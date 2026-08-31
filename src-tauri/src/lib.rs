#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_biometric::init());

    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_ios_webview_insets::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
