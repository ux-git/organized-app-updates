import AppIntents
import Foundation

/// "Sync territories" in Shortcuts and Siri: a Shortcut automation (arriving
/// at the Kingdom Hall, a meeting time, an NFC sticker) syncs with paired
/// devices nearby without opening the app. The work is in the nearby plugin
/// (Launch.swift); this only waits for its answer. The words for Shortcuts are
/// in territories_iOS/*.lproj (Localizable.strings, AppShortcuts.strings).
struct SyncTerritories: AppIntent {
  static var title: LocalizedStringResource = "Sync territories"
  static var description = IntentDescription(
    "Syncs territories with paired devices nearby, without opening the app.")
  static var openAppWhenRun = false
  /// Within the half minute iOS gives an intent; the search itself takes 25 s.
  private static let maxSeconds = 27.0

  func perform() async throws -> some IntentResult & ProvidesDialog {
    territory_ios_sync_start()
    let deadline = Date().addingTimeInterval(Self.maxSeconds)
    while Date() < deadline {
      try await Task.sleep(nanoseconds: 500_000_000)
      let state = await Self.state()
      switch state["state"] as? String {
      case "running":
        continue
      case "done":
        let names = (state["names"] as? [String] ?? []).joined(separator: ", ")
        let numbers = (state["territories"] as? [String] ?? []).joined(separator: ", ")
        let what =
          numbers.isEmpty
          ? "" : Self.tr(" Territories \(numbers) changed.", " Gebiete Nr. \(numbers) wurden geändert.")
        let who = names.isEmpty ? Self.tr("a paired device", "einem gekoppelten Gerät") : names
        return .result(dialog: "\(Self.tr("Synced with \(who).", "Synchronisiert mit \(who)."))\(what)")
      case "off":
        return .result(
          dialog: "\(Self.tr("Open Territories: Organized once to pair a device and allow Bluetooth.", "Öffne Gebiete: Organized einmal, um ein Gerät zu koppeln und Bluetooth zu erlauben."))")
      case "bluetoothOff":
        return .result(
          dialog: "\(Self.tr("Turn on Bluetooth to sync territories.", "Schalte Bluetooth ein, um Gebiete zu synchronisieren."))")
      default:
        return .result(dialog: "\(Self.nothing)")
      }
    }
    // a sync is still going; it goes on in the background
    return .result(
      dialog: "\(Self.tr("Still syncing with a paired device nearby.", "Die Synchronisierung mit einem gekoppelten Gerät in der Nähe läuft noch."))")
  }

  private static var nothing: String {
    tr("No paired device nearby with something new.", "Kein gekoppeltes Gerät mit Neuem in der Nähe.")
  }

  /// German when the phone is set to German, like the notifications.
  private static func tr(_ english: String, _ german: String) -> String {
    Locale.preferredLanguages.first?.hasPrefix("de") == true ? german : english
  }

  /// On the main thread, where the plugin keeps its state: no blocking wait.
  @MainActor private static func state() -> [String: Any] {
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
