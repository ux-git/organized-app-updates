package com.sws2apps.territories

import android.Manifest
import android.os.Bundle
import android.view.HapticFeedbackConstants
import androidx.activity.ComponentActivity
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory

/**
 * Films a pairing code, or a transfer shown as a loop of codes
 * ("OTQ:part/parts:text"). The parts are collected here, in any order, and
 * only the whole text goes back to the page.
 */
class ScanActivity : ComponentActivity() {
  private lateinit var view: DecoratedBarcodeView
  private val parts = HashMap<Int, String>()
  private var total = 0
  private var done = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    view = DecoratedBarcodeView(this)
    view.barcodeView.decoderFactory = DefaultDecoderFactory(listOf(BarcodeFormat.QR_CODE))
    view.setStatusText(getString(R.string.scan_hint))
    setContentView(view)
    view.decodeContinuous(BarcodeCallback { result -> onCode(result.text ?: return@BarcodeCallback) })
    if (!Nearby.granted(this, Manifest.permission.CAMERA)) {
      requestPermissions(arrayOf(Manifest.permission.CAMERA), 1)
    }
  }

  private fun onCode(text: String) {
    if (done) return
    val match = PART.matchEntire(text)
    if (match == null) {
      finishWith(text)
      return
    }
    val (index, count, data) = match.destructured
    total = count.toInt()
    if (parts.put(index.toInt(), data) == null) {
      view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }
    view.setStatusText(getString(R.string.scan_progress, parts.size, total))
    if (parts.size == total) finishWith((1..total).joinToString("") { parts[it] ?: "" })
  }

  private fun finishWith(text: String) {
    done = true
    Haptics.play(this, "synced")
    MainActivity.received = text
    finish()
  }

  override fun onResume() {
    super.onResume()
    view.resume()
  }

  override fun onPause() {
    view.pause()
    super.onPause()
  }

  companion object {
    private val PART = Regex("""OTQ:(\d+)/(\d+):(.*)""", RegexOption.DOT_MATCHES_ALL)
  }
}
