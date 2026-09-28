package com.sws2apps.territories

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.HostApduService
import android.nfc.tech.IsoDep
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/**
 * Pairing by holding two phones back to back. The exchange itself lives in
 * the Rust core (src-tauri/src/tap.rs); here the phone either answers as an
 * NFC card (TapService) or reads the other one.
 *
 * While Meet is open, a phone switches between reading and answering at
 * random, so two Android phones end up one of each within a second or two.
 * Once a tap starts, the switching stops until it is over, or the answering
 * phone would turn into a reader in the middle of it. An iPhone only reads.
 *
 * While answering, the phone must not look for tags itself: it would find
 * the other phone as an unknown tag, Android would open its own tag window
 * over the app, and the tap would break off. Android 15+ turns the looking
 * off (setDiscoveryTechnology); older versions catch such tags in this app
 * (foreground dispatch) and ignore them.
 */
object Tap {
  private val handler = Handler(Looper.getMainLooper())

  /** Meet is open: taps are answered and read. */
  @Volatile var active = false
    private set

  /** A tap is going on, on either side. */
  @Volatile private var busy = false
  private var reading = false
  private var activity: Activity? = null

  /** Right after a tap the phones are still together; no second one. */
  @Volatile private var quietUntil = 0L
  private val quiet get() = System.currentTimeMillis() < quietUntil
  private const val QUIET_MS = 4000L
  private val listenOnly = Build.VERSION.SDK_INT >= 35

  fun available(context: Context) = NfcAdapter.getDefaultAdapter(context) != null

  fun enabled(context: Context) = NfcAdapter.getDefaultAdapter(context)?.isEnabled == true

  fun start(activity: Activity) {
    this.activity = activity
    active = true
    handler.removeCallbacks(toggle)
    handler.post(toggle)
  }

  fun stop() {
    active = false
    handler.removeCallbacks(toggle)
    activity?.let { activity ->
      NfcAdapter.getDefaultAdapter(activity)?.let { adapter ->
        runCatching { adapter.disableReaderMode(activity) }
        runCatching { adapter.disableForegroundDispatch(activity) }
        if (listenOnly) runCatching { adapter.resetDiscoveryTechnology(activity) }
      }
    }
    reading = false
    activity = null
    busy = false
    Native.tapCardReset()
  }

  private fun setReading(on: Boolean) {
    val activity = activity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    if (on) {
      runCatching { adapter.disableForegroundDispatch(activity) }
      if (listenOnly) runCatching { adapter.resetDiscoveryTechnology(activity) }
      runCatching {
        adapter.enableReaderMode(
          activity,
          ::onTag,
          NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
          Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000) }
        )
      }
    } else {
      runCatching { adapter.disableReaderMode(activity) }
      if (listenOnly) {
        runCatching {
          adapter.setDiscoveryTechnology(activity, NfcAdapter.FLAG_READER_DISABLE, NfcAdapter.FLAG_LISTEN_KEEP)
        }
      } else {
        runCatching { adapter.enableForegroundDispatch(activity, swallow(activity), null, null) }
      }
    }
    reading = on
  }

  /** Tags found while answering come back to this app, which ignores them. */
  private fun swallow(activity: Activity) =
    PendingIntent.getActivity(
      activity,
      0x7a9,
      Intent(activity, activity.javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_MUTABLE
    )

  fun isTagIntent(intent: Intent?) = intent?.action in listOf(
    NfcAdapter.ACTION_TAG_DISCOVERED,
    NfcAdapter.ACTION_TECH_DISCOVERED,
    NfcAdapter.ACTION_NDEF_DISCOVERED,
  )

  private val toggle = object : Runnable {
    override fun run() {
      if (!active) return
      if (quiet) {
        if (reading) setReading(false)
      } else if (!busy) {
        setReading(!reading)
      }
      handler.postDelayed(this, 600L + (Math.random() * 900).toLong())
    }
  }

  // ---- reading the other phone; runs on an NFC thread ----

  private fun onTag(tag: Tag) {
    val iso = IsoDep.get(tag) ?: return
    if (busy) return
    busy = true
    handler.post(::touched)
    val handle = Native.tapReaderNew()
    try {
      iso.connect()
      iso.timeout = 2000
      while (handle != 0L) {
        val command = Native.tapReaderNext(handle)
        if (command.isEmpty()) break
        if (!Native.tapReaderResponse(handle, iso.transceive(command))) break
      }
    } catch (_: Exception) {
      // the phones moved apart; the status says how far it got
    } finally {
      runCatching { iso.close() }
    }
    val status = if (handle != 0L) Native.tapReaderStatus(handle) else ""
    Native.tapReaderClose(handle)
    handler.post { finish(status) }
  }

  // ---- answering as a card; TapService calls these on the main thread ----

  fun onApdu(apdu: ByteArray): ByteArray {
    val select = apdu.size > 1 && apdu[1] == 0xA4.toByte()
    if (select && active && !quiet) {
      busy = true
      // only if needed: switching the radio again would drop this very tap
      if (reading) setReading(false)
      Native.tapCardReset()
      touched()
    }
    val response = Native.tapCardApdu(apdu, active && !quiet)
    if (Native.tapCardDone()) {
      val status = Native.tapCardStatus()
      Native.tapCardReset()
      handler.post { finish(status) }
    }
    return response
  }

  fun onCardLeft() {
    if (!busy) return
    val status = Native.tapCardStatus()
    Native.tapCardReset()
    finish(status)
  }

  /** The phones found each other: a knock, and "keep holding" on the page. */
  private fun touched() {
    activity?.let { Haptics.play(it, "contact") }
    Native.emit("tap", JSONObject().put("state", "touching").toString())
  }

  /** Tells the page once; a pairing then syncs over Bluetooth right away. */
  private fun finish(status: String) {
    busy = false
    val json = runCatching { JSONObject(status) }.getOrNull() ?: JSONObject()
    val state = json.optString("state")
    // a tap that never got past the handshake is just the phones brushing by
    if (state != "done" && state != "failed") {
      Native.emit("tap", JSONObject().put("state", "apart").toString())
      return
    }
    Native.emit("tap", json.toString())
    quietUntil = System.currentTimeMillis() + QUIET_MS
    val activity = activity ?: return
    // paired: the page plays it as it shows it
    if (state == "done") {
      Reminders.apply(activity)
      NearbyService.start(activity, "open", 2 * 60_000L)
    } else {
      Haptics.play(activity, "error")
    }
    (activity as? MainActivity)?.emitNearby()
  }
}

class TapService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
    Native.open(filesDir.absolutePath)
    return Tap.onApdu(commandApdu)
  }

  override fun onDeactivated(reason: Int) = Tap.onCardLeft()
}
