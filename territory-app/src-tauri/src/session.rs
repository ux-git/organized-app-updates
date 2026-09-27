//! One conversation between two phones over any byte stream (Bluetooth,
//! NFC). The transport only moves bytes: it feeds what arrives into
//! `Session::feed` and sends back what that returns.
//!
//! Every conversation starts with a Noise XX handshake, so all that follows
//! is encrypted, and each side learns the other's key. A sync then only goes
//! on with a paired key. A pairing either shows both people the same 6-digit
//! code (when the phones may be anywhere in the room) or trusts the link
//! itself (an NFC tap).

use std::collections::BTreeMap;
use std::io::{Read, Write};

use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use snow::{Builder, HandshakeState, TransportState};

use crate::store::{is_id, Applied, Cell, Member, Peer, Result, Standing, Store, Touched, Versions};

const PARAMS: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";
const PROLOGUE: &[u8] = b"organized-territories-1";
/// Plaintext per message, under Noise's 65535-byte limit with room for the tag.
const CHUNK: usize = 60_000;
/// The most a sync or transfer may carry, packed or unpacked, so a broken
/// or hostile peer can't make the phone run out of memory.
const LIMIT: usize = 64 << 20;

const HELLO: u8 = 1;
const COMMIT: u8 = 2;
const NONCE: u8 = 3;
const REVEAL: u8 = 4;
const CONFIRM: u8 = 5;
const PART: u8 = 6;
const DONE: u8 = 7;
const ACK: u8 = 8;
const FAIL: u8 = 9;
const CIRCLE: u8 = 10;
/// Sent instead of a hello to a phone removed from the group, with the stamp
/// of its removal. Older versions take it as an unexpected message.
const REMOVED: u8 = 11;

/// Why a sync with a phone removed from the group stops, on both phones.
pub const REMOVED_REASON: &str = "removed from the group";

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
        /// Records received, per table.
        items: BTreeMap<String, usize>,
        /// Territories that came in changed, and those sent.
        territories: Vec<Touched>,
        sent_territories: Vec<Touched>,
        /// Fields both phones had changed.
        conflicts: usize,
        /// Phones of the circle this one met through the other.
        introduced: Vec<String>,
        /// Paired phones this one heard were removed from the group.
        removed: Vec<String>,
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
    /// Only while the handshake turns into transport mode, or when that failed.
    Closed,
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
    sent_territories: Vec<Touched>,
    parts: Vec<u8>,
    received: Option<(Applied, Versions)>,
    introduced: Vec<String>,
    removed: Vec<String>,
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
            sent_territories: Vec::new(),
            parts: Vec::new(),
            received: None,
            introduced: Vec::new(),
            removed: Vec::new(),
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
                    if let Noise::Handshake(hs) = std::mem::replace(&mut self.noise, Noise::Closed) {
                        self.noise = Noise::Transport(Box::new(
                            hs.into_transport_mode().map_err(|e| e.to_string())?,
                        ));
                    }
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
            Noise::Closed => Err("not connected".into()),
        }
    }

    fn opened(&mut self, store: &Store, out: &mut Vec<u8>) -> Result<()> {
        if self.mode == Mode::Sync {
            let Some(peer) = store.peer_by_key(&self.remote_key)? else {
                // it learns why, so it stops trying
                if let Some(stamp) = store.removed_by_key(&self.remote_key)? {
                    self.send(out, REMOVED, stamp.as_bytes())?;
                    return Err(REMOVED_REASON.into());
                }
                return Err("this phone is not paired".into());
            };
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
        // each step of the code check comes once and in order; a second
        // nonce or commit would let someone in the middle steer the code
        let code = self.mode == Mode::Pair { code: true } && self.status == Status::Connecting;
        // data only from a phone that is trusted: paired, or a peer already
        let trusted = self.peer.is_some();
        match kind {
            HELLO if self.hello.is_none() => {
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
            COMMIT if code && !self.initiator && self.their_commit.is_none() => {
                self.their_commit = Some(body.try_into().map_err(|_| "bad commit")?);
                let nonce = self.nonce;
                self.send(out, NONCE, &nonce)?;
            }
            // the initiator committed when the hello came
            NONCE if code && self.initiator && self.hello.is_some() => {
                let nonce = self.nonce;
                self.send(out, REVEAL, &nonce)?;
                self.show_code(&nonce, body)?;
            }
            REVEAL if code && !self.initiator => {
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
            CIRCLE if trusted => {
                let members: Vec<Member> = unpack(body)?;
                let by = self.peer.clone().unwrap_or_default();
                (self.introduced, self.removed) = store.introduce(&members, &by)?;
                if store.is_removed()? {
                    return Err(REMOVED_REASON.into());
                }
                if store.peer(&by)?.is_none() {
                    return Err("the other phone was removed from the group".into());
                }
            }
            REMOVED if trusted => {
                let stamp = String::from_utf8_lossy(body).into_owned();
                let (id, name) = (store.identity.id.clone(), store.identity.name.clone());
                let standing = Standing { stamp, removed: true };
                store.take_standing(&id, &standing, &name)?;
                // a removal older than a pairing since is news the other phone lacks
                if !store.is_removed()? {
                    return Err("this phone is not paired on the other phone".into());
                }
                return Err(REMOVED_REASON.into());
            }
            PART if trusted => {
                if self.parts.len() + body.len() > LIMIT {
                    return Err("too much data".into());
                }
                self.parts.extend_from_slice(body);
            }
            DONE if trusted && self.received.is_none() => {
                let cells: Vec<Cell> = unpack(&std::mem::take(&mut self.parts))?;
                let theirs: Versions = serde_json::from_slice(body).map_err(|e| e.to_string())?;
                let applied = store.apply(&cells, &theirs)?;
                self.received = Some((applied, theirs));
                self.send(out, ACK, &[])?;
                self.finish(store)?;
            }
            ACK if self.sent_versions.is_some() => {
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
        if !is_id(&hello.id) || adv.len() != 16 {
            return Err("the other phone sent a bad id".into());
        }
        store.add_peer(&Peer {
            id: hello.id.clone(),
            name: hello.name.clone(),
            platform: hello.platform,
            public_key: self.remote_key.clone(),
            adv_secret: adv,
            paired_at: 0,
            last_sync: None,
            pending: 0,
            introduced_by: None,
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
                items: BTreeMap::new(),
                territories: Vec::new(),
                sent_territories: Vec::new(),
                conflicts: 0,
                introduced: Vec::new(),
                removed: Vec::new(),
            };
            return Ok(());
        }
        self.exchange(store, out)
    }

    fn exchange(&mut self, store: &mut Store, out: &mut Vec<u8>) -> Result<()> {
        let mut theirs = self.hello.as_ref().ok_or("no hello")?.versions.clone();
        let peer = self.peer.clone().unwrap_or_default();
        // either phone may have been restored from a backup: this one moves
        // its own changes past what the peer knows of them, and a peer that
        // knows less of its own changes than this phone gets them all back
        store.catch_up(&theirs)?;
        if theirs.get(&peer) < store.versions()?.get(&peer) {
            theirs.remove(&peer);
        }
        let cells = store.changes_since(&theirs)?;
        let mine = store.versions()?;
        self.status = Status::Exchanging { peer: peer.clone() };
        self.send(out, CIRCLE, &pack(&store.circle(&peer)?)?)?;
        for chunk in pack(&cells)?.chunks(CHUNK) {
            self.send(out, PART, chunk)?;
        }
        self.send(out, DONE, &serde_json::to_vec(&mine).map_err(|e| e.to_string())?)?;
        self.sent = cells.len();
        // records whose every cell goes out are new to the peer
        let new = store.unseen(&cells)?;
        self.sent_territories = store.touched(&cells, &new)?;
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
        if let Some(hello) = &self.hello {
            store.rename_peer(&peer, &hello.name)?;
        }
        let name = store.peer(&peer)?.map(|p| p.name).unwrap_or_default();
        store.log_sync(&peer, &name, self.sent, &self.sent_territories, received, &self.removed)?;
        self.status = Status::Done {
            name,
            peer,
            sent: self.sent,
            received: received.cells,
            items: received.items.clone(),
            territories: received.territories.clone(),
            sent_territories: self.sent_territories.clone(),
            conflicts: received.conflicts,
            introduced: self.introduced.clone(),
            removed: self.removed.clone(),
        };
        Ok(())
    }
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
                received: 1,
                items: BTreeMap::from([("territories".into(), 1)]),
                territories: vec![Touched {
                    id: "t2".into(),
                    number: "2".into(),
                    what: vec!["created".into()]
                }],
                sent_territories: vec![Touched {
                    id: "t1".into(),
                    number: "1".into(),
                    what: vec!["created".into()]
                }],
                conflicts: 0,
                introduced: Vec::new(),
                removed: Vec::new(),
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

    fn sync(sa: &mut Store, sb: &mut Store) -> Status {
        let mut a = Session::new(sa, Mode::Sync, true, "android").unwrap();
        let mut b = Session::new(sb, Mode::Sync, false, "android").unwrap();
        run(&mut a, sa, &mut b, sb);
        a.status().clone()
    }

    #[test]
    fn pairing_with_one_phone_joins_its_circle() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let mut sc = store("Carl");
        pair(&mut sa, &mut sb);
        // Carl pairs with Ben only, and hears about Anna from him
        pair(&mut sb, &mut sc);
        assert_eq!(sc.peers().unwrap().len(), 2);

        let Status::Done { introduced, .. } = sync(&mut sa, &mut sb) else {
            panic!()
        };
        assert_eq!(introduced, vec!["Carl".to_string()]);
        let carl = sa.peer(&sc.identity.id).unwrap().unwrap();
        assert_eq!(carl.introduced_by, Some(sb.identity.id.clone()));

        // Anna and Carl now sync without ever having met
        put(&mut sa, "t1", json!({"number": "1"}));
        assert!(matches!(sync(&mut sa, &mut sc), Status::Done { sent: 1, .. }));
        assert_eq!(sc.list("territories").unwrap().len(), 1);

        // an unpaired phone stays unpaired
        sa.remove_peer(&sc.identity.id).unwrap();
        sync(&mut sa, &mut sb);
        assert!(sa.peer(&sc.identity.id).unwrap().is_none());
    }

    #[test]
    fn changes_one_phone_of_the_circle_has_count_as_sent() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let mut sc = store("Carl");
        pair(&mut sa, &mut sb);
        pair(&mut sb, &mut sc);
        sync(&mut sa, &mut sb);
        put(&mut sa, "t1", json!({"number": "1"}));
        assert_eq!(sa.unsynced().unwrap(), 1);
        sync(&mut sa, &mut sb);
        assert_eq!(sa.unsynced().unwrap(), 0);
    }

    /// Pairs with a code up to the point where both people see it.
    fn codes_shown(sa: &mut Store, sb: &mut Store) -> (Session, Session) {
        let mut a = Session::new(sa, Mode::Pair { code: true }, true, "android").unwrap();
        let mut b = Session::new(sb, Mode::Pair { code: true }, false, "ios").unwrap();
        run(&mut a, sa, &mut b, sb);
        assert!(matches!(a.status(), Status::Confirm { .. }), "{:?}", a.status());
        assert!(matches!(b.status(), Status::Confirm { .. }), "{:?}", b.status());
        (a, b)
    }

    #[test]
    fn no_data_is_taken_before_the_code_is_confirmed() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let (mut a, mut b) = codes_shown(&mut sa, &mut sb);
        put(&mut sb, "t1", json!({"number": "1"}));
        let cells = sb.changes_since(&Versions::new()).unwrap();
        let mut out = Vec::new();
        b.send(&mut out, PART, &pack(&cells).unwrap()).unwrap();
        b.send(&mut out, DONE, b"{}").unwrap();
        a.feed(&mut sa, &out);
        assert!(matches!(a.status(), Status::Failed { .. }), "{:?}", a.status());
        assert!(sa.list("territories").unwrap().is_empty());
    }

    #[test]
    fn a_second_nonce_cannot_change_the_code() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let (mut a, mut b) = codes_shown(&mut sa, &mut sb);
        let mut out = Vec::new();
        b.send(&mut out, NONCE, &[7u8; 32]).unwrap();
        a.feed(&mut sa, &out);
        assert!(matches!(a.status(), Status::Failed { .. }), "{:?}", a.status());
    }

    #[test]
    fn a_second_commit_is_refused() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        let (mut a, mut b) = codes_shown(&mut sa, &mut sb);
        let mut out = Vec::new();
        a.send(&mut out, COMMIT, &sha256(&[&[7u8; 32]])).unwrap();
        b.feed(&mut sb, &out);
        assert!(matches!(b.status(), Status::Failed { .. }), "{:?}", b.status());
    }

    #[test]
    fn a_phone_with_a_malformed_id_does_not_pair() {
        let mut sa = store("Anna");
        let mut sb = store("Ben");
        sb.identity.id = "Ben's phone 1234".into();
        let mut a = Session::new(&sa, Mode::Pair { code: false }, true, "android").unwrap();
        let mut b = Session::new(&sb, Mode::Pair { code: false }, false, "ios").unwrap();
        run(&mut a, &mut sa, &mut b, &mut sb);
        assert!(matches!(a.status(), Status::Failed { .. }), "{:?}", a.status());
        assert!(sa.peers().unwrap().is_empty());
    }

    #[test]
    fn a_small_payload_that_unpacks_to_too_much_is_refused() {
        let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
        let zeros = vec![0u8; 1 << 20];
        for _ in 0..=(LIMIT >> 20) {
            encoder.write_all(&zeros).unwrap();
        }
        let bomb = encoder.finish().unwrap();
        assert!(bomb.len() < LIMIT / 100);
        assert_eq!(unpack::<Vec<Cell>>(&bomb).err().as_deref(), Some("too much data"));
    }

    #[test]
    fn a_phone_restored_from_a_backup_catches_up_with_its_circle() {
        let dir = std::env::temp_dir().join(format!("territories-restore-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (path, backup) = (dir.join("a.db"), dir.join("backup.db"));
        let open = || {
            let mut s = Store::open(&path).unwrap();
            s.set_name("Anna").unwrap();
            s
        };
        let mut sa = open();
        let mut sb = store("Ben");
        let mut sc = store("Carl");
        pair(&mut sa, &mut sb);
        pair(&mut sb, &mut sc);
        drop(sa);
        std::fs::copy(&path, &backup).unwrap();

        let mut sa = open();
        put(&mut sa, "t1", json!({"number": "1"}));
        put(&mut sa, "t3", json!({"number": "3"}));
        sync(&mut sa, &mut sb);
        sync(&mut sb, &mut sc);
        drop(sa);

        // the edits above are gone from this phone, and it makes a new one
        std::fs::copy(&backup, &path).unwrap();
        let mut sa = open();
        put(&mut sa, "t2", json!({"number": "2"}));
        sync(&mut sa, &mut sb);
        sync(&mut sb, &mut sc);
        for s in [&sa, &sb, &sc] {
            assert_eq!(s.list("territories").unwrap().len(), 3);
        }
        // and what it writes next is new to everyone
        put(&mut sa, "t4", json!({"number": "4"}));
        sync(&mut sa, &mut sb);
        sync(&mut sb, &mut sc);
        assert_eq!(sc.list("territories").unwrap().len(), 4);
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Anna, Ben, Carl and Xena, each paired with all the others.
    fn circle_of_four() -> [Store; 4] {
        let [mut sa, mut sb, mut sc, mut sx] = ["Anna", "Ben", "Carl", "Xena"].map(store);
        pair(&mut sa, &mut sb);
        pair(&mut sb, &mut sc);
        pair(&mut sb, &mut sx);
        sync(&mut sa, &mut sb);
        sync(&mut sc, &mut sb);
        for s in [&sa, &sb, &sc, &sx] {
            assert_eq!(s.peers().unwrap().len(), 3);
        }
        [sa, sb, sc, sx]
    }

    fn knows(s: &Store, other: &Store) -> bool {
        s.peer(&other.identity.id).unwrap().is_some()
    }

    fn removed(status: &Status) -> Vec<String> {
        match status {
            Status::Done { removed, .. } => removed.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_removal_spreads_over_the_group_and_the_removed_phone_stops() {
        let [mut sa, mut sb, mut sc, mut sx] = circle_of_four();
        sa.remove_peer(&sx.identity.id).unwrap();

        assert_eq!(removed(&sync(&mut sb, &mut sa)), vec!["Xena".to_string()]);
        assert!(sb.log().unwrap().iter().any(|e| e["detail"]["removed"] == json!(["Xena"])));
        assert!(!knows(&sb, &sx));
        // Carl hasn't heard yet and still syncs with Xena
        put(&mut sx, "t1", json!({"number": "1"}));
        assert!(matches!(sync(&mut sx, &mut sc), Status::Done { .. }));
        // Ben's news reaches Carl; Carl's stale list doesn't bring Xena back to Ben
        assert_eq!(removed(&sync(&mut sc, &mut sb)), vec!["Xena".to_string()]);
        assert!(!knows(&sc, &sx) && !knows(&sb, &sx));

        // Xena learns it the next time she meets one of them, and stops
        let status = sync(&mut sx, &mut sc);
        assert_eq!(status, Status::Failed { reason: REMOVED_REASON.into() });
        assert!(sx.is_removed().unwrap());
        assert!(sx.peers().unwrap().is_empty());
        // she keeps her data, but is no longer part of any sync
        assert_eq!(sx.list("territories").unwrap().len(), 1);
        assert!(!sa.is_removed().unwrap());
    }

    #[test]
    fn a_removed_phone_cannot_sync_back() {
        let [mut sa, mut sb, _sc, mut sx] = circle_of_four();
        sa.remove_peer(&sx.identity.id).unwrap();
        put(&mut sa, "t1", json!({"number": "1"}));
        put(&mut sx, "t2", json!({"number": "2"}));
        for status in [sync(&mut sx, &mut sa), sync(&mut sa, &mut sx)] {
            assert!(matches!(status, Status::Failed { .. }), "{status:?}");
        }
        assert_eq!(sa.list("territories").unwrap().len(), 1);
        assert_eq!(sx.list("territories").unwrap().len(), 1);
        // a phone that hasn't heard yet takes nothing from Xena on to the others
        sync(&mut sb, &mut sa);
        assert!(!knows(&sa, &sx) && !knows(&sb, &sx));
        assert!(matches!(sync(&mut sx, &mut sb), Status::Failed { .. }));
        assert_eq!(sb.list("territories").unwrap().len(), 1);
    }

    #[test]
    fn pairing_again_after_a_removal_rejoins_the_group() {
        let [mut sa, mut sb, mut sc, mut sx] = circle_of_four();
        sa.remove_peer(&sx.identity.id).unwrap();
        sync(&mut sb, &mut sa);
        sync(&mut sc, &mut sb);
        sync(&mut sx, &mut sb);
        assert!(sx.is_removed().unwrap());

        // Ben pairs with Xena in person again
        pair(&mut sb, &mut sx);
        assert!(!sx.is_removed().unwrap());
        assert_eq!(sx.peers().unwrap().len(), 3);
        sync(&mut sa, &mut sb);
        assert!(knows(&sa, &sx));
        put(&mut sx, "t1", json!({"number": "1"}));
        assert!(matches!(sync(&mut sx, &mut sa), Status::Done { sent: 1, .. }));
        // Carl heard only of the removal until now
        assert!(!knows(&sc, &sx));
        sync(&mut sc, &mut sa);
        assert!(knows(&sc, &sx));
        assert!(matches!(sync(&mut sx, &mut sc), Status::Done { .. }));
    }
}
