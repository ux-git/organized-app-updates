// swift-tools-version:5.7

import PackageDescription

// The iPhone's Bluetooth sync (../ios) for the Mac app: the same Swift files,
// linked as they are, plus Mac.swift in place of the Tauri iOS plugin glue.
let package = Package(
  name: "nearby-mac",
  platforms: [.macOS(.v12)],
  products: [
    .library(name: "NearbyMac", type: .static, targets: ["NearbyMac"])
  ],
  targets: [
    .target(name: "TerritoryCore", path: "Sources/TerritoryCore"),
    .target(name: "NearbyMac", dependencies: ["TerritoryCore"], path: "Sources/NearbyMac"),
  ]
)
