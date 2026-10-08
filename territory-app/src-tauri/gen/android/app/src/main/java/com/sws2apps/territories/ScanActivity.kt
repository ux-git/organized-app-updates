package com.sws2apps.territories

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.journeyapps.barcodescanner.camera.CenterCropStrategy

/**
 * Films a pairing code, or a transfer shown as a loop of codes
 * ("OTQ:part/parts:text"). The parts are collected here, in any order, and
 * only the whole text goes back to the page.
 */
class ScanActivity : ComponentActivity() {
  private lateinit var camera: BarcodeView
  private lateinit var hint: TextView
  private lateinit var torchButton: ImageButton
  private var torch = false
  private val parts = HashMap<Int, String>()
  private var total = 0
  private var done = false

  // refused: back to the page, which asks again or points to the settings
  private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (!granted) finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // the scene is dark whatever the app's theme
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    camera = BarcodeView(this)
    camera.decoderFactory = DefaultDecoderFactory(listOf(BarcodeFormat.QR_CODE))
    camera.previewScalingStrategy = CenterCropStrategy()

    val close = iconButton(R.drawable.ic_scan_close, getString(R.string.scan_close)) { finish() }
    torchButton = iconButton(R.drawable.ic_flashlight_off, getString(R.string.scan_torch_on)) { setTorch(!torch) }
    torchButton.visibility =
      if (packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH)) View.VISIBLE else View.INVISIBLE
    val title = TextView(this).apply {
      text = getString(R.string.scan_title)
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      gravity = Gravity.CENTER
    }
    val top = FrameLayout(this).apply {
      addView(close, FrameLayout.LayoutParams(dp(40), dp(40), Gravity.START or Gravity.CENTER_VERTICAL))
      addView(title, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
      addView(torchButton, FrameLayout.LayoutParams(dp(40), dp(40), Gravity.END or Gravity.CENTER_VERTICAL))
    }

    hint = TextView(this).apply {
      text = getString(R.string.scan_hint)
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      gravity = Gravity.CENTER
    }
    val enterCode = Button(this).apply {
      text = getString(R.string.scan_enter_code)
      isAllCaps = false
      setTextColor(ACCENT)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      stateListAnimator = null
      minHeight = dp(48)
      setPadding(dp(20), 0, dp(20), 0)
      background = surface(ACCENT, dp(1))
      setOnClickListener {
        done = true
        MainActivity.received = ENTER_CODE
        finish()
      }
    }
    val bottom = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      addView(hint, LinearLayout.LayoutParams(-1, -2))
      addView(enterCode, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(16) })
    }

    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.BLACK)
      addView(camera, FrameLayout.LayoutParams(-1, -1))
      addView(Viewfinder(context), FrameLayout.LayoutParams(-1, -1))
      addView(top, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
      addView(bottom, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
    }
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      top.setPadding(bars.left + dp(16), bars.top + dp(8), bars.right + dp(16), dp(8))
      bottom.setPadding(bars.left + dp(24), dp(16), bars.right + dp(24), bars.bottom + dp(24))
      insets
    }
    setContentView(root)

    camera.decodeContinuous(BarcodeCallback { result -> onCode(result.text ?: return@BarcodeCallback) })
    if (!Nearby.granted(this, Manifest.permission.CAMERA)) {
      askCamera.launch(Manifest.permission.CAMERA)
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
    // any code can be in front of the camera
    val part = index.toIntOrNull() ?: return
    val of = count.toIntOrNull()?.takeIf { part in 1..it } ?: return
    // another transfer's loop: start over
    if (of != total) parts.clear()
    total = of
    if (parts.put(part, data) == null) {
      camera.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }
    hint.text = getString(R.string.scan_progress, parts.size, total)
    if (parts.size == total) finishWith((1..total).joinToString("") { parts[it] ?: "" })
  }

  private fun finishWith(text: String) {
    done = true
    // read: a knock now, the outcome on the page
    Haptics.play(this, "contact")
    MainActivity.received = text
    finish()
  }

  private fun setTorch(on: Boolean) {
    torch = on
    camera.setTorch(on)
    torchButton.setImageResource(if (on) R.drawable.ic_flashlight_on else R.drawable.ic_flashlight_off)
    torchButton.contentDescription = getString(if (on) R.string.scan_torch_off else R.string.scan_torch_on)
  }

  private fun iconButton(icon: Int, label: String, onClick: () -> Unit) = ImageButton(this).apply {
    setImageResource(icon)
    contentDescription = label
    background = surface(0x3DFFFFFF, dp(0.5f))
    setOnClickListener { onClick() }
  }

  private fun surface(stroke: Int, strokeWidth: Int) = RippleDrawable(
    ColorStateList.valueOf(0x33FFFFFF),
    GradientDrawable().apply {
      setColor(0xD91E2028.toInt())
      setStroke(maxOf(strokeWidth, 1), stroke)
      cornerRadius = dp(8).toFloat()
    },
    null,
  )

  private fun dp(value: Number) = (value.toFloat() * resources.displayMetrics.density + 0.5f).toInt()

  override fun onResume() {
    super.onResume()
    camera.resume()
  }

  override fun onPause() {
    camera.pause()
    // the light goes out with the camera
    if (torch) setTorch(false)
    super.onPause()
  }

  /** The dimmed scene with a clear rounded square and accent corners. */
  private class Viewfinder(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private val mask = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x8C0A0C14.toInt() }
    private val corners = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = ACCENT
      style = Paint.Style.STROKE
      strokeWidth = 3 * density
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    private val hole = RectF()
    private val path = Path()

    override fun onDraw(canvas: Canvas) {
      val side = minOf(width * 0.7f, 300 * density)
      val radius = 16 * density
      hole.set((width - side) / 2, (height - side) / 2, (width + side) / 2, (height + side) / 2)
      path.reset()
      path.fillType = Path.FillType.EVEN_ODD
      path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
      path.addRoundRect(hole, radius, radius, Path.Direction.CW)
      canvas.drawPath(path, mask)

      // just outside the clear square, so the code's edge stays visible
      val gap = 4 * density
      val r = radius + gap
      val arm = 28 * density
      val l = hole.left - gap
      val t = hole.top - gap
      val rt = hole.right + gap
      val b = hole.bottom + gap
      path.reset()
      path.fillType = Path.FillType.WINDING
      path.moveTo(l, t + arm)
      path.arcTo(l, t, l + 2 * r, t + 2 * r, 180f, 90f, false)
      path.lineTo(l + arm, t)
      path.moveTo(rt - arm, t)
      path.arcTo(rt - 2 * r, t, rt, t + 2 * r, 270f, 90f, false)
      path.lineTo(rt, t + arm)
      path.moveTo(rt, b - arm)
      path.arcTo(rt - 2 * r, b - 2 * r, rt, b, 0f, 90f, false)
      path.lineTo(rt - arm, b)
      path.moveTo(l + arm, b)
      path.arcTo(l, b - 2 * r, l + 2 * r, b, 90f, 90f, false)
      path.lineTo(l, b - arm)
      canvas.drawPath(path, corners)
    }
  }

  companion object {
    private val PART = Regex("""OTQ:(\d+)/(\d+):(.*)""", RegexOption.DOT_MATCHES_ALL)
    private const val ACCENT = 0xFF8F9CF9.toInt()
    /** Sync.tsx opens the code entry for it. */
    const val ENTER_CODE = "enter-code"
  }
}
