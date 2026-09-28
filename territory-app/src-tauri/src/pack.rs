//! Records as compressed JSON, for a sync over the air and for files alike.

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};

use crate::store::Result;

/// The most a sync or transfer may carry, packed or unpacked, so a broken
/// or hostile peer can't make the phone run out of memory.
pub const LIMIT: usize = 64 << 20;

fn deflate(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::best());
    let _ = encoder.write_all(bytes);
    encoder.finish().unwrap_or_default()
}

fn inflate(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::DeflateDecoder::new(bytes)
        .take(LIMIT as u64 + 1)
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    if out.len() > LIMIT {
        return Err("too much data".into());
    }
    Ok(out)
}

pub fn pack(value: &impl Serialize) -> Result<Vec<u8>> {
    Ok(deflate(&serde_json::to_vec(value).map_err(|e| e.to_string())?))
}

pub fn unpack<T: for<'a> Deserialize<'a>>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(&inflate(bytes)?).map_err(|e| e.to_string())
}
