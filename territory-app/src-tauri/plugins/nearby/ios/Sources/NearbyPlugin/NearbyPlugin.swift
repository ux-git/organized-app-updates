import AVFoundation
import CoreBluetooth
import Tauri
import UIKit
import WebKit

/// WKUserContentController keeps its handlers; this keeps the plugin free.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
  weak var target: NearbyPlugin?
  init(_ target: NearbyPlugin) { self.target = target }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    target?.received(message)
  }
}

enum Page {
  fileprivate static weak var webview: WKWebView?

  /// A notification opens the page it is about.
  static func open(route: String) {
    guard let data = try? JSONSerialization.data(withJSONObject: ["#" + route]),
      let quoted = String(data: data, encoding: .utf8)
    else { return }
    webview?.evaluateJavaScript("location.hash=\(quoted)[0]")
  }
}

class NearbyPlugin: Tauri.Plugin {
  private weak var webview: WKWebView?

  public override func load(webview: WKWebView) {
    self.webview = webview
    Page.webview = webview
    // the page's objects come from src-tauri/src/ios_bridge.js
    let controller = webview.configuration.userContentController
    controller.add(WeakHandler(self), name: "territoryNearby")
    controller.add(WeakHandler(self), name: "territoryHaptics")

    Core.open()
    Notices.shared.setUp()
    Nearby.shared.onChange = { [weak self] in self?.emitStatus() }
    Nearby.shared.setUp()
    NotificationCenter.default.addObserver(
      self, selector: #selector(foreground), name: UIApplication.willEnterForegroundNotification,
      object: nil)
    foreground()
  }

  /// Opening the app is a good moment, unless syncing is left to Sync now.
  @objc private func foreground() {
    if Nearby.shared.hasPeers && Nearby.shared.mode != "manual" {
      Nearby.shared.start(reason: "open", seconds: 120)
    }
    Notices.shared.refresh { self.emitStatus() }
  }

  fileprivate func received(_ message: WKScriptMessage) {
    if message.name == "territoryHaptics" {
      _ = Haptics.perform(message.body as? String ?? "")
      return
    }
    guard let body = message.body as? [String: Any], let name = body["name"] as? String else {
      return
    }
    let text = body["args"] as? String ?? "{}"
    let args =
      (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]) ?? [:]
    command(name, args)
  }

  private func command(_ name: String, _ args: [String: Any]) {
    let nearby = Nearby.shared
    switch name {
    case "permissions": ask(args["which"] as? String ?? "")
    case "syncNow": nearby.start(reason: "open", seconds: 120)
    case "changed": nearby.localChange()
    case "meetStart": nearby.startMeet()
    case "meetStop": nearby.stopMeet()
    case "pair": nearby.pair(args["address"] as? String ?? "")
    case "confirm": nearby.confirm(args["accept"] as? Bool ?? false)
    case "schedule": nearby.schedule = args
    case "paired": nearby.apply()
    case "hallHere": Place.shared.hallHere(radius: args["radius"] as? Double ?? 150)
    case "hallSet":
      Place.shared.setHall(
        lat: args["lat"] as? Double ?? 0, lng: args["lng"] as? Double ?? 0,
        radius: args["radius"] as? Double ?? 150)
      if !Place.shared.allowed { Place.shared.askWhenInUse() }
    case "hallClear": Place.shared.clearHall()
    case "scanQr": scanQr()
    case "shareFile": share(name: args["name"] as? String ?? "territories", text: args["text"] as? String ?? "")
    case "bluetoothOn", "battery":
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
      }
    default:
      // status; and what only Android has (NFC, alarms, taking a file)
      break
    }
    emitStatus()
  }

  // ---- permissions, asked one after the other ----

  private func ask(_ which: String) {
    switch which {
    case "camera":
      AVCaptureDevice.requestAccess(for: .video) { _ in DispatchQueue.main.async { self.emitStatus() } }
    case "location":
      Place.shared.askWhenInUse()
    case "backgroundLocation":
      Place.shared.askAlways()
    case "all":
      Nearby.shared.ensureLink()
      Notices.shared.ask {
        AVCaptureDevice.requestAccess(for: .video) { _ in
          DispatchQueue.main.async { self.emitStatus() }
        }
      }
    default:
      Nearby.shared.ensureLink()
      Notices.shared.ask { self.emitStatus() }
    }
  }

  private func emitStatus() {
    var status = Nearby.shared.status()
    status["permissions"] = [
      "bluetooth": CBManager.authorization == .allowedAlways,
      "bluetoothOn": status["bluetooth"] as? Bool ?? false,
      "notifications": Notices.shared.allowed,
      "location": Place.shared.allowed,
      "backgroundLocation": Place.shared.allowedAlways,
      "camera": AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      "nfc": false,
      "nfcOn": false,
      "battery": true,
      "exactAlarms": true,
    ]
    status["schedule"] = Nearby.shared.schedule
    status["hall"] = Place.shared.hall ?? NSNull()
    status["mode"] = Nearby.shared.mode
    status["inside"] = Place.shared.inside
    status["platform"] = "ios"
    Core.emit("nearby", status)
  }

  // ---- QR codes, as ScanActivity does on Android ----

  private var frames: [Int: String] = [:]
  private var scanner: Scanner?

  private func scanQr() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          self.emitStatus()
          if granted { self.scanQr() }
        }
      }
      return
    }
    frames = [:]
    let controller = Scanner { [weak self] text in self?.read(text) }
    scanner = controller
    top()?.present(controller, animated: true)
  }

  /// One code, or one of a looping series "OTQ:i/n:part".
  private func read(_ text: String) {
    if text.hasPrefix("OTQ:") {
      let fields = text.split(separator: ":", maxSplits: 2).map(String.init)
      let counts = fields.count == 3 ? fields[1].split(separator: "/").compactMap { Int($0) } : []
      guard counts.count == 2 else { return }
      if frames[counts[0]] == nil {
        frames[counts[0]] = fields[2]
        _ = Haptics.perform("tick")
        scanner?.progress(frames.count, of: counts[1])
      }
      guard frames.count == counts[1] else { return }
      finish((1...counts[1]).compactMap { frames[$0] }.joined())
    } else if text.hasPrefix("OTC1:") || text.hasPrefix("OTB1:") {
      finish(text)
    }
  }

  private func finish(_ text: String) {
    _ = Haptics.perform("synced")
    scanner?.dismiss(animated: true)
    scanner = nil
    Core.emit("qr", ["text": text])
  }

  // ---- sending a transfer as a file ----

  private func share(name: String, text: String) {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
    guard (try? Data(text.utf8).write(to: url)) != nil else { return }
    let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = webview
    top()?.present(sheet, animated: true)
  }

  private func top() -> UIViewController? {
    var controller = webview?.window?.rootViewController
    while let next = controller?.presentedViewController { controller = next }
    return controller
  }
}

@_cdecl("init_plugin_nearby")
func initPlugin() -> Tauri.Plugin {
  NearbyPlugin()
}
