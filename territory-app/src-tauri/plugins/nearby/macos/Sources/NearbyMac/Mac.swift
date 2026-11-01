import AppKit
import CoreBluetooth
import Foundation
import WebKit

/// What NearbyPlugin.swift does on an iPhone, for the Mac app: Tauri has no
/// Swift plugins on macOS, so src-tauri/src/lib.rs hands over the window's
/// WKWebView and the page gets the same `TerritoryNearby` object
/// (src-tauri/src/ios_bridge.js). Bluetooth sync runs while the app is open.

private final class WeakHandler: NSObject, WKScriptMessageHandler {
  weak var target: MacBridge?
  init(_ target: MacBridge) { self.target = target }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    target?.received(message)
  }
}

enum Page {
  fileprivate static weak var webview: WKWebView?
  fileprivate static var ready = false
  private static var pendingRoute: String?

  /// A notification opens the page it is about, once the page is there.
  static func open(route: String) {
    guard ready, let webview = webview else {
      pendingRoute = route
      return
    }
    guard let data = try? JSONSerialization.data(withJSONObject: ["#" + route]),
      let quoted = String(data: data, encoding: .utf8)
    else { return }
    webview.evaluateJavaScript("location.hash=\(quoted)[0]")
    NSApp.activate(ignoringOtherApps: true)
  }

  fileprivate static func loaded() {
    ready = true
    if let route = pendingRoute {
      pendingRoute = nil
      open(route: route)
    }
  }
}

final class MacBridge: NSObject {
  static var shared: MacBridge?
  private weak var webview: WKWebView?

  init(webview: WKWebView) {
    super.init()
    self.webview = webview
    Page.webview = webview
    let controller = webview.configuration.userContentController
    controller.add(WeakHandler(self), name: "territoryNearby")
    controller.add(WeakHandler(self), name: "territoryHaptics")
    Nearby.shared.onChange = { [weak self] in self?.emitStatus() }
    NotificationCenter.default.addObserver(
      self, selector: #selector(foreground), name: NSApplication.didBecomeActiveNotification,
      object: nil)
    Notices.shared.setUp()
    Nearby.shared.setUp()
    foreground()
  }

  /// Coming back to the app is a good moment, unless syncing is left to Sync now.
  @objc private func foreground() {
    if Nearby.shared.hasPeers && Nearby.shared.mode != "manual" {
      Nearby.shared.start(reason: "open", seconds: 120)
    }
    Notices.shared.refresh { self.emitStatus() }
  }

  fileprivate func received(_ message: WKScriptMessage) {
    // a Mac has no haptics the page could use
    guard message.name == "territoryNearby",
      let body = message.body as? [String: Any], let name = body["name"] as? String
    else { return }
    let text = body["args"] as? String ?? "{}"
    let args =
      (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]) ?? [:]
    command(name, args)
  }

  private func command(_ name: String, _ args: [String: Any]) {
    let nearby = Nearby.shared
    switch name {
    case "locate":
      MapLocation.shared.request(args["id"] as? String ?? "")
    case "exportFile":
      let id = args["id"] as? String ?? ""
      guard let data = Data(base64Encoded: args["base64"] as? String ?? "") else {
        Core.emit("export-result", ["id": id, "error": "Invalid file data"]); return
      }
      let panel = NSSavePanel()
      panel.nameFieldStringValue = ((args["name"] as? String ?? "territory.pdf") as NSString).lastPathComponent
      panel.canCreateDirectories = true
      panel.begin { response in
        guard response == .OK, let url = panel.url else {
          Core.emit("export-result", ["id": id, "saved": false]); return
        }
        do {
          try data.write(to: url, options: .atomic)
          Core.emit("export-result", ["id": id, "saved": true])
        } catch { Core.emit("export-result", ["id": id, "error": error.localizedDescription]) }
      }
    case "shareFile":
      guard let data = Data(base64Encoded: args["base64"] as? String ?? ""),
        let view = NSApp.keyWindow?.contentView
      else { return }
      let name = ((args["name"] as? String ?? "territory.png") as NSString).lastPathComponent
      let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
      guard (try? data.write(to: url, options: .atomic)) != nil else { return }
      NSSharingServicePicker(items: [url]).show(
        relativeTo: NSRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1),
        of: view, preferredEdge: .minY)
    case "permissions":
      nearby.ensureLink()
      Notices.shared.ask { self.emitStatus() }
    case "syncNow": nearby.start(reason: "open", seconds: 120)
    case "changed": nearby.localChange()
    case "meetStart": nearby.startMeet()
    case "meetStop": nearby.stopMeet()
    case "pair": nearby.pair(args["address"] as? String ?? "")
    case "confirm": nearby.confirm(args["accept"] as? Bool ?? false, address: args["address"] as? String)
    case "schedule": nearby.schedule = args
    case "paired": nearby.apply()
    case "pageReady":
      Page.loaded()
      if Core.hasFile { Page.open(route: "/sync") }
    case "pageGone": Page.ready = false
    case "showFile": showFile()
    case "takeFile": deliverFile()
    case "openUrl":
      if let text = args["url"] as? String, text.hasPrefix("https://"), let url = URL(string: text) {
        NSWorkspace.shared.open(url)
      }
    case "bluetoothOn":
      if let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth")
      {
        NSWorkspace.shared.open(url)
      }
    default:
      // status; and what only phones have (camera, NFC, the Kingdom Hall)
      break
    }
    emitStatus()
  }

  private func showFile() {
    guard Core.hasFile else { return }
    // every page takes it in; before one has loaded, it asks (takeFile)
    guard Page.ready, webview != nil else { return }
    deliverFile()
  }

  private func deliverFile() {
    if let text = Core.takeFile() { Core.emit("file", ["text": text]) }
  }

  private func emitStatus() {
    var status = Nearby.shared.status()
    status["permissions"] = [
      "bluetooth": CBManager.authorization == .allowedAlways,
      "bluetoothOn": status["bluetooth"] as? Bool ?? false,
      "notifications": Notices.shared.allowed,
      "location": false,
      "backgroundLocation": false,
      "camera": false,
      "nfc": false,
      "nfcOn": false,
      "battery": true,
      "exactAlarms": true,
    ]
    status["schedule"] = Nearby.shared.schedule
    status["hall"] = NSNull()
    status["mode"] = Nearby.shared.mode
    status["inside"] = false
    status["platform"] = "macos"
    Core.emit("nearby", status)
  }
}

/// Called once from lib.rs with the main window's WKWebView.
@_cdecl("territory_mac_attach")
public func territoryMacAttach(_ webview: UnsafeMutableRawPointer) {
  let view = Unmanaged<WKWebView>.fromOpaque(webview).takeUnretainedValue()
  DispatchQueue.main.async {
    if MacBridge.shared == nil { MacBridge.shared = MacBridge(webview: view) }
  }
}
