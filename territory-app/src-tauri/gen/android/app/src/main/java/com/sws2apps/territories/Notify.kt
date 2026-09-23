package com.sws2apps.territories

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.TypedValue
import android.view.ContextThemeWrapper
import androidx.core.content.ContextCompat

object Notify {
  fun mayNotify(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED

  /** The page's accent (res/values/accents.xml), for notification tints. */
  fun accentColor(context: Context): Int {
    val accent = context.getSharedPreferences("shell", Context.MODE_PRIVATE)
      .getString(MainActivity.PREF_ACCENT, null)
    val themed = ContextThemeWrapper(context, R.style.Theme_app)
    MainActivity.ACCENTS[accent]?.let { themed.theme.applyStyle(it, true) }
    val value = TypedValue()
    themed.theme.resolveAttribute(android.R.attr.colorControlActivated, value, true)
    return value.data
  }
}
