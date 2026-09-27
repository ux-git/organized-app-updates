package com.sws2apps.territories

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Full backups (src-tauri/src/backup.rs) saved to a folder the user picked,
 * by hand or on a schedule: daily, weekly or monthly at a time of day. An
 * alarm wakes the app for it, as Reminders does for bursts; one missed while
 * the phone was off is made when the app next opens. Only a failure notifies.
 */
object Backups {
  private const val ACTION = "com.sws2apps.territories.BACKUP"
  private const val FAILED_ID = 53
  private const val CHANNEL = "backup"
  private const val KEEP = 10
  private const val PREFIX = "Territories-backup-"
  private const val SUFFIX = ".territories"
  private const val EARLY_MS = 60_000L

  private val worker = Executors.newSingleThreadExecutor()

  @Volatile var running = false
    private set

  /** When the last backup, made or failed, ended; for the page's Back up now. */
  @Volatile private var ended = 0L

  fun prefs(context: Context) = context.getSharedPreferences("backup", Context.MODE_PRIVATE)

  private fun folder(context: Context): Uri? = prefs(context).getString("folder", null)?.let(Uri::parse)

  /** Picked, and Android still lets the app write there. */
  private fun canWrite(context: Context, tree: Uri) =
    context.contentResolver.persistedUriPermissions.any { it.uri == tree && it.isWritePermission }

  private fun folderName(context: Context, tree: Uri): String = runCatching {
    val doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    context.contentResolver.query(doc, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)
      ?.use { if (it.moveToFirst()) it.getString(0) else null }
  }.getOrNull() ?: tree.lastPathSegment?.substringAfterLast(':').orEmpty()

  fun status(context: Context): JSONObject {
    val prefs = prefs(context)
    val tree = folder(context)
    return JSONObject()
      .put("frequency", prefs.getString("frequency", "off"))
      .put("hour", prefs.getInt("hour", 2))
      .put("minute", prefs.getInt("minute", 0))
      .put("folder", tree?.let { folderName(context, it) } ?: JSONObject.NULL)
      .put("folderOk", tree != null && canWrite(context, tree))
      .put("last", prefs.getString("last", null)?.let(::JSONObject) ?: JSONObject.NULL)
      .put("error", prefs.getString("error", null) ?: JSONObject.NULL)
      .put("next", next(context) ?: JSONObject.NULL)
      .put("running", running)
      .put("ended", ended)
  }

  /** Tells the page, when it is open. */
  fun emit(context: Context) = Native.emit("backup", status(context).toString())

  fun setSchedule(context: Context, args: JSONObject) {
    val frequency = args.optString("frequency", "off").takeIf { it in listOf("daily", "weekly", "monthly") } ?: "off"
    prefs(context).edit()
      .putString("frequency", frequency)
      .putInt("hour", args.optInt("hour", 2).coerceIn(0, 23))
      .putInt("minute", args.optInt("minute", 0).coerceIn(0, 59))
      .putLong("since", System.currentTimeMillis())
      .apply()
    schedule(context)
  }

  fun setFolder(context: Context, tree: Uri) {
    val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    runCatching { context.contentResolver.takePersistableUriPermission(tree, flags) }
    folder(context)?.takeIf { it != tree }?.let { old ->
      runCatching { context.contentResolver.releasePersistableUriPermission(old, flags) }
    }
    prefs(context).edit().putString("folder", tree.toString()).remove("error").apply()
    NotificationManagerCompat.from(context).cancel(FAILED_ID)
  }

  /** The next scheduled backup, in ms; null when they are off. */
  fun next(context: Context): Long? {
    val prefs = prefs(context)
    val field = when (prefs.getString("frequency", "off")) {
      "daily" -> Calendar.DAY_OF_YEAR
      "weekly" -> Calendar.WEEK_OF_YEAR
      "monthly" -> Calendar.MONTH
      else -> return null
    }
    val lastRun = prefs.getLong("lastRun", 0L)
    // a period after the last run, less most of a day: a late run keeps the time
    val base = if (lastRun > 0) {
      Calendar.getInstance().apply {
        timeInMillis = lastRun
        add(field, 1)
        add(Calendar.HOUR_OF_DAY, -23)
      }.timeInMillis
    } else {
      prefs.getLong("since", System.currentTimeMillis())
    }
    return Calendar.getInstance().apply {
      timeInMillis = base
      set(Calendar.HOUR_OF_DAY, prefs.getInt("hour", 2))
      set(Calendar.MINUTE, prefs.getInt("minute", 0))
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      if (timeInMillis <= base) add(Calendar.DAY_OF_YEAR, 1)
    }.timeInMillis
  }

  private fun due(context: Context) =
    next(context)?.let { System.currentTimeMillis() >= it - EARLY_MS } == true

  private fun alarm(context: Context) =
    PendingIntent.getBroadcast(
      context,
      ACTION.hashCode(),
      Intent(context, BackupReceiver::class.java).setAction(ACTION),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  @android.annotation.SuppressLint("MissingPermission")
  fun schedule(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    val intent = alarm(context)
    manager.cancel(intent)
    val at = next(context) ?: return
    // allowed while dozing; Android may still hold it to its next maintenance window
    if (Reminders.canExact(context)) {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
    }
  }

  /** The app opened: one that was missed while the phone was off. */
  fun catchUp(context: Context) {
    if (!running && due(context)) worker.execute { automatic(context) }
  }

  fun onAlarm(context: Context, done: () -> Unit) {
    worker.execute {
      try {
        if (due(context)) automatic(context) else schedule(context)
      } finally {
        done()
      }
    }
  }

  private fun automatic(context: Context) {
    if (!due(context)) return
    val ok = run(context)
    prefs(context).edit().putLong("lastRun", System.currentTimeMillis()).apply()
    schedule(context)
    if (!ok) notifyFailed(context)
  }

  fun runNow(context: Context) {
    worker.execute { run(context) }
  }

  private fun run(context: Context): Boolean {
    running = true
    emit(context)
    try {
      val tree = folder(context)
      if (tree == null || !canWrite(context, tree)) return fail(context, "folder")
      val text = Native.backup()
      if (text.isEmpty()) return fail(context, "export")
      val bytes = text.toByteArray(Charsets.UTF_8)
      val name = PREFIX + SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.ROOT).format(Date()) + SUFFIX
      val written = runCatching { write(context, tree, name, bytes) }.getOrDefault(false)
      if (!written) return fail(context, if (canWrite(context, tree)) "write" else "folder")
      runCatching { prune(context, tree) }
      prefs(context).edit()
        .putString(
          "last",
          JSONObject()
            .put("at", System.currentTimeMillis())
            .put("size", bytes.size)
            .put("name", name)
            .put("folder", folderName(context, tree))
            .toString()
        )
        .remove("error")
        .apply()
      NotificationManagerCompat.from(context).cancel(FAILED_ID)
      return true
    } finally {
      running = false
      ended = System.currentTimeMillis()
      emit(context)
    }
  }

  private fun fail(context: Context, reason: String): Boolean {
    prefs(context).edit().putString("error", reason).apply()
    return false
  }

  private fun write(context: Context, tree: Uri, name: String, bytes: ByteArray): Boolean {
    val resolver = context.contentResolver
    val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    val doc = DocumentsContract.createDocument(resolver, parent, "application/octet-stream", name) ?: return false
    val stream = resolver.openOutputStream(doc, "wt")
    if (stream == null) {
      runCatching { DocumentsContract.deleteDocument(resolver, doc) }
      return false
    }
    stream.use { it.write(bytes) }
    return true
  }

  /** Keeps the newest backups the app made; anything else in the folder stays. */
  private fun prune(context: Context, tree: Uri) {
    val resolver = context.contentResolver
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    val columns = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME)
    val backups = mutableListOf<Pair<String, String>>()
    resolver.query(children, columns, null, null, null)?.use { cursor ->
      while (cursor.moveToNext()) {
        val name = cursor.getString(1) ?: continue
        if (name.startsWith(PREFIX) && name.endsWith(SUFFIX)) backups += cursor.getString(0) to name
      }
    }
    // the names sort by their date
    backups.sortedByDescending { it.second }.drop(KEEP).forEach { (id, _) ->
      runCatching { DocumentsContract.deleteDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, id)) }
    }
  }

  private fun notifyFailed(context: Context) {
    if (!Notify.mayNotify(context)) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, context.getString(R.string.backup_channel), NotificationManager.IMPORTANCE_DEFAULT)
      )
    }
    val text = context.getString(
      if (prefs(context).getString("error", null) == "folder") R.string.backup_failed_folder else R.string.backup_failed
    )
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(context.getString(R.string.backup_failed_title))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setColor(Notify.accentColor(context))
      .setAutoCancel(true)
      .setContentIntent(openApp(context, "/settings/backup"))
      .build()
    Notify.post(context, FAILED_ID, notification)
  }
}

class BackupReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Native.open(context.filesDir.absolutePath)
    val pending = goAsync()
    Backups.onAlarm(context.applicationContext) { pending.finish() }
  }
}
