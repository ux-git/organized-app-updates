import BackgroundTasks
import Foundation
import UIKit
import UniformTypeIdentifiers
import UserNotifications

/// Full backups (src-tauri/src/backup.rs) saved to a folder picked in Files,
/// as Backups.kt does on Android. iOS runs no app at an exact time: a
/// background task asks for the chosen time and iOS picks the moment, and a
/// backup that is due is also made when the app opens or goes to the
/// background. Only a failure notifies.
enum Backups {
  static let identifier = "com.sws2apps.territories.backup"
  private static let failed = "backupFailed"
  private static let keep = 10
  private static let prefix = "Territories-backup-"
  private static let suffix = ".territories"

  private static let defaults = UserDefaults.standard
  private static let queue = DispatchQueue(label: "com.sws2apps.territories.backup")
  private static var running = false
  /// When the last backup, made or failed, ended; for the page's Back up now.
  private static var ended: Int64 = 0

  private static var frequency: String { defaults.string(forKey: "backup.frequency") ?? "off" }
  private static var hour: Int { defaults.object(forKey: "backup.hour") as? Int ?? 2 }
  private static var minute: Int { defaults.integer(forKey: "backup.minute") }

  // ---- the folder, kept as a bookmark ----

  private static func folder() -> URL? {
    guard let data = defaults.data(forKey: "backup.folder") else { return nil }
    var stale = false
    guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale) else {
      return nil
    }
    if stale, url.startAccessingSecurityScopedResource() {
      if let fresh = try? url.bookmarkData() { defaults.set(fresh, forKey: "backup.folder") }
      url.stopAccessingSecurityScopedResource()
    }
    return url
  }

  private static func canWrite(_ url: URL) -> Bool {
    guard url.startAccessingSecurityScopedResource() else { return false }
    defer { url.stopAccessingSecurityScopedResource() }
    return FileManager.default.isWritableFile(atPath: url.path)
  }

  static var folderOk: Bool { folder().map(canWrite) ?? false }

  static func setFolder(_ url: URL) {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    guard let bookmark = try? url.bookmarkData() else { return }
    defaults.set(bookmark, forKey: "backup.folder")
    defaults.removeObject(forKey: "backup.error")
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [failed])
  }

  // ---- status and schedule ----

  static func status() -> [String: Any] {
    let url = folder()
    let ms = { (date: Date) in Int64(date.timeIntervalSince1970 * 1000) }
    return [
      "frequency": frequency,
      "hour": hour,
      "minute": minute,
      "folder": url?.lastPathComponent ?? NSNull(),
      "folderOk": url.map(canWrite) ?? false,
      "last": defaults.dictionary(forKey: "backup.last") ?? NSNull(),
      "error": defaults.string(forKey: "backup.error") ?? NSNull(),
      "next": next().map(ms) ?? NSNull(),
      "running": running,
      "ended": ended,
      "approximate": true,
    ]
  }

  static func emit() {
    let status = status()
    DispatchQueue.main.async { Core.emit("backup", status) }
  }

  static func setSchedule(_ args: [String: Any]) {
    let wanted = args["frequency"] as? String ?? "off"
    defaults.set(["daily", "weekly", "monthly"].contains(wanted) ? wanted : "off", forKey: "backup.frequency")
    defaults.set(min(max(args["hour"] as? Int ?? 2, 0), 23), forKey: "backup.hour")
    defaults.set(min(max(args["minute"] as? Int ?? 0, 0), 59), forKey: "backup.minute")
    defaults.set(Date().timeIntervalSince1970, forKey: "backup.since")
    schedule()
  }

  /// The next backup as scheduled; iOS decides when it really runs.
  static func next() -> Date? {
    let component: Calendar.Component
    switch frequency {
    case "daily": component = .day
    case "weekly": component = .weekOfYear
    case "monthly": component = .month
    default: return nil
    }
    let calendar = Calendar.current
    let lastRun = defaults.double(forKey: "backup.lastRun")
    // a period after the last run, less most of a day: a late run keeps the time
    let base: Date
    if lastRun > 0,
      let later = calendar.date(byAdding: component, value: 1, to: Date(timeIntervalSince1970: lastRun)),
      let earlier = calendar.date(byAdding: .hour, value: -23, to: later)
    {
      base = earlier
    } else {
      let since = defaults.double(forKey: "backup.since")
      base = since > 0 ? Date(timeIntervalSince1970: since) : Date()
    }
    guard var slot = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: base) else {
      return nil
    }
    if slot <= base { slot = calendar.date(byAdding: .day, value: 1, to: slot) ?? slot }
    return slot
  }

  private static var due: Bool { next().map { Date() >= $0.addingTimeInterval(-60) } ?? false }

  // ---- iOS's background task ----

  static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
      // completed once: by the backup or by iOS taking the time back
      var finished = false
      let finish = { (success: Bool) in
        DispatchQueue.main.async {
          guard !finished else { return }
          finished = true
          task.setTaskCompleted(success: success)
        }
      }
      task.expirationHandler = { finish(false) }
      queue.async {
        automatic()
        finish(true)
      }
    }
    for name in [UIApplication.willEnterForegroundNotification, UIApplication.didEnterBackgroundNotification] {
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in catchUp() }
    }
  }

  static func schedule() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
    guard let at = next() else { return }
    let request = BGProcessingTaskRequest(identifier: identifier)
    request.earliestBeginDate = at
    request.requiresNetworkConnectivity = false
    request.requiresExternalPower = false
    try? BGTaskScheduler.shared.submit(request)
  }

  /// A backup that is due, while the app opens or leaves the screen.
  static func catchUp() {
    guard due, !running else { return }
    Background.begin("backup")
    queue.async {
      automatic()
      DispatchQueue.main.async { Background.end("backup") }
    }
  }

  private static func automatic() {
    guard due else { return }
    let ok = run()
    defaults.set(Date().timeIntervalSince1970, forKey: "backup.lastRun")
    schedule()
    if !ok { notifyFailed() }
  }

  static func runNow() {
    queue.async { _ = run() }
  }

  // ---- writing ----

  private static func run() -> Bool {
    running = true
    emit()
    defer {
      running = false
      ended = Int64(Date().timeIntervalSince1970 * 1000)
      emit()
    }
    guard let url = folder(), url.startAccessingSecurityScopedResource() else {
      return fail("folder")
    }
    defer { url.stopAccessingSecurityScopedResource() }
    let text = Core.backup()
    guard !text.isEmpty else { return fail("export") }
    let data = Data(text.utf8)
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd-HHmm"
    let name = prefix + formatter.string(from: Date()) + suffix
    guard write(data, to: url.appendingPathComponent(name)) else {
      return fail(canWrite(url) ? "write" : "folder")
    }
    prune(url)
    defaults.set(
      [
        "at": Int64(Date().timeIntervalSince1970 * 1000), "size": data.count, "name": name,
        "folder": url.lastPathComponent,
      ], forKey: "backup.last")
    defaults.removeObject(forKey: "backup.error")
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [failed])
    return true
  }

  private static func fail(_ reason: String) -> Bool {
    defaults.set(reason, forKey: "backup.error")
    return false
  }

  /// Through a file coordinator, as a folder in iCloud Drive or another provider wants.
  private static func write(_ data: Data, to target: URL) -> Bool {
    var coordination: NSError?
    var written = false
    NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &coordination) {
      written = (try? data.write(to: $0, options: .atomic)) != nil
    }
    return coordination == nil && written
  }

  /// Keeps the newest backups the app made; anything else in the folder stays.
  private static func prune(_ folder: URL) {
    let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    let backups = names.filter { $0.hasPrefix(prefix) && $0.hasSuffix(suffix) }.sorted(by: >)
    for name in backups.dropFirst(keep) {
      try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
    }
  }

  private static func notifyFailed() {
    let content = UNMutableNotificationContent()
    content.title = Notices.tr("Backup failed", "Sicherung fehlgeschlagen")
    content.body =
      defaults.string(forKey: "backup.error") == "folder"
      ? Notices.tr(
        "The app can no longer save to your backup folder. Open the app and choose the folder again.",
        "Die App kann nicht mehr in deinem Sicherungsordner speichern. Öffne die App und wähle den Ordner noch einmal aus.")
      : Notices.tr(
        "The automatic backup couldn’t be saved. Open the app to try again.",
        "Die automatische Sicherung konnte nicht gespeichert werden. Öffne die App, um es noch einmal zu versuchen.")
    content.userInfo = ["route": "/settings/backup"]
    UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: failed, content: content, trigger: nil))
  }
}

/// Files' folder picker; the picked folder stays usable through its bookmark.
final class BackupFolderPicker: NSObject, UIDocumentPickerDelegate {
  private let picked: (URL?) -> Void

  init(picked: @escaping (URL?) -> Void) {
    self.picked = picked
  }

  func controller() -> UIDocumentPickerViewController {
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
    picker.delegate = self
    return picker
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    picked(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    picked(nil)
  }
}
