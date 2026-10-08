import CoreBluetooth
import Foundation

#if canImport(UIKit)
  import UIKit
#endif

/// One Rust session over one Bluetooth connection. A step can apply a whole
/// sync to the store, so the steps run on one queue of their own, in order,
/// and what they send and say comes back on the main queue in the same order.
final class Exchange {
  private static let steps = DispatchQueue(label: "com.sws2apps.territories.session")

  let pipe: Pipe
  let handle: Int64
  let mode: Int32
  private let onStatus: (Exchange) -> Void
  private(set) var status: [String: Any] = ["state": "connecting"]
  private var heard = Date()
  private var closed = false
  /// Known from the beacon or the handshake, and kept when the session fails.
  var knownPeer = ""

  init(pipe: Pipe, handle: Int64, mode: Int32, onStatus: @escaping (Exchange) -> Void) {
    self.pipe = pipe
    self.handle = handle
    self.mode = mode
    self.onStatus = onStatus
  }

  var state: String { status["state"] as? String ?? "" }
  var finished: Bool { state == "done" || state == "failed" }
  var peer: String { status["peer"] as? String ?? knownPeer }
  /// Bytes came in, a step ended, or the other device took a part.
  var lastActivity: Date { max(heard, pipe.lastWritten) }

  func start(preamble: Data?) {
    step { (preamble ?? Data()) + Core.start(self.handle) }
  }

  func receive(_ bytes: Data) {
    heard = Date()
    step { Core.feed(self.handle, bytes) }
  }

  func confirm(_ accept: Bool) { step { Core.confirm(self.handle, accept: accept) } }

  private func step(_ run: @escaping () -> Data) {
    Self.steps.async {
      let out = run()
      let next = Core.status(self.handle)
      DispatchQueue.main.async {
        guard !self.closed, !self.finished else { return }
        self.heard = Date()
        if !out.isEmpty { self.pipe.send(out) }
        if !next.isEmpty { self.status = next }
        if let peer = self.status["peer"] as? String, !peer.isEmpty { self.knownPeer = peer }
        self.onStatus(self)
      }
    }
  }

  func fail(_ reason: String) {
    guard !finished else { return }
    status = ["state": "failed", "reason": reason]
    onStatus(self)
  }

  /// The connection closed: after the steps still running, so a last
  /// message that finished the session counts.
  func lost(_ reason: String) {
    Self.steps.async {
      DispatchQueue.main.async {
        self.fail(reason)
        self.close()
      }
    }
  }

  func close() {
    closed = true
    Self.steps.async { Core.close(self.handle) }
  }

  func json() -> [String: Any] {
    var out = status
    out["address"] = pipe.address
    out["mode"] = mode
    return out
  }
}

/// Looks for paired phones and syncs with them, as NearbyService does on
/// Android. iOS has no foreground service: in "always" mode the scan for our
/// service keeps running in the background (iOS allows that for one named
/// service and wakes the app when a phone shows up); at the Kingdom Hall it
/// runs while the location says so; otherwise only a while after the app was
/// opened or Sync now was tapped.
final class Nearby: NSObject, LinkListener {
  static let shared = Nearby()

  private static let tickSeconds = 5.0
  private static let idleSeconds = 25.0
  private static let resyncSeconds = 15.0
  private static let waitForOtherSeconds = 8.0
  private static let peerStaySeconds = 30.0
  private static let foundAfterFails = 3
  private static let foundAgainSeconds = 30.0 * 60
  private static let attemptGapSeconds = 10.0
  private static let iphoneNewsSeconds = 60.0
  private static let iphoneQuietSeconds = 5.0 * 60

  private var link: Link?
  private var timer: Timer?
  private(set) var meet = false
  private var until = Date.distantPast
  private var reason = ""
  private var exchanges: [String: Exchange] = [:]
  private var connecting: [String: Int32] = [:]
  private var lastSync: [String: Date] = [:]
  private var needSince: [String: Date] = [:]
  private var seenPeers: [String: Date] = [:]
  private var beacons: [String: Data] = [:]
  private var trying: [String: String] = [:]
  private var fails: [String: Int] = [:]
  private var failedAt: [String: Date] = [:]
  private var seenMeet: [String: [String: Any]] = [:]
  private var noticed: [String: Date] = [:]
  private var triedIphone: [String: Date] = [:]
  private var lastDone: [String: Any]?
  private var myId = ""
  /// A Shortcut's run: when it started and the syncs since.
  private var shortcutSince: Date?
  private var shortcutDone: [[String: Any]] = []
  private static let shortcutSeconds = 25.0

  /// Sends status to the page; set by the plugin.
  var onChange: (() -> Void)?

  // ---- settings, as Reminders keeps them on Android ----

  private let defaults = UserDefaults.standard

  var schedule: [String: Any] {
    get { defaults.dictionary(forKey: "schedule") ?? [:] }
    set {
      defaults.set(Self.withoutNulls(newValue), forKey: "schedule")
      apply()
    }
  }

  /// UserDefaults throws on JSON's null.
  private static func withoutNulls(_ value: Any) -> Any? {
    switch value {
    case is NSNull: return nil
    case let object as [String: Any]: return object.compactMapValues(withoutNulls)
    case let list as [Any]: return list.compactMap(withoutNulls)
    default: return value
    }
  }

  /// "always", "location" or "manual"
  var mode: String {
    if schedule["enabled"] as? Bool == false { return "manual" }
    let mode = schedule["mode"] as? String ?? "always"
    return mode == "location" || mode == "manual" ? mode : "always"
  }

  var searching: Bool {
    switch mode {
    case "always": return true
    case "location": return Place.shared.inside
    default: return false
    }
  }

  var hasPeers: Bool { !Core.peers.isEmpty }

  var unsynced: Int { Core.summary()["unsynced"] as? Int ?? 0 }

  // ---- lifecycle ----

  /// Creating Bluetooth shows the permission prompt, so it waits until the
  /// person allowed it, or asks for it.
  func ensureLink() {
    if link == nil { link = Link(listener: self) }
  }

  func setUp() {
    if CBManager.authorization == .allowedAlways { ensureLink() }
    apply()
  }

  /// Starts what the mode needs and stops the rest.
  func apply() {
    if mode == "location" { Place.shared.watchHall() } else { Place.shared.unwatchHall() }
    if mode != "manual" && hasPeers { Place.shared.watchPeers() } else { Place.shared.unwatchPeers() }
    if searching && hasPeers {
      start(reason: "always", seconds: 0)
    } else if Date() > until && !meet {
      stop()
    }
  }

  func start(reason: String, seconds: TimeInterval) {
    guard CBManager.authorization == .allowedAlways else { return }
    ensureLink()
    self.reason = reason
    until = max(until, Date().addingTimeInterval(seconds))
    myId = Core.summary()["id"] as? String ?? ""
    refresh()
    if timer == nil {
      timer = Timer.scheduledTimer(withTimeInterval: Self.tickSeconds, repeats: true) {
        [weak self] _ in self?.tick()
      }
    }
    changed()
  }

  private func stop() {
    timer?.invalidate()
    timer = nil
    for exchange in exchanges.values {
      exchange.close()
      Background.end(exchange.pipe.key)
    }
    exchanges.removeAll()
    // after the sessions: the pipes it closes find none left to fail
    link?.stop()
    changed()
  }

  private var running: Bool { timer != nil }

  private func refresh() {
    guard let link = link else { return }
    link.advertise(meet: meet ? meetName : nil)
    link.scan()
  }

  private var meetName: String {
    let profile = Core.summary()
    let name = profile["name"] as? String ?? ""
    let code = profile["avatarCode"] as? Int ?? 0
    let suffix = (1...255).contains(code) ? String(format: "~%02x", code) : ""
    #if canImport(UIKit)
      let model = UIDevice.current.model
    #else
      let model = Host.current().localizedName ?? "Mac"
    #endif
    var label = name.isEmpty ? model : name
    while label.utf8.count > 20 - suffix.utf8.count { label.removeLast() }
    return label + suffix
  }

  private func tick() {
    let now = Date()
    for exchange in exchanges.values where now.timeIntervalSince(exchange.lastActivity) > Self.idleSeconds {
      exchange.fail(Notices.tr("The other device stopped answering", "Das andere Gerät antwortet nicht mehr"))
      link?.close(exchange.pipe)
    }
    seenMeet = seenMeet.filter {
      now.timeIntervalSince1970 - ($0.value["at"] as? Double ?? 0) < 12
    }
    noticeStuckPeers(now)
    changed()
    if !meet && now > until && exchanges.isEmpty && !searching {
      stop()
    }
  }

  /// A paired phone is close, three syncs with it failed, and it still has news.
  private func noticeStuckPeers(_ now: Date) {
    for (peer, beacon) in beacons {
      guard (fails[peer] ?? 0) >= Self.foundAfterFails,
        now.timeIntervalSince(seenPeers[peer] ?? .distantPast) < 30,
        !exchanges.values.contains(where: { $0.peer == peer }),
        now.timeIntervalSince(noticed[peer] ?? .distantPast) > Self.foundAgainSeconds,
        // asked again: this phone's data may have changed since the beacon came
        Core.recognise(beacon)?["needsSync"] as? Bool == true
      else { continue }
      noticed[peer] = now
      Notices.shared.found(peer: peer)
    }
  }

  /// A sync with this phone failed, timed out or lost its connection.
  private func attemptFailed(_ peer: String) {
    let now = Date()
    // retries seconds apart are one attempt
    guard now.timeIntervalSince(failedAt[peer] ?? .distantPast) >= Self.attemptGapSeconds else { return }
    failedAt[peer] = now
    fails[peer, default: 0] += 1
  }

  /// Something was edited here: tell paired phones nearby right away.
  func localChange() {
    if running {
      until = max(until, Date().addingTimeInterval(20))
    } else if searching && hasPeers {
      start(reason: "change", seconds: 20)
    }
  }

  // ---- a Shortcut ("Sync territories") ----

  func startForShortcut() {
    shortcutSince = Date()
    shortcutDone = []
    start(reason: "shortcut", seconds: Self.shortcutSeconds)
  }

  /// "off" without Bluetooth or paired phones, "bluetoothOff", "running"
  /// while it looks, then "done" with what came in, or "none" when no phone
  /// answered.
  func shortcutState() -> [String: Any] {
    guard CBManager.authorization == .allowedAlways, hasPeers else { return ["state": "off"] }
    if link?.poweredOff == true { return ["state": "bluetoothOff"] }
    guard let since = shortcutSince else { return ["state": "none"] }
    let busy = !exchanges.isEmpty
    let over = Date().timeIntervalSince(since) > Self.shortcutSeconds
    if !shortcutDone.isEmpty && (!busy || over) {
      let names = shortcutDone.compactMap { $0["name"] as? String }.filter { !$0.isEmpty }
      let numbers = shortcutDone.flatMap { ($0["territories"] as? [[String: Any]] ?? []) }
        .compactMap { $0["number"] as? String }
      return [
        "state": "done", "names": Array(Set(names)).sorted(),
        "territories": Array(Set(numbers)).sorted(by: Notices.byNumber),
      ]
    }
    return over && !busy ? ["state": "none"] : ["state": "running"]
  }

  // ---- what the page asks for ----

  func startMeet() {
    meet = true
    start(reason: "meet", seconds: 60)
  }

  func stopMeet() {
    meet = false
    seenMeet.removeAll()
    refresh()
    changed()
  }

  func pair(_ address: String) {
    connecting[address] = Core.modePairCode
    link?.connect(address)
  }

  /// `address` as the page has it: an incoming pipe's key has "in:" before it.
  func confirm(_ accept: Bool, address: String?) {
    let waiting = exchanges.values.filter { $0.state == "confirm" }
    guard let address = address, !address.isEmpty else {
      // an older page names no address
      waiting.first?.confirm(accept)
      return
    }
    waiting.first { $0.pipe.address == address }?.confirm(accept)
  }

  func status() -> [String: Any] {
    [
      "running": running,
      "bluetooth": link?.available ?? false,
      "meet": meet,
      "reason": reason,
      "until": until.timeIntervalSince1970 * 1000,
      "seen": Array(seenMeet.values),
      "exchanges": exchanges.values.map { $0.json() },
      "peersSeen": Array(seenPeers.keys),
      "lastDone": lastDone.map { $0 as Any } ?? NSNull(),
    ]
  }

  private func changed() { onChange?() }

  // ---- Bluetooth ----

  func linkSaw(address: String, payload: Data, rssi: Int, name: String?) {
    let now = Date()
    guard let kind = payload.first else {
      seenIphone(address: address, rssi: rssi, name: name, now: now)
      return
    }
    let rest = payload.dropFirst()
    switch kind {
    case Ids.kindMeet:
      sawMeet(address: address, name: String(decoding: rest, as: UTF8.self), rssi: rssi, now: now)
    case Ids.kindBeacon:
      guard let sighting = Core.recognise(Data(rest)), let peer = sighting["peer"] as? String else {
        return
      }
      seenPeers[peer] = now
      beacons[peer] = Data(rest)
      guard sighting["needsSync"] as? Bool == true else {
        needSince[peer] = nil
        Notices.shared.settled(peer: peer)
        return
      }
      until = max(until, now.addingTimeInterval(Self.peerStaySeconds))
      guard let link = link, !link.connected(address),
        !exchanges.values.contains(where: { $0.peer == peer }),
        now.timeIntervalSince(lastSync[peer] ?? .distantPast) > Self.resyncSeconds
      else { return }
      // one side connects: the phone with the smaller id, or this one if the
      // other hasn't for a while
      let since = needSince[peer] ?? now
      needSince[peer] = since
      if myId < peer || now.timeIntervalSince(since) > Self.waitForOtherSeconds {
        connecting[address] = Core.modeSync
        trying[address] = peer
        link.connect(address)
      }
    default:
      break
    }
  }

  private func sawMeet(address: String, name: String, rssi: Int, now: Date) {
    guard meet else { return }
    let fresh = seenMeet[address]?["name"] as? String != name
    seenMeet[address] = [
      "address": address, "name": name, "rssi": rssi, "at": now.timeIntervalSince1970,
    ]
    if fresh { changed() }
  }

  /// Another iPhone can't say who it is either: the session finds out.
  private func seenIphone(address: String, rssi: Int, name: String?, now: Date) {
    if let name = name, name.hasPrefix(Ids.meetPrefix) {
      sawMeet(address: address, name: String(name.dropFirst(Ids.meetPrefix.count)), rssi: rssi, now: now)
      return
    }
    guard !meet, let link = link, !link.connected(address), exchanges[address] == nil,
      myId.isEmpty == false
    else { return }
    // cheap check first: this runs for every advertisement
    let last = triedIphone[address] ?? .distantPast
    guard now.timeIntervalSince(last) > Self.iphoneNewsSeconds else { return }
    let wait = unsynced > 0 ? Self.iphoneNewsSeconds : Self.iphoneQuietSeconds
    guard now.timeIntervalSince(last) > wait else { return }
    triedIphone[address] = now
    until = max(until, now.addingTimeInterval(Self.peerStaySeconds))
    connecting[address] = Core.modeSync
    link.connect(address)
  }

  func linkConnected(_ pipe: Pipe) {
    let mode = connecting.removeValue(forKey: pipe.address) ?? Core.modeSync
    let handle = Core.sessionNew(mode: mode, initiator: true)
    guard handle != 0 else {
      link?.close(pipe)
      return
    }
    let exchange = Exchange(pipe: pipe, handle: handle, mode: mode, onStatus: onStatus)
    exchange.knownPeer = trying.removeValue(forKey: pipe.address) ?? ""
    exchanges[pipe.key] = exchange
    Background.begin(pipe.key)
    // the first byte tells the other phone whether this is a sync or a pairing
    exchange.start(preamble: Data([UInt8(mode)]))
  }

  func linkIncoming(_ pipe: Pipe, first: Data) {
    guard let modeByte = first.first else { return }
    let mode = Int32(modeByte)
    let allowed = mode == Core.modeSync || (mode == Core.modePairCode && meet)
    let handle = allowed ? Core.sessionNew(mode: mode, initiator: false) : 0
    guard handle != 0 else {
      link?.close(pipe)
      return
    }
    let exchange = Exchange(pipe: pipe, handle: handle, mode: mode, onStatus: onStatus)
    exchanges[pipe.key] = exchange
    Background.begin(pipe.key)
    exchange.start(preamble: nil)
    if first.count > 1 { exchange.receive(first.dropFirst()) }
  }

  func linkBytes(_ pipe: Pipe, _ bytes: Data) {
    exchanges[pipe.key]?.receive(bytes)
  }

  func linkClosed(_ pipe: Pipe) {
    // keyed like outgoing pipes: a closed incoming one leaves them alone
    connecting[pipe.key] = nil
    // the connection never came up
    if let peer = trying.removeValue(forKey: pipe.key) { attemptFailed(peer) }
    Background.end(pipe.key)
    guard let exchange = exchanges.removeValue(forKey: pipe.key) else { return }
    exchange.lost(Notices.tr("The connection was lost", "Die Verbindung ist abgebrochen"))
    changed()
  }

  func linkStateChanged() {
    // e.g. Bluetooth was just allowed: start what the mode wants
    if !running { apply() }
    changed()
  }

  private func onStatus(_ exchange: Exchange) {
    switch exchange.state {
    case "done":
      let peer = exchange.peer
      lastSync[peer] = Date()
      needSince[peer] = nil
      noticed[peer] = nil
      fails[peer] = nil
      failedAt[peer] = nil
      Notices.shared.synced(peer: peer, nothingLeft: unsynced == 0)
      var done = exchange.status
      done["at"] = Date().timeIntervalSince1970 * 1000
      done["mode"] = exchange.mode
      lastDone = done
      if exchange.mode == Core.modeSync {
        Notices.shared.done(exchange.status)
        if shortcutSince != nil { shortcutDone.append(exchange.status) }
      }
      Place.shared.synced()
      // a step can end after the search stopped
      if running { refresh() }
      closeWhenSent(exchange)
    case "failed":
      if exchange.mode == Core.modeSync && !exchange.peer.isEmpty { attemptFailed(exchange.peer) }
      closeWhenSent(exchange)
    default:
      break
    }
    changed()
  }

  private func closeWhenSent(_ exchange: Exchange, waited: Double = 0) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      if exchange.pipe.idle || waited > 5 {
        self?.link?.close(exchange.pipe)
      } else {
        self?.closeWhenSent(exchange, waited: waited + 0.5)
      }
    }
  }
}
