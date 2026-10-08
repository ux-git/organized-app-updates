package com.sws2apps.territories

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * One Rust session over one Bluetooth connection. A step can apply a whole
 * sync to the store, so the steps run on one worker thread, in order, and
 * what they send and say comes back on the main thread in the same order.
 */
class Exchange(val pipe: Pipe, private val handle: Long, val mode: Int, private val onStatus: (Exchange) -> Unit) {
  var status = JSONObject().put("state", "connecting")
    private set
  private var heard = System.currentTimeMillis()
  private var closed = false

  /** Bytes came in, a step ended, or the other phone took a part. */
  val lastActivity get() = maxOf(heard, pipe.lastWritten)

  /** Known from the beacon or the handshake, and kept when the session fails. */
  var peer = ""

  val state get() = status.optString("state")
  val finished get() = state == "done" || state == "failed"

  fun start(preamble: ByteArray?) = step { (preamble ?: ByteArray(0)) + Native.sessionStart(handle) }

  fun receive(bytes: ByteArray) {
    heard = System.currentTimeMillis()
    step { Native.sessionFeed(handle, bytes) }
  }

  fun confirm(accept: Boolean) = step { Native.sessionConfirm(handle, accept) }

  private fun step(run: () -> ByteArray) {
    worker.execute {
      val out = run()
      val next = runCatching { JSONObject(Native.sessionStatus(handle)) }.getOrNull()
      main.post {
        if (closed || finished) return@post
        heard = System.currentTimeMillis()
        if (out.isNotEmpty()) pipe.send(out)
        next?.let { status = it }
        status.optString("peer").takeIf { it.isNotEmpty() }?.let { peer = it }
        onStatus(this)
      }
    }
  }

  fun fail(reason: String) {
    if (finished) return
    status = JSONObject().put("state", "failed").put("reason", reason)
    onStatus(this)
  }

  /** The connection closed: after the steps still running, so a last message that finished the session counts. */
  fun lost(reason: String) {
    worker.execute {
      main.post {
        fail(reason)
        close()
      }
    }
  }

  fun close() {
    closed = true
    worker.execute { Native.sessionClose(handle) }
  }

  fun toJson(): JSONObject = JSONObject(status.toString()).put("address", pipe.address).put("mode", mode)

  private companion object {
    val worker: ExecutorService = Executors.newSingleThreadExecutor()
    val main = Handler(Looper.getMainLooper())
  }
}

/**
 * Looks for paired phones and syncs with them, for a short while at a time:
 * a burst when this phone has news (Reminders), a minute after a paired
 * phone with news was seen, a couple of minutes after the app was opened,
 * and while Meet is open. Then it stops, so nothing runs when there is
 * nothing to do. Runs as a connectedDevice foreground service, as Android
 * requires for Bluetooth work in the background.
 */
class NearbyService : Service(), Link.Listener {
  companion object {
    private const val EXTRA_FOR_MS = "for_ms"
    private const val EXTRA_REASON = "reason"
    const val CHANNEL = "background"
    private const val NOTIFICATION_ID = 41
    private const val TICK_MS = 5_000L
    private const val IDLE_MS = 25_000L
    private const val RESYNC_MS = 15_000L
    private const val WAIT_FOR_OTHER_MS = 8_000L
    /** After a connection that failed or closed, before the next one. */
    private const val RETRY_MS = 5_000L
    /** A paired phone with news is close: stay at least this long. */
    private const val PEER_STAY_MS = 30_000L
    /** How often an iPhone nearby is tried, with and without news here. */
    private const val IPHONE_NEWS_MS = 60_000L
    private const val IPHONE_QUIET_MS = 5 * 60_000L

    var instance: NearbyService? = null
      private set

    /** Meet was opened on the page before the service was running. */
    var wantMeet = false

    fun intent(context: Context, reason: String, forMs: Long): Intent =
      Intent(context, NearbyService::class.java)
        .putExtra(EXTRA_FOR_MS, forMs)
        .putExtra(EXTRA_REASON, reason)

    /** Starts or extends the search. False when Android doesn't allow it now. */
    fun start(context: Context, reason: String, forMs: Long): Boolean {
      if (!Nearby.hasBluetooth(context)) return false
      return runCatching {
        ContextCompat.startForegroundService(context, intent(context, reason, forMs))
      }.isSuccess
    }

    /** Something was edited here: tell paired phones nearby right away. */
    fun changed(context: Context) {
      Reminders.changed(context)
      val service = instance
      when {
        service != null -> service.localChange()
        Reminders.searching(context) && Nearby.hasPeers() ->
          start(context, "change", Reminders.BURST_MS)
      }
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
  private val beacons = HashMap<String, ByteArray>()
  private val trying = HashMap<String, String>()
  private val nextTry = HashMap<String, Long>()
  private val heard = HashMap<String, Long>()
  private val seenMeet = LinkedHashMap<String, JSONObject>()
  private var lastDone: JSONObject? = null
  private var myId = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    link = Link(this, this)
    ensureChannel(this)
    ContextCompat.registerReceiver(
      this,
      bluetoothState,
      IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
  }

  /** Turning Bluetooth off drops the server, the scan and the advertising. */
  private val bluetoothState = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
        BluetoothAdapter.STATE_TURNING_OFF, BluetoothAdapter.STATE_OFF -> link.stop()
        BluetoothAdapter.STATE_ON -> if (link.start()) refresh()
      }
      emitStatus()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    } else 0
    val started = runCatching {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), type)
    }
    if (started.isFailure) {
      // Android didn't allow a start from the background this time
      stopSelf()
      return START_NOT_STICKY
    }

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
    runCatching { unregisterReceiver(bluetoothState) }
    exchanges.values.forEach { it.close() }
    exchanges.clear()
    link.stop()
    instance = null
    Native.emit("nearby", status().put("running", false).toString())
    Reminders.scheduleBurst(this)
    super.onDestroy()
  }

  private fun refresh() {
    link.advertise(if (meet) Nearby.meetPayload() else Nearby.beaconPayload())
    if (!meet && Nearby.hasIphone()) link.advertiseIbeacon() else link.stopIbeacon()
    link.scan()
  }

  fun localChange() {
    until = maxOf(until, System.currentTimeMillis() + Reminders.BURST_MS)
    if (!meet) link.advertise(Nearby.beaconPayload())
  }

  private val tick = object : Runnable {
    override fun run() {
      val now = System.currentTimeMillis()
      // Meet is left open only by a page that is gone
      if (meet && MainActivity.current == null) {
        wantMeet = false
        stopMeet()
      }
      // the beacon carries the data version and a tag that changes every 15 minutes
      if (!meet) link.advertise(Nearby.beaconPayload())
      // again after Android refused it
      link.scan()
      exchanges.values.filter { now - it.lastActivity > IDLE_MS }.forEach {
        it.fail(getString(R.string.sync_timeout))
        it.pipe.close()
      }
      seenMeet.entries.removeAll { now - it.value.optLong("at") > 12_000 }
      noticeStuckPeers(now)
      emitStatus()
      if (!meet && now > until && exchanges.isEmpty()) {
        stopSelf()
        return
      }
      handler.postDelayed(this, TICK_MS)
    }
  }

  /** A paired phone is close, three syncs with it failed, and it still has news. */
  private fun noticeStuckPeers(now: Long) {
    for ((peer, beacon) in beacons) {
      if (now - (seenPeers[peer] ?: 0L) > 30_000) continue
      if (exchanges.values.any { it.peer == peer }) continue
      if (!SyncNotices.stuck(this, peer)) continue
      // asked again: this phone's data may have changed since the beacon came
      val sighting = Native.recognise(beacon)
      if (sighting.isEmpty() || !JSONObject(sighting).optBoolean("needsSync")) continue
      SyncNotices.found(this, peer)
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

  fun confirm(address: String, accept: Boolean) {
    val exchange = if (address.isEmpty()) {
      // an older page names no address
      exchanges.values.firstOrNull { it.state == "confirm" }
    } else {
      exchanges[address]?.takeIf { it.state == "confirm" }
    }
    exchange?.confirm(accept)
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

  override fun onSeen(device: BluetoothDevice, payload: ByteArray, rssi: Int, name: String?) {
    val now = System.currentTimeMillis()
    // the scan reports every advertisement; once a second is plenty
    if (now - (heard[device.address] ?: 0L) < 1_000) return
    heard[device.address] = now
    if (payload.isEmpty()) {
      seenIphone(device, rssi, name, now)
      return
    }
    when (payload[0]) {
      Nearby.KIND_MEET -> if (meet) {
        val advertisedName = String(payload, 1, payload.size - 1, Charsets.UTF_8)
        val fresh = seenMeet[device.address]?.optString("name") != advertisedName
        seenMeet[device.address] = JSONObject()
          .put("address", device.address)
          .put("name", advertisedName)
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
        beacons[peer] = payload.copyOfRange(1, payload.size)
        if (!json.getBoolean("needsSync")) {
          needSince.remove(peer)
          SyncNotices.settled(this, peer)
          return
        }
        until = maxOf(until, now + PEER_STAY_MS)
        if (link.connected(device.address) || now < (nextTry[device.address] ?: 0L)) return
        if (exchanges.values.any { it.peer == peer }) return
        if (now - (lastSync[peer] ?: 0L) < RESYNC_MS) return
        // one side connects: the phone with the smaller id, or this one if
        // the other hasn't for a while (an iPhone in the background can't)
        val since = needSince.getOrPut(peer) { now }
        if (myId < peer || now - since > WAIT_FOR_OTHER_MS) {
          connecting[device.address] = Native.MODE_SYNC
          trying[device.address] = peer
          link.connect(device)
        }
      }
    }
  }

  private val triedIphone = HashMap<String, Long>()

  /**
   * An iPhone can't say in its advertisement who it is or whether it has
   * news, so a paired one is only found by trying: a sync session with an
   * unknown phone ends at the handshake. Tried again after a while, sooner
   * when this phone has changes to give.
   */
  private fun seenIphone(device: BluetoothDevice, rssi: Int, name: String?, now: Long) {
    if (name?.startsWith(Nearby.IOS_MEET) == true) {
      if (!meet) return
      val fresh = seenMeet[device.address]?.optString("name") != name.removePrefix(Nearby.IOS_MEET)
      seenMeet[device.address] = JSONObject()
        .put("address", device.address)
        .put("name", name.removePrefix(Nearby.IOS_MEET))
        .put("rssi", rssi)
        .put("at", now)
      if (fresh) emitStatus()
      return
    }
    if (meet || link.connected(device.address) || exchanges.containsKey(device.address)) return
    val wait = if (Nearby.unsynced() > 0) IPHONE_NEWS_MS else IPHONE_QUIET_MS
    if (now - (triedIphone[device.address] ?: 0L) < wait) return
    triedIphone[device.address] = now
    until = maxOf(until, now + PEER_STAY_MS)
    connecting[device.address] = Native.MODE_SYNC
    link.connect(device)
  }

  override fun onConnected(pipe: Pipe) {
    val mode = connecting.remove(pipe.address) ?: Native.MODE_SYNC
    // the other phone connected here first
    if (exchanges.containsKey(pipe.address)) {
      trying.remove(pipe.address)
      pipe.close()
      return
    }
    val handle = Native.sessionNew(mode, true)
    if (handle == 0L) {
      pipe.close()
      return
    }
    val exchange = Exchange(pipe, handle, mode, ::onStatus)
    exchange.peer = trying.remove(pipe.address) ?: ""
    exchanges[pipe.address] = exchange
    // the first byte tells the other phone whether this is a sync or a pairing
    exchange.start(byteArrayOf(mode.toByte()))
  }

  override fun onIncoming(pipe: Pipe, first: ByteArray) {
    val mode = first[0].toInt()
    val allowed = mode == Native.MODE_SYNC || (mode == Native.MODE_PAIR_CODE && meet)
    val handle = if (allowed && !exchanges.containsKey(pipe.address)) Native.sessionNew(mode, false) else 0L
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
    nextTry[pipe.address] = System.currentTimeMillis() + RETRY_MS
    // the connection never came up
    trying.remove(pipe.address)?.let { SyncNotices.attemptFailed(this, it) }
    // a second connection with the same phone, turned away, leaves the first alone
    val exchange = exchanges[pipe.address]?.takeIf { it.pipe === pipe } ?: return
    exchanges.remove(pipe.address)
    exchange.lost(getString(R.string.sync_lost))
    emitStatus()
  }

  private fun onStatus(exchange: Exchange) {
    // a step that ended after the service stopped must not advertise again
    if (instance !== this) return
    val status = exchange.status
    when (exchange.state) {
      "done" -> {
        val peer = status.optString("peer")
        lastSync[peer] = System.currentTimeMillis()
        needSince.remove(peer)
        SyncNotices.synced(this, peer)
        lastDone = JSONObject(status.toString()).put("at", System.currentTimeMillis()).put("mode", exchange.mode)
        if (exchange.mode == Native.MODE_SYNC) SyncNotices.done(this, status)
        Reminders.synced(this)
        // the beacon now carries the new data version
        link.advertise(if (meet) Nearby.meetPayload() else Nearby.beaconPayload())
        closeWhenSent(exchange)
      }
      "failed" -> {
        if (exchange.mode == Native.MODE_SYNC && exchange.peer.isNotEmpty()) {
          SyncNotices.attemptFailed(this, exchange.peer)
        }
        closeWhenSent(exchange)
      }
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

  /**
   * Android requires one while it runs; the channel keeps it out of sight.
   * A connectedDevice service would show it at once; deferred, Android 12+
   * holds it back 10 seconds, so a short search never shows it. It can't be
   * removed earlier without leaving the foreground, and then Android stops
   * the Bluetooth work within about a minute.
   */
  private fun notification() =
    NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(getString(R.string.sync_looking))
      .setColor(Notify.accentColor(this))
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
      .setContentIntent(openApp(this, "/sync"))
      .build()

}

/** Every channel the app posts to, in one place. */
fun ensureChannel(context: Context) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  val manager = context.getSystemService(NotificationManager::class.java)
  // 0.5 showed the search with an icon in the status bar
  if (manager.getNotificationChannel("sync") != null) manager.deleteNotificationChannel("sync")
  // created again each time: that only renames an existing one, e.g. into German
  manager.createNotificationChannel(
    NotificationChannel(
      NearbyService.CHANNEL,
      context.getString(R.string.sync_channel),
      NotificationManager.IMPORTANCE_MIN
    ).apply { setShowBadge(false) }
  )
  // 0.6.1 had it quieter; a sync result pops up now
  if (manager.getNotificationChannel("results") != null) manager.deleteNotificationChannel("results")
  manager.createNotificationChannel(
    NotificationChannel(
      SyncNotices.CHANNEL,
      context.getString(R.string.results_channel),
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      setShowBadge(false)
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 30, 70, 30, 70, 90)
    }
  )
  // everything a person should see now goes through SyncNotices.CHANNEL
  if (manager.getNotificationChannel("reminders") != null) manager.deleteNotificationChannel("reminders")
  manager.createNotificationChannel(
    NotificationChannel(FileHandoff.CHANNEL, context.getString(R.string.file_channel_name), NotificationManager.IMPORTANCE_DEFAULT)
  )
  manager.createNotificationChannel(
    NotificationChannel(Backups.CHANNEL, context.getString(R.string.backup_channel), NotificationManager.IMPORTANCE_DEFAULT)
  )
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
