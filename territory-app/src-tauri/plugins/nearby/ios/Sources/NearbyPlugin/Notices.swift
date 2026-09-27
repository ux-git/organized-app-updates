import Foundation
import UserNotifications

/// The notifications SyncNotices sends on Android: what a sync brought (one
/// notification, later syncs added to it while it is still there), a paired
/// phone near with news but no sync (with Sync now), and leaving the hall
/// with changes no paired phone has.
final class Notices: NSObject, UNUserNotificationCenterDelegate {
  static let shared = Notices()

  private static let result = "result"
  private static let found = "found"
  private static let leave = "leave"
  private static let syncNow = "SYNC_NOW"
  private static let foundCategory = "FOUND"
  private static let maxLines = 5

  private let center = UNUserNotificationCenter.current()
  private let defaults = UserDefaults.standard
  private(set) var allowed = false
  private var foundPeer: String? {
    get { defaults.string(forKey: "foundPeer") }
    set { defaults.set(newValue, forKey: "foundPeer") }
  }

  func setUp() {
    center.delegate = self
    let action = UNNotificationAction(identifier: Self.syncNow, title: Self.tr("Sync now", "Jetzt synchronisieren"), options: [])
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: Self.foundCategory, actions: [action], intentIdentifiers: [], options: [])
    ])
    refresh()
  }

  func refresh(then: (() -> Void)? = nil) {
    center.getNotificationSettings { settings in
      DispatchQueue.main.async {
        self.allowed =
          settings.authorizationStatus == .authorized
          || settings.authorizationStatus == .provisional
        then?()
      }
    }
  }

  func ask(then: (() -> Void)? = nil) {
    center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
      self.refresh(then: then)
    }
  }

  private var wanted: Bool {
    Nearby.shared.schedule["notify"] as? Bool ?? true
  }

  // ---- a sync went through ----

  func done(_ status: [String: Any]) {
    let sent = status["sent"] as? Int ?? 0
    let received = status["received"] as? Int ?? 0
    let introduced = status["introduced"] as? [String] ?? []
    guard sent + received > 0 || !introduced.isEmpty else { return }
    // the page vibrates and shows it too; the notification stays either way
    Core.emit("synced", status)
    guard wanted else { return }

    center.getDeliveredNotifications { delivered in
      let showing = delivered.contains { $0.request.identifier == Self.result }
      DispatchQueue.main.async { self.post(self.merge(status, into: showing)) }
    }
  }

  /// Adds this sync to the result still shown, or starts a new one.
  private func merge(_ status: [String: Any], into showing: Bool) -> [String: Any] {
    var result = showing ? (defaults.dictionary(forKey: "result") ?? [:]) : [:]
    var names = result["names"] as? [String] ?? []
    let name = (status["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? Self.tr("the other device", "dem anderen Gerät")
    if !names.contains(name) { names.append(name) }
    result["names"] = names

    var territories = result["territories"] as? [String: [String]] ?? [:]
    for item in status["territories"] as? [[String: Any]] ?? [] {
      guard let number = item["number"] as? String else { continue }
      let what = Set((territories[number] ?? []) + (item["what"] as? [String] ?? []))
      territories[number] = Self.settle(what)
    }
    result["territories"] = territories

    let items = status["items"] as? [String: Int] ?? [:]
    result["people"] = (result["people"] as? Int ?? 0) + (items["people"] ?? 0)
    result["sent"] = (result["sent"] as? Int ?? 0) + (status["sent"] as? Int ?? 0)
    result["conflicts"] = (result["conflicts"] as? Int ?? 0) + (status["conflicts"] as? Int ?? 0)
    var joined = result["joined"] as? [String] ?? []
    joined += (status["introduced"] as? [String] ?? []).filter { !joined.contains($0) }
    result["joined"] = joined
    defaults.set(result, forKey: "result")
    return result
  }

  private func post(_ result: [String: Any]) {
    let names = result["names"] as? [String] ?? []
    let territories = result["territories"] as? [String: [String]] ?? [:]
    let numbers = territories.keys.sorted(by: Self.byNumber)
    let people = result["people"] as? Int ?? 0
    let conflicts = result["conflicts"] as? Int ?? 0
    let joined = result["joined"] as? [String] ?? []

    var lines: [String] = []
    if numbers.count > 1 {
      let shown = Self.join(numbers.prefix(Self.maxLines).map { Self.tr("#\($0)", $0) })
        + (numbers.count > Self.maxLines ? "…" : "")
      lines.append(Self.tr("Territories \(shown) changed.", "Gebiete Nr. \(shown) wurden geändert."))
    }
    // a single territory says what changed right away
    if numbers.count == 1 { lines.append(Self.line(numbers[0], territories)) }
    if people > 0 {
      lines.append(
        people == 1
          ? Self.tr("1 name changed.", "1 Name geändert.")
          : Self.tr("\(people) names changed.", "\(people) Namen geändert."))
    }
    if lines.isEmpty && (result["sent"] as? Int ?? 0) > 0 {
      lines.append(
        Self.tr("Your changes are on their device now too.", "Deine Änderungen sind jetzt auch auf dem anderen Gerät."))
    }
    if !joined.isEmpty {
      lines.append(
        Self.tr("\(Self.join(joined)) joined your devices. You now sync with them too.", "\(Self.join(joined)) ist zu euren Geräten dazugekommen. Du synchronisierst jetzt auch damit."))
    }
    if conflicts > 0 {
      lines.append(
        conflicts == 1
          ? Self.tr("1 detail was changed on both devices. Check it in the app.", "1 Angabe wurde auf beiden Geräten geändert. Prüfe sie in der App.")
          : Self.tr("\(conflicts) details were changed on both devices. Check them in the app.", "\(conflicts) Angaben wurden auf beiden Geräten geändert. Prüfe sie in der App."))
    }
    // one line per territory, with what changed in it
    if numbers.count > 1 {
      for number in numbers.prefix(Self.maxLines) { lines.append(Self.line(number, territories)) }
      if numbers.count > Self.maxLines {
        let more = numbers.count - Self.maxLines
        lines.append(Self.tr("+\(more) more", "+\(more) weitere"))
      }
    }

    let content = UNMutableNotificationContent()
    content.title = Self.tr("Synced with \(Self.join(names))", "Synchronisiert mit \(Self.join(names))")
    content.body = lines.joined(separator: "\n")
    content.sound = .default
    content.threadIdentifier = "sync"
    content.userInfo = ["route": "/sync"]
    center.add(UNNotificationRequest(identifier: Self.result, content: content, trigger: nil))
  }

  // ---- a paired phone is close, nothing synced ----

  func found(peer: String) {
    foundPeer = peer
    let name = Core.peerName(peer)
    let content = UNMutableNotificationContent()
    let who = name.isEmpty ? Self.tr("A paired device", "Ein gekoppeltes Gerät") : name
    content.title = Self.tr("\(who) is nearby", "\(who) ist in der Nähe")
    content.body = Self.tr("Your devices haven’t synced yet. Tap Sync now, or open the app.", "Eure Geräte haben noch nicht synchronisiert. Tippe auf „Jetzt synchronisieren“ oder öffne die App.")
    content.categoryIdentifier = Self.foundCategory
    content.userInfo = ["route": "/sync?now=1"]
    center.add(UNNotificationRequest(identifier: Self.found, content: content, trigger: nil))
  }

  func synced(peer: String, nothingLeft: Bool) {
    if nothingLeft { cancelFound() } else { settled(peer: peer) }
  }

  /// Nothing is left to sync with this phone.
  func settled(peer: String) {
    if foundPeer == peer { cancelFound() }
  }

  private func cancelFound() {
    foundPeer = nil
    center.removeDeliveredNotifications(withIdentifiers: [Self.found])
  }

  // ---- leaving the Kingdom Hall ----

  func leaving() {
    let names = Core.peers.compactMap { $0["name"] as? String }.filter { !$0.isEmpty }
    let content = UNMutableNotificationContent()
    content.title = Self.tr("You left before syncing", "Du bist vor der Synchronisierung gegangen")
    content.body =
      names.isEmpty
      ? Self.tr("Your changes haven’t reached a paired device yet. Open the app when you’re near one of them again.", "Deine Änderungen haben noch kein gekoppeltes Gerät erreicht. Öffne die App, wenn du wieder in der Nähe bist.")
      : Self.tr("Your changes haven’t reached \(Self.join(names)) yet. Open the app when you’re near one of them again.", "Deine Änderungen haben \(Self.join(names)) noch nicht erreicht. Öffne die App, wenn du wieder in der Nähe bist.")
    content.userInfo = ["route": "/sync?now=1"]
    center.add(UNNotificationRequest(identifier: Self.leave, content: content, trigger: nil))
  }

  func cancelLeaving() {
    center.removeDeliveredNotifications(withIdentifiers: [Self.leave])
  }

  // ---- UNUserNotificationCenterDelegate ----

  /// Shown as a banner with the app open, as Android does.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    DispatchQueue.main.async {
      if response.actionIdentifier == Self.syncNow {
        Nearby.shared.start(reason: "tap", seconds: 120)
      } else if let route = response.notification.request.content.userInfo["route"] as? String {
        Page.open(route: route)
      }
      completionHandler()
    }
  }

  // ---- words ----

  /// "M9" before "M10", as in Rust's Store::touched
  static func byNumber(_ a: String, _ b: String) -> Bool {
    func key(_ s: String) -> (String, Int) {
      let prefix = String(s.prefix { !$0.isNumber })
      let digits = String(s.dropFirst(prefix.count).prefix { $0.isNumber })
      return (prefix, Int(digits) ?? Int.max)
    }
    let (ka, kb) = (key(a), key(b))
    return ka != kb ? (ka.0, ka.1) < (kb.0, kb.1) : a < b
  }

  // the order Rust's Store::touched tells them in
  static let kinds = [
    "created", "deleted", "assigned", "returned", "assignment-removed",
    "border", "details", "dnc-added", "dnc-changed", "dnc-removed",
  ]

  /// A territory added or deleted needs no more words.
  static func settle(_ what: Set<String>) -> [String] {
    if let alone = ["deleted", "created"].first(where: what.contains) { return [alone] }
    return what.sorted { (kinds.firstIndex(of: $0) ?? -1) < (kinds.firstIndex(of: $1) ?? -1) }
  }

  /// "Territory #12: returned, border changed"
  static func line(_ number: String, _ territories: [String: [String]]) -> String {
    let what = (territories[number] ?? []).map(kind).joined(separator: ", ")
    return tr("Territory #\(number): \(what)", "Gebiet Nr. \(number): \(what)")
  }

  static func kind(_ what: String) -> String {
    switch what {
    case "created": return tr("added", "neu angelegt")
    case "deleted": return tr("deleted", "gelöscht")
    case "border": return tr("border changed", "Grenze geändert")
    case "assigned": return tr("assigned", "zugeteilt")
    case "returned": return tr("returned", "zurückgegeben")
    case "assignment-removed": return tr("assignment removed", "Zuteilung entfernt")
    case "dnc-added": return tr("do-not-call added", "„Nicht besuchen“ hinzugefügt")
    case "dnc-removed": return tr("do-not-call removed", "„Nicht besuchen“ entfernt")
    case "dnc-changed": return tr("do-not-call changed", "„Nicht besuchen“ geändert")
    case "assignment": return tr("assignment", "Zuteilung")
    case "do-not-call": return tr("do-not-call address", "„Nicht besuchen“-Adresse")
    default: return tr("details changed", "Angaben geändert")
    }
  }

  /// "A", "A and B", "A, B and C"
  static func join(_ parts: [String]) -> String {
    guard parts.count > 1 else { return parts.first ?? "" }
    return parts.dropLast().joined(separator: ", ") + tr(" and ", " und ") + parts.last!
  }

  /// German when the app is set to German (the phone's language or the app's
  /// own in Settings), as Android picks values-de.
  static func tr(_ english: String, _ german: String) -> String {
    Bundle.main.preferredLocalizations.first?.hasPrefix("de") == true ? german : english
  }
}
