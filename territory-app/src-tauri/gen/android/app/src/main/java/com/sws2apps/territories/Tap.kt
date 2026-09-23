package com.sws2apps.territories

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.HostApduService
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/**
 * Pairing by holding two phones back to back. One phone answers as an NFC
 * card (TapService), the other reads it (Tap.reader); the Rust pairing
 * session runs over the APDUs. A few centimetres is proof enough that these
 * are the two phones in front of each other, so no code is compared.
 *
 * Two Android phones in Meet both want to read; each switches reading on and
 * off at random, so within a second or two one reads while the other answers.
 * An iPhone only reads, and pairs with the Android phone answering.
 */
object Tap {
  // proprietary AID: F0 + "ORGTERR"
  val AID = byteArrayOf(0xF0.toByte(), 0x4F, 0x52, 0x47, 0x54, 0x45, 0x52, 0x52)
  const val INS_DATA: Byte = 0x10
  const val MAX_DATA = 240
  private val OK = byteArrayOf(0x90.toByte(), 0x00)
  private val NOT_FOUND = byteArrayOf(0x6A, 0x82.toByte())

  /** Meet is open: this phone answers taps and reads them. */
  @Volatile var active = false

  private val handler = Handler(Looper.getMainLooper())
  private var reading = false
  private var activity: Activity? = null

  fun start(activity: Activity) {
    this.activity = activity
    active = true
    handler.removeCallbacks(toggle)
    handler.post(toggle)
  }

  fun stop() {
    active = false
    handler.removeCallbacks(toggle)
    activity?.let { runCatching { NfcAdapter.getDefaultAdapter(it)?.disableReaderMode(it) } }
    reading = false
    activity = null
  }

  private val toggle = object : Runnable {
    override fun run() {
      val activity = activity ?: return
      val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
      reading = !reading
      runCatching {
        if (reading) {
          adapter.enableReaderMode(
            activity,
            ::onTag,
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
              NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
            Bundle()
          )
        } else {
          adapter.disableReaderMode(activity)
        }
      }
      handler.postDelayed(this, 700L + (Math.random() * 900).toLong())
    }
  }

  private fun apdu(ins: Byte, data: ByteArray): ByteArray {
    val header = byteArrayOf(if (ins == INS_DATA) 0x80.toByte() else 0x00, ins, 0x00, 0x00, data.size.toByte())
    return header + data + byteArrayOf(0x00)
  }

  /** Reading side; runs on an NFC thread. */
  private fun onTag(tag: Tag) {
    val iso = IsoDep.get(tag) ?: return
    handler.removeCallbacks(toggle)
    var handle = 0L
    try {
      iso.connect()
      iso.timeout = 3000
      val select = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, AID.size.toByte()) + AID + byteArrayOf(0x00)
      if (!iso.transceive(select).endsWith(OK)) return
      handle = Native.sessionNew(Native.MODE_PAIR_TAP, true)
      var outbox = Native.sessionStart(handle)
      for (round in 0 until 200) {
        val part = outbox.copyOfRange(0, minOf(MAX_DATA, outbox.size))
        outbox = outbox.copyOfRange(part.size, outbox.size)
        val response = iso.transceive(apdu(INS_DATA, part))
        if (!response.endsWith(OK)) break
        val data = response.copyOfRange(0, response.size - 2)
        if (data.isNotEmpty()) outbox += Native.sessionFeed(handle, data)
        val status = JSONObject(Native.sessionStatus(handle))
        val finished = status.optString("state") in setOf("done", "failed")
        if (finished && outbox.isEmpty() && data.isEmpty()) break
      }
      done(handle)
    } catch (_: Exception) {
      if (handle != 0L) done(handle)
    } finally {
      runCatching { iso.close() }
      handler.postDelayed(toggle, 1500)
    }
  }

  // ---- answering side ----

  private var cardHandle = 0L
  private var cardOutbox = ByteArray(0)

  fun onApdu(apdu: ByteArray): ByteArray {
    if (apdu.size >= 4 && apdu[1] == 0xA4.toByte()) {
      if (!active) return NOT_FOUND
      if (cardHandle != 0L) Native.sessionClose(cardHandle)
      cardHandle = Native.sessionNew(Native.MODE_PAIR_TAP, false)
      cardOutbox = Native.sessionStart(cardHandle)
      return OK
    }
    if (apdu.size < 5 || apdu[1] != INS_DATA || cardHandle == 0L) return NOT_FOUND
    val length = apdu[4].toInt() and 0xFF
    val data = apdu.copyOfRange(5, minOf(apdu.size, 5 + length))
    if (data.isNotEmpty()) cardOutbox += Native.sessionFeed(cardHandle, data)
    val part = cardOutbox.copyOfRange(0, minOf(MAX_DATA, cardOutbox.size))
    cardOutbox = cardOutbox.copyOfRange(part.size, cardOutbox.size)
    val status = JSONObject(Native.sessionStatus(cardHandle))
    if (status.optString("state") in setOf("done", "failed") && cardOutbox.isEmpty()) {
      val handle = cardHandle
      handler.postDelayed({ done(handle) }, 300)
    }
    return part + OK
  }

  fun onCardLeft() {
    val handle = cardHandle
    if (handle != 0L) done(handle)
  }

  /** Tells the page, and syncs the data over Bluetooth right away. */
  private fun done(handle: Long) {
    val status = runCatching { JSONObject(Native.sessionStatus(handle)) }.getOrNull()
    Native.sessionClose(handle)
    if (handle == cardHandle) {
      cardHandle = 0L
      cardOutbox = ByteArray(0)
    }
    status ?: return
    handler.post {
      val activity = activity
      Native.emit("tap", status.toString())
      if (status.optString("state") == "done" && activity != null) {
        activity.window.decorView.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
        Reminders.watchPeers(activity)
        NearbyService.start(activity, "open", 2 * 60_000L)
      }
    }
  }

  private fun ByteArray.endsWith(suffix: ByteArray) =
    size >= suffix.size && copyOfRange(size - suffix.size, size).contentEquals(suffix)
}

class TapService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
    Native.open(filesDir.absolutePath)
    return Tap.onApdu(commandApdu)
  }

  override fun onDeactivated(reason: Int) = Tap.onCardLeft()
}
