import CoreLocation
import Foundation

/// One foreground fix, requested only by a location button. Never tracks in background.
final class MapLocation: NSObject, CLLocationManagerDelegate {
  static let shared = MapLocation()
  private let manager = CLLocationManager()
  private var requests = Set<String>()
  private var timer: Timer?

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
  }

  func request(_ id: String) {
    guard !id.isEmpty else { return }
    requests.insert(id)
    if timer == nil {
      timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in
        self?.finish(error: "Location timed out")
      }
    }
    startIfAllowed()
  }

  private func startIfAllowed() {
    guard !requests.isEmpty else { return }
    switch manager.authorizationStatus {
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .authorizedAlways, .authorizedWhenInUse:
      manager.startUpdatingLocation()
    case .denied, .restricted:
      finish(error: "Location permission denied")
    @unknown default:
      finish(error: "Location unavailable")
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    startIfAllowed()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last,
      location.horizontalAccuracy >= 0,
      abs(location.timestamp.timeIntervalSinceNow) < 60 else { return }
    finish(location: location)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if (error as? CLError)?.code == .locationUnknown { return }
    finish(error: error.localizedDescription)
  }

  private func finish(location: CLLocation? = nil, error: String? = nil) {
    manager.stopUpdatingLocation()
    timer?.invalidate()
    timer = nil
    let pending = requests
    requests.removeAll()
    for id in pending {
      var result: [String: Any] = ["id": id]
      if let location = location {
        result["latitude"] = location.coordinate.latitude
        result["longitude"] = location.coordinate.longitude
      } else {
        result["error"] = error ?? "Location unavailable"
      }
      Core.emit("location-result", result)
    }
  }
}
