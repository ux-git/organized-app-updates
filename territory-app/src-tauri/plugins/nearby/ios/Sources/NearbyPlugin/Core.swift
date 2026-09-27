import Foundation
import TerritoryCore

/// The Rust core (src-tauri/src/ios.rs): sessions, the beacon, the summary.
/// The same calls Kotlin makes through `Native` on Android.
enum Core {
  static let modeSync: Int32 = 0
  static let modePairCode: Int32 = 1

  private static func take(_ ptr: UnsafeMutablePointer<UInt8>?, _ len: Int) -> Data {
    guard let ptr = ptr else { return Data() }
    let data = Data(bytes: ptr, count: len)
    territory_free(ptr, len)
    return data
  }

  private static func take(_ ptr: UnsafeMutablePointer<CChar>?) -> String {
    guard let ptr = ptr else { return "" }
    let text = String(cString: ptr)
    territory_free_string(ptr)
    return text
  }

  private static func json(_ text: String) -> [String: Any] {
    guard let data = text.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return object
  }

  /// The same folder Tauri opens the store in (app_data_dir), so the core is
  /// ready even when iOS wakes the app for Bluetooth before the page loads.
  @discardableResult
  static func open() -> Bool {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    var dir = base.appendingPathComponent(Bundle.main.bundleIdentifier ?? "com.sws2apps.territories")
    // a restored backup would bring back an old identity and old sequence numbers
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return dir.path.withCString { territory_open($0) }
  }

  static func sessionNew(mode: Int32, initiator: Bool) -> Int64 {
    territory_session_new(mode, initiator)
  }

  static func start(_ handle: Int64) -> Data {
    var len = 0
    return take(territory_session_start(handle, &len), len)
  }

  static func feed(_ handle: Int64, _ input: Data) -> Data {
    var len = 0
    let out = input.withUnsafeBytes { raw in
      territory_session_feed(
        handle, raw.bindMemory(to: UInt8.self).baseAddress, input.count, &len)
    }
    return take(out, len)
  }

  static func confirm(_ handle: Int64, accept: Bool) -> Data {
    var len = 0
    return take(territory_session_confirm(handle, accept, &len), len)
  }

  static func status(_ handle: Int64) -> [String: Any] {
    json(take(territory_session_status(handle)))
  }

  static func close(_ handle: Int64) {
    territory_session_close(handle)
  }

  static func beacon() -> Data {
    var len = 0
    return take(territory_beacon(&len), len)
  }

  /// `["peer": id, "needsSync": Bool]` for a paired phone's beacon.
  static func recognise(_ beacon: Data) -> [String: Any]? {
    let text = beacon.withUnsafeBytes { raw in
      take(territory_recognise(raw.bindMemory(to: UInt8.self).baseAddress, beacon.count))
    }
    return text.isEmpty ? nil : json(text)
  }

  /// `["id", "name", "peers": [...], "unsynced"]`
  static func summary() -> [String: Any] {
    json(take(territory_summary()))
  }

  static var peers: [[String: Any]] {
    summary()["peers"] as? [[String: Any]] ?? []
  }

  static func peerName(_ id: String) -> String {
    peers.first { $0["id"] as? String == id }?["name"] as? String ?? ""
  }

  /// A full backup (src-tauri/src/backup.rs); "" when it fails.
  static func backup() -> String {
    take(territory_backup())
  }

  /// A transfer file opened from Files, AirDrop or Mail waits for the sync page.
  static var hasFile: Bool { territory_has_file() }

  /// The waiting transfer file, once; nil when there is none.
  static func takeFile() -> String? {
    let text = take(territory_take_file())
    return text.isEmpty ? nil : text
  }

  /// Passes progress to the page, as `Native.emit` does on Android.
  static func emit(_ event: String, _ payload: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
      let text = String(data: data, encoding: .utf8)
    else { return }
    event.withCString { e in text.withCString { territory_emit(e, $0) } }
  }
}
