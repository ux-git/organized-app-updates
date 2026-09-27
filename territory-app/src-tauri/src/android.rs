//! The Kotlin side (`com.sws2apps.territories.Native`) moves the bytes over
//! Bluetooth and NFC, often from a background service with no window open;
//! the sessions and the store stay here.

use std::collections::HashMap;
use std::sync::Mutex;

use jni::objects::{JByteArray, JObject, JString};
use jni::sys::{jboolean, jbyteArray, jint, jlong, jstring, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;

use crate::native;
use crate::session::Status;
use crate::{store, PLATFORM};

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

fn flag(value: bool) -> jboolean {
    if value {
        JNI_TRUE
    } else {
        JNI_FALSE
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
    flag(native::open(&String::from(dir)))
}

/// mode: 0 sync, 1 pair with a code, 2 pair by NFC tap
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionNew(
    _env: JNIEnv,
    _: JObject,
    mode: jint,
    initiator: jboolean,
) -> jlong {
    native::session_new(mode, initiator == JNI_TRUE)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionStart(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jbyteArray {
    bytes_out(&env, &native::session_start(handle))
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionFeed(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
    input: JByteArray,
) -> jbyteArray {
    let input = env.convert_byte_array(&input).unwrap_or_default();
    bytes_out(&env, &native::session_feed(handle, &input))
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionConfirm(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
    accept: jboolean,
) -> jbyteArray {
    bytes_out(&env, &native::session_confirm(handle, accept == JNI_TRUE))
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionStatus(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jstring {
    string_out(&env, &native::session_status(handle))
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_sessionClose(
    _env: JNIEnv,
    _: JObject,
    handle: jlong,
) {
    native::session_close(handle);
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_beacon(
    env: JNIEnv,
    _: JObject,
) -> jbyteArray {
    bytes_out(&env, &native::beacon())
}

/// `{"peer": id, "needsSync": bool}` for a paired phone's beacon, else "".
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_recognise(
    env: JNIEnv,
    _: JObject,
    beacon: JByteArray,
) -> jstring {
    let beacon = env.convert_byte_array(&beacon).unwrap_or_default();
    string_out(&env, &native::recognise(&beacon))
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_summary(
    env: JNIEnv,
    _: JObject,
) -> jstring {
    string_out(&env, &native::summary())
}

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
    native::emit(&String::from(event), &String::from(payload));
}

// ---- NFC tap (src/tap.rs); Kotlin only passes the APDUs ----

static CARD: Mutex<Option<crate::tap::Card>> = Mutex::new(None);
static READERS: Mutex<Option<HashMap<i64, crate::tap::Reader>>> = Mutex::new(None);

fn status_json(status: Option<&Status>) -> String {
    status
        .map(|s| serde_json::to_string(s).unwrap_or_default())
        .unwrap_or_default()
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapCardApdu(
    env: JNIEnv,
    _: JObject,
    apdu: JByteArray,
    listening: jboolean,
) -> jbyteArray {
    let apdu = env.convert_byte_array(&apdu).unwrap_or_default();
    let response = match (CARD.lock(), store()) {
        (Ok(mut card), Ok(mut store)) => card.get_or_insert_with(Default::default).apdu(
            &mut store,
            &apdu,
            listening == JNI_TRUE,
            PLATFORM,
        ),
        _ => vec![0x69, 0x85],
    };
    bytes_out(&env, &response)
}

/// The card side's session status as JSON, "" before any tap.
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapCardStatus(
    env: JNIEnv,
    _: JObject,
) -> jstring {
    let json = CARD
        .lock()
        .ok()
        .map(|card| status_json(card.as_ref().and_then(|c| c.status())))
        .unwrap_or_default();
    string_out(&env, &json)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapCardDone(
    _env: JNIEnv,
    _: JObject,
) -> jboolean {
    flag(
        CARD.lock()
            .ok()
            .is_some_and(|card| card.as_ref().is_some_and(|c| c.done())),
    )
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapCardReset(_env: JNIEnv, _: JObject) {
    if let Ok(mut card) = CARD.lock() {
        *card = None;
    }
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapReaderNew(
    _env: JNIEnv,
    _: JObject,
) -> jlong {
    let Ok(store) = store() else { return 0 };
    let Ok(reader) = crate::tap::Reader::new(&store, PLATFORM) else {
        return 0;
    };
    // tapReaderResponse takes READERS before the store; never the other way
    drop(store);
    let handle = native::next_handle();
    if let Ok(mut readers) = READERS.lock() {
        readers.get_or_insert_with(HashMap::new).insert(handle, reader);
    }
    handle
}

/// The next command APDU; empty when the pairing is over.
#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapReaderNext(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jbyteArray {
    let next = READERS
        .lock()
        .ok()
        .and_then(|mut r| r.as_mut()?.get_mut(&handle)?.next())
        .unwrap_or_default();
    bytes_out(&env, &next)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapReaderResponse(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
    response: JByteArray,
) -> jboolean {
    let response = env.convert_byte_array(&response).unwrap_or_default();
    let (Ok(mut readers), Ok(mut store)) = (READERS.lock(), store()) else {
        return JNI_FALSE;
    };
    let ok = readers
        .as_mut()
        .and_then(|r| r.get_mut(&handle))
        .is_some_and(|reader| reader.response(&mut store, &response).is_ok());
    flag(ok)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapReaderStatus(
    env: JNIEnv,
    _: JObject,
    handle: jlong,
) -> jstring {
    let json = READERS
        .lock()
        .ok()
        .map(|r| status_json(r.as_ref().and_then(|r| r.get(&handle)).map(|r| r.status())))
        .unwrap_or_default();
    string_out(&env, &json)
}

#[no_mangle]
pub extern "system" fn Java_com_sws2apps_territories_Native_tapReaderClose(
    _env: JNIEnv,
    _: JObject,
    handle: jlong,
) {
    if let Ok(mut readers) = READERS.lock() {
        if let Some(readers) = readers.as_mut() {
            readers.remove(&handle);
        }
    }
}
