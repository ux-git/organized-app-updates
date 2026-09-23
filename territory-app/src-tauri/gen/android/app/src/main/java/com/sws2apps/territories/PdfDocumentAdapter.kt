package com.sws2apps.territories

import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import java.io.File

/** Hands a PDF the page made to Android's print dialog, page for page. */
class PdfDocumentAdapter(private val file: File) : PrintDocumentAdapter() {
  override fun onLayout(
    oldAttributes: PrintAttributes?,
    newAttributes: PrintAttributes?,
    cancellationSignal: CancellationSignal?,
    callback: LayoutResultCallback,
    extras: Bundle?,
  ) {
    if (cancellationSignal?.isCanceled == true) {
      callback.onLayoutCancelled()
      return
    }
    callback.onLayoutFinished(
      PrintDocumentInfo.Builder(file.name)
        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
        .build(),
      true
    )
  }

  override fun onWrite(
    pages: Array<out PageRange>?,
    destination: ParcelFileDescriptor,
    cancellationSignal: CancellationSignal?,
    callback: WriteResultCallback,
  ) {
    runCatching {
      file.inputStream().use { source ->
        ParcelFileDescriptor.AutoCloseOutputStream(destination).use { source.copyTo(it) }
      }
    }.onSuccess {
      callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
    }.onFailure {
      callback.onWriteFailed(it.message)
    }
  }
}
