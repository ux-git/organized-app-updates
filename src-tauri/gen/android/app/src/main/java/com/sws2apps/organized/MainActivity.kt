package com.sws2apps.organized

import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable

class MainActivity : TauriActivity() {
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
    // stays edge-to-edge behind the transparent navigation bar
    val content = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val top = insets.getInsets(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
      ).top
      view.setPadding(0, top, 0, 0)
      insets
    }

    showLottieSplash()
  }

  /**
   * Continues the system splashscreen with the same Lottie logo animation the
   * web app uses while loading (src/assets/lotties/loader.json), then fades
   * out to reveal the webview.
   */
  private fun showLottieSplash() {
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

    // Keep the animation up while the webview boots, then fade it away
    overlay.postDelayed({
      overlay
        .animate()
        .alpha(0f)
        .setDuration(400)
        .withEndAction { (overlay.parent as? ViewGroup)?.removeView(overlay) }
        .start()
    }, 2600)
  }
}
