package com.sws2apps.territories

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * The files the web app makes: schedules, reports, backups and calendar
 * events. In a browser they are downloads; a web view drops them, so the
 * shell script hands them here (OrganizedFiles) and the file is saved to
 * Downloads, shared, printed or opened, as on any Android app.
 */
object FileHandoff {
  private const val CHANNEL = "files"
  const val EXTRA_PATH = "com.sws2apps.territories.FILE_PATH"
  const val EXTRA_TYPE = "com.sws2apps.territories.FILE_TYPE"
  const val EXTRA_ACTION = "com.sws2apps.territories.FILE_ACTION"
  const val OPEN = "open"
  const val SHARE = "share"
  const val PRINT = "print"

  /** Written where FileProvider serves them from (res/xml/file_paths.xml). */
  private fun cache(context: Context, name: String): File {
    val folder = File(context.cacheDir, "shared").apply { mkdirs() }
    // one copy per name, so the folder doesn't grow with every export
    return File(folder, name.substringAfterLast('/')).apply { delete() }
  }

  fun uri(context: Context, file: File): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

  /**
   * A file the page just made. Calendar events go straight to a calendar app;
   * everything else is kept in Downloads with a notification to open, share
   * or print it.
   */
  fun receive(context: Context, name: String, type: String, bytes: ByteArray) {
    val file = cache(context, name)
    file.writeBytes(bytes)

    val saved = toDownloads(context, name, type, bytes)

    // a calendar event goes straight to a calendar app, where it is added
    if (type.startsWith("text/calendar") && open(context, file, type)) return

    notifySaved(context, name, type, file, saved)
  }

  /** Straight to the share sheet, without saving a copy. */
  fun share(context: Context, name: String, type: String, bytes: ByteArray) {
    val file = cache(context, name)
    file.writeBytes(bytes)
    share(context, file, type)
  }

  fun open(context: Context, file: File, type: String): Boolean =
    start(
      context,
      Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri(context, file), type)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    )

  fun share(context: Context, file: File, type: String) {
    start(
      context,
      Intent.createChooser(
        Intent(Intent.ACTION_SEND)
          .setType(type)
          .putExtra(Intent.EXTRA_STREAM, uri(context, file))
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
        null
      )
    )
  }

  /** Android's print dialog for a PDF the page made. */
  fun print(context: Context, file: File) {
    val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
    manager.print(
      file.nameWithoutExtension,
      PdfDocumentAdapter(file),
      PrintAttributes.Builder().build()
    )
  }

  private fun start(context: Context, intent: Intent): Boolean = try {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: ActivityNotFoundException) {
    // nothing on the device opens it; the copy in Downloads is still there
    false
  }

  /** A copy in the phone's Downloads, as a browser would leave. */
  private fun toDownloads(context: Context, name: String, type: String, bytes: ByteArray): Uri? =
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, name)
          put(MediaStore.Downloads.MIME_TYPE, type)
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return@runCatching null
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        uri
      } else {
        @Suppress("DEPRECATION")
        val folder = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        folder.mkdirs()
        File(folder, name).apply { writeBytes(bytes) }.let { Uri.fromFile(it) }
      }
    }.getOrNull()

  private fun notifySaved(context: Context, name: String, type: String, file: File, saved: Uri?) {
    if (!Notify.mayNotify(context)) {
      // without permission for a notification, show the file itself
      open(context, file, type)
      return
    }
    ensureChannel(context)

    val builder = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(name)
      .setContentText(context.getString(R.string.file_saved))
      .setAutoCancel(true)
      .setColor(Notify.accentColor(context))
      .setContentIntent(action(context, file, type, OPEN))
      .addAction(0, context.getString(R.string.file_share), action(context, file, type, SHARE))
    if (type.startsWith("application/pdf")) {
      builder.addAction(0, context.getString(R.string.file_print), action(context, file, type, PRINT))
    }
    if (saved == null) builder.setContentText(context.getString(R.string.file_ready))

    NotificationManagerCompat.from(context).notify(file.path.hashCode(), builder.build())
  }

  /** Opening, sharing and printing all run through the activity, which has a window. */
  private fun action(context: Context, file: File, type: String, what: String): PendingIntent =
    PendingIntent.getActivity(
      context,
      (file.path + what).hashCode(),
      Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(EXTRA_PATH, file.path)
        .putExtra(EXTRA_TYPE, type)
        .putExtra(EXTRA_ACTION, what),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, context.getString(R.string.file_channel_name), NotificationManager.IMPORTANCE_DEFAULT)
    )
  }
}
