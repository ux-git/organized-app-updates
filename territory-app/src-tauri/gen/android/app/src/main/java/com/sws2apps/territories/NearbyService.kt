package com.sws2apps.territories

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date
import org.json.JSONArray
import org.json.JSONObject

/** One Rust session over one Bluetooth connection. */
class Exchange(val pipe: Pipe, private val handle: Long, val mode: Int, private val onStatus: (Exchange) -> Unit) {
  var status = JSONObject().put("state", "connecting")
    private set
  var lastActivity = System.currentTimeMillis()
    private set

  val state get() = status.optString("state")
  val finished get() = state == "done" || state == "failed"

  fun start(preamble: ByteArray?) {
    val out = Native.sessionStart(handle)
    pipe.send((preamble ?: ByteArray(0)) + out)
    report()
  }

  fun receive(bytes: ByteArray) {
    lastActivity = System.currentTimeMillis()
    send(Native.sessionFeed(handle, bytes))
  }

  fun confirm(accept: Boolean) = send(Native.sessionConfirm(handle, accept))

  private fun send(out: ByteArray) {
    if (out.isNotEmpty()) pipe.send(out)
    report()
  }

  fun fail(reason: String) {
    if (finished) return
    status = JSONObject().put("state", "failed").put("reason", reason)
    onStatus(this)
  }

  private fun report() {
    status = runCatching { JSONObject(Native.sessionStatus(handle)) }.getOrElse { status }
    onStatus(this)
  }

  fun close() = Native.sessionClose(handle)

  fun toJson(): JSONObject = JSONObject(status.toString()).put("address", pipe.address).put("mode", mode)
}

/**
 * Looks for paired phones and syncs with them, with the screen off and the
 * app closed: during meeting times, for a few minutes after the app was open
 * or a paired phone was seen, and while Meet is open. Runs as a
 * connectedDevice foreground service, as Android requires for Bluetooth work
 * in the background.
 */
class NearbyService : Service(), Link.Listener {
  companion object {
    private const val EXTRA_FOR_MS = "for_ms"
    private const val EXTRA_REASON = "reason"
    private const val CHANNEL = "sync"
    private const val NOTIFICATION_ID = 41
    private const val TICK_MS = 5_000L
    private const val IDLE_MS = 25_000L
    private const val RESYNC_MS = 15_000L
    private const val WAIT_FOR_OTHER_MS = 20_000L

    var instance: NearbyService? = null
      private set

    /** Meet was opened on the page before the service was running. */
    var wantMeet = false

    /** Starts or extends the search. False when Android doesn't allow it now. */
    fun start(context: Context, reason: String, forMs: Long): Boolean {
      if (!Nearby.hasBluetooth(context)) return false
      val intent = Intent(context, NearbyService::class.java)
        .putExtra(EXTRA_FOR_MS, forMs)
        .putExtra(EXTRA_REASON, reason)
      return runCatching { ContextCompat.startForegroundService(context, intent) }.isSuccess
    }

    fun status(context: Context): JSONObject =
      instance?.status() ?: JSONObject()
        .put("running", false)
        .put("bluetooth", Nearby.hasBluetooth(context))
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var link: Link
  private var until = 0L
  private var reason = ""
  var meet = false
    private set
  private val exchanges = HashMap<String, Exchange>()
  private val connecting = HashMap<String, Int>()
  private val lastSync = HashMap<String, Long>()
  private val needSince = HashMap<String, Long>()
  private val seenPeers = HashMap<String, Long>()
  private val seenMeet = LinkedHashMap<String, JSONObject>()
  private var lastDone: JSONObject? = null
  private var myId = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    link = Link(this, this)
    ensureChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    } else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(getString(R.string.sync_looking)), type)

    val forMs = intent?.getLongExtra(EXTRA_FOR_MS, 60_000L) ?: 60_000L
    reason = intent?.getStringExtra(EXTRA_REASON) ?: reason
    until = maxOf(until, System.currentTimeMillis() + forMs)
    myId = Nearby.summary().optString("id")

    if (!link.start()) {
      emitStatus()
      if (!meet) stopSelf()
      return START_NOT_STICKY
    }
    if (wantMeet && !meet) startMeet() else refresh()
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    exchanges.values.forEach { it.close() }
    exchanges.clear()
    link.stop()
    instance = null
    Native.emit("nearby", status().put("running", false).toString())
    super.onDestroy()
  }

  private fun refresh() {
    link.advertise(if (meet) Nearby.meetPayload() else Nearby.beaconPayload())
    link.scan(fast = meet || reason == "open")
  }

  private val tick = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      // the beacon carries the data version and a tag that changes every 15 minutes
      if (!meet) link.advertise(Nearby.beaconPayload())
      exchanges.values.filter { now - it.lastActivity > IDLE_MS }.forEach {
        it.fail(getString(R.string.sync_timeout))
        it.pipe.close()
      }
      seenMeet.entries.removeAll { now - it.value.optLong("at") > 12_000 }
      emitStatus()
      if (!meet && now > until && exchanges.isEmpty()) {
        stopSelf()
        return
      }
      handler.postDelayed(this, TICK_MS)
    }
  }

  // ---- what the page asks for ----

  fun startMeet() {
    meet = true
    until = maxOf(until, System.currentTimeMillis() + 60_000)
    refresh()
    emitStatus()
  }

  fun stopMeet() {
    meet = false
    seenMeet.clear()
    refresh()
    emitStatus()
  }

  fun pair(address: String) {
    val device = link.device(address) ?: return
    connecting[address] = Native.MODE_PAIR_CODE
    link.connect(device)
  }

  fun confirm(accept: Boolean) {
    exchanges.values.firstOrNull { it.state == "confirm" }?.confirm(accept)
  }

  fun status(): JSONObject {
    val seen = JSONArray()
    seenMeet.values.forEach { seen.put(it) }
    val active = JSONArray()
    exchanges.values.forEach { active.put(it.toJson()) }
    val peersSeen = JSONArray()
    seenPeers.keys.forEach { peersSeen.put(it) }
    return JSONObject()
      .put("running", true)
      .put("bluetooth", link.available)
      .put("meet", meet)
      .put("reason", reason)
      .put("until", until)
      .put("seen", seen)
      .put("exchanges", active)
      .put("peersSeen", peersSeen)
      .put("lastDone", lastDone ?: JSONObject.NULL)
  }

  private fun emitStatus() {
    val activity = MainActivity.current
    if (activity != null) activity.emitNearby() else Native.emit("nearby", status().toString())
  }

  // ---- Bluetooth ----

  override fun onSeen(device: BluetoothDevice, payload: ByteArray, rssi: Int) {
    if (payload.isEmpty()) return
    val now = System.currentTimeMillis()
    when (payload[0]) {
      Nearby.KIND_MEET -> if (meet) {
        val name = String(payload, 1, payload.size - 1, Charsets.UTF_8)
        val fresh = !seenMeet.containsKey(device.address)
        seenMeet[device.address] = JSONObject()
          .put("address", device.address)
          .put("name", name)
          .put("rssi", rssi)
          .put("at", now)
        if (fresh) emitStatus()
      }
      Nearby.KIND_BEACON -> {
        val sighting = Native.recognise(payload.copyOfRange(1, payload.size))
        if (sighting.isEmpty()) return
        val json = JSONObject(sighting)
        val peer = json.getString("peer")
        seenPeers[peer] = now
        if (!json.getBoolean("needsSync")) {
          needSince.remove(peer)
          return
        }
        if (link.connected(device.address)) return
        if (exchanges.values.any { it.status.optString("peer") == peer }) return
        if (now - (lastSync[peer] ?: 0L) < RESYNC_MS) return
        // one side connects: the phone with the smaller id, or this one if
        // the other hasn't for a while (an iPhone in the background can't)
        val since = needSince.getOrPut(peer) { now }
        if (myId < peer || now - since > WAIT_FOR_OTHER_MS) {
          connecting[device.address] = Native.MODE_SYNC
          link.connect(device)
        }
      }
    }
  }

  override fun onConnected(pipe: Pipe) {
    val mode = connecting.remove(pipe.address) ?: Native.MODE_SYNC
    val handle = Native.sessionNew(mode, true)
    if (handle == 0L) {
      pipe.close()
      return
    }
    val exchange = Exchange(pipe, handle, mode, ::onStatus)
    exchanges[pipe.address] = exchange
    // the first byte tells the other phone whether this is a sync or a pairing
    exchange.start(byteArrayOf(mode.toByte()))
  }

  override fun onIncoming(pipe: Pipe, first: ByteArray) {
    val mode = first[0].toInt()
    val allowed = mode == Native.MODE_SYNC || (mode == Native.MODE_PAIR_CODE && meet)
    val handle = if (allowed) Native.sessionNew(mode, false) else 0L
    if (handle == 0L) {
      pipe.close()
      return
    }
    val exchange = Exchange(pipe, handle, mode, ::onStatus)
    exchanges[pipe.address] = exchange
    exchange.start(null)
    if (first.size > 1) exchange.receive(first.copyOfRange(1, first.size))
  }

  override fun onBytes(pipe: Pipe, bytes: ByteArray) {
    exchanges[pipe.address]?.receive(bytes)
  }

  override fun onClosed(pipe: Pipe) {
    connecting.remove(pipe.address)
    val exchange = exchanges.remove(pipe.address) ?: return
    exchange.fail(getString(R.string.sync_lost))
    exchange.close()
    emitStatus()
  }

  private fun onStatus(exchange: Exchange) {
    val status = exchange.status
    when (exchange.state) {
      "done" -> {
        val peer = status.optString("peer")
        lastSync[peer] = System.currentTimeMillis()
        needSince.remove(peer)
        lastDone = JSONObject(status.toString()).put("at", System.currentTimeMillis())
        val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date())
        updateNotification(getString(R.string.sync_done, status.optString("name"), time))
        Reminders.synced(this)
        // the beacon now carries the new data version
        link.advertise(if (meet) Nearby.meetPayload() else Nearby.beaconPayload())
        closeWhenSent(exchange)
      }
      "failed" -> closeWhenSent(exchange)
      "exchanging" -> updateNotification(getString(R.string.sync_running))
    }
    emitStatus()
  }

  private fun closeWhenSent(exchange: Exchange, waited: Long = 0) {
    handler.postDelayed({
      if (exchange.pipe.idle || waited > 5_000) {
        exchange.pipe.close()
      } else {
        closeWhenSent(exchange, waited + 500)
      }
    }, 500)
  }

  // ---- notification ----

  private fun notification(text: String) =
    NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(getString(R.string.sync_title))
      .setContentText(text)
      .setColor(Notify.accentColor(this))
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(openApp(this))
      .build()

  private fun updateNotification(text: String) {
    if (!Notify.mayNotify(this)) return
    runCatching { NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification(text)) }
  }
}

fun ensureChannel(context: Context) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  val manager = context.getSystemService(NotificationManager::class.java)
  if (manager.getNotificationChannel("sync") == null) {
    manager.createNotificationChannel(
      NotificationChannel("sync", context.getString(R.string.sync_channel), NotificationManager.IMPORTANCE_LOW)
        .apply { setShowBadge(false) }
    )
  }
  if (manager.getNotificationChannel("reminders") == null) {
    manager.createNotificationChannel(
      NotificationChannel(
        "reminders",
        context.getString(R.string.reminder_channel),
        NotificationManager.IMPORTANCE_DEFAULT
      )
    )
  }
}

fun openApp(context: Context, route: String? = null): PendingIntent =
  PendingIntent.getActivity(
    context,
    route?.hashCode() ?: 0,
    Intent(context, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .apply { if (route != null) putExtra(MainActivity.EXTRA_ROUTE, route) },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )
