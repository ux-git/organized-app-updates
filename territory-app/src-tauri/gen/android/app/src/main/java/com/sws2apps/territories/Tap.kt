package com.sws2apps.territories

import android.app.Activity
import android.content.Context
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.HostApduService
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
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
    setReading(false)
    activity = null
    busy = false
    Native.tapCardReset()
  }

  private fun setReading(on: Boolean) {
    val activity = activity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    runCatching {
      if (on) {
        adapter.enableReaderMode(
          activity,
          ::onTag,
          NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
            NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
          Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000) }
        )
      } else {
        adapter.disableReaderMode(activity)
      }
    }
    reading = on
  }

  private val toggle = object : Runnable {
    override fun run() {
      if (!active) return
      if (!busy) setReading(!reading)
      handler.postDelayed(this, 600L + (Math.random() * 900).toLong())
    }
  }

  // ---- reading the other phone; runs on an NFC thread ----

  private fun onTag(tag: Tag) {
    val iso = IsoDep.get(tag) ?: return
    if (busy) return
    busy = true
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
    if (select && active) {
      busy = true
      setReading(false)
      Native.tapCardReset()
    }
    val response = Native.tapCardApdu(apdu, active)
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

  /** Tells the page once; a pairing then syncs over Bluetooth right away. */
  private fun finish(status: String) {
    busy = false
    if (status.isEmpty()) return
    val json = runCatching { JSONObject(status) }.getOrNull() ?: return
    val state = json.optString("state")
    // a tap that never got past the handshake is just the phones brushing by
    if (state != "done" && state != "failed") return
    Native.emit("tap", json.toString())
    val activity = activity ?: return
    if (state == "done") {
      activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
      Reminders.watchPeers(activity)
      NearbyService.start(activity, "open", 2 * 60_000L)
    } else {
      activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.REJECT)
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
