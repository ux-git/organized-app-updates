use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Component, Path, PathBuf},
};
use tauri::Manager;

// create_new prevents an export from replacing an earlier file, including symlinks.
fn write_download(directory: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let filename = Path::new(name);
    if name.is_empty()
        || name.contains(['/', '\\'])
        || filename.components().count() != 1
        || !matches!(filename.components().next(), Some(Component::Normal(_)))
    {
        return Err("Invalid export filename".into());
    }
    let stem = filename
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid export filename")?;
    let extension = filename
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{s}"))
        .unwrap_or_default();
    for index in 0..10_000 {
        let path = directory.join(if index == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({index}){extension}")
        });
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        };
        if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(error.to_string());
        }
        return Ok(path);
    }
    Err("Too many exports with this filename".into())
}

#[tauri::command(async)]
pub fn export_file(app: tauri::AppHandle, name: String, data: String) -> Result<String, String> {
    let bytes = STANDARD.decode(data).map_err(|error| error.to_string())?;
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = write_download(&directory, &name, &bytes)?;
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open")
        .arg(&directory)
        .spawn();
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_exact_bytes_without_overwriting_or_escaping_downloads() {
        let dir = std::env::temp_dir().join(format!("territory-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = write_download(&dir, "territory.pdf", b"first").unwrap();
        let second = write_download(&dir, "territory.pdf", b"second").unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read(first).unwrap(), b"first");
        assert_eq!(std::fs::read(second).unwrap(), b"second");
        for name in ["../escape.pdf", "..\\escape.pdf", "/escape.pdf", "", "."] {
            assert!(write_download(&dir, name, b"bad").is_err());
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
}
