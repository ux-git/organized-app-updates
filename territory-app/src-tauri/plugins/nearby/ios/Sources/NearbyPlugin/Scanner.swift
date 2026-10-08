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
  private let onEnterCode: () -> Void
  private let hint = UILabel()
  private let mask = CAShapeLayer()
  private let corners = CAShapeLayer()
  private let torchButton = UIButton(type: .system)
  private var camera: AVCaptureDevice?
  private lazy var preview = AVCaptureVideoPreviewLayer(session: session)

  private static let accent = UIColor(red: 0x8F / 255, green: 0x9C / 255, blue: 0xF9 / 255, alpha: 1)
  private static let surface = UIColor(red: 0x1E / 255, green: 0x20 / 255, blue: 0x28 / 255, alpha: 0.85)

  init(onCode: @escaping (String) -> Void, onEnterCode: @escaping () -> Void) {
    self.onCode = onCode
    self.onEnterCode = onEnterCode
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  required init?(coder: NSCoder) { nil }

  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    view.layer.addSublayer(preview)
    mask.fillRule = .evenOdd
    mask.fillColor = UIColor(red: 0x0A / 255, green: 0x0C / 255, blue: 0x14 / 255, alpha: 0.55).cgColor
    view.layer.addSublayer(mask)
    corners.fillColor = nil
    corners.strokeColor = Self.accent.cgColor
    corners.lineWidth = 3
    corners.lineCap = .round
    corners.lineJoin = .round
    view.layer.addSublayer(corners)

    // the controls first: a camera that won't start mustn't trap anyone here
    let close = iconButton("xmark", label: Notices.tr("Close", "Schließen"))
    close.addTarget(self, action: #selector(done), for: .touchUpInside)
    setTorchIcon(false)
    torchButton.addTarget(self, action: #selector(toggleTorch), for: .touchUpInside)
    torchButton.isHidden = true
    let title = UILabel()
    title.text = Notices.tr("Scan code", "Code scannen")
    title.textColor = .white
    title.font = .preferredFont(forTextStyle: .headline)

    hint.text = Notices.tr(
      "Point the camera at the other device’s code", "Richte die Kamera auf den Code des anderen Geräts")
    hint.textColor = .white
    hint.textAlignment = .center
    hint.numberOfLines = 0
    hint.font = .preferredFont(forTextStyle: .subheadline)

    var config = UIButton.Configuration.plain()
    config.title = Notices.tr("Enter code instead", "Code stattdessen eingeben")
    config.baseForegroundColor = Self.accent
    config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
    config.background.backgroundColor = Self.surface
    config.background.strokeColor = Self.accent
    config.background.strokeWidth = 1
    config.background.cornerRadius = 8
    let enterCode = UIButton(configuration: config)
    enterCode.addTarget(self, action: #selector(enterCodeInstead), for: .touchUpInside)

    for item in [close, title, torchButton, hint, enterCode] as [UIView] {
      item.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(item)
    }
    let safe = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      close.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 16),
      close.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
      close.widthAnchor.constraint(equalToConstant: 40),
      close.heightAnchor.constraint(equalToConstant: 40),
      torchButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -16),
      torchButton.centerYAnchor.constraint(equalTo: close.centerYAnchor),
      torchButton.widthAnchor.constraint(equalToConstant: 40),
      torchButton.heightAnchor.constraint(equalToConstant: 40),
      title.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      title.centerYAnchor.constraint(equalTo: close.centerYAnchor),
      hint.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 24),
      hint.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -24),
      hint.bottomAnchor.constraint(equalTo: enterCode.topAnchor, constant: -16),
      enterCode.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      enterCode.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -24),
    ])

    guard let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input)
    else { return }
    self.camera = camera
    torchButton.isHidden = !camera.hasTorch
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
    drawViewfinder()
  }

  /// A dimmed scene with a clear rounded square, accent corners around it.
  private func drawViewfinder() {
    let bounds = view.bounds
    let side = min(bounds.width * 0.7, 300)
    let radius: CGFloat = 16
    let hole = CGRect(x: bounds.midX - side / 2, y: bounds.midY - side / 2, width: side, height: side)
    let dim = UIBezierPath(rect: bounds)
    dim.append(UIBezierPath(roundedRect: hole, cornerRadius: radius))
    mask.frame = bounds
    mask.path = dim.cgPath

    // just outside the clear square, so the code's edge stays visible
    let frame = hole.insetBy(dx: -4, dy: -4)
    let r = radius + 4
    let arm: CGFloat = 28
    let (l, t, rt, b) = (frame.minX, frame.minY, frame.maxX, frame.maxY)
    let path = UIBezierPath()
    path.move(to: CGPoint(x: l, y: t + arm))
    path.addArc(withCenter: CGPoint(x: l + r, y: t + r), radius: r, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true)
    path.addLine(to: CGPoint(x: l + arm, y: t))
    path.move(to: CGPoint(x: rt - arm, y: t))
    path.addArc(withCenter: CGPoint(x: rt - r, y: t + r), radius: r, startAngle: .pi * 1.5, endAngle: 0, clockwise: true)
    path.addLine(to: CGPoint(x: rt, y: t + arm))
    path.move(to: CGPoint(x: rt, y: b - arm))
    path.addArc(withCenter: CGPoint(x: rt - r, y: b - r), radius: r, startAngle: 0, endAngle: .pi / 2, clockwise: true)
    path.addLine(to: CGPoint(x: rt - arm, y: b))
    path.move(to: CGPoint(x: l + arm, y: b))
    path.addArc(withCenter: CGPoint(x: l + r, y: b - r), radius: r, startAngle: .pi / 2, endAngle: .pi, clockwise: true)
    path.addLine(to: CGPoint(x: l, y: b - arm))
    corners.frame = bounds
    corners.path = path.cgPath
  }

  private func iconButton(_ symbol: String, label: String) -> UIButton {
    let button = UIButton(type: .system)
    button.configuration = iconConfiguration(symbol)
    button.accessibilityLabel = label
    return button
  }

  private func iconConfiguration(_ symbol: String) -> UIButton.Configuration {
    var config = UIButton.Configuration.plain()
    config.image = UIImage(systemName: symbol)
    config.baseForegroundColor = .white
    config.background.backgroundColor = Self.surface
    config.background.strokeColor = UIColor.white.withAlphaComponent(0.24)
    config.background.strokeWidth = 0.5
    config.background.cornerRadius = 8
    return config
  }

  private func setTorchIcon(_ on: Bool) {
    torchButton.configuration = iconConfiguration(on ? "flashlight.on.fill" : "flashlight.off.fill")
    torchButton.accessibilityLabel =
      on
      ? Notices.tr("Turn off the flashlight", "Taschenlampe ausschalten")
      : Notices.tr("Turn on the flashlight", "Taschenlampe einschalten")
  }

  @objc private func toggleTorch() {
    guard let camera = camera, camera.hasTorch, (try? camera.lockForConfiguration()) != nil else { return }
    let on = camera.torchMode != .on
    camera.torchMode = on ? .on : .off
    camera.unlockForConfiguration()
    setTorchIcon(on)
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
    // the light goes out with the camera
    setTorchIcon(false)
    sessionQueue.async { self.session.stopRunning() }
  }

  /// "3 of 7 codes read. Keep the camera on the screen."
  func progress(_ read: Int, of total: Int) {
    hint.text = Notices.tr(
      "\(read) of \(total) codes read. Keep the camera on the screen.",
      "\(read) von \(total) Codes gelesen. Halte die Kamera weiter auf den Bildschirm.")
  }

  @objc private func done() { dismiss(animated: true) }

  @objc private func enterCodeInstead() { onEnterCode() }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    for case let code as AVMetadataMachineReadableCodeObject in metadataObjects {
      if let text = code.stringValue { onCode(text) }
    }
  }
}
