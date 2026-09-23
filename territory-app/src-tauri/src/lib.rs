mod hlc;
mod qr;
mod session;
mod store;
mod tap;

#[cfg(target_os = "android")]
mod android;

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

#[tauri::command]
fn store_list(table: String) -> Result<Vec<Value>> {
    store()?.list(&table)
}

#[tauri::command]
fn store_write(writes: Vec<Write>) -> Result<usize> {
    let mut store = store()?;
    let mut written = 0;
    for write in writes {
        if write.deleted {
            store.remove(&write.table, &write.id)?;
            written += 1;
        } else {
            written += store.put(&write.table, &write.id, &write.fields)?;
        }
    }
    Ok(written)
}

#[tauri::command]
fn identity() -> Result<Value> {
    let store = store()?;
    Ok(serde_json::json!({
        "id": store.identity.id,
        "name": store.identity.name,
        "platform": PLATFORM,
        "unsynced": store.unsynced()?,
    }))
}

#[tauri::command]
fn set_name(name: String) -> Result<()> {
    store()?.set_name(name.trim())
}

#[tauri::command]
fn peers() -> Result<Vec<Peer>> {
    store()?.peers()
}

#[tauri::command]
fn remove_peer(id: String) -> Result<()> {
    store()?.remove_peer(&id)
}

#[tauri::command]
fn pairing_card() -> Result<String> {
    qr::card(&*store()?, PLATFORM)
}

#[tauri::command]
fn add_pairing_card(text: String) -> Result<Peer> {
    qr::add_card(&*store()?, &text)
}

#[tauri::command]
fn export_bundle(peer: String) -> Result<String> {
    qr::export(&*store()?, &peer)
}

#[tauri::command]
fn import_bundle(text: String) -> Result<qr::Imported> {
    let imported = qr::import(&mut *store()?, &text)?;
    changed();
    Ok(imported)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Android opens the store from Kotlin first, in the app's files
            // directory, so a background sync finds the same one
            let dir = app.path().app_data_dir()?;
            open_store(&dir)?;
            let _ = APP.set(app.handle().clone());

            // Built here rather than from the config, for the script that
            // takes the Android shell's bar sizes and colours
            let config = app.config().app.windows[0].clone();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .initialization_script(include_str!("system_bars.js"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_list,
            store_write,
            identity,
            set_name,
            peers,
            remove_peer,
            pairing_card,
            add_pairing_card,
            export_bundle,
            import_bundle,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
