import Foundation

#if canImport(UIKit)
  import UIKit
#endif

/// A sync that started while the app was in the background gets the half
/// minute iOS grants to finish, instead of being frozen mid-transfer.
enum Background {
  #if canImport(UIKit)
    private static var tasks: [String: UIBackgroundTaskIdentifier] = [:]
  #endif

  static func begin(_ key: String) {
    #if canImport(UIKit)
      guard tasks[key] == nil else { return }
      tasks[key] = UIApplication.shared.beginBackgroundTask(withName: "sync") { end(key) }
    #endif
  }

  static func end(_ key: String) {
    #if canImport(UIKit)
      guard let task = tasks.removeValue(forKey: key) else { return }
      UIApplication.shared.endBackgroundTask(task)
    #endif
  }
}
