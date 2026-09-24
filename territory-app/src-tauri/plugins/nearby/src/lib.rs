//! On an iPhone, what `gen/android` does on Android: Bluetooth sync in the
//! background, Meet, the Kingdom Hall, notifications, haptics, QR codes. The
//! Swift code (ios/Sources) gives the page the same `TerritoryNearby` and
//! `OrganizedHaptics` objects as the Android shell and calls the same core
//! (src/native.rs through src/ios.rs), so the page and the protocol stay
//! one. Elsewhere this plugin does nothing.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_nearby);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nearby")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_nearby)?;
            Ok(())
        })
        .build()
}
