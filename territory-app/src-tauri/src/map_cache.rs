use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use tauri::Manager;
use crate::store::Result;

fn directory(app: &tauri::AppHandle, scope: &str) -> Result<std::path::PathBuf> {
    if !["meta", "a", "b"].contains(&scope) { return Err("Invalid map cache".into()); }
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("offline-maps").join(scope))
}
fn filename(key: &str) -> String { format!("{:x}", Sha256::digest(key.as_bytes())) }

#[tauri::command(async)]
pub fn map_cache_get(app: tauri::AppHandle, scope: String, key: String) -> Result<Option<String>> {
    let path = directory(&app, &scope)?.join(filename(&key));
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(STANDARD.encode(bytes))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
#[tauri::command(async)]
pub fn map_cache_put(app: tauri::AppHandle, scope: String, key: String, data: String) -> Result<()> {
    if data.len() > 16 * 1024 * 1024 { return Err("Map resource too large".into()); }
    let dir = directory(&app, &scope)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = filename(&key);
    let temporary = dir.join(format!("{name}.tmp"));
    std::fs::write(&temporary, STANDARD.decode(data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, dir.join(name)).map_err(|e| e.to_string())
}
#[tauri::command(async)]
pub fn map_cache_clear(app: tauri::AppHandle, scope: String) -> Result<()> {
    let dir = directory(&app, &scope)?;
    if dir.exists() { std::fs::remove_dir_all(dir).map_err(|e| e.to_string())?; }
    Ok(())
}
