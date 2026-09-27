import AVFoundation
import UIKit

/// A full-screen camera that reads QR codes, one after the other, for the
/// looping transfer codes too. The camera's own reader works on every iPhone
/// from iOS 16 on, the iPhone 8 included (VisionKit's needs a newer chip).
final class Scanner: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  private let session = AVCaptureSession()
  /// startRunning and stopRunning block, and must not overlap.
  private let sessionQueue = DispatchQueue(label: "territories.scanner")
  private let onCode: (String) -> Void
  private let hint = UILabel()
  private lazy var preview = AVCaptureVideoPreviewLayer(session: session)

  init(onCode: @escaping (String) -> Void) {
    self.onCode = onCode
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  required init?(coder: NSCoder) { nil }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    view.layer.addSublayer(preview)

    // the controls first: a camera that won't start mustn't trap anyone here
    hint.text = Notices.tr(
      "Point the camera at the other device’s code", "Richte die Kamera auf den Code des anderen Geräts")
    hint.textColor = .white
    hint.textAlignment = .center
    hint.numberOfLines = 0
    hint.font = .preferredFont(forTextStyle: .headline)
    let close = UIButton(type: .system)
    close.setTitle(Notices.tr("Close", "Schließen"), for: .normal)
    close.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    close.tintColor = .white
    close.addTarget(self, action: #selector(done), for: .touchUpInside)
    for item in [hint, close] as [UIView] {
      item.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(item)
    }
    NSLayoutConstraint.activate([
      hint.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      hint.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      hint.bottomAnchor.constraint(equalTo: close.topAnchor, constant: -16),
      close.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      close.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
    ])

    guard let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input)
    else { return }
    session.addInput(input)
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { return }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: .main)
    output.metadataObjectTypes = [.qr]
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    preview.frame = view.bounds
    rotatePreview()
  }

  /// iPads scan in landscape too; the camera's picture stays upright.
  private func rotatePreview() {
    guard let connection = preview.connection,
      let orientation = view.window?.windowScene?.interfaceOrientation
    else { return }
    if #available(iOS 17, *) {
      let angles: [UIInterfaceOrientation: CGFloat] = [
        .landscapeRight: 0, .portrait: 90, .landscapeLeft: 180, .portraitUpsideDown: 270,
      ]
      let angle = angles[orientation] ?? 90
      if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
    } else if connection.isVideoOrientationSupported,
      let video = AVCaptureVideoOrientation(rawValue: orientation.rawValue)
    {
      connection.videoOrientation = video
    }
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    sessionQueue.async { self.session.startRunning() }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { self.session.stopRunning() }
  }

  /// "3 of 7 codes read. Keep the camera on the screen."
  func progress(_ read: Int, of total: Int) {
    hint.text = Notices.tr(
      "\(read) of \(total) codes read. Keep the camera on the screen.",
      "\(read) von \(total) Codes gelesen. Halte die Kamera weiter auf den Bildschirm.")
  }

  @objc private func done() { dismiss(animated: true) }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    for case let code as AVMetadataMachineReadableCodeObject in metadataObjects {
      if let text = code.stringValue { onCode(text) }
    }
  }
}
