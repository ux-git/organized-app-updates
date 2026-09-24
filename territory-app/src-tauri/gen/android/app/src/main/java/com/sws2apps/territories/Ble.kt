package com.sws2apps.territories

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.util.UUID

/**
 * A byte stream to one phone over Bluetooth LE. The Rust session frames its
 * own messages, so the stream only has to keep the bytes in order: each part
 * waits until Android confirms the previous one.
 */
abstract class Pipe(val address: String) {
  private val queue = ArrayDeque<ByteArray>()
  private var busy = false
  protected val handler = Handler(Looper.getMainLooper())

  /** Bytes per write: the negotiated ATT MTU less its 3-byte header. */
  var chunk = 20
    set(value) {
      // an attribute value is at most 512 bytes, whatever the MTU
      field = value.coerceIn(20, 512)
    }

  var closed = false
    private set

  fun send(bytes: ByteArray) {
    var offset = 0
    while (offset < bytes.size) {
      val end = minOf(bytes.size, offset + chunk)
      queue.addLast(bytes.copyOfRange(offset, end))
      offset = end
    }
    pump()
  }

  val idle get() = queue.isEmpty() && !busy

  protected abstract fun write(part: ByteArray): Boolean

  /** Android confirmed the last part. */
  fun written() {
    busy = false
    pump()
  }

  private fun pump() {
    if (busy || closed) return
    val next = queue.removeFirstOrNull() ?: return
    busy = true
    if (!runCatching { write(next) }.getOrDefault(false)) {
      // the stack is busy; try again shortly
      busy = false
      queue.addFirst(next)
      handler.postDelayed(::pump, 30)
    }
  }

  open fun close() {
    closed = true
    queue.clear()
  }
}

/**
 * Advertising, the GATT server a paired phone connects to, scanning, and
 * connecting to others. All callbacks are passed on on the main thread.
 */
@SuppressLint("MissingPermission")
class Link(private val context: Context, private val listener: Listener) {
  interface Listener {
    /**
     * An advertisement of this app: a sync beacon or a phone in Meet. An
     * iPhone can't send service data, so there `payload` is empty and
     * `name` says the rest (Nearby.IOS_MEET).
     */
    fun onSeen(device: BluetoothDevice, payload: ByteArray, rssi: Int, name: String?)

    /** A phone connected to this one and sent its first bytes. */
    fun onIncoming(pipe: Pipe, first: ByteArray)

    fun onBytes(pipe: Pipe, bytes: ByteArray)

    /** This phone's connection to another is ready to write. */
    fun onConnected(pipe: Pipe)

    fun onClosed(pipe: Pipe)
  }

  private val handler = Handler(Looper.getMainLooper())
  private val manager = context.getSystemService(BluetoothManager::class.java)
  private val adapter get() = manager?.adapter
  private var server: BluetoothGattServer? = null
  private var tx: BluetoothGattCharacteristic? = null
  private val incoming = HashMap<String, ServerPipe>()
  private val outgoing = HashMap<String, ClientPipe>()
  private var advertising: ByteArray? = null
  private var scanning = false

  val available get() = adapter?.isEnabled == true

  fun start(): Boolean {
    if (!available) return false
    if (server == null) openServer()
    return server != null
  }

  fun stop() {
    stopScan()
    stopAdvertising()
    outgoing.values.toList().forEach { it.close() }
    incoming.values.toList().forEach { it.close() }
    runCatching { server?.close() }
    server = null
  }

  // ---- advertising ----

  private val advertiseCallback = object : AdvertiseCallback() {
    override fun onStartFailure(errorCode: Int) {
      advertising = null
    }
  }

  /** The payload rides in the scan response, as service data of our service. */
  fun advertise(payload: ByteArray) {
    if (advertising?.contentEquals(payload) == true) return
    val advertiser = adapter?.bluetoothLeAdvertiser ?: return
    stopAdvertising()
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    val data = AdvertiseData.Builder()
      .addServiceUuid(ParcelUuid(Nearby.SERVICE))
      .setIncludeDeviceName(false)
      .build()
    val response = AdvertiseData.Builder()
      .addServiceData(ParcelUuid(Nearby.SERVICE), payload)
      .setIncludeDeviceName(false)
      .build()
    runCatching { advertiser.startAdvertising(settings, data, response, advertiseCallback) }
      .onSuccess { advertising = payload }
  }

  fun stopAdvertising() {
    runCatching { adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback) }
    advertising = null
  }

  // ---- scanning ----

  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val record = result.scanRecord ?: return
      val payload = record.getServiceData(ParcelUuid(Nearby.SERVICE)) ?: ByteArray(0)
      val name = record.deviceName
      handler.post { listener.onSeen(result.device, payload, result.rssi, name) }
    }

    override fun onBatchScanResults(results: MutableList<ScanResult>) {
      results.forEach { onScanResult(0, it) }
    }
  }

  /** `fast` while someone waits for it; `quiet` when it runs all day. */
  fun scan(fast: Boolean, quiet: Boolean = false) {
    val scanner = adapter?.bluetoothLeScanner ?: return
    stopScan()
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(Nearby.SERVICE)).build()
    val mode = when {
      fast -> ScanSettings.SCAN_MODE_LOW_LATENCY
      quiet -> ScanSettings.SCAN_MODE_LOW_POWER
      else -> ScanSettings.SCAN_MODE_BALANCED
    }
    val settings = ScanSettings.Builder().setScanMode(mode).build()
    runCatching { scanner.startScan(listOf(filter), settings, scanCallback) }
      .onSuccess { scanning = true }
  }

  fun stopScan() {
    if (!scanning) return
    runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    scanning = false
  }

  // ---- this phone as the server others connect to ----

  private inner class ServerPipe(val device: BluetoothDevice) : Pipe(device.address) {
    var started = false

    override fun write(part: ByteArray): Boolean {
      val server = server ?: return false
      val characteristic = tx ?: return false
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        server.notifyCharacteristicChanged(device, characteristic, false, part) ==
          android.bluetooth.BluetoothStatusCodes.SUCCESS
      } else {
        @Suppress("DEPRECATION")
        characteristic.value = part
        @Suppress("DEPRECATION")
        server.notifyCharacteristicChanged(device, characteristic, false)
      }
    }

    override fun close() {
      if (closed) return
      super.close()
      incoming.remove(address)
      runCatching { server?.cancelConnection(device) }
      listener.onClosed(this)
    }
  }

  private fun openServer() {
    val callback = object : BluetoothGattServerCallback() {
      override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          handler.post { incoming[device.address]?.close() }
        }
      }

      override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
        handler.post { pipeFor(device).chunk = mtu - 3 }
      }

      override fun onCharacteristicWriteRequest(
        device: BluetoothDevice,
        requestId: Int,
        characteristic: BluetoothGattCharacteristic,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray?,
      ) {
        if (responseNeeded) {
          server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }
        if (characteristic.uuid != Nearby.RX || value == null) return
        val bytes = value.copyOf()
        handler.post {
          val pipe = pipeFor(device)
          if (!pipe.started) {
            pipe.started = true
            listener.onIncoming(pipe, bytes)
          } else {
            listener.onBytes(pipe, bytes)
          }
        }
      }

      override fun onDescriptorWriteRequest(
        device: BluetoothDevice,
        requestId: Int,
        descriptor: BluetoothGattDescriptor,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray?,
      ) {
        if (responseNeeded) {
          server?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }
      }

      override fun onNotificationSent(device: BluetoothDevice, status: Int) {
        handler.post { incoming[device.address]?.written() }
      }
    }

    val service = BluetoothGattService(Nearby.SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    val rx = BluetoothGattCharacteristic(
      Nearby.RX,
      BluetoothGattCharacteristic.PROPERTY_WRITE,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    )
    val tx = BluetoothGattCharacteristic(
      Nearby.TX,
      BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_READ
    )
    tx.addDescriptor(
      BluetoothGattDescriptor(
        Nearby.CCCD,
        BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
      )
    )
    service.addCharacteristic(rx)
    service.addCharacteristic(tx)
    this.tx = tx
    server = runCatching { manager?.openGattServer(context, callback) }.getOrNull()
    server?.addService(service)
  }

  private fun pipeFor(device: BluetoothDevice) =
    incoming.getOrPut(device.address) { ServerPipe(device) }

  // ---- this phone connecting to another ----

  private inner class ClientPipe(val device: BluetoothDevice) : Pipe(device.address) {
    var gatt: BluetoothGatt? = null
    var rx: BluetoothGattCharacteristic? = null

    override fun write(part: ByteArray): Boolean {
      val gatt = gatt ?: return false
      val characteristic = rx ?: return false
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeCharacteristic(
          characteristic,
          part,
          BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        ) == android.bluetooth.BluetoothStatusCodes.SUCCESS
      } else {
        @Suppress("DEPRECATION")
        characteristic.value = part
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        @Suppress("DEPRECATION")
        gatt.writeCharacteristic(characteristic)
      }
    }

    override fun close() {
      if (closed) return
      super.close()
      outgoing.remove(address)
      runCatching {
        gatt?.disconnect()
        gatt?.close()
      }
      listener.onClosed(this)
    }
  }

  fun connected(address: String) = outgoing.containsKey(address) || incoming.containsKey(address)

  fun connect(device: BluetoothDevice) {
    if (connected(device.address)) return
    val pipe = ClientPipe(device)
    outgoing[device.address] = pipe

    val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        handler.post {
          when (newState) {
            BluetoothProfile.STATE_CONNECTED -> {
              if (!gatt.requestMtu(517)) gatt.discoverServices()
            }
            BluetoothProfile.STATE_DISCONNECTED -> pipe.close()
          }
        }
      }

      override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
        handler.post {
          if (status == BluetoothGatt.GATT_SUCCESS) pipe.chunk = mtu - 3
          gatt.discoverServices()
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        handler.post {
          val service = gatt.getService(Nearby.SERVICE)
          val rx = service?.getCharacteristic(Nearby.RX)
          val tx = service?.getCharacteristic(Nearby.TX)
          val cccd = tx?.getDescriptor(Nearby.CCCD)
          if (rx == null || tx == null || cccd == null) {
            pipe.close()
            return@post
          }
          pipe.rx = rx
          gatt.setCharacteristicNotification(tx, true)
          val enable = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeDescriptor(cccd, enable)
          } else {
            @Suppress("DEPRECATION")
            cccd.value = enable
            @Suppress("DEPRECATION")
            gatt.writeDescriptor(cccd)
          }
        }
      }

      override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
        handler.post {
          if (status == BluetoothGatt.GATT_SUCCESS) listener.onConnected(pipe) else pipe.close()
        }
      }

      override fun onCharacteristicWrite(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        status: Int,
      ) {
        handler.post {
          if (status == BluetoothGatt.GATT_SUCCESS) pipe.written() else pipe.close()
        }
      }

      override fun onCharacteristicChanged(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
      ) {
        val bytes = value.copyOf()
        handler.post { listener.onBytes(pipe, bytes) }
      }

      @Deprecated("Deprecated in Java")
      override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        @Suppress("DEPRECATION")
        val bytes = characteristic.value?.copyOf() ?: return
        handler.post { listener.onBytes(pipe, bytes) }
      }
    }

    pipe.gatt = runCatching {
      device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }.getOrNull()
    if (pipe.gatt == null) pipe.close()
  }

  fun device(address: String): BluetoothDevice? =
    runCatching { adapter?.getRemoteDevice(address) }.getOrNull()
}
