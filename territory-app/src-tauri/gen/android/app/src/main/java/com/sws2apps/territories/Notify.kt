package com.sws2apps.territories

import android.annotation.SuppressLint
import android.app.Notification
import android.content.Context
import android.util.TypedValue
import android.view.ContextThemeWrapper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object Notify {
  /** The permission on Android 13+, and the app's switch in the settings everywhere. */
  fun mayNotify(context: Context): Boolean =
    NotificationManagerCompat.from(context).areNotificationsEnabled()

  @SuppressLint("MissingPermission") // mayNotify is the check
  fun post(context: Context, id: Int, notification: Notification) {
    if (mayNotify(context)) runCatching { NotificationManagerCompat.from(context).notify(id, notification) }
  }

  /** What a locked screen shows in place of a notification with names or territory numbers. */
  fun lockScreen(context: Context, channel: String, title: String): Notification =
    NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setColor(accentColor(context))
      .build()

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
