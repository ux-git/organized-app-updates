package com.sws2apps.territories

/**
 * The Rust core (src-tauri/src/android.rs): the store and the encrypted
 * pairing and sync sessions. Kotlin only moves their bytes.
 */
object Native {
  init {
    System.loadLibrary("territories_lib")
  }

  const val MODE_SYNC = 0
  const val MODE_PAIR_CODE = 1
  const val MODE_PAIR_TAP = 2

  external fun open(dir: String): Boolean

  external fun sessionNew(mode: Int, initiator: Boolean): Long

  external fun sessionStart(handle: Long): ByteArray

  external fun sessionFeed(handle: Long, input: ByteArray): ByteArray

  external fun sessionConfirm(handle: Long, accept: Boolean): ByteArray

  external fun sessionStatus(handle: Long): String

  external fun sessionClose(handle: Long)

  external fun beacon(): ByteArray

  external fun recognise(beacon: ByteArray): String

  external fun summary(): String

  external fun emit(event: String, payload: String)

  /** A full backup (src-tauri/src/backup.rs); "" when it fails. */
  external fun backup(): String

  // NFC tap pairing (src-tauri/src/tap.rs)
  external fun tapCardApdu(apdu: ByteArray, listening: Boolean): ByteArray

  external fun tapCardStatus(): String

  external fun tapCardDone(): Boolean

  external fun tapCardReset()

  external fun tapReaderNew(): Long

  external fun tapReaderNext(handle: Long): ByteArray

  external fun tapReaderResponse(handle: Long, response: ByteArray): Boolean

  external fun tapReaderStatus(handle: Long): String

  external fun tapReaderClose(handle: Long)
}
