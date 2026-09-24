import AppIntents
import Foundation

/// "Sync territories" in Shortcuts and Siri: a Shortcut automation (arriving
/// at the Kingdom Hall, a meeting time, an NFC sticker) syncs with paired
/// phones nearby without opening the app. The work is in the nearby plugin
/// (Launch.swift); this only waits for its answer.
struct SyncTerritories: AppIntent {
  static var title: LocalizedStringResource = "Sync territories"
  static var description = IntentDescription(
    "Syncs territories with paired phones nearby, without opening the app.")
  static var openAppWhenRun = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    territory_ios_sync_start()
    for _ in 0..<60 {
      try await Task.sleep(nanoseconds: 500_000_000)
      let state = Self.state()
      switch state["state"] as? String {
      case "running":
        continue
      case "done":
        let names = (state["names"] as? [String] ?? []).joined(separator: ", ")
        let numbers = (state["territories"] as? [String] ?? []).joined(separator: ", ")
        let what = numbers.isEmpty ? "" : " Territories \(numbers) changed."
        return .result(dialog: "Synced with \(names.isEmpty ? "a paired phone" : names).\(what)")
      case "off":
        return .result(dialog: "Open Territories once to pair a phone and allow Bluetooth.")
      default:
        return .result(dialog: "No paired phone nearby with something new.")
      }
    }
    return .result(dialog: "No paired phone nearby with something new.")
  }

  private static func state() -> [String: Any] {
    guard let text = territory_ios_sync_state() else { return [:] }
    defer { free(text) }
    let data = Data(String(cString: text).utf8)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }
}

/// Shown in the Shortcuts app with no setup, and to Siri.
struct TerritoriesShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SyncTerritories(),
      phrases: ["Sync \(.applicationName)", "Sync territories with \(.applicationName)"]
    )
  }
}
