//! One conversation between two phones over any byte stream (Bluetooth,
//! NFC). The transport only moves bytes: it feeds what arrives into
//! `Session::feed` and sends back what that returns.
//!
//! Every conversation starts with a Noise XX handshake, so all that follows
//! is encrypted, and each side learns the other's key. A sync then only goes
//! on with a paired key. A pairing either shows both people the same 6-digit
//! code (when the phones may be anywhere in the room) or trusts the link
//! itself (an NFC tap).

use std::io::{Read, Write};

use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use snow::{Builder, HandshakeState, TransportState};

use crate::store::{Cell, Peer, Result, Store, Versions};

const PARAMS: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";
const PROLOGUE: &[u8] = b"organized-territories-1";
/// Plaintext per message, under Noise's 65535-byte limit with room for the tag.
const CHUNK: usize = 60_000;

const HELLO: u8 = 1;
const COMMIT: u8 = 2;
const NONCE: u8 = 3;
const REVEAL: u8 = 4;
const CONFIRM: u8 = 5;
const PART: u8 = 6;
const DONE: u8 = 7;
const ACK: u8 = 8;
const FAIL: u8 = 9;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode {
    Sync,
    /// `code`: both people compare a code before the phones trust each other.
    Pair { code: bool },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    Connecting,
    Confirm {
        code: Option<String>,
        name: String,
    },
    Exchanging {
        peer: String,
    },
    Done {
        peer: String,
        name: String,
        sent: usize,
        received: usize,
    },
    Failed {
        reason: String,
    },
}

#[derive(Clone, Serialize, Deserialize)]
struct Hello {
    id: String,
    name: String,
    platform: String,
    versions: Versions,
    /// Only while pairing: the secret the peer's Bluetooth tag is made with.
    #[serde(default)]
    adv: Option<String>,
}

enum Noise {
    Handshake(Box<HandshakeState>),
    Transport(Box<TransportState>),
}

pub struct Session {
    mode: Mode,
    initiator: bool,
    platform: String,
    noise: Noise,
    inbox: Vec<u8>,
    status: Status,
    remote_key: Vec<u8>,
    handshake_hash: Vec<u8>,
    hello: Option<Hello>,
    peer: Option<String>,
    nonce: [u8; 32],
    their_commit: Option<[u8; 32]>,
    local_ok: Option<bool>,
    remote_ok: Option<bool>,
    sent_versions: Option<Versions>,
    sent: usize,
    parts: Vec<u8>,
    received: Option<(usize, Versions)>,
    acked: bool,
}

fn frame(out: &mut Vec<u8>, message: &[u8]) {
    out.extend_from_slice(&(message.len() as u16).to_be_bytes());
    out.extend_from_slice(message);
}

fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut hash = Sha256::new();
    for part in parts {
        hash.update(part);
    }
    hash.finalize().into()
}

fn deflate(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::best());
    let _ = encoder.write_all(bytes);
    encoder.finish().unwrap_or_default()
}

fn inflate(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::DeflateDecoder::new(bytes)
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

pub fn pack(value: &impl Serialize) -> Result<Vec<u8>> {
    Ok(deflate(&serde_json::to_vec(value).map_err(|e| e.to_string())?))
}

pub fn unpack<T: for<'a> Deserialize<'a>>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(&inflate(bytes)?).map_err(|e| e.to_string())
}

impl Session {
    pub fn new(store: &Store, mode: Mode, initiator: bool, platform: &str) -> Result<Self> {
        let builder = Builder::new(PARAMS.parse().map_err(|_| "noise params")?)
            .local_private_key(&store.identity.private_key)
            .prologue(PROLOGUE);
        let handshake = if initiator {
            builder.build_initiator()
        } else {
            builder.build_responder()
        }
        .map_err(|e| e.to_string())?;
        let mut nonce = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut nonce);
        Ok(Session {
            mode,
            initiator,
            platform: platform.into(),
            noise: Noise::Handshake(Box::new(handshake)),
            inbox: Vec::new(),
            status: Status::Connecting,
            remote_key: Vec::new(),
            handshake_hash: Vec::new(),
            hello: None,
            peer: None,
            nonce,
            their_commit: None,
            local_ok: None,
            remote_ok: None,
            sent_versions: None,
            sent: 0,
            parts: Vec::new(),
            received: None,
            acked: false,
        })
    }

    pub fn status(&self) -> &Status {
        &self.status
    }

    pub fn finished(&self) -> bool {
        matches!(self.status, Status::Done { .. } | Status::Failed { .. })
    }

    /// The first message; only the side that connected sends one.
    pub fn start(&mut self) -> Vec<u8> {
        let mut out = Vec::new();
        if !self.initiator {
            return out;
        }
        if let Noise::Handshake(hs) = &mut self.noise {
            let mut buf = vec![0u8; 1024];
            match hs.write_message(&[], &mut buf) {
                Ok(n) => frame(&mut out, &buf[..n]),
                Err(e) => self.fail(&mut out, &e.to_string()),
            }
        }
        out
    }

    pub fn feed(&mut self, store: &mut Store, input: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        self.inbox.extend_from_slice(input);
        while !self.finished() && self.inbox.len() >= 2 {
            let len = u16::from_be_bytes([self.inbox[0], self.inbox[1]]) as usize;
            if self.inbox.len() < 2 + len {
                break;
            }
            let message: Vec<u8> = self.inbox.drain(..2 + len).skip(2).collect();
            if let Err(reason) = self.receive(store, &message, &mut out) {
                self.fail(&mut out, &reason);
            }
        }
        out
    }

    /// The person's answer to "Do both phones show this code?".
    pub fn confirm(&mut self, store: &mut Store, accept: bool) -> Vec<u8> {
        let mut out = Vec::new();
        if !matches!(self.status, Status::Confirm { .. }) || self.local_ok.is_some() {
            return out;
        }
        if let Err(reason) = self.answer(store, accept, &mut out) {
            self.fail(&mut out, &reason);
        }
        out
    }

    fn answer(&mut self, store: &mut Store, accept: bool, out: &mut Vec<u8>) -> Result<()> {
        self.local_ok = Some(accept);
        self.send(out, CONFIRM, &[accept as u8])?;
        if !accept {
            self.status = Status::Failed {
                reason: "declined".into(),
            };
            return Ok(());
        }
        self.paired(store, out)
    }

    fn fail(&mut self, out: &mut Vec<u8>, reason: &str) {
        if self.finished() {
            return;
        }
        let _ = self.send(out, FAIL, reason.as_bytes());
        self.status = Status::Failed {
            reason: reason.into(),
        };
    }

    fn send(&mut self, out: &mut Vec<u8>, kind: u8, body: &[u8]) -> Result<()> {
        let Noise::Transport(transport) = &mut self.noise else {
            return Err("not connected".into());
        };
        let mut plain = Vec::with_capacity(body.len() + 1);
        plain.push(kind);
        plain.extend_from_slice(body);
        let mut buf = vec![0u8; plain.len() + 64];
        let n = transport
            .write_message(&plain, &mut buf)
            .map_err(|e| e.to_string())?;
        frame(out, &buf[..n]);
        Ok(())
    }

    fn receive(&mut self, store: &mut Store, message: &[u8], out: &mut Vec<u8>) -> Result<()> {
        let mut buf = vec![0u8; message.len() + 64];
        match &mut self.noise {
            Noise::Handshake(hs) => {
                hs.read_message(message, &mut buf)
                    .map_err(|_| "handshake failed")?;
                if !hs.is_handshake_finished() && hs.is_my_turn() {
                    let n = hs.write_message(&[], &mut buf).map_err(|e| e.to_string())?;
                    frame(out, &buf[..n]);
                }
                if hs.is_handshake_finished() {
                    self.remote_key = hs.get_remote_static().unwrap_or_default().to_vec();
                    self.handshake_hash = hs.get_handshake_hash().to_vec();
                    let Noise::Handshake(hs) =
                        std::mem::replace(&mut self.noise, Noise::Transport(Box::new(placeholder())))
                    else {
                        unreachable!()
                    };
                    self.noise = Noise::Transport(Box::new(
                        hs.into_transport_mode().map_err(|e| e.to_string())?,
                    ));
                    self.opened(store, out)?;
                }
                Ok(())
            }
            Noise::Transport(transport) => {
                let n = transport
                    .read_message(message, &mut buf)
                    .map_err(|_| "message did not decrypt")?;
                let (kind, body) = buf[..n].split_first().ok_or("empty message")?;
                let body = body.to_vec();
                self.handle(store, *kind, &body, out)
            }
        }
    }

    fn opened(&mut self, store: &Store, out: &mut Vec<u8>) -> Result<()> {
        if self.mode == Mode::Sync {
            let peer = store
                .peer_by_key(&self.remote_key)?
                .ok_or("this phone is not paired")?;
            self.peer = Some(peer.id);
        }
        let hello = Hello {
            id: store.identity.id.clone(),
            name: store.identity.name.clone(),
            platform: self.platform.clone(),
            versions: store.versions()?,
            adv: matches!(self.mode, Mode::Pair { .. })
                .then(|| STANDARD.encode(store.identity.adv_secret)),
        };
        self.send(out, HELLO, &serde_json::to_vec(&hello).map_err(|e| e.to_string())?)
    }

    fn handle(&mut self, store: &mut Store, kind: u8, body: &[u8], out: &mut Vec<u8>) -> Result<()> {
        match kind {
            HELLO => {
                let hello: Hello = serde_json::from_slice(body).map_err(|e| e.to_string())?;
                if let Some(peer) = &self.peer {
                    if peer != &hello.id {
                        return Err("the phone's key does not match its id".into());
                    }
                }
                let name = hello.name.clone();
                self.hello = Some(hello);
                match self.mode {
                    Mode::Sync => self.exchange(store, out)?,
                    Mode::Pair { code: false } => {
                        self.status = Status::Confirm { code: None, name };
                        self.answer(store, true, out)?;
                    }
                    Mode::Pair { code: true } if self.initiator => {
                        let commit = sha256(&[&self.nonce]);
                        self.send(out, COMMIT, &commit)?;
                    }
                    Mode::Pair { code: true } => {}
                }
            }
            COMMIT if !self.initiator => {
                self.their_commit = Some(body.try_into().map_err(|_| "bad commit")?);
                let nonce = self.nonce;
                self.send(out, NONCE, &nonce)?;
            }
            NONCE if self.initiator => {
                let nonce = self.nonce;
                self.send(out, REVEAL, &nonce)?;
                self.show_code(&nonce, body)?;
            }
            REVEAL if !self.initiator => {
                if Some(sha256(&[body])) != self.their_commit {
                    return Err("the code check failed".into());
                }
                let nonce = self.nonce;
                self.show_code(body, &nonce)?;
            }
            CONFIRM => {
                let accept = body.first() == Some(&1);
                self.remote_ok = Some(accept);
                if !accept {
                    self.status = Status::Failed {
                        reason: "declined on the other phone".into(),
                    };
                    return Ok(());
                }
                self.paired(store, out)?;
            }
            PART => self.parts.extend_from_slice(body),
            DONE => {
                let cells: Vec<Cell> = unpack(&std::mem::take(&mut self.parts))?;
                let theirs: Versions = serde_json::from_slice(body).map_err(|e| e.to_string())?;
                let applied = store.apply(&cells, &theirs)?;
                self.received = Some((applied, theirs));
                self.send(out, ACK, &[])?;
                self.finish(store)?;
            }
            ACK => {
                self.acked = true;
                self.finish(store)?;
            }
            FAIL => {
                self.status = Status::Failed {
                    reason: String::from_utf8_lossy(body).into_owned(),
                };
            }
            _ => return Err("unexpected message".into()),
        }
        Ok(())
    }

    /// Both nonces were committed to before either was known, so someone in
    /// the middle can't steer both codes to match.
    fn show_code(&mut self, initiator_nonce: &[u8], responder_nonce: &[u8]) -> Result<()> {
        let hash = sha256(&[
            b"organized-code",
            &self.handshake_hash,
            initiator_nonce,
            responder_nonce,
        ]);
        let number = u32::from_be_bytes([hash[0], hash[1], hash[2], hash[3]]) % 1_000_000;
        let name = self.hello.as_ref().map(|h| h.name.clone()).unwrap_or_default();
        self.status = Status::Confirm {
            code: Some(format!("{number:06}")),
            name,
        };
        Ok(())
    }

    fn paired(&mut self, store: &mut Store, out: &mut Vec<u8>) -> Result<()> {
        if self.local_ok != Some(true) || self.remote_ok != Some(true) {
            return Ok(());
        }
        let hello = self.hello.clone().ok_or("no hello")?;
        let adv = STANDARD
            .decode(hello.adv.as_deref().unwrap_or_default())
            .map_err(|e| e.to_string())?;
        store.add_peer(&Peer {
            id: hello.id.clone(),
            name: hello.name.clone(),
            platform: hello.platform,
            public_key: self.remote_key.clone(),
            adv_secret: adv,
            paired_at: 0,
            last_sync: None,
            pending: 0,
        })?;
        self.peer = Some(hello.id.clone());
        // a tap only introduces the phones; the data follows over Bluetooth,
        // so nobody has to hold two phones together through a whole transfer
        if self.mode == (Mode::Pair { code: false }) {
            self.status = Status::Done {
                peer: hello.id,
                name: hello.name,
                sent: 0,
                received: 0,
            };
            return Ok(());
        }
        self.exchange(store, out)
    }

    fn exchange(&mut self, store: &Store, out: &mut Vec<u8>) -> Result<()> {
        let theirs = self.hello.as_ref().ok_or("no hello")?.versions.clone();
        let cells = store.changes_since(&theirs)?;
        let mine = store.versions()?;
        self.status = Status::Exchanging {
            peer: self.peer.clone().unwrap_or_default(),
        };
        for chunk in pack(&cells)?.chunks(CHUNK) {
            self.send(out, PART, chunk)?;
        }
        self.send(out, DONE, &serde_json::to_vec(&mine).map_err(|e| e.to_string())?)?;
        self.sent = cells.len();
        self.sent_versions = Some(mine);
        Ok(())
    }

    fn finish(&mut self, store: &Store) -> Result<()> {
        let (Some((received, theirs)), true, Some(mine)) =
            (&self.received, self.acked, &self.sent_versions)
        else {
            return Ok(());
        };
        // the peer now holds its own changes and everything sent to it
        let mut held = theirs.clone();
        for (origin, seq) in mine {
            let entry = held.entry(origin.clone()).or_insert(0);
            *entry = (*entry).max(*seq);
        }
        let peer = self.peer.clone().unwrap_or_default();
        store.record_sync(&peer, &held)?;
        self.status = Status::Done {
            name: store.peer(&peer)?.map(|p| p.name).unwrap_or_default(),
            peer,
            sent: self.sent,
            received: *received,
        };
        Ok(())
    }
}

/// Only stands in for a moment while the handshake turns into transport mode.
fn placeholder() -> TransportState {
    let keys = Builder::new(PARAMS.parse().unwrap()).generate_keypair().unwrap();
    let mut i = Builder::new(PARAMS.parse().unwrap())
        .local_private_key(&keys.private)
        .build_initiator()
        .unwrap();
    let mut r = Builder::new(PARAMS.parse().unwrap())
        .local_private_key(&keys.private)
        .build_responder()
        .unwrap();
    let mut a = [0u8; 256];
    let mut b = [0u8; 256];
    let n = i.write_message(&[], &mut a).unwrap();
    r.read_message(&a[..n], &mut b).unwrap();
    let n = r.write_message(&[], &mut a).unwrap();
    i.read_message(&a[..n], &mut b).unwrap();
    let n = i.write_message(&[], &mut a).unwrap();
    r.read_message(&a[..n], &mut b).unwrap();
    i.into_transport_mode().unwrap()
}

/// What the phone puts in its Bluetooth advertisement: 8 bytes only its
/// paired phones can recognise (they change every 15 minutes, so the phone
/// can't be followed), then 4 bytes of its data version, so a peer that
/// already has the same data doesn't connect at all.
pub fn beacon(store: &Store, now: i64) -> Result<Vec<u8>> {
    let mut bytes = tag(&store.identity.adv_secret, now / 900).to_vec();
    bytes.extend_from_slice(&version_hash(&store.versions()?));
    Ok(bytes)
}

fn tag(secret: &[u8], epoch: i64) -> [u8; 8] {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("any key length");
    mac.update(&epoch.to_be_bytes());
    mac.finalize().into_bytes()[..8].try_into().unwrap()
}

fn version_hash(versions: &Versions) -> [u8; 4] {
    let hash = sha256(&[&serde_json::to_vec(versions).unwrap_or_default()]);
    [hash[0], hash[1], hash[2], hash[3]]
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Sighting {
    pub peer: String,
    /// False when both phones already hold the same data.
    pub needs_sync: bool,
}

/// Which paired phone sent this advertisement, if any.
pub fn recognise(store: &Store, beacon: &[u8], now: i64) -> Result<Option<Sighting>> {
    if beacon.len() < 12 {
        return Ok(None);
    }
    let epoch = now / 900;
    let ours = version_hash(&store.versions()?);
    for peer in store.peers()? {
        let known = (epoch - 1..=epoch + 1).any(|e| tag(&peer.adv_secret, e) == beacon[..8]);
        if known {
            return Ok(Some(Sighting {
                peer: peer.id,
                needs_sync: beacon[8..12] != ours,
            }));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn store(name: &str) -> Store {
        let mut s = Store::in_memory().unwrap();
        s.set_name(name).unwrap();
        s
    }

    fn put(s: &mut Store, id: &str, value: serde_json::Value) {
        s.put("territories", id, value.as_object().unwrap()).unwrap();
    }

    /// Passes bytes back and forth until both sides stop talking.
    fn run(a: &mut Session, sa: &mut Store, b: &mut Session, sb: &mut Store) {
        let mut to_b = a.start();
        let mut to_a = b.start();
        for _ in 0..50 {
            if to_a.is_empty() && to_b.is_empty() {
                break;
            }
            let next_a = b.feed(sb, &std::mem::take(&mut to_b));
            let next_b = a.feed(sa, &std::mem::take(&mut to_a));
            to_a.extend(next_a);
            to_b.extend(next_b);
        }
    }

    fn pair(sa: &mut Store, sb: &mut Store) {
        let mut a = Session::new(sa, Mode::Pair { code: true }, true, "android").unwrap();
        let mut b = Session::new(sb, Mode::Pair { code: true }, false, "ios").unwrap();
        run(&mut a, sa, &mut b, sb);
        let (Status::Confirm { code: ca, .. }, Status::Confirm { code: cb, .. }) =
            (a.status().clone(), b.status().clone())
        else {
            panic!("no code: {:?} {:?}", a.status(), b.status());
        };
        assert_eq!(ca, cb);
        let mut to_b = a.confirm(sa, true);
        let mut to_a = b.confirm(sb, true);
        for _ in 0..20 {
            let next_a = b.feed(sb, &std::mem::take(&mut to_b));
            let next_b = a.feed(sa, &std::mem::take(&mut to_a));
            to_a.extend(next_a);
            to_b.extend(next_b);
        }
        assert!(matches!(a.status(), Status::Done { .. }), "{:?}", a.status());
        assert!(matches!(b.status(), Status::Done { .. }), "{:?}", b.status());
    }

    #[test]
    fn pairing_shows_the_same_code_and_then_syncs() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        put(&mut sa, "t1", json!({"number": "1"}));
        pair(&mut sa, &mut sb);
        assert_eq!(sb.list("territories").unwrap(), sa.list("territories").unwrap());
        assert_eq!(sa.peers().unwrap()[0].name, "Ben");
        assert_eq!(sb.peers().unwrap()[0].name, "Anna");
        assert_eq!(sa.unsynced().unwrap(), 0);
    }

    #[test]
    fn paired_phones_sync_both_ways() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        pair(&mut sa, &mut sb);
        put(&mut sa, "t1", json!({"number": "1"}));
        put(&mut sb, "t2", json!({"number": "2"}));
        assert_eq!(sa.unsynced().unwrap(), 1);

        let mut a = Session::new(&sa, Mode::Sync, false, "android").unwrap();
        let mut b = Session::new(&sb, Mode::Sync, true, "ios").unwrap();
        run(&mut a, &mut sa, &mut b, &mut sb);
        assert_eq!(
            a.status(),
            &Status::Done {
                peer: sb.identity.id.clone(),
                name: "Ben".into(),
                sent: 1,
                received: 1
            }
        );
        assert_eq!(sa.list("territories").unwrap().len(), 2);
        assert_eq!(sb.list("territories").unwrap(), sa.list("territories").unwrap());
        assert_eq!(sa.unsynced().unwrap(), 0);
        assert_eq!(sb.unsynced().unwrap(), 0);
    }

    #[test]
    fn an_unpaired_phone_gets_nothing() {
        let mut sa = store("Anna");
        let mut sx = store("Stranger");
        put(&mut sa, "t1", json!({"number": "1"}));
        let mut a = Session::new(&sa, Mode::Sync, false, "android").unwrap();
        let mut x = Session::new(&sx, Mode::Sync, true, "android").unwrap();
        run(&mut a, &mut sa, &mut x, &mut sx);
        assert!(matches!(a.status(), Status::Failed { .. }));
        assert!(sx.list("territories").unwrap().is_empty());
    }

    #[test]
    fn a_declined_code_pairs_nothing() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let mut a = Session::new(&sa, Mode::Pair { code: true }, true, "android").unwrap();
        let mut b = Session::new(&sb, Mode::Pair { code: true }, false, "ios").unwrap();
        run(&mut a, &mut sa, &mut b, &mut sb);
        let to_b = a.confirm(&mut sa, false);
        b.feed(&mut sb, &to_b);
        assert!(matches!(b.status(), Status::Failed { .. }));
        assert!(sa.peers().unwrap().is_empty());
        assert!(sb.peers().unwrap().is_empty());
    }

    #[test]
    fn a_tap_pairs_without_a_code_and_leaves_the_data_to_bluetooth() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        put(&mut sa, "t1", json!({"number": "1"}));
        let mut a = Session::new(&sa, Mode::Pair { code: false }, true, "android").unwrap();
        let mut b = Session::new(&sb, Mode::Pair { code: false }, false, "ios").unwrap();
        run(&mut a, &mut sa, &mut b, &mut sb);
        assert!(matches!(a.status(), Status::Done { .. }), "{:?}", a.status());
        assert!(matches!(b.status(), Status::Done { .. }), "{:?}", b.status());
        assert_eq!(sb.peers().unwrap().len(), 1);
        assert_eq!(sa.peers().unwrap().len(), 1);
        assert!(sb.list("territories").unwrap().is_empty());
    }

    #[test]
    fn large_data_goes_in_several_parts() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        pair(&mut sa, &mut sb);
        for i in 0..3000 {
            put(
                &mut sa,
                &format!("t{i}"),
                json!({"number": i, "notes": format!("{i:x}").repeat(40)}),
            );
        }
        let mut a = Session::new(&sa, Mode::Sync, true, "android").unwrap();
        let mut b = Session::new(&sb, Mode::Sync, false, "ios").unwrap();
        run(&mut a, &mut sa, &mut b, &mut sb);
        assert_eq!(sb.list("territories").unwrap().len(), 3000);
    }

    #[test]
    fn a_paired_phone_recognises_the_beacon() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let sx = store("Stranger");
        pair(&mut sa, &mut sb);
        let now = 1_800_000_000;
        let beacon_a = beacon(&sa, now).unwrap();
        assert_eq!(
            recognise(&sb, &beacon_a, now + 300).unwrap(),
            Some(Sighting {
                peer: sa.identity.id.clone(),
                needs_sync: false
            })
        );
        assert_eq!(recognise(&sx, &beacon_a, now).unwrap(), None);
        put(&mut sa, "t1", json!({"n": 1}));
        let beacon_a = beacon(&sa, now).unwrap();
        assert!(recognise(&sb, &beacon_a, now).unwrap().unwrap().needs_sync);
    }
}
