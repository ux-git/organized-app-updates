import CoreHaptics
import Foundation

#if canImport(UIKit)
  import UIKit
#endif

/// The same named vibrations as Haptics.kt on Android: waves while waiting,
/// a knock when phones find each other, a little tune when paired or synced.
/// Taps and toggles use the system's own feedback.
enum Haptics {
  private static var engine: CHHapticEngine?

  /// (time, intensity, sharpness) of each tap; a duration > 0 makes it a swell.
  private typealias Beat = (at: Double, intensity: Float, sharpness: Float, duration: Double)

  private static let patterns: [String: [Beat]] = [
    "wave": [
      (0.00, 0.25, 0.1, 0.18), (0.26, 0.45, 0.15, 0.18), (0.52, 0.7, 0.2, 0.2),
    ],
    "contact": [(0.00, 1.0, 0.9, 0), (0.08, 0.8, 0.9, 0)],
    "found": [(0.00, 0.5, 0.6, 0), (0.10, 0.9, 0.7, 0)],
    "code": [(0.00, 0.5, 0.3, 0.06), (0.08, 0.7, 0.8, 0)],
    "start": [(0.00, 0.5, 0.2, 0.12)],
    "paired": [
      (0.00, 0.5, 0.3, 0.05), (0.08, 0.9, 0.8, 0), (0.20, 0.6, 0.8, 0), (0.30, 1.0, 0.9, 0),
    ],
    "synced": [(0.00, 0.4, 0.5, 0), (0.07, 0.6, 0.6, 0), (0.14, 0.8, 0.7, 0), (0.24, 1.0, 0.9, 0)],
    "error": [(0.00, 0.9, 0.4, 0), (0.14, 0.8, 0.2, 0.06)],
    "remove": [(0.00, 0.9, 0.3, 0.08)],
  ]

  static func perform(_ name: String) -> Bool {
    if let beats = patterns[name] { return play(beats) }
    #if canImport(UIKit)
      switch name {
      case "tap", "tick", "toggleOn", "toggleOff":
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
      case "confirm":
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      case "reject":
        UINotificationFeedbackGenerator().notificationOccurred(.error)
      default:
        return false
      }
      return true
    #else
      return false
    #endif
  }

  private static func play(_ beats: [Beat]) -> Bool {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return false }
    do {
      if engine == nil {
        let started = try CHHapticEngine()
        started.isAutoShutdownEnabled = true
        started.resetHandler = { try? engine?.start() }
        engine = started
      }
      try engine?.start()
      let events = beats.map { beat -> CHHapticEvent in
        let parameters = [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: beat.intensity),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: beat.sharpness),
        ]
        return beat.duration > 0
          ? CHHapticEvent(
            eventType: .hapticContinuous, parameters: parameters, relativeTime: beat.at,
            duration: beat.duration)
          : CHHapticEvent(eventType: .hapticTransient, parameters: parameters, relativeTime: beat.at)
      }
      try engine?.makePlayer(with: CHHapticPattern(events: events, parameters: []))
        .start(atTime: CHHapticTimeImmediate)
      return true
    } catch {
      return false
    }
  }
}
