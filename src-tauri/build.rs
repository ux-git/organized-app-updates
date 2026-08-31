fn main() {
    // Google Play requires 16 KB-aligned native libraries. Tauri drives cargo
    // itself, so `.cargo/config.toml` rustflags do not reach this build — the
    // alignment has to be requested through link args here.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }

    tauri_build::build()
}
