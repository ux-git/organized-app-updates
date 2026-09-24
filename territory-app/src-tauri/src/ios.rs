//! The Swift side (the nearby plugin, plugins/nearby/ios) calls these plain C
//! functions, as Kotlin calls `android.rs`. Bytes and text Rust hands out are
//! freed with `territory_free` and `territory_free_string`.

use std::ffi::{c_char, CStr, CString};

use crate::native;

fn text<'a>(ptr: *const c_char) -> &'a str {
    if ptr.is_null() {
        return "";
    }
    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or("")
}

fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    unsafe { std::slice::from_raw_parts(ptr, len) }
}

/// Hands bytes to Swift; `len` receives their length.
fn give(out: Vec<u8>, len: *mut usize) -> *mut u8 {
    let boxed = out.into_boxed_slice();
    if !len.is_null() {
        unsafe { *len = boxed.len() };
    }
    Box::into_raw(boxed) as *mut u8
}

fn give_text(out: String) -> *mut c_char {
    CString::new(out).unwrap_or_default().into_raw()
}

#[no_mangle]
pub extern "C" fn territory_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) });
    }
}

#[no_mangle]
pub extern "C" fn territory_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}

#[no_mangle]
pub extern "C" fn territory_open(dir: *const c_char) -> bool {
    native::open(text(dir))
}

/// mode: 0 sync, 1 pair with a code, 2 pair by NFC tap. 0 when it can't start.
#[no_mangle]
pub extern "C" fn territory_session_new(mode: i32, initiator: bool) -> i64 {
    native::session_new(mode, initiator)
}

#[no_mangle]
pub extern "C" fn territory_session_start(handle: i64, len: *mut usize) -> *mut u8 {
    give(native::session_start(handle), len)
}

#[no_mangle]
pub extern "C" fn territory_session_feed(
    handle: i64,
    input: *const u8,
    input_len: usize,
    len: *mut usize,
) -> *mut u8 {
    give(native::session_feed(handle, bytes(input, input_len)), len)
}

#[no_mangle]
pub extern "C" fn territory_session_confirm(handle: i64, accept: bool, len: *mut usize) -> *mut u8 {
    give(native::session_confirm(handle, accept), len)
}

#[no_mangle]
pub extern "C" fn territory_session_status(handle: i64) -> *mut c_char {
    give_text(native::session_status(handle))
}

#[no_mangle]
pub extern "C" fn territory_session_close(handle: i64) {
    native::session_close(handle);
}

#[no_mangle]
pub extern "C" fn territory_beacon(len: *mut usize) -> *mut u8 {
    give(native::beacon(), len)
}

#[no_mangle]
pub extern "C" fn territory_recognise(beacon: *const u8, beacon_len: usize) -> *mut c_char {
    give_text(native::recognise(bytes(beacon, beacon_len)))
}

#[no_mangle]
pub extern "C" fn territory_summary() -> *mut c_char {
    give_text(native::summary())
}

#[no_mangle]
pub extern "C" fn territory_emit(event: *const c_char, payload: *const c_char) {
    native::emit(text(event), text(payload));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn take(ptr: *mut u8, len: usize) -> Vec<u8> {
        let out = bytes(ptr, len).to_vec();
        territory_free(ptr, len);
        out
    }

    fn take_text(ptr: *mut c_char) -> String {
        let out = text(ptr).to_string();
        territory_free_string(ptr);
        out
    }

    #[test]
    fn swift_can_run_a_session_through_the_c_functions() {
        let dir = std::env::temp_dir().join(format!("territories-ios-{}", std::process::id()));
        let dir = CString::new(dir.to_str().unwrap()).unwrap();
        assert!(territory_open(dir.as_ptr()));

        let summary = take_text(territory_summary());
        assert!(summary.contains("\"unsynced\""), "{summary}");

        let mut len = 0;
        let beacon = take(territory_beacon(&mut len), len);
        assert_eq!(beacon.len(), 12);
        // this phone's own beacon is no paired phone's
        assert_eq!(take_text(territory_recognise(beacon.as_ptr(), beacon.len())), "");

        let handle = territory_session_new(1, true);
        assert!(handle > 0);
        let first = take(territory_session_start(handle, &mut len), len);
        assert!(!first.is_empty());
        let status = take_text(territory_session_status(handle));
        assert!(status.contains("connecting"), "{status}");
        territory_session_close(handle);
        let gone = take_text(territory_session_status(handle));
        assert!(gone.contains("no session"), "{gone}");
    }
}
