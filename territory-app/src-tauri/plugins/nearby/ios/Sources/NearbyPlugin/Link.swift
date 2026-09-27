import CoreBluetooth
import Foundation

/// What the phones agree on over Bluetooth (Nearby.kt on Android).
enum Ids {
  static let service = CBUUID(string: "7b1f0000-4f72-6761-6e69-7a6564547272")
  static let rx = CBUUID(string: "7b1f0001-4f72-6761-6e69-7a6564547272")
  static let tx = CBUUID(string: "7b1f0002-4f72-6761-6e69-7a6564547272")
  /** First byte of an Android phone's advertised payload. */
  static let kindBeacon: UInt8 = 0
  static let kindMeet: UInt8 = 1
  /** An iPhone can't advertise service data; its name says it is in Meet. */
  static let meetPrefix = "M:"
}

/// A byte stream to one phone. The Rust session frames its own messages, so
/// the stream only keeps the bytes in order: each part waits until the last
/// one went out.
class Pipe {
  let address: String
  private var queue: [Data] = []
  private var busy = false
  private(set) var closed = false
  /// Bytes per write, at most one attribute value.
  var chunk = 20 {
    didSet { chunk = min(max(chunk, 20), 512) }
  }

  init(address: String) {
    self.address = address
  }

  /// Unique per direction: the same device can connect here and be connected to.
  var key: String { address }

  var idle: Bool { queue.isEmpty && !busy }

  func send(_ bytes: Data) {
    var offset = 0
    while offset < bytes.count {
      let end = min(bytes.count, offset + chunk)
      queue.append(bytes.subdata(in: offset..<end))
      offset = end
    }
    pump()
  }

  /// Sends one part; false when the stack is full and it has to wait.
  func write(_ part: Data) -> Bool { false }

  /// The last part went out, or the stack has room again.
  func written() {
    busy = false
    pump()
  }

  func pump() {
    guard !busy, !closed, let next = queue.first else { return }
    if write(next) {
      queue.removeFirst()
      busy = true
    }
  }

  func close() {
    closed = true
    queue.removeAll()
  }
}

protocol LinkListener: AnyObject {
  /// An advertisement of this app: `payload` is an Android phone's service
  /// data (a beacon or a phone in Meet); an iPhone sends only its `name`.
  func linkSaw(address: String, payload: Data, rssi: Int, name: String?)
  func linkIncoming(_ pipe: Pipe, first: Data)
  func linkBytes(_ pipe: Pipe, _ bytes: Data)
  func linkConnected(_ pipe: Pipe)
  func linkClosed(_ pipe: Pipe)
  /// Bluetooth was turned on or off, or allowed.
  func linkStateChanged()
}

/// This phone's connection to another: writes to its RX, hears its TX.
final class ClientPipe: Pipe {
  let peripheral: CBPeripheral
  var rx: CBCharacteristic?
  /// Subscribed and handed to the listener.
  var ready = false

  init(_ peripheral: CBPeripheral) {
    self.peripheral = peripheral
    super.init(address: peripheral.identifier.uuidString)
  }

  override func write(_ part: Data) -> Bool {
    guard let rx = rx, peripheral.state == .connected else { return false }
    peripheral.writeValue(part, for: rx, type: .withResponse)
    return true
  }
}

/// Another phone's connection to this one: it writes to RX, hears TX.
final class ServerPipe: Pipe {
  let central: CBCentral
  weak var manager: CBPeripheralManager?
  let tx: CBMutableCharacteristic

  init(_ central: CBCentral, manager: CBPeripheralManager, tx: CBMutableCharacteristic) {
    self.central = central
    self.manager = manager
    self.tx = tx
    super.init(address: central.identifier.uuidString)
    chunk = central.maximumUpdateValueLength
  }

  override var key: String { "in:" + address }

  override func write(_ part: Data) -> Bool {
    guard let manager = manager else { return false }
    // false: the queue is full; peripheralManagerIsReady says when to go on
    guard manager.updateValue(part, for: tx, onSubscribedCentrals: [central]) else { return false }
    // notifications aren't confirmed; the next part may follow at once
    DispatchQueue.main.async { self.written() }
    return true
  }
}

/// Advertising, the GATT server a paired phone connects to, scanning and
/// connecting, as Link does on Android. Everything runs on the main queue.
final class Link: NSObject, CBCentralManagerDelegate, CBPeripheralManagerDelegate,
  CBPeripheralDelegate
{
  weak var listener: LinkListener?
  private var central: CBCentralManager!
  private var peripheral: CBPeripheralManager!
  private var tx: CBMutableCharacteristic?
  private var serviceAdded = false
  private var advertisedName: String?
  private var wantScan = false
  private var incoming: [String: ServerPipe] = [:]
  private var outgoing: [String: ClientPipe] = [:]
  private var seen: [String: CBPeripheral] = [:]
  /// Connections iOS kept while the app was closed; their sessions are gone.
  private var restored: [CBPeripheral] = []
  private static let connectSeconds = 15.0
  /// Timed-out attempts whose late disconnect may still come; no new attempt
  /// to the address until it did, so it can't close the retry.
  private var abandoned: Set<String> = []

  init(listener: LinkListener) {
    self.listener = listener
    super.init()
    var centralOptions: [String: Any] = [:]
    var peripheralOptions: [String: Any] = [:]
    #if os(iOS)
      // iOS brings the app back for Bluetooth events after it was closed
      centralOptions[CBCentralManagerOptionRestoreIdentifierKey] = "territories.central"
      peripheralOptions[CBPeripheralManagerOptionRestoreIdentifierKey] = "territories.peripheral"
    #endif
    central = CBCentralManager(delegate: self, queue: .main, options: centralOptions)
    peripheral = CBPeripheralManager(delegate: self, queue: .main, options: peripheralOptions)
  }

  var available: Bool { central.state == .poweredOn }

  var poweredOff: Bool { central.state == .poweredOff }

  // ---- advertising ----

  /// "T" while syncing; "M:<name>" while Meet is open. iOS can't send more:
  /// an Android phone connects and the session says who this is.
  func advertise(meet name: String?) {
    let local = name.map { Ids.meetPrefix + $0 } ?? "T"
    guard local != advertisedName || !peripheral.isAdvertising else { return }
    advertisedName = local
    readvertise()
  }

  func stopAdvertising() {
    advertisedName = nil
    readvertise()
  }

  /// Also after Bluetooth comes on, and after a restored launch, where iOS
  /// may still send the advertisement of before.
  private func readvertise() {
    guard peripheral.state == .poweredOn, serviceAdded else { return }
    if peripheral.isAdvertising { peripheral.stopAdvertising() }
    guard let local = advertisedName else { return }
    peripheral.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [Ids.service],
      CBAdvertisementDataLocalNameKey: local,
    ])
  }

  private func openServer() {
    guard !serviceAdded, peripheral.state == .poweredOn else { return }
    let rx = CBMutableCharacteristic(
      type: Ids.rx, properties: [.write], value: nil, permissions: [.writeable])
    let tx = CBMutableCharacteristic(
      type: Ids.tx, properties: [.notify], value: nil, permissions: [.readable])
    let service = CBMutableService(type: Ids.service, primary: true)
    service.characteristics = [rx, tx]
    self.tx = tx
    peripheral.add(service)
  }

  // ---- scanning ----

  /// With a service id, iOS keeps scanning in the background too.
  func scan() {
    wantScan = true
    guard central.state == .poweredOn else { return }
    central.scanForPeripherals(
      withServices: [Ids.service],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }

  func stopScan() {
    wantScan = false
    if central.state == .poweredOn { central.stopScan() }
  }

  func connected(_ address: String) -> Bool {
    outgoing[address] != nil || incoming[address] != nil || abandoned.contains(address)
  }

  func connect(_ address: String) {
    guard let target = seen[address], outgoing[address] == nil, !abandoned.contains(address) else {
      return
    }
    let pipe = ClientPipe(target)
    outgoing[address] = pipe
    target.delegate = self
    central.connect(target)
    // iOS never gives up on a connection by itself
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.connectSeconds) { [weak self] in
      guard let self = self, self.outgoing[address] === pipe, !pipe.ready else { return }
      self.central.cancelPeripheralConnection(target)
      self.closeOutgoing(target)
      self.abandoned.insert(address)
      // a pending connect may end without any callback
      DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
        self?.abandoned.remove(address)
      }
    }
  }

  func stop() {
    stopScan()
    stopAdvertising()
    outgoing.values.forEach { central.cancelPeripheralConnection($0.peripheral) }
  }

  // ---- central: the phones this one finds and connects to ----

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      restored.forEach { central.cancelPeripheralConnection($0) }
      restored = []
      // a restored scan runs on until it is stopped
      if wantScan { scan() } else { central.stopScan() }
    } else {
      // iOS drops every connection without telling each one
      abandoned.removeAll()
      outgoing.values.forEach { closeOutgoing($0.peripheral) }
      seen.removeAll()
    }
    listener?.linkStateChanged()
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    restored = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] ?? []
  }

  func centralManager(
    _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    let address = peripheral.identifier.uuidString
    seen[address] = peripheral
    let data = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data]
    let payload = data?[Ids.service] ?? Data()
    let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    listener?.linkSaw(address: address, payload: payload, rssi: RSSI.intValue, name: name)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([Ids.service])
  }

  func centralManager(
    _ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?
  ) {
    closeOutgoing(peripheral)
  }

  func centralManager(
    _ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?
  ) {
    closeOutgoing(peripheral)
  }

  private func closeOutgoing(_ peripheral: CBPeripheral) {
    // the late answer to a timed-out attempt, already closed
    if abandoned.remove(peripheral.identifier.uuidString) != nil { return }
    guard let pipe = outgoing.removeValue(forKey: peripheral.identifier.uuidString) else { return }
    pipe.close()
    listener?.linkClosed(pipe)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == Ids.service }) else {
      central.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.discoverCharacteristics([Ids.rx, Ids.tx], for: service)
  }

  func peripheral(
    _ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?
  ) {
    let rx = service.characteristics?.first { $0.uuid == Ids.rx }
    let tx = service.characteristics?.first { $0.uuid == Ids.tx }
    guard let pipe = outgoing[peripheral.identifier.uuidString], let rx = rx, let tx = tx else {
      central.cancelPeripheralConnection(peripheral)
      return
    }
    pipe.rx = rx
    peripheral.setNotifyValue(true, for: tx)
  }

  func peripheral(
    _ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    guard let pipe = outgoing[peripheral.identifier.uuidString], characteristic.isNotifying else {
      central.cancelPeripheralConnection(peripheral)
      return
    }
    // one ATT packet per part: a longer write becomes a prepared write,
    // which the Android side doesn't take
    pipe.chunk = peripheral.maximumWriteValueLength(for: .withoutResponse)
    pipe.ready = true
    listener?.linkConnected(pipe)
  }

  func peripheral(
    _ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?
  ) {
    guard let pipe = outgoing[peripheral.identifier.uuidString] else { return }
    if error != nil {
      central.cancelPeripheralConnection(peripheral)
      return
    }
    pipe.written()
  }

  func peripheral(
    _ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?
  ) {
    guard let pipe = outgoing[peripheral.identifier.uuidString],
      let value = characteristic.value, !value.isEmpty
    else { return }
    listener?.linkBytes(pipe, value)
  }

  // ---- peripheral: this phone as the server others connect to ----

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn {
      openServer()
      readvertise()
    } else {
      serviceAdded = false
      incoming.values.forEach { close($0) }
    }
    listener?.linkStateChanged()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String: Any]) {
    let services = dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService]
    if let service = services?.first(where: { $0.uuid == Ids.service }) {
      tx = service.characteristics?.first { $0.uuid == Ids.tx } as? CBMutableCharacteristic
      serviceAdded = tx != nil
    }
  }

  func peripheralManager(
    _ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?
  ) {
    serviceAdded = error == nil
    readvertise()
  }

  func peripheralManager(
    _ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]
  ) {
    // one answer for all of them, or the other device waits for it
    defer {
      if let first = requests.first { peripheral.respond(to: first, withResult: tx == nil ? .unlikelyError : .success) }
    }
    guard let tx = tx else { return }
    for request in requests where request.characteristic.uuid == Ids.rx {
      guard let value = request.value, !value.isEmpty else { continue }
      let address = request.central.identifier.uuidString
      if let pipe = incoming[address] {
        listener?.linkBytes(pipe, value)
      } else {
        let pipe = ServerPipe(request.central, manager: peripheral, tx: tx)
        incoming[address] = pipe
        listener?.linkIncoming(pipe, first: value)
      }
    }
  }

  func peripheralManager(
    _ peripheral: CBPeripheralManager, central: CBCentral,
    didUnsubscribeFrom characteristic: CBCharacteristic
  ) {
    guard let pipe = incoming.removeValue(forKey: central.identifier.uuidString) else { return }
    pipe.close()
    listener?.linkClosed(pipe)
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    incoming.values.forEach { $0.pump() }
  }

  /// Ends a connection this phone started or took.
  func close(_ pipe: Pipe) {
    if let client = pipe as? ClientPipe {
      central.cancelPeripheralConnection(client.peripheral)
    } else if let server = incoming.removeValue(forKey: pipe.address) {
      server.close()
      listener?.linkClosed(server)
    }
  }
}
