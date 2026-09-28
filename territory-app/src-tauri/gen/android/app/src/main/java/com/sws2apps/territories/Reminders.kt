package com.sws2apps.territories

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.os.Build
import android.os.ParcelUuid
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.IntentCompat
import org.json.JSONObject

/**
 * When the phone looks for its paired phones by itself, by sync mode:
 * - "always": everywhere;
 * - "location": only while at the Kingdom Hall (a proximity alert);
 * - "manual": never, only on Sync now.
 *
 * Looking costs almost nothing: the Bluetooth chip watches for a paired
 * phone's beacon and wakes the app only when one shows up with news
 * (watchPeers). A phone with changes of its own also sends its beacon in
 * short bursts (a few seconds, every few minutes, less often the longer
 * nothing answers), so the others notice it. A phone with nothing new stays
 * quiet. Brothers who meet spend minutes together, so seconds don't matter.
 */
object Reminders {
  private const val ACTION_BURST = "com.sws2apps.territories.BURST"
  private const val ACTION_HALL = "com.sws2apps.territories.HALL"
  private const val ACTION_PEER = "com.sws2apps.territories.PEER_SEEN"
  const val LEAVE_ID = 52
  const val BURST_MS = 20_000L
  private const val INSIDE_MAX_MS = 4 * 60 * 60_000L

  fun schedule(context: Context): JSONObject =
    runCatching { JSONObject(Nearby.prefs(context).getString("schedule", "{}")!!) }
      .getOrElse { JSONObject() }

  fun saveSchedule(context: Context, json: String) {
    Nearby.prefs(context).edit().putString("schedule", json).apply()
    apply(context)
  }

  /** "always", "location" or "manual"; 0.6 settings map onto these. */
  fun mode(context: Context): String {
    val schedule = schedule(context)
    if (!schedule.optBoolean("enabled", true)) return "manual"
    return when (val mode = schedule.optString("mode", "always")) {
      "location", "manual" -> mode
      else -> "always"
    }
  }

  /** At the Kingdom Hall, as far as the proximity alert knows. */
  fun inside(context: Context): Boolean {
    val since = Nearby.prefs(context).getLong("inside", 0L)
    return since > 0 && System.currentTimeMillis() - since < INSIDE_MAX_MS
  }

  /** Whether the phone looks for paired phones by itself right now. */
  fun searching(context: Context) = when (mode(context)) {
    "always" -> true
    "location" -> inside(context)
    else -> false
  }

  /** Sets up what the mode needs and stops what it doesn't. */
  fun apply(context: Context) {
    if (searching(context)) watchPeers(context) else stopWatchingPeers(context)
    if (mode(context) == "location") watchHall(context) else unwatchHall(context)
    scheduleBurst(context)
  }

  fun canExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  private fun broadcast(context: Context, action: String) =
    PendingIntent.getBroadcast(
      context,
      action.hashCode(),
      Intent(context, ReminderReceiver::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )

  // ---- bursts ----

  /** Some paired phone lacks this phone's changes. */
  private fun hasNews(): Boolean {
    val peers = Nearby.summary().optJSONArray("peers") ?: return false
    return (0 until peers.length()).any { peers.getJSONObject(it).optInt("pending") > 0 }
  }

  /**
   * 2, 4, 8, then every 15 minutes; at the hall 1, 2, then every 4. With a
   * paired iPhone and nothing new here, every 5: the iPhone can't be found
   * while its app sleeps, but it notices this phone and sends its own news.
   */
  private fun interval(context: Context): Long {
    val misses = Nearby.prefs(context).getInt("misses", 0)
    val news = if (mode(context) == "location") {
      minOf(60_000L shl misses.coerceAtMost(3), 4 * 60_000L)
    } else {
      minOf(2 * 60_000L shl misses.coerceAtMost(3), 15 * 60_000L)
    }
    return if (hasNews()) news else IPHONE_MS
  }

  private const val IPHONE_MS = 5 * 60_000L

  /** A burst is worth it: news to give, or an iPhone that may have some. */
  private fun worthIt() = hasNews() || Nearby.hasIphone()

  @SuppressLint("MissingPermission")
  fun scheduleBurst(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    val intent = broadcast(context, ACTION_BURST)
    manager.cancel(intent)
    if (!searching(context) || !Nearby.hasPeers() || !worthIt()) return
    val at = System.currentTimeMillis() + interval(context)
    if (canExact(context)) {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    }
  }

  private fun onBurst(context: Context) {
    val prefs = Nearby.prefs(context)
    prefs.edit().putInt("misses", prefs.getInt("misses", 0) + 1).apply()
    if (searching(context) && worthIt()) {
      val started = NearbyService.start(context, "burst", BURST_MS)
      SyncNotices.exactAlarms(context, needed = !started && Nearby.hasBluetooth(context) && !canExact(context))
    }
    scheduleBurst(context)
  }

  /** Something new to tell: back to the short interval. */
  fun changed(context: Context) {
    Nearby.prefs(context).edit().putInt("misses", 0).apply()
    scheduleBurst(context)
  }

  /** A sync went through. */
  fun synced(context: Context) {
    Nearby.prefs(context).edit().putInt("misses", 0).apply()
    if (Nearby.unsynced() == 0) NotificationManagerCompat.from(context).cancel(LEAVE_ID)
    scheduleBurst(context)
  }

  // ---- the Kingdom Hall ----

  fun hall(context: Context): JSONObject? =
    Nearby.prefs(context).getString("hall", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun setHall(context: Context, lat: Double, lng: Double, radius: Float) {
    Nearby.prefs(context).edit()
      .putString("hall", JSONObject().put("lat", lat).put("lng", lng).put("radius", radius).toString())
      .apply()
    apply(context)
  }

  fun clearHall(context: Context) {
    Nearby.prefs(context).edit().remove("hall").remove("inside").apply()
    apply(context)
  }

  private fun unwatchHall(context: Context) {
    runCatching {
      context.getSystemService(LocationManager::class.java)?.removeProximityAlert(broadcast(context, ACTION_HALL))
    }
    Nearby.prefs(context).edit().remove("inside").apply()
  }

  @SuppressLint("MissingPermission")
  fun watchHall(context: Context) {
    val hall = hall(context) ?: return
    if (!Nearby.granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) return
    val manager = context.getSystemService(LocationManager::class.java) ?: return
    val intent = broadcast(context, ACTION_HALL)
    runCatching {
      manager.removeProximityAlert(intent)
      manager.addProximityAlert(
        hall.getDouble("lat"),
        hall.getDouble("lng"),
        hall.optDouble("radius", 150.0).toFloat(),
        -1,
        intent
      )
    }
  }

  private fun onHall(context: Context, intent: Intent) {
    if (mode(context) != "location") return
    val entering = intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)
    Nearby.prefs(context).edit()
      .putLong("inside", if (entering) System.currentTimeMillis() else 0L)
      .putInt("misses", 0)
      .apply()
    apply(context)
    if (entering) {
      NearbyService.start(context, "hall", 60_000L)
    } else {
      leaving(context)
    }
  }

  /** Left the hall with changes no paired phone has: one reminder. */
  private fun leaving(context: Context) {
    val summary = Nearby.summary()
    val peers = summary.optJSONArray("peers") ?: return
    if (summary.optInt("unsynced") == 0 || peers.length() == 0 || !Notify.mayNotify(context)) return
    val names = (0 until peers.length())
      .map { peers.getJSONObject(it).optString("name") }
      .filter { it.isNotBlank() }
      .joinToString(", ")
    val text = context.getString(R.string.reminder_leave, names)
    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, SyncNotices.CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.reminder_leave_title))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setColor(Notify.accentColor(context))
      .setAutoCancel(true)
      .setContentIntent(openApp(context, "/sync?now=1"))
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(Notify.lockScreen(context, SyncNotices.CHANNEL, context.getString(R.string.reminder_leave_title)))
      .build()
    Notify.post(context, LEAVE_ID, notification)
  }

  // ---- waking up when a paired phone with news is near ----

  /** Android ignores an app that starts a scan more than 5 times in 30 seconds. */
  private var watchedAt = 0L

  /**
   * The Bluetooth chip keeps scanning for this app's beacon and wakes the
   * app when one shows up, at almost no battery cost.
   */
  @SuppressLint("MissingPermission")
  fun watchPeers(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (!searching(context) || !Nearby.hasBluetooth(context) || !Nearby.hasPeers()) return
    if (System.currentTimeMillis() - watchedAt < 30_000L) return
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(Nearby.SERVICE)).build()
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build()
    val started = runCatching {
      scanner.stopScan(broadcast(context, ACTION_PEER))
      scanner.startScan(listOf(filter), settings, broadcast(context, ACTION_PEER))
    }.getOrNull() == 0
    if (started) watchedAt = System.currentTimeMillis()
  }

  @SuppressLint("MissingPermission")
  private fun stopWatchingPeers(context: Context) {
    watchedAt = 0L
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !Nearby.hasBluetooth(context)) return
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return
    runCatching { scanner.stopScan(broadcast(context, ACTION_PEER)) }
  }

  private fun onPeerSeen(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (NearbyService.instance != null || !searching(context)) return
    val results = IntentCompat.getParcelableArrayListExtra(
      intent,
      BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT,
      ScanResult::class.java
    ) ?: return
    // an iPhone sends no beacon; worth a look when there is news to give
    val iphone = results.any { it.scanRecord?.getServiceData(ParcelUuid(Nearby.SERVICE)) == null }
    if (iphone && Nearby.unsynced() > 0) {
      NearbyService.start(context, "peer", 60_000L)
      return
    }
    val peer = results.firstNotNullOfOrNull { result ->
      val payload = result.scanRecord?.getServiceData(ParcelUuid(Nearby.SERVICE)) ?: return@firstNotNullOfOrNull null
      if (payload.isEmpty() || payload[0] != Nearby.KIND_BEACON) return@firstNotNullOfOrNull null
      val sighting = Native.recognise(payload.copyOfRange(1, payload.size))
      if (sighting.isEmpty()) return@firstNotNullOfOrNull null
      JSONObject(sighting).takeIf { it.optBoolean("needsSync") }?.optString("peer")
    } ?: return
    // without the battery exception Android may refuse; after three refusals one tap does it
    if (!NearbyService.start(context, "peer", 60_000L)) {
      SyncNotices.attemptFailed(context, peer)
      SyncNotices.found(context, peer)
    }
  }

  fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_PEER -> onPeerSeen(context, intent)
      ACTION_HALL -> onHall(context, intent)
      ACTION_BURST -> onBurst(context)
    }
  }
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Native.open(context.filesDir.absolutePath)
    Reminders.onReceive(context, intent)
  }
}

/** Alarms, scans and the hall alert don't survive a restart; set them again. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    Native.open(context.filesDir.absolutePath)
    Reminders.apply(context)
    Backups.schedule(context)
  }
}
