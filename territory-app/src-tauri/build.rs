fn main() {
    // the Mac links the iPhone's Bluetooth sync, built as a Swift package
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        swift_rs::SwiftLinker::new("12")
            .with_package("NearbyMac", "plugins/nearby/macos")
            .link();
    }
    tauri_build::build()
}
