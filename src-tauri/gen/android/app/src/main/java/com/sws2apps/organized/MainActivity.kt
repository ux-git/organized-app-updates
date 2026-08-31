package com.sws2apps.organized

import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.graphics.Insets
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable

class MainActivity : TauriActivity() {
  /** Shortest time the branded splash stays up, so it never just flickers. */
  private val minimumSplashMs = 600L

  /** Hard ceiling, in case the webview never reports a first draw. */
  private val maximumSplashMs = 6000L

  private var splashOverlay: FrameLayout? = null
  private var splashShownAt = 0L
  private var splashDismissed = false
  private var lastSafeAreaScript: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Native splashscreen (Android 12 SplashScreen API, backported pre-31)
    installSplashScreen()

    // Fully transparent system bars (no scrim, even with 3-button navigation)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT)
    )

    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Remove the automatic contrast scrim behind the navigation bar
      window.isNavigationBarContrastEnforced = false
    }

    // Keep content below the status bar / display cutout while the bottom
    // stays edge-to-edge behind the transparent navigation bar, so the menu
    // gradient shows through it.
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )

      view.setPadding(0, bars.top, 0, 0)
      publishSafeArea(view, bars)

      insets
    }

    showLottieSplash(content)
  }

  /**
   * Continues the system splashscreen with the same Lottie logo animation the
   * web app uses while loading (src/assets/lotties/loader.json).
   *
   * The overlay is dismissed once the webview has actually drawn rather than
   * after a fixed delay, so fast devices are not held back and slow ones are
   * not revealed mid-boot.
   */
  private fun showLottieSplash(content: ViewGroup) {
    val isDark =
      (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES

    val overlay = FrameLayout(this).apply {
      setBackgroundColor(if (isDark) 0xFF1C1C25.toInt() else 0xFFF8F9FF.toInt())
      isClickable = true // swallow touches while visible
    }

    val lottieView = LottieAnimationView(this).apply {
      setAnimation("splash_loader.json")
      repeatCount = LottieDrawable.INFINITE
      playAnimation()
    }

    val sizePx = (240 * resources.displayMetrics.density).toInt()
    overlay.addView(
      lottieView,
      FrameLayout.LayoutParams(sizePx, sizePx, Gravity.CENTER)
    )

    addContentView(
      overlay,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )

    splashOverlay = overlay
    splashShownAt = System.currentTimeMillis()

    awaitWebviewFirstDraw(content)

    // Nothing reported a first draw in time — never strand the user behind
    // an animation they cannot dismiss.
    overlay.postDelayed({ dismissSplash() }, maximumSplashMs)
  }

  private fun awaitWebviewFirstDraw(content: ViewGroup) {
    val webView = findWebView(content)

    if (webView == null) {
      // No webview in the tree yet; fall back to the minimum display time.
      splashOverlay?.postDelayed({ dismissSplash() }, minimumSplashMs)
      return
    }

    webView.viewTreeObserver.addOnPreDrawListener(
      object : ViewTreeObserver.OnPreDrawListener {
        override fun onPreDraw(): Boolean {
          webView.viewTreeObserver.removeOnPreDrawListener(this)

          val elapsed = System.currentTimeMillis() - splashShownAt
          val remaining = (minimumSplashMs - elapsed).coerceAtLeast(0L)

          splashOverlay?.postDelayed({ dismissSplash() }, remaining)
          return true
        }
      }
    )
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

  private fun dismissSplash() {
    if (splashDismissed) return
    splashDismissed = true

    val overlay = splashOverlay ?: return
    splashOverlay = null

    overlay
      .animate()
      .alpha(0f)
      .setDuration(400)
      .withEndAction { (overlay.parent as? ViewGroup)?.removeView(overlay) }
      .start()
  }
}
