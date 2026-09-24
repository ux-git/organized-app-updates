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
  private static let maxLines = 6

  private let center = UNUserNotificationCenter.current()
  private let defaults = UserDefaults.standard
  private(set) var allowed = false

  func setUp() {
    center.delegate = self
    let action = UNNotificationAction(identifier: Self.syncNow, title: "Sync now", options: [])
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
    center.removeDeliveredNotifications(withIdentifiers: [Self.found])
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
    let name = (status["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "the other phone"
    if !names.contains(name) { names.append(name) }
    result["names"] = names

    var territories = result["territories"] as? [String: [String]] ?? [:]
    for item in status["territories"] as? [[String: Any]] ?? [] {
      guard let number = item["number"] as? String else { continue }
      let what = Set((territories[number] ?? []) + (item["what"] as? [String] ?? []))
      territories[number] = Array(what).sorted()
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
    if !numbers.isEmpty {
      let shown = Self.join(Array(numbers.prefix(Self.maxLines)))
        + (numbers.count > Self.maxLines ? "…" : "")
      lines.append("\(numbers.count == 1 ? "Territory" : "Territories") \(shown) changed.")
    }
    if people > 0 { lines.append(people == 1 ? "1 name changed." : "\(people) names changed.") }
    if lines.isEmpty && (result["sent"] as? Int ?? 0) > 0 {
      lines.append("Your changes are on their phone now too.")
    }
    if !joined.isEmpty {
      lines.append("\(Self.join(joined)) joined your phones. You now sync with them too.")
    }
    if conflicts > 0 {
      lines.append(
        conflicts == 1
          ? "1 detail was changed on both phones. Check it in the app."
          : "\(conflicts) details were changed on both phones. Check them in the app.")
    }
    // one line per territory, with what changed in it
    if numbers.count > 1 {
      for number in numbers.prefix(Self.maxLines) {
        let what = (territories[number] ?? []).map(Self.kind).joined(separator: ", ")
        lines.append("Territory \(number): \(what)")
      }
    }

    let content = UNMutableNotificationContent()
    content.title = "Synced with \(Self.join(names))"
    content.body = lines.joined(separator: "\n")
    content.sound = .default
    content.threadIdentifier = "sync"
    content.userInfo = ["route": "/sync"]
    center.add(UNNotificationRequest(identifier: Self.result, content: content, trigger: nil))
  }

  // ---- a paired phone is close, nothing synced ----

  func found(peer: String) {
    let name = Core.peerName(peer)
    let content = UNMutableNotificationContent()
    content.title = "\(name.isEmpty ? "A paired phone" : name) is nearby"
    content.body = "Your phones haven’t synced yet. Tap Sync now, or open the app."
    content.categoryIdentifier = Self.foundCategory
    content.userInfo = ["route": "/sync?now=1"]
    center.add(UNNotificationRequest(identifier: Self.found, content: content, trigger: nil))
  }

  // ---- leaving the Kingdom Hall ----

  func leaving() {
    let names = Core.peers.compactMap { $0["name"] as? String }.filter { !$0.isEmpty }
    let content = UNMutableNotificationContent()
    content.title = "You left before syncing"
    content.body =
      "Your changes haven’t reached \(names.isEmpty ? "a paired phone" : Self.join(names)) yet. Open the app when you’re near one of them again."
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

  static func kind(_ what: String) -> String {
    switch what {
    case "assignment": return "assignment"
    case "do-not-call": return "do-not-call address"
    default: return "details"
    }
  }

  /// "A", "A and B", "A, B and C"
  static func join(_ parts: [String]) -> String {
    guard parts.count > 1 else { return parts.first ?? "" }
    return parts.dropLast().joined(separator: ", ") + " and " + parts.last!
  }
}
