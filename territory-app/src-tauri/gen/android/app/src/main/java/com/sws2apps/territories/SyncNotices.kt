package com.sws2apps.territories

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * What a background sync tells the person: that it went through (with whom,
 * what came in, when), or that a paired phone is near but they haven't
 * synced, with a button to try right away. While the app is open the page
 * shows it as well.
 */
object SyncNotices {
  const val CHANNEL = "sync_results"
  private const val DONE_BASE = 1000
  private const val FOUND_BASE = 2000

  private fun id(base: Int, peer: String) = base + (peer.hashCode() and 0x3ff)

  fun wanted(context: Context) = Reminders.schedule(context).optBoolean("notify", true)

  /** `status` is the finished session: peer, name, sent, received, items... */
  fun done(context: Context, status: JSONObject) {
    val peer = status.optString("peer")
    cancelFound(context, peer)
    val sent = status.optInt("sent")
    val received = status.optInt("received")
    val introduced = status.optJSONArray("introduced")
    val joined = (0 until (introduced?.length() ?: 0)).map { introduced!!.getString(it) }
    if (sent + received == 0 && joined.isEmpty()) return

    val name = status.optString("name").ifBlank { context.getString(R.string.done_someone) }
    // the page vibrates and shows it too; the notification stays either way
    if (MainActivity.visible) Native.emit("synced", status.toString())
    if (!wanted(context) || !Notify.mayNotify(context)) return

    val lines = mutableListOf<String>()
    val items = describe(context, status.optJSONObject("items"))
    lines += when {
      items.isNotEmpty() && sent > 0 -> context.getString(R.string.done_both, items)
      items.isNotEmpty() -> context.getString(R.string.done_received, items)
      sent > 0 -> context.resources.getQuantityString(R.plurals.done_sent, sent, sent, name)
      else -> ""
    }
    if (joined.isNotEmpty()) {
      lines += context.getString(R.string.done_joined, joined.joinToString(", "), name)
    }
    val conflicts = status.optInt("conflicts")
    if (conflicts > 0) {
      lines += context.resources.getQuantityString(R.plurals.done_conflicts, conflicts, conflicts)
    }
    val text = lines.filter { it.isNotBlank() }.joinToString(" ")

    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.done_title, name))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setColor(Notify.accentColor(context))
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(openApp(context, "/sync"))
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(id(DONE_BASE, peer), notification) }
  }

  /** "2 territories and 1 do-not-call address" from `{"territories": 2, ...}`. */
  private fun describe(context: Context, items: JSONObject?): String {
    if (items == null) return ""
    val res = context.resources
    val parts = mutableListOf<String>()
    var other = 0
    items.keys().forEach { table ->
      val count = items.optInt(table)
      val plural = when (table) {
        "territories" -> R.plurals.item_territories
        "assignments" -> R.plurals.item_assignments
        "do_not_calls" -> R.plurals.item_do_not_calls
        "people" -> R.plurals.item_people
        else -> null
      }
      if (plural == null) other += count else parts += res.getQuantityString(plural, count, count)
    }
    if (other > 0) parts += res.getQuantityString(R.plurals.item_other, other, other)
    return when (parts.size) {
      0 -> ""
      1 -> parts[0]
      else -> parts.dropLast(1).joinToString(", ") + " " + context.getString(R.string.and) + " " + parts.last()
    }
  }

  /** A paired phone is close and has changes, but no sync got through. */
  fun found(context: Context, peer: String) {
    if (!Notify.mayNotify(context)) return
    val name = Nearby.peerName(peer).ifBlank { context.getString(R.string.done_someone) }
    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.found_title, name))
      .setContentText(context.getString(R.string.found_text))
      .setColor(Notify.accentColor(context))
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openApp(context, "/sync?now=1"))
      .addAction(0, context.getString(R.string.found_action), syncNow(context))
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(id(FOUND_BASE, peer), notification) }
  }

  fun cancelFound(context: Context, peer: String) =
    NotificationManagerCompat.from(context).cancel(id(FOUND_BASE, peer))

  /** A tap on a notification button may start the search from the background. */
  private fun syncNow(context: Context): PendingIntent {
    val intent = NearbyService.intent(context, "tap", 3 * 60_000L)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, 7, intent, flags)
    } else {
      PendingIntent.getService(context, 7, intent, flags)
    }
  }
}
