// swift-tools-version:5.7

import PackageDescription

let package = Package(
  name: "tauri-plugin-nearby",
  platforms: [
    .iOS(.v16)
  ],
  products: [
    .library(name: "tauri-plugin-nearby", type: .static, targets: ["NearbyPlugin"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    // the core's C functions (src-tauri/src/ios.rs), linked from the app itself
    .target(name: "TerritoryCore", path: "Sources/TerritoryCore"),
    .target(
      name: "NearbyPlugin",
      dependencies: [.byName(name: "Tauri"), "TerritoryCore"],
      path: "Sources/NearbyPlugin")
  ]
)
