//! What the phone's own code (Kotlin on Android, Swift on iOS) asks of the
//! core while it moves bytes over Bluetooth, often with no window open:
//! sessions by handle, the beacon, and a summary for notifications.
//! `android.rs` and `ios.rs` only translate these for their language.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use tauri::Emitter;

use crate::session::{self, Mode, Session, Status};
use crate::store::{now_secs, Store};
use crate::{changed, open_store, store, APP, PLATFORM};

static SESSIONS: Mutex<Option<HashMap<i64, Session>>> = Mutex::new(None);
static NEXT: AtomicI64 = AtomicI64::new(1);

pub fn next_handle() -> i64 {
    NEXT.fetch_add(1, Ordering::Relaxed)
}

pub fn open(dir: &str) -> bool {
    open_store(Path::new(dir)).is_ok()
}

fn with_session<T>(handle: i64, f: impl FnOnce(&mut Session) -> T) -> Option<T> {
    let mut sessions = SESSIONS.lock().ok()?;
    sessions.as_mut()?.get_mut(&handle).map(f)
}

/// Runs a step of a session and tells the page when it brought data.
fn step(handle: i64, f: impl FnOnce(&mut Session, &mut Store) -> Vec<u8>) -> Vec<u8> {
    let Ok(mut store) = store() else {
        return Vec::new();
    };
    let result = with_session(handle, |session| {
        let out = f(session, &mut store);
        let brought = matches!(session.status(), Status::Done { received, .. } if *received > 0);
        (out, brought)
    });
    drop(store);
    match result {
        Some((out, brought)) => {
            if brought {
                changed();
            }
            out
        }
        None => Vec::new(),
    }
}

/// mode: 0 sync, 1 pair with a code, 2 pair by NFC tap. 0 when it can't start.
pub fn session_new(mode: i32, initiator: bool) -> i64 {
    let mode = match mode {
        1 => Mode::Pair { code: true },
        2 => Mode::Pair { code: false },
        _ => Mode::Sync,
    };
    let Ok(store) = store() else { return 0 };
    let Ok(session) = Session::new(&store, mode, initiator, PLATFORM) else {
        return 0;
    };
    let Ok(mut sessions) = SESSIONS.lock() else { return 0 };
    let sessions = sessions.get_or_insert_with(HashMap::new);
    // while this phone pairs with one, another asking to pair could have its
    // code confirmed in the first one's place
    let pairing = |s: &Session| s.pairs_with_code(true) && !s.finished();
    if mode == (Mode::Pair { code: true }) && !initiator && sessions.values().any(pairing) {
        return 0;
    }
    let handle = next_handle();
    sessions.insert(handle, session);
    handle
}

pub fn session_start(handle: i64) -> Vec<u8> {
    with_session(handle, |s| s.start()).unwrap_or_default()
}

pub fn session_feed(handle: i64, input: &[u8]) -> Vec<u8> {
    step(handle, |session, store| session.feed(store, input))
}

pub fn session_confirm(handle: i64, accept: bool) -> Vec<u8> {
    step(handle, |session, store| session.confirm(store, accept))
}

pub fn session_status(handle: i64) -> String {
    with_session(handle, |s| serde_json::to_string(s.status()).unwrap_or_default())
        .unwrap_or_else(|| r#"{"state":"failed","reason":"no session"}"#.into())
}

pub fn session_close(handle: i64) {
    if let Ok(mut sessions) = SESSIONS.lock() {
        if let Some(sessions) = sessions.as_mut() {
            sessions.remove(&handle);
        }
    }
}

pub fn beacon() -> Vec<u8> {
    store()
        .and_then(|s| session::beacon(&s, now_secs()))
        .unwrap_or_default()
}

/// `{"peer": id, "needsSync": bool}` for a paired phone's beacon, else "".
pub fn recognise(beacon: &[u8]) -> String {
    store()
        .and_then(|s| session::recognise(&s, beacon, now_secs()))
        .ok()
        .flatten()
        .map(|sighting| {
            serde_json::json!({"peer": sighting.peer, "needsSync": sighting.needs_sync}).to_string()
        })
        .unwrap_or_default()
}

/// `{"id", "name", "peers": [...], "unsynced", "removed"}` for notifications and the service.
pub fn summary() -> String {
    store()
        .and_then(|s| {
            let peers = s.peers()?;
            Ok(serde_json::json!({
                "id": s.identity.id,
                "name": s.identity.name,
                "unsynced": peers.iter().map(|p| p.pending).min().unwrap_or(0),
                "peers": peers,
                "removed": s.is_removed()?,
            })
            .to_string())
        })
        .unwrap_or_default()
}

/// Passes Bluetooth and NFC progress to the page, when it is open.
pub fn emit(event: &str, payload: &str) {
    let payload: serde_json::Value = serde_json::from_str(payload).unwrap_or_default();
    if let Some(app) = APP.get() {
        let _ = app.emit(event, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_one_else_can_pair_while_this_phone_pairs() {
        let dir = std::env::temp_dir().join(format!("territories-native-{}", std::process::id()));
        assert!(open(dir.to_str().unwrap()));
        let outgoing = session_new(1, true);
        assert!(outgoing > 0);
        assert_eq!(session_new(1, false), 0);
        // a sync from a paired phone still comes in
        let sync = session_new(0, false);
        assert!(sync > 0);
        session_close(sync);
        session_close(outgoing);
    }
}
