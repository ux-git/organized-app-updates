package com.sws2apps.territories

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The only notifications that say something: a sync brought or sent news
 * (with whom, which territories, when), or a paired phone with news is near
 * but nothing synced, with a button to try. Syncs that bring nothing stay
 * silent. While a result is still in the shade, the next one is added to it
 * instead of showing a second one.
 */
object SyncNotices {
  const val CHANNEL = "sync_results"
  private const val RESULT_ID = 1000
  private const val FOUND_ID = 2000
  private const val MAX_LINES = 6

  fun wanted(context: Context) = Reminders.schedule(context).optBoolean("notify", true)

  private fun showing(context: Context, id: Int): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return runCatching { manager.activeNotifications.any { it.id == id } }.getOrDefault(false)
  }

  private fun strings(array: JSONArray?) =
    (0 until (array?.length() ?: 0)).map { array!!.getString(it) }

  /** `status` is the finished session: peer, name, sent, items, territories... */
  fun done(context: Context, status: JSONObject) {
    NotificationManagerCompat.from(context).cancel(FOUND_ID)
    val sent = status.optInt("sent")
    val received = status.optInt("received")
    val joined = strings(status.optJSONArray("introduced"))
    if (sent + received == 0 && joined.isEmpty()) return

    // the page vibrates and shows it too; the notification stays either way
    if (MainActivity.visible) Native.emit("synced", status.toString())
    if (!wanted(context) || !Notify.mayNotify(context)) return

    val result = merge(context, status)
    val res = context.resources
    val names = strings(result.optJSONArray("names"))
    val territories = result.optJSONObject("territories") ?: JSONObject()
    val numbers = territories.keys().asSequence().toList().sortedWith(byNumber)
    val people = result.optInt("people")
    val conflicts = result.optInt("conflicts")

    val title = context.getString(R.string.done_title, join(context, names))
    val summary = mutableListOf<String>()
    if (numbers.isNotEmpty()) {
      summary += res.getQuantityString(
        R.plurals.done_territories,
        numbers.size,
        join(context, numbers.take(MAX_LINES)) + if (numbers.size > MAX_LINES) "…" else ""
      )
    }
    if (people > 0) summary += res.getQuantityString(R.plurals.done_people, people, people)
    if (summary.isEmpty() && result.optInt("sent") > 0) {
      summary += context.getString(R.string.done_sent_only)
    }
    val joinedAll = strings(result.optJSONArray("joined"))
    if (joinedAll.isNotEmpty()) summary += context.getString(R.string.done_joined, join(context, joinedAll))
    if (conflicts > 0) summary += res.getQuantityString(R.plurals.done_conflicts, conflicts, conflicts)
    val text = summary.joinToString(" ")

    // expanded: one line per territory, with what changed in it
    val style = if (numbers.size > 1) {
      NotificationCompat.InboxStyle().setSummaryText(text).also { inbox ->
        for (number in numbers.take(MAX_LINES)) {
          val what = strings(territories.optJSONArray(number)).map { kind(context, it) }
          inbox.addLine(context.getString(R.string.done_line, number, what.joinToString(", ")))
        }
      }
    } else {
      NotificationCompat.BigTextStyle().bigText(text)
    }

    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(style)
      .setColor(Notify.accentColor(context))
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(openApp(context, "/sync"))
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(RESULT_ID, notification) }
  }

  /** Adds this sync to the result still in the shade, or starts a new one. */
  private fun merge(context: Context, status: JSONObject): JSONObject {
    val prefs = Nearby.prefs(context)
    val result = if (showing(context, RESULT_ID)) {
      runCatching { JSONObject(prefs.getString("result", "{}")!!) }.getOrElse { JSONObject() }
    } else JSONObject()

    val names = strings(result.optJSONArray("names")).toMutableList()
    val name = status.optString("name").ifBlank { context.getString(R.string.done_someone) }
    if (name !in names) names += name
    result.put("names", JSONArray(names))

    val territories = result.optJSONObject("territories") ?: JSONObject()
    val touched = status.optJSONArray("territories") ?: JSONArray()
    for (i in 0 until touched.length()) {
      val item = touched.getJSONObject(i)
      val number = item.optString("number")
      val what = strings(territories.optJSONArray(number)).toMutableSet()
      what += strings(item.optJSONArray("what"))
      territories.put(number, JSONArray(what.toList()))
    }
    result.put("territories", territories)

    val items = status.optJSONObject("items")
    result.put("people", result.optInt("people") + (items?.optInt("people") ?: 0))
    result.put("sent", result.optInt("sent") + status.optInt("sent"))
    result.put("conflicts", result.optInt("conflicts") + status.optInt("conflicts"))
    val joined = strings(result.optJSONArray("joined")).toMutableList()
    joined += strings(status.optJSONArray("introduced")).filter { it !in joined }
    result.put("joined", JSONArray(joined))

    prefs.edit().putString("result", result.toString()).apply()
    return result
  }

  // "M9" before "M10", as in Rust's Store::touched
  private val byNumber = compareBy<String>(
    { it.takeWhile { c -> !c.isDigit() } },
    { it.dropWhile { c -> !c.isDigit() }.takeWhile(Char::isDigit).toIntOrNull() ?: Int.MAX_VALUE },
    { it }
  )

  private fun kind(context: Context, what: String) = when (what) {
    "assignment" -> context.getString(R.string.kind_assignment)
    "do-not-call" -> context.getString(R.string.kind_do_not_call)
    else -> context.getString(R.string.kind_details)
  }

  /** "A", "A and B", "A, B and C" */
  private fun join(context: Context, parts: List<String>) = when (parts.size) {
    0 -> ""
    1 -> parts[0]
    else -> parts.dropLast(1).joinToString(", ") + " " + context.getString(R.string.and) + " " + parts.last()
  }

  /** A paired phone with news is close, but no sync got through. */
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
    runCatching { NotificationManagerCompat.from(context).notify(FOUND_ID, notification) }
  }

  /** A tap on a notification button may start the search from the background. */
  private fun syncNow(context: Context): PendingIntent {
    val intent = NearbyService.intent(context, "tap", 2 * 60_000L)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, 7, intent, flags)
    } else {
      PendingIntent.getService(context, 7, intent, flags)
    }
  }
}
