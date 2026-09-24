package com.sws2apps.territories

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.UUID
import org.json.JSONObject

/** What the phones agree on over Bluetooth, and this phone's sync settings. */
object Nearby {
  val SERVICE: UUID = UUID.fromString("7b1f0000-4f72-6761-6e69-7a6564547272")
  val RX: UUID = UUID.fromString("7b1f0001-4f72-6761-6e69-7a6564547272")
  val TX: UUID = UUID.fromString("7b1f0002-4f72-6761-6e69-7a6564547272")
  val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  /** First byte of the advertised payload. */
  const val KIND_BEACON: Byte = 0
  const val KIND_MEET: Byte = 1

  /** Apple's company id, under which an iBeacon travels. */
  const val APPLE = 0x004C

  /** The iBeacon every Territories phone sends (Place.swift watches for it). */
  private val IBEACON: UUID = UUID.fromString("7b1f0003-4f72-6761-6e69-7a6564547272")

  /** type 0x02, length 0x15, the id, major and minor 0, and the power at 1 m. */
  fun ibeaconData(): ByteArray {
    val id = java.nio.ByteBuffer.allocate(16)
      .putLong(IBEACON.mostSignificantBits)
      .putLong(IBEACON.leastSignificantBits)
      .array()
    return byteArrayOf(0x02, 0x15) + id + byteArrayOf(0, 0, 0, 0, 0xC5.toByte())
  }

  /** A paired iPhone: it can't be found while its app sleeps, only find us. */
  fun hasIphone(): Boolean {
    val peers = summary().optJSONArray("peers") ?: return false
    return (0 until peers.length()).any { peers.getJSONObject(it).optString("platform") == "ios" }
  }

  /** An iPhone in Meet puts this before its name (it can't send service data). */
  const val IOS_MEET = "M:"

  /** The scan response holds 13 bytes of payload after our 128-bit service id. */
  const val PAYLOAD_MAX = 13

  fun bluetoothPermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT,
      )
    } else {
      // before Android 12, finding Bluetooth devices counted as location
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

  fun granted(context: Context, permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  fun hasBluetooth(context: Context) = bluetoothPermissions().all { granted(context, it) }

  fun prefs(context: Context) = context.getSharedPreferences("nearby", Context.MODE_PRIVATE)

  /** This phone's id and paired phones, from the store. */
  fun summary(): JSONObject = runCatching { JSONObject(Native.summary()) }.getOrElse { JSONObject() }

  fun hasPeers() = (summary().optJSONArray("peers")?.length() ?: 0) > 0

  fun unsynced() = summary().optInt("unsynced", 0)

  fun peerName(id: String): String {
    val peers = summary().optJSONArray("peers") ?: return ""
    for (i in 0 until peers.length()) {
      val peer = peers.getJSONObject(i)
      if (peer.optString("id") == id) return peer.optString("name")
    }
    return ""
  }

  /** The name a phone shows in Meet: what fits in the advertisement. */
  fun meetPayload(): ByteArray {
    var name = summary().optString("name").ifBlank { Build.MODEL }
    while (name.toByteArray(Charsets.UTF_8).size > PAYLOAD_MAX - 1) name = name.dropLast(1)
    return byteArrayOf(KIND_MEET) + name.toByteArray(Charsets.UTF_8)
  }

  fun beaconPayload(): ByteArray = byteArrayOf(KIND_BEACON) + Native.beacon()
}
