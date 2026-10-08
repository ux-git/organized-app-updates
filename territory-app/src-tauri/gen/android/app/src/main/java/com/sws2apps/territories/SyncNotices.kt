package com.sws2apps.territories

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
  private const val EXACT_ID = 3000
  private const val EXACT = "exact_needed"
  private const val MAX_LINES = 5
  private const val FOUND_AFTER = 3
  private const val FOUND_AGAIN_MS = 30 * 60_000L
  private const val ATTEMPT_GAP_MS = 10_000L

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
    val sent = status.optInt("sent")
    val received = status.optInt("received")
    val joined = strings(status.optJSONArray("introduced"))
    if (sent + received == 0 && joined.isEmpty()) {
      // only clashing values came in: the page still offers to review them
      if (status.optInt("conflicts") > 0 && MainActivity.visible) Native.emit("synced", status.toString())
      return
    }

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
        join(context, numbers.take(MAX_LINES).map { number(context, it) }) + if (numbers.size > MAX_LINES) "…" else ""
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
    val style = if (numbers.isNotEmpty()) {
      NotificationCompat.InboxStyle().setSummaryText(text).also { inbox ->
        for (number in numbers.take(MAX_LINES)) {
          val what = strings(territories.optJSONArray(number)).map { kind(context, it) }
          inbox.addLine(context.getString(R.string.done_line, number(context, number), what.joinToString(", ")))
        }
        if (numbers.size > MAX_LINES) {
          inbox.addLine(context.getString(R.string.done_more, numbers.size - MAX_LINES))
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
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(Notify.lockScreen(context, CHANNEL, context.getString(R.string.done_public)))
      .build()
    Notify.post(context, RESULT_ID, notification)
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
      territories.put(number, JSONArray(settle(what)))
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

  // the order Rust's Store::touched tells them in
  private val KINDS = listOf(
    "created", "deleted", "assigned", "returned", "assignment-removed",
    "border", "details", "dnc-added", "dnc-changed", "dnc-removed"
  )

  /** A territory added or deleted needs no more words. */
  private fun settle(what: Set<String>): List<String> {
    listOf("deleted", "created").firstOrNull { it in what }?.let { return listOf(it) }
    return what.sortedBy { KINDS.indexOf(it) }
  }

  private fun kind(context: Context, what: String) = context.getString(
    when (what) {
      "created" -> R.string.kind_created
      "deleted" -> R.string.kind_deleted
      "border" -> R.string.kind_border
      "assigned" -> R.string.kind_assigned
      "returned" -> R.string.kind_returned
      "assignment-removed" -> R.string.kind_assignment_removed
      "dnc-added" -> R.string.kind_dnc_added
      "dnc-removed" -> R.string.kind_dnc_removed
      "dnc-changed" -> R.string.kind_dnc_changed
      "assignment" -> R.string.kind_assignment
      "do-not-call" -> R.string.kind_do_not_call
      else -> R.string.kind_details
    }
  )

  /** "#12" in English; German puts "Nr." once before the numbers. */
  private fun number(context: Context, number: String) = context.getString(R.string.number, number)

  /** "A", "A and B", "A, B and C" */
  private fun join(context: Context, parts: List<String>) = when (parts.size) {
    0 -> ""
    1 -> parts[0]
    else -> parts.dropLast(1).joinToString(", ") + " " + context.getString(R.string.and) + " " + parts.last()
  }

  // kept in prefs: the receiver and the service each live only a short while
  private fun fails(context: Context, peer: String) = Nearby.prefs(context).getInt("fails.$peer", 0)

  /** A sync with this phone was refused, failed, timed out or lost its connection. */
  fun attemptFailed(context: Context, peer: String) {
    val prefs = Nearby.prefs(context)
    val now = System.currentTimeMillis()
    // retries seconds apart are one attempt
    if (now - prefs.getLong("failed_at.$peer", 0L) < ATTEMPT_GAP_MS) return
    prefs.edit().putLong("failed_at.$peer", now).putInt("fails.$peer", fails(context, peer) + 1).apply()
  }

  /** Three attempts in a row failed, and it wasn't said lately. */
  fun stuck(context: Context, peer: String) =
    fails(context, peer) >= FOUND_AFTER &&
      System.currentTimeMillis() - Nearby.prefs(context).getLong("found_at.$peer", 0L) >= FOUND_AGAIN_MS

  fun synced(context: Context, peer: String) {
    Nearby.prefs(context).edit().remove("fails.$peer").remove("failed_at.$peer").remove("found_at.$peer").apply()
    if (Nearby.unsynced() == 0) cancelFound(context) else settled(context, peer)
  }

  /** Nothing is left to sync with this phone. */
  fun settled(context: Context, peer: String) {
    if (Nearby.prefs(context).getString("found_peer", null) == peer) cancelFound(context)
  }

  private fun cancelFound(context: Context) {
    Nearby.prefs(context).edit().remove("found_peer").apply()
    NotificationManagerCompat.from(context).cancel(FOUND_ID)
  }

  /** A paired phone with news is close, but no sync got through. */
  fun found(context: Context, peer: String) {
    if (!stuck(context, peer) || !Notify.mayNotify(context)) return
    Nearby.prefs(context).edit()
      .putLong("found_at.$peer", System.currentTimeMillis())
      .putString("found_peer", peer)
      .apply()
    val name = Nearby.peerName(peer).ifBlank { context.getString(R.string.found_someone) }
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
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(
        Notify.lockScreen(context, CHANNEL, context.getString(R.string.found_title, context.getString(R.string.found_someone)))
      )
      .build()
    Notify.post(context, FOUND_ID, notification)
  }

  /**
   * A burst couldn't start the search: from the background, Android 12+
   * allows that after an exact alarm, not an inexact one. Said once, until a
   * burst gets through again; the page reads it from the status.
   */
  fun exactAlarms(context: Context, needed: Boolean) {
    val prefs = Nearby.prefs(context)
    if (needed == prefs.getBoolean(EXACT, false)) return
    prefs.edit().putBoolean(EXACT, needed).apply()
    if (!needed) {
      NotificationManagerCompat.from(context).cancel(EXACT_ID)
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !Notify.mayNotify(context)) return
    val settings = PendingIntent.getActivity(
      context,
      EXACT_ID,
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val text = context.getString(R.string.exact_text)
    ensureChannel(context)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.exact_title))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setColor(Notify.accentColor(context))
      .setAutoCancel(true)
      .setContentIntent(settings)
      .build()
    Notify.post(context, EXACT_ID, notification)
  }

  fun exactAlarmsNeeded(context: Context) =
    Nearby.prefs(context).getBoolean(EXACT, false) && !Reminders.canExact(context)

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
