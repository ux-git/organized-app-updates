//! The Kotlin side (`com.sws2apps.territories.Native`) moves the bytes over
//! Bluetooth and NFC, often from a background service with no window open;
//! the sessions and the store stay here.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use jni::objects::{JByteArray, JObject, JString};
use jni::sys::{jboolean, jbyteArray, jint, jlong, jstring, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;
use tauri::Emitter;

use crate::session::{self, Mode, Session, Status};
use crate::store::now_secs;
use crate::{changed, open_store, store, APP, PLATFORM};

static SESSIONS: Mutex<Option<HashMap<i64, Session>>> = Mutex::new(None);
static NEXT: AtomicI64 = AtomicI64::new(1);

fn bytes_out(env: &JNIEnv, bytes: &[u8]) -> jbyteArray {
    env.byte_array_from_slice(bytes)
        .map(|a| a.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

fn string_out(env: &JNIEnv, text: &str) -> jstring {
    env.new_string(text)
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

fn with_session<T>(handle: jlong, f: impl FnOnce(&mut Session) -> T) -> Option<T> {
    let mut sessions = SESSIONS.lock().ok()?;
    sessions.as_mut()?.get_mut(&handle).map(f)
}

/// Runs a step of a session and tells the page when it brought data.
fn step(handle: jlong, f: impl FnOnce(&mut Session, &mut crate::store::Store) -> Vec<u8>) -> Vec<u8> {
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

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_open(
    mut env: JNIEnv,
    _: JObject,
    dir: JString,
) -> jboolean {
    let Ok(dir) = env.get_string(&dir) else {
        return JNI_FALSE;
    };
    match open_store(&PathBuf::from(String::from(dir))) {
        Ok(()) => JNI_TRUE,
        Err(_) => JNI_FALSE,
    }
}

/// mode: 0 sync, 1 pair with a code, 2 pair by NFC tap
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionNew(
    _env: JNIEnv,
    _: JObject,
    mode: jint,
    initiator: jboolean,
) -> jlong {
    let mode = match mode {
        1 => Mode::Pair { code: true },
        2 => Mode::Pair { code: false },
        _ => Mode::Sync,
    };
    let Ok(store) = store() else { return 0 };
    let Ok(session) = Session::new(&store, mode, initiator == JNI_TRUE, PLATFORM) else {
        return 0;
    };
    let handle = NEXT.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut sessions) = SESSIONS.lock() {
        sessions.get_or_insert_with(HashMap::new).insert(handle, session);
    }
    handle
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionStart(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jbyteArray {
    let out = with_session(handle, |s| s.start()).unwrap_or_default();
    bytes_out(&env, &out)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionFeed(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
    input: JByteArray,
) -> jbyteArray {
    let input = env.convert_byte_array(&input).unwrap_or_default();
    let out = step(handle, |session, store| session.feed(store, &input));
    bytes_out(&env, &out)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionConfirm(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
    accept: jboolean,
) -> jbyteArray {
    let out = step(handle, |session, store| session.confirm(store, accept == JNI_TRUE));
    bytes_out(&env, &out)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionStatus(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jstring {
    let json = with_session(handle, |s| serde_json::to_string(s.status()).unwrap_or_default())
        .unwrap_or_else(|| r#"{"state":"failed","reason":"no session"}"#.into());
    string_out(&env, &json)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionClose(
    _env: JNIEnv,
    _: JObject,
    handle: jlong,
) {
    if let Ok(mut sessions) = SESSIONS.lock() {
        if let Some(sessions) = sessions.as_mut() {
            sessions.remove(&handle);
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_beacon(
    env: JNIEnv,
    _: JObject,
) -> jbyteArray {
    let bytes = store()
        .and_then(|s| session::beacon(&s, now_secs()))
        .unwrap_or_default();
    bytes_out(&env, &bytes)
}

/// `{"peer": id, "needsSync": bool}` for a paired phone's beacon, else "".
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_recognise(
    env: JNIEnv,
    _: JObject,
    beacon: JByteArray,
) -> jstring {
    let beacon = env.convert_byte_array(&beacon).unwrap_or_default();
    let json = store()
        .and_then(|s| session::recognise(&s, &beacon, now_secs()))
        .ok()
        .flatten()
        .map(|sighting| {
            serde_json::json!({"peer": sighting.peer, "needsSync": sighting.needs_sync})
                .to_string()
        })
        .unwrap_or_default();
    string_out(&env, &json)
}

/// `{"name", "peers": [...], "unsynced"}` for notifications and the service.
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_summary(
    env: JNIEnv,
    _: JObject,
) -> jstring {
    let json = store()
        .and_then(|s| {
            Ok(serde_json::json!({
                "id": s.identity.id,
                "name": s.identity.name,
                "peers": s.peers()?,
                "unsynced": s.unsynced()?,
            })
            .to_string())
        })
        .unwrap_or_default();
    string_out(&env, &json)
}

/// Passes Bluetooth and NFC progress to the page, when it is open.
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_emit(
    mut env: JNIEnv,
    _: JObject,
    event: JString,
    payload: JString,
) {
    let (Ok(event), Ok(payload)) = (env.get_string(&event), env.get_string(&payload)) else {
        return;
    };
    let payload: serde_json::Value =
        serde_json::from_str(&String::from(payload)).unwrap_or_default();
    if let Some(app) = APP.get() {
        let _ = app.emit(&String::from(event), payload);
    }
}
