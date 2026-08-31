package com.sws2apps.organized

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {

  private var lastSafeAreaScript: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Fully transparent system bars, with no scrim even under 3-button
    // navigation, so the web layer can draw behind them.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )

    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }

    // Content sits below the status bar and display cutout, while the bottom
    // stays edge to edge behind the transparent navigation bar so the bottom
    // menu's gradient shows through it.
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )

      view.setPadding(0, bars.top, 0, 0)
      publishSafeArea(view, bars)

      insets
    }
  }

  /**
   * Hands the system bar heights to the web layer as CSS variables.
   *
   * Android WebView below M136 reports zero for `env(safe-area-inset-*)`, so a
   * floating element positioned with it alone ends up underneath the
   * navigation bar on a large share of devices. The web side reads
   * `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`, so these values
   * win where they exist and `env()` still covers iOS and the browser.
   *
   * The top is published as zero on purpose: this activity already pads the
   * content view below the status bar, and counting it twice would leave a
   * visible gap under the navigation bar.
   */
  private fun publishSafeArea(root: View, bars: Insets) {
    val density = resources.displayMetrics.density
    val toCssPx = { value: Int -> (value / density).roundToInt() }

    val css = buildString {
      append("(function(){var s=document.documentElement.style;")
      append("s.setProperty('--safe-area-inset-top','0px');")
      append("s.setProperty('--safe-area-inset-right','${toCssPx(bars.right)}px');")
      append("s.setProperty('--safe-area-inset-bottom','${toCssPx(bars.bottom)}px');")
      append("s.setProperty('--safe-area-inset-left','${toCssPx(bars.left)}px');")
      append("})()")
    }

    lastSafeAreaScript = css

    findWebView(root)?.evaluateJavascript(css, null)
  }

  /**
   * Reapplies the last known insets. A reload drops the inline properties, and
   * no inset change is guaranteed to follow it.
   */
  override fun onResume() {
    super.onResume()

    val script = lastSafeAreaScript ?: return
    val root = findViewById<ViewGroup>(android.R.id.content) ?: return

    findWebView(root)?.let { webView ->
      webView.post { webView.evaluateJavascript(script, null) }
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view

    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findWebView(view.getChildAt(index))?.let { return it }
      }
    }

    return null
  }
}
