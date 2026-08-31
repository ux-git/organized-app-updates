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
import androidx.core.view.WindowInsetsCompat
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
    // stays edge-to-edge behind the transparent navigation bar. The web layer
    // positions itself against the bottom inset with env(safe-area-inset-*).
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val top = insets.getInsets(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
      ).top
      view.setPadding(0, top, 0, 0)
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
