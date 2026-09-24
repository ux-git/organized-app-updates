import BackgroundTasks
import Foundation

/// What has to exist as soon as the app starts, also when iOS starts it in
/// the background with no page (for Bluetooth, the Kingdom Hall, a paired
/// Android phone's iBeacon, a Shortcut or a background refresh): iOS hands
/// those events only to managers created during launch.
enum Launch {
  private static var started = false

  static func start() {
    guard !started else { return }
    started = true
    Core.open()
    Notices.shared.setUp()
    Refresh.register()
    Nearby.shared.setUp()
    Refresh.schedule()
  }
}

/// iOS's occasional background refresh: one more chance to sync, when the
/// system allows it (often every few hours).
enum Refresh {
  static let identifier = "com.sws2apps.territories.refresh"

  static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: .main) { task in
      schedule()
      let nearby = Nearby.shared
      guard nearby.mode != "manual", nearby.hasPeers else {
        task.setTaskCompleted(success: true)
        return
      }
      nearby.start(reason: "refresh", seconds: 20)
      DispatchQueue.main.asyncAfter(deadline: .now() + 22) {
        task.setTaskCompleted(success: true)
      }
      task.expirationHandler = { task.setTaskCompleted(success: false) }
    }
  }

  static func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: identifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }
}

// ---- the "Sync territories" App Intent (gen/apple/Sources) calls these ----

/// Starts a search for paired phones for a Shortcut, also with no page.
@_cdecl("territory_ios_sync_start")
public func territorySyncStart() {
  DispatchQueue.main.async {
    Launch.start()
    Nearby.shared.startForShortcut()
  }
}

/// JSON: `{"state": "running" | "done" | "none" | "off", ...}`; free() it.
@_cdecl("territory_ios_sync_state")
public func territorySyncState() -> UnsafeMutablePointer<CChar>? {
  var state: [String: Any] = [:]
  if Thread.isMainThread {
    state = Nearby.shared.shortcutState()
  } else {
    DispatchQueue.main.sync { state = Nearby.shared.shortcutState() }
  }
  let data = (try? JSONSerialization.data(withJSONObject: state)) ?? Data("{}".utf8)
  return strdup(String(decoding: data, as: UTF8.self))
}
