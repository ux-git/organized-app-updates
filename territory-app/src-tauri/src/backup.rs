//! A full backup: every record this device holds, as a `.territories` file
//! any device can open, paired or not. It is not sealed like a transfer:
//! whoever has the file can read it. Restoring goes through `Store::apply`,
//! so a newer edit on the device always wins over the backup's older one.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use serde::{Deserialize, Serialize};

use crate::pack::{pack, unpack};
use crate::store::{now_secs, Cell, Result, Store, Versions};

pub const BACKUP: &str = "OTA1:";

#[derive(Serialize, Deserialize)]
struct Contents {
    device: String,
    name: String,
    at: i64,
    versions: Versions,
    cells: Vec<Cell>,
}

#[derive(Debug, Serialize)]
pub struct Restored {
    pub name: String,
    /// the device the backup was made on, to take over its profile
    pub device: String,
    pub at: i64,
    pub received: usize,
    pub items: std::collections::BTreeMap<String, usize>,
}

pub fn export(store: &Store) -> Result<String> {
    let contents = Contents {
        device: store.identity.id.clone(),
        name: store.identity.name.clone(),
        at: now_secs(),
        versions: store.versions()?,
        cells: store.changes_since(&Versions::new())?,
    };
    Ok(format!("{BACKUP}{}", B64.encode(pack(&contents)?)))
}

/// Who made a backup and when, read without restoring it.
#[derive(Debug, Deserialize, Serialize)]
pub struct Info {
    pub device: String,
    pub name: String,
    pub at: i64,
}

pub fn info(text: &str) -> Result<Info> {
    let body = text.trim().strip_prefix(BACKUP).ok_or("not a backup")?;
    unpack(&B64.decode(body).map_err(|e| e.to_string())?)
}

pub fn restore(store: &mut Store, text: &str) -> Result<Restored> {
    let body = text.trim().strip_prefix(BACKUP).ok_or("not a backup")?;
    let contents: Contents = unpack(&B64.decode(body).map_err(|e| e.to_string())?)?;
    // anyone can write a file: it may not claim more than it brings
    let adopt = store.capped(&contents.versions, &contents.cells)?;
    let applied = store.merge(&contents.cells, &contents.versions, &adopt)?;
    Ok(Restored {
        name: contents.name,
        device: contents.device,
        at: contents.at,
        received: applied.cells,
        items: applied.items,
    })
}

#[tauri::command(async)]
pub fn backup_export() -> Result<String> {
    export(&*crate::store()?)
}

/// On a Mac, where no share sheet is wired up: the file goes to Downloads and
/// Finder shows it, ready for AirDrop.
#[cfg(target_os = "macos")]
#[tauri::command(async)]
pub fn backup_save(app: tauri::AppHandle, name: String) -> Result<String> {
    use tauri::Manager;
    let name = std::path::Path::new(&name).file_name().ok_or("no file name")?.to_owned();
    let path = app.path().download_dir().map_err(|e| e.to_string())?.join(name);
    std::fs::write(&path, export(&*crate::store()?)?).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn backup_info(text: String) -> Result<Info> {
    info(&text)
}

#[tauri::command(async)]
pub fn backup_restore(text: String) -> Result<Restored> {
    let restored = restore(&mut *crate::store()?, &text)?;
    crate::changed();
    Ok(restored)
}

/// For the scheduled backup, with no window open; "" when it fails.
#[cfg(any(target_os = "android", target_os = "ios", target_os = "macos", test))]
fn native_export() -> String {
    crate::store().and_then(|s| export(&s)).unwrap_or_default()
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_backup(
    env: jni::JNIEnv,
    _: jni::objects::JObject,
) -> jni::sys::jstring {
    env.new_string(native_export())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// Freed with `territory_free_string`.
#[cfg(any(target_os = "ios", target_os = "macos", test))]
#[no_mangle]
pub extern "C" fn territory_backup() -> *mut std::ffi::c_char {
    std::ffi::CString::new(native_export())
        .unwrap_or_default()
        .into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Map, Value};

    fn fields(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    const TABLES: [&str; 6] = [
        "territories",
        "assignments",
        "do_not_calls",
        "people",
        "categories",
        "settings",
    ];

    fn filled() -> Store {
        let mut s = Store::in_memory().unwrap();
        s.set_name("Anna").unwrap();
        s.put(
            "territories",
            "t1",
            &fields(json!({"number": "1", "city": "Graz"})),
        )
        .unwrap();
        s.put("territories", "t2", &fields(json!({"number": "2"})))
            .unwrap();
        s.remove("territories", "t2").unwrap();
        s.put(
            "assignments",
            "a1",
            &fields(json!({"territory": "t1", "publisher": "Ben"})),
        )
        .unwrap();
        s.put(
            "do_not_calls",
            "d1",
            &fields(json!({"territory": "t1", "address": "Main St 1"})),
        )
        .unwrap();
        s.put(
            "people",
            "ben",
            &fields(json!({"name": "Ben", "group": false})),
        )
        .unwrap();
        s.put(
            "categories",
            "c1",
            &fields(json!({"name": "Business", "order": 0})),
        )
        .unwrap();
        s.put("settings", "overdue_months", &fields(json!({"value": 4})))
            .unwrap();
        s
    }

    #[test]
    fn a_backup_restores_every_record_on_a_fresh_device() {
        let a = filled();
        let text = export(&a).unwrap();
        assert!(text.starts_with(BACKUP));

        let mut b = Store::in_memory().unwrap();
        let restored = restore(&mut b, &text).unwrap();
        assert_eq!(restored.name, "Anna");
        assert_eq!(restored.device, a.identity.id);
        assert!(restored.received > 0);
        for table in TABLES {
            assert_eq!(b.list(table).unwrap(), a.list(table).unwrap(), "{table}");
        }
        assert!(b.list("territories").unwrap().len() == 1);
        // restoring again brings nothing new
        assert_eq!(restore(&mut b, &text).unwrap().received, 0);
    }

    #[test]
    fn restoring_an_old_backup_keeps_newer_edits() {
        let mut a = filled();
        let text = export(&a).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        a.put("territories", "t1", &fields(json!({"city": "Wien"})))
            .unwrap();
        a.put("territories", "t3", &fields(json!({"number": "3"})))
            .unwrap();

        let restored = restore(&mut a, &text).unwrap();
        assert_eq!(restored.received, 0);
        let territories = a.list("territories").unwrap();
        assert_eq!(territories.len(), 2);
        assert_eq!(territories[0]["city"], "Wien");
    }

    #[test]
    fn a_device_that_synced_later_keeps_its_data_and_can_still_sync() {
        let a = filled();
        let text = export(&a).unwrap();
        let mut b = Store::in_memory().unwrap();
        b.put("territories", "t9", &fields(json!({"number": "9"})))
            .unwrap();
        restore(&mut b, &text).unwrap();
        assert_eq!(b.list("territories").unwrap().len(), 2);
        // b now holds all of a's changes, so a sync has nothing of a's left to send
        assert!(a.changes_since(&b.versions().unwrap()).unwrap().is_empty());
    }

    #[test]
    fn a_backup_tells_who_made_it_without_restoring() {
        let a = filled();
        let info = info(&export(&a).unwrap()).unwrap();
        assert_eq!((info.device, info.name), (a.identity.id.clone(), "Anna".to_string()));
        assert!(info.at > 0);
        assert!(super::info("OTB1:abc").is_err());
    }

    #[test]
    fn a_backup_brings_only_cells_from_the_devices_that_made_them() {
        let a = filled();
        let mut contents: Contents = unpack(
            &B64.decode(export(&a).unwrap().strip_prefix(BACKUP).unwrap()).unwrap(),
        )
        .unwrap();
        // a cell passed off as another device's, and a claim of far more changes
        contents.cells[0].o = "00000000000000bb".into();
        contents.versions.insert("00000000000000bb".into(), 1 << 40);
        let text = format!("{BACKUP}{}", B64.encode(pack(&contents).unwrap()));
        let mut b = Store::in_memory().unwrap();
        let restored = restore(&mut b, &text).unwrap();
        assert_eq!(restored.received, contents.cells.len() - 1);
        assert_eq!(b.versions().unwrap().get("00000000000000bb"), None);
    }

    #[test]
    fn other_text_is_refused() {
        let mut b = Store::in_memory().unwrap();
        assert!(restore(&mut b, "OTB1:abc").is_err());
        assert!(restore(&mut b, &format!("{BACKUP}!!")).is_err());
    }

    #[test]
    fn swift_gets_the_backup_through_the_c_function() {
        let dir = std::env::temp_dir().join(format!("territories-backup-{}", std::process::id()));
        crate::open_store(&dir).unwrap();
        let ptr = territory_backup();
        let text = unsafe { std::ffi::CStr::from_ptr(ptr) }
            .to_str()
            .unwrap()
            .to_string();
        crate::ios::territory_free_string(ptr);
        assert!(text.starts_with(BACKUP));
    }
}
