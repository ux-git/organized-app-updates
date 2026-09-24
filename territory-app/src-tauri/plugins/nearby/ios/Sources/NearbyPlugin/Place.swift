import CoreLocation
import Foundation

/// The Kingdom Hall, for the "at the Kingdom Hall" mode: iOS watches the
/// area in the location chip and wakes the app on arriving and leaving, as
/// the proximity alert does on Android.
final class Place: NSObject, CLLocationManagerDelegate {
  static let shared = Place()

  private static let region = "hall"
  private static let insideMaxSeconds = 4.0 * 60 * 60
  private let manager = CLLocationManager()
  private let defaults = UserDefaults.standard
  private var pendingHere: Double?

  override init() {
    super.init()
    manager.delegate = self
  }

  var hall: [String: Double]? {
    defaults.dictionary(forKey: "hall") as? [String: Double]
  }

  var inside: Bool {
    let since = defaults.double(forKey: "inside")
    return since > 0 && Date().timeIntervalSince1970 - since < Self.insideMaxSeconds
  }

  var authorization: CLAuthorizationStatus { manager.authorizationStatus }

  var allowed: Bool {
    authorization == .authorizedAlways || authorization == .authorizedWhenInUse
  }

  var allowedAlways: Bool { authorization == .authorizedAlways }

  func askWhenInUse() { manager.requestWhenInUseAuthorization() }

  /// iOS asks for "always" only after "while using".
  func askAlways() { manager.requestAlwaysAuthorization() }

  func setHall(lat: Double, lng: Double, radius: Double) {
    defaults.set(["lat": lat, "lng": lng, "radius": radius], forKey: "hall")
    Nearby.shared.apply()
  }

  func clearHall() {
    defaults.removeObject(forKey: "hall")
    defaults.removeObject(forKey: "inside")
    unwatchHall()
    Nearby.shared.apply()
  }

  /// Uses where the phone is now.
  func hallHere(radius: Double) {
    pendingHere = radius
    if allowed { manager.requestLocation() } else { askWhenInUse() }
  }

  func watchHall() {
    guard let hall = hall, let lat = hall["lat"], let lng = hall["lng"] else { return }
    guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
    let region = CLCircularRegion(
      center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
      radius: min(hall["radius"] ?? 150, manager.maximumRegionMonitoringDistance),
      identifier: Self.region)
    region.notifyOnEntry = true
    region.notifyOnExit = true
    manager.startMonitoring(for: region)
  }

  func unwatchHall() {
    manager.monitoredRegions.filter { $0.identifier == Self.region }.forEach {
      manager.stopMonitoring(for: $0)
    }
    defaults.removeObject(forKey: "inside")
  }

  /// A sync went through: nothing left to remind about on leaving.
  func synced() {
    if Nearby.shared.unsynced == 0 { Notices.shared.cancelLeaving() }
  }

  // ---- CLLocationManagerDelegate ----

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if pendingHere != nil, allowed { manager.requestLocation() }
    Nearby.shared.apply()
    Nearby.shared.onChange?()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let radius = pendingHere, let location = locations.last else { return }
    pendingHere = nil
    setHall(lat: location.coordinate.latitude, lng: location.coordinate.longitude, radius: radius)
    Nearby.shared.onChange?()
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    pendingHere = nil
  }

  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    guard region.identifier == Self.region, Nearby.shared.mode == "location" else { return }
    defaults.set(Date().timeIntervalSince1970, forKey: "inside")
    Nearby.shared.start(reason: "hall", seconds: 60)
  }

  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    guard region.identifier == Self.region, Nearby.shared.mode == "location" else { return }
    defaults.removeObject(forKey: "inside")
    Nearby.shared.apply()
    if Nearby.shared.unsynced > 0 { Notices.shared.leaving() }
  }
}
