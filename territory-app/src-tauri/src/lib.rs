mod backup;
mod hlc;
mod pack;
mod qr;
mod store;

// only the phones sync over the air
#[cfg(any(target_os = "android", target_os = "ios", test))]
mod session;
// the iPhone reads a tap in Swift, with a plain session
#[cfg(any(target_os = "android", test))]
mod tap;

#[cfg(any(target_os = "android", target_os = "ios", test))]
mod native;

#[cfg(target_os = "android")]
mod android;

#[cfg(any(target_os = "ios", test))]
mod ios;

use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

use store::{Peer, Result, Store};

/// The one store, shared by the app window and by syncs that run with no
/// window open (Android starts those from a background service).
static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

pub const PLATFORM: &str = if cfg!(target_os = "android") {
    "android"
} else if cfg!(target_os = "ios") {
    "ios"
} else {
    "desktop"
};

pub fn open_store(dir: &Path) -> Result<()> {
    if STORE.get().is_some() {
        return Ok(());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let store = Store::open(&dir.join("territories.db"))?;
    let _ = STORE.set(Mutex::new(store));
    Ok(())
}

pub fn store() -> Result<MutexGuard<'static, Store>> {
    STORE
        .get()
        .ok_or("the store is not open")?
        .lock()
        .map_err(|_| "the store is locked".to_string())
}

/// Tells the page that a sync changed the data, so it reloads it.
pub fn changed() {
    if let Some(app) = APP.get() {
        let _ = app.emit("store-changed", ());
    }
}

#[derive(Deserialize)]
struct Write {
    table: String,
    id: String,
    #[serde(default)]
    fields: Map<String, Value>,
    #[serde(default)]
    deleted: bool,
}

// the heavier commands run off the main thread; writes stay on it, in order

#[tauri::command(async)]
fn store_list(table: String) -> Result<Vec<Value>> {
    store()?.list(&table)
}

#[tauri::command]
fn store_write(writes: Vec<Write>) -> Result<usize> {
    // one commit for the lot: the page sends every record at once
    store()?.batch(|store| {
        let mut written = 0;
        for write in writes {
            // what no other phone would take in
            if !store::TABLES.contains(&write.table.as_str()) {
                return Err(format!("no table {}", write.table));
            }
            if write.deleted {
                store.remove(&write.table, &write.id)?;
                written += 1;
            } else {
                written += store.put(&write.table, &write.id, &write.fields)?;
            }
        }
        Ok(written)
    })
}

#[tauri::command(async)]
fn identity() -> Result<Value> {
    let store = store()?;
    Ok(serde_json::json!({
        "id": store.identity.id,
        "name": store.identity.name,
        "platform": PLATFORM,
        "unsynced": store.unsynced()?,
        "removed": store.is_removed()?,
    }))
}

#[tauri::command]
fn set_name(name: String) -> Result<()> {
    store()?.set_name(name.trim())
}

#[tauri::command(async)]
fn peers() -> Result<Vec<Peer>> {
    store()?.peers()
}

#[tauri::command]
fn remove_peer(id: String) -> Result<()> {
    store()?.remove_peer(&id)
}

#[tauri::command(async)]
fn sync_log() -> Result<Vec<Value>> {
    store()?.log()
}

#[tauri::command(async)]
fn conflicts() -> Result<Vec<Value>> {
    store()?.conflicts()
}

#[tauri::command]
fn resolve_conflict(table: String, id: String, field: String, use_other: bool) -> Result<()> {
    store()?.resolve(&table, &id, &field, use_other)?;
    changed();
    Ok(())
}

/// This phone's pairing code, and the fingerprint the other phone shows of it.
#[tauri::command]
fn pairing_card() -> Result<Value> {
    let store = store()?;
    Ok(serde_json::json!({
        "text": qr::card(&store, PLATFORM)?,
        "fingerprint": qr::fingerprint(&store.identity.public_key),
    }))
}

#[tauri::command]
fn read_pairing_card(text: String) -> Result<qr::CardInfo> {
    qr::read_card(&*store()?, &text)
}

/// `again` pairs a device that was removed from the group.
#[tauri::command]
fn add_pairing_card(text: String, again: Option<bool>) -> Result<Peer> {
    qr::add_card(&mut *store()?, &text, again.unwrap_or(false))
}

#[tauri::command(async)]
fn export_bundle(peer: String) -> Result<String> {
    qr::export(&*store()?, &peer)
}

#[tauri::command(async)]
fn import_bundle(text: String) -> Result<qr::Imported> {
    let imported = qr::import(&mut *store()?, &text)?;
    changed();
    Ok(imported)
}

/// A transfer opened from Files, AirDrop or Mail, until the sync page takes it
/// (`territory_take_file`), as MainActivity keeps one on Android.
#[cfg(any(target_os = "ios", target_os = "macos", test))]
static OPENED_FILE: Mutex<Option<String>> = Mutex::new(None);

#[cfg(any(target_os = "ios", target_os = "macos", test))]
pub fn opened_file(take: bool) -> Option<String> {
    let mut file = OPENED_FILE.lock().ok()?;
    if take {
        file.take()
    } else {
        file.clone()
    }
}

/// What the sync page gets instead of a file too large to open.
#[cfg(any(target_os = "ios", target_os = "macos", test))]
pub const TOO_LARGE: &str = "OTX1:too-large";

/// Reads at most `limit` bytes of a file; `TOO_LARGE` for a larger one.
#[cfg(any(target_os = "ios", target_os = "macos", test))]
fn read_capped(path: &Path, limit: u64) -> std::io::Result<String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Ok(TOO_LARGE.into());
    }
    String::from_utf8(bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

/// Reads a transfer into the waiting slot. iOS hands over a copy in
/// Documents/Inbox, which iCloud would back up, so that copy goes.
#[cfg(any(target_os = "ios", target_os = "macos"))]
fn read_opened(path: &Path) -> bool {
    // unpacked, a larger file could take more memory than iOS allows the app
    let text = read_capped(path, 32 << 20);
    if path.parent().is_some_and(|dir| dir.ends_with("Documents/Inbox")) {
        let _ = std::fs::remove_file(path);
    }
    let Ok(text) = text else { return false };
    let text = text.trim().to_string();
    if ![TOO_LARGE, "OTB1:", "OTC1:", backup::BACKUP].iter().any(|p| text.starts_with(p)) {
        return false;
    }
    if let Ok(mut file) = OPENED_FILE.lock() {
        *file = Some(text);
    }
    true
}

/// tao doesn't pass on a file that launched the app (only one opened while it
/// runs), so what is left in Documents/Inbox is taken at start, newest last.
#[cfg(target_os = "ios")]
fn read_inbox(documents: &Path) {
    let Ok(entries) = std::fs::read_dir(documents.join("Inbox")) else { return };
    let mut files: Vec<_> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "territories"))
        .map(|path| (std::fs::metadata(&path).and_then(|m| m.modified()).ok(), path))
        .collect();
    files.sort();
    for (_, path) in files {
        read_opened(&path);
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn open_files(app: &AppHandle, urls: Vec<tauri::Url>) {
    let app = app.clone();
    std::thread::spawn(move || {
        for url in urls {
            let Ok(path) = url.to_file_path() else { continue };
            if !read_opened(&path) {
                continue;
            }
            let Some(window) = app.get_webview_window("main") else { continue };
            // the plugin shows the sync page, or hands the file over there; before
            // the page has loaded, it does so once the page reports in
            #[cfg(target_os = "ios")]
            let _ = window.eval("window.TerritoryNearby&&TerritoryNearby.command('showFile','{}')");
            #[cfg(not(target_os = "ios"))]
            {
                let _ = window.eval("location.hash='#/sync'");
                std::thread::sleep(std::time::Duration::from_millis(800));
                if let Some(text) = opened_file(true) {
                    let _ = app.emit("file", serde_json::json!({ "text": text }));
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_nearby::init())
        .setup(|app| {
            // Android opens the store from Kotlin first, in the app's files
            // directory, so a background sync finds the same one
            let dir = app.path().app_data_dir()?;
            open_store(&dir)?;
            let _ = APP.set(app.handle().clone());
            #[cfg(target_os = "ios")]
            if let Ok(documents) = app.path().document_dir() {
                read_inbox(&documents);
            }

            // Built here rather than from the config, for the script that
            // takes the Android shell's bar sizes and colours
            let config = app.config().app.windows[0].clone();
            let builder = WebviewWindowBuilder::from_config(app.handle(), &config)?
                .initialization_script(include_str!("system_bars.js"));
            #[cfg(target_os = "ios")]
            let builder = builder.initialization_script(include_str!("ios_bridge.js"));
            builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_list,
            store_write,
            identity,
            set_name,
            peers,
            remove_peer,
            sync_log,
            conflicts,
            resolve_conflict,
            pairing_card,
            read_pairing_card,
            add_pairing_card,
            export_bundle,
            import_bundle,
            backup::backup_export,
            backup::backup_info,
            backup::backup_restore,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // a transfer file opened from Files, AirDrop or Mail (iOS)
            #[cfg(any(target_os = "ios", target_os = "macos"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                open_files(_app, urls);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_too_large_to_open_says_so() {
        let path = std::env::temp_dir().join(format!("territories-large-{}", std::process::id()));
        std::fs::write(&path, "OTB1:0123456789").unwrap();
        assert_eq!(read_capped(&path, 8).unwrap(), TOO_LARGE);
        assert_eq!(read_capped(&path, 100).unwrap(), "OTB1:0123456789");
        std::fs::remove_file(path).unwrap();
    }
}
