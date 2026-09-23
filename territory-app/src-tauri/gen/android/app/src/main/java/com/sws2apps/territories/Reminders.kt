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
import java.util.Calendar
import org.json.JSONObject

/**
 * When the phone looks for its paired phones without anyone opening the app:
 * - during meeting times (an alarm starts the search, as a foreground service
 *   may be started from an exact alarm);
 * - when a paired phone's beacon is seen (Android scans for it in the
 *   Bluetooth chip and wakes the app);
 * - on arriving at the Kingdom Hall (a proximity alert, optional).
 * When Android won't let the search start by itself, and there are changes
 * to share, a notification asks for one tap; and before leaving the meeting,
 * one more if the changes still haven't reached the other phone.
 */
object Reminders {
  private const val ACTION_START = "com.sws2apps.territories.WINDOW_START"
  private const val ACTION_END = "com.sws2apps.territories.WINDOW_END"
  private const val ACTION_HALL = "com.sws2apps.territories.HALL"
  private const val ACTION_PEER = "com.sws2apps.territories.PEER_SEEN"
  private const val EXTRA_END = "end"
  const val ARRIVE_ID = 51
  const val LEAVE_ID = 52
  private const val DAY_MS = 24 * 60 * 60 * 1000L

  fun schedule(context: Context): JSONObject =
    runCatching { JSONObject(Nearby.prefs(context).getString("schedule", "{}")!!) }
      .getOrElse { JSONObject() }

  fun saveSchedule(context: Context, json: String) {
    Nearby.prefs(context).edit().putString("schedule", json).apply()
    plan(context)
  }

  /** Meeting times as [start, end] of the search, from now for a week. */
  private fun windows(context: Context, now: Long): List<Pair<Long, Long>> {
    val schedule = schedule(context)
    if (!schedule.optBoolean("enabled", true)) return emptyList()
    val meetings = schedule.optJSONArray("meetings") ?: return emptyList()
    val before = schedule.optInt("before", 45) * 60_000L
    val after = schedule.optInt("after", 150) * 60_000L
    val result = mutableListOf<Pair<Long, Long>>()
    for (i in 0 until meetings.length()) {
      val meeting = meetings.getJSONObject(i)
      // day: 0 = Sunday, as JavaScript counts
      val day = meeting.optInt("day", -1)
      val (hour, minute) = meeting.optString("time").split(":").map { it.toIntOrNull() ?: 0 }
        .let { (it.getOrElse(0) { 0 }) to (it.getOrElse(1) { 0 }) }
      if (day !in 0..6) continue
      for (offset in 0..7) {
        val start = Calendar.getInstance().apply {
          timeInMillis = now - DAY_MS + offset * DAY_MS
          set(Calendar.HOUR_OF_DAY, hour)
          set(Calendar.MINUTE, minute)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }
        if (start.get(Calendar.DAY_OF_WEEK) - 1 != day) continue
        val from = start.timeInMillis - before
        val to = start.timeInMillis + after
        if (to > now) result += from to to
      }
    }
    return result.sortedBy { it.first }
  }

  fun canExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  private fun alarm(context: Context, action: String, end: Long) =
    PendingIntent.getBroadcast(
      context,
      action.hashCode(),
      Intent(context, ReminderReceiver::class.java).setAction(action).putExtra(EXTRA_END, end),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  @SuppressLint("MissingPermission")
  private fun set(context: Context, at: Long, intent: PendingIntent) {
    val manager = context.getSystemService(AlarmManager::class.java)
    if (canExact(context)) {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    }
  }

  /** Sets the alarms for the next meeting, and searches now if one is on. */
  fun plan(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    manager.cancel(alarm(context, ACTION_START, 0))
    manager.cancel(alarm(context, ACTION_END, 0))
    val now = System.currentTimeMillis()
    val next = windows(context, now).firstOrNull() ?: return
    val (start, end) = next
    if (start <= now) {
      NearbyService.start(context, "window", end - now)
    } else {
      set(context, start, alarm(context, ACTION_START, end))
    }
    set(context, end, alarm(context, ACTION_END, end))
  }

  fun onAlarm(context: Context, action: String?, end: Long) {
    val now = System.currentTimeMillis()
    when (action) {
      ACTION_START -> {
        val started = Nearby.hasPeers() && NearbyService.start(context, "window", end - now)
        if (!started) remind(context, ARRIVE_ID)
      }
      ACTION_END -> remind(context, LEAVE_ID)
      ACTION_HALL -> {
        val searching = NearbyService.start(context, "hall", 90 * 60_000L)
        if (!searching) remind(context, ARRIVE_ID)
      }
    }
    if (action != ACTION_HALL) plan(context)
  }

  /** Only when there are changes a paired phone hasn't received. */
  private fun remind(context: Context, id: Int) {
    val summary = Nearby.summary()
    val unsynced = summary.optInt("unsynced")
    val peers = summary.optJSONArray("peers") ?: return
    if (unsynced == 0 || peers.length() == 0 || !Notify.mayNotify(context)) return
    val names = (0 until peers.length())
      .map { peers.getJSONObject(it) }
      .filter { it.optInt("pending") > 0 }
      .joinToString(", ") { it.optString("name") }
    val text = if (id == LEAVE_ID) {
      context.getString(R.string.reminder_leave, names)
    } else {
      context.resources.getQuantityString(R.plurals.reminder_arrive, unsynced, unsynced, names)
    }
    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, "reminders")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.reminder_title))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setColor(Notify.accentColor(context))
      .setAutoCancel(true)
      .setContentIntent(openApp(context, "/sync?now=1"))
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(id, notification) }
  }

  /** A sync went through: the reminders are no longer needed once nothing is left. */
  fun synced(context: Context) {
    if (Nearby.unsynced() > 0) return
    NotificationManagerCompat.from(context).cancel(ARRIVE_ID)
    NotificationManagerCompat.from(context).cancel(LEAVE_ID)
  }

  // ---- the Kingdom Hall, optional ----

  fun hall(context: Context): JSONObject? =
    Nearby.prefs(context).getString("hall", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  @SuppressLint("MissingPermission")
  fun setHall(context: Context, lat: Double, lng: Double, radius: Float) {
    Nearby.prefs(context).edit()
      .putString("hall", JSONObject().put("lat", lat).put("lng", lng).put("radius", radius).toString())
      .apply()
    watchHall(context)
  }

  fun clearHall(context: Context) {
    Nearby.prefs(context).edit().remove("hall").apply()
    runCatching { context.getSystemService(LocationManager::class.java)?.removeProximityAlert(hallIntent(context)) }
  }

  private fun hallIntent(context: Context) =
    PendingIntent.getBroadcast(
      context,
      ACTION_HALL.hashCode(),
      Intent(context, ReminderReceiver::class.java).setAction(ACTION_HALL),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )

  @SuppressLint("MissingPermission")
  fun watchHall(context: Context) {
    val hall = hall(context) ?: return
    if (!Nearby.granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) return
    val manager = context.getSystemService(LocationManager::class.java) ?: return
    val intent = hallIntent(context)
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

  fun onHall(context: Context, intent: Intent) {
    if (intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)) {
      onAlarm(context, ACTION_HALL, 0)
    }
  }

  // ---- waking up when a paired phone is near ----

  private fun peerIntent(context: Context) =
    PendingIntent.getBroadcast(
      context,
      ACTION_PEER.hashCode(),
      Intent(context, ReminderReceiver::class.java).setAction(ACTION_PEER),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )

  /**
   * Android keeps scanning for this app's advertisement in the Bluetooth chip
   * and wakes the app when one shows up, at almost no battery cost.
   */
  @SuppressLint("MissingPermission")
  fun watchPeers(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (!Nearby.hasBluetooth(context) || !Nearby.hasPeers()) return
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(Nearby.SERVICE)).build()
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build()
    runCatching {
      scanner.stopScan(peerIntent(context))
      scanner.startScan(listOf(filter), settings, peerIntent(context))
    }
  }

  fun onPeerSeen(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (NearbyService.instance != null) return
    val results = IntentCompat.getParcelableArrayListExtra(
      intent,
      BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT,
      ScanResult::class.java
    ) ?: return
    val wanted = results.any { result ->
      val payload = result.scanRecord?.getServiceData(ParcelUuid(Nearby.SERVICE)) ?: return@any false
      if (payload.isEmpty() || payload[0] != Nearby.KIND_BEACON) return@any false
      val sighting = Native.recognise(payload.copyOfRange(1, payload.size))
      sighting.isNotEmpty() && JSONObject(sighting).optBoolean("needsSync")
    }
    if (wanted) NearbyService.start(context, "peer", 3 * 60_000L)
  }

  fun isPeerIntent(intent: Intent) = intent.action == ACTION_PEER
  fun isHallIntent(intent: Intent) = intent.action == ACTION_HALL
  fun endOf(intent: Intent) = intent.getLongExtra(EXTRA_END, 0)
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Native.open(context.filesDir.absolutePath)
    when {
      Reminders.isPeerIntent(intent) -> Reminders.onPeerSeen(context, intent)
      Reminders.isHallIntent(intent) -> Reminders.onHall(context, intent)
      else -> Reminders.onAlarm(context, intent.action, Reminders.endOf(intent))
    }
  }
}

/** Alarms and scans don't survive a restart; set them again. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Native.open(context.filesDir.absolutePath)
    Reminders.plan(context)
    Reminders.watchPeers(context)
    Reminders.watchHall(context)
  }
}
