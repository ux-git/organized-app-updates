//! Plan B when Bluetooth won't do: phones scan each other's QR codes to pair,
//! and paired phones pass their changes as a sealed bundle shown as a series
//! of QR codes. Nothing can answer through a camera, so a bundle carries
//! everything the receiver may not have, sealed so only it can open it.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::ChaCha20Poly1305;
use hkdf::Hkdf;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::pack::{pack, unpack};
use crate::store::{is_id, now_secs, Cell, Peer, Result, Store, Versions};

const CARD: &str = "OTC1:";
const BUNDLE: &str = "OTB1:";
const ID_LEN: usize = 16;
/// How long a pairing code shown once stays good, in seconds.
const CARD_DAYS: i64 = 30 * 24 * 60 * 60;

/// Why a card is refused: made too long ago, or with a clock far off.
pub const CARD_OLD: &str = "the pairing code is out of date";
/// Why a card of a phone removed from the group needs a second yes.
pub const CARD_REMOVED: &str = "that device was removed from the group";

#[derive(Serialize, Deserialize)]
struct Card {
    id: String,
    name: String,
    platform: String,
    key: String,
    adv: String,
    /// When it was made; older versions leave it out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
struct Contents {
    versions: Versions,
    cells: Vec<Cell>,
    /// What the sender took the receiver to hold; older versions leave it out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    since: Option<Versions>,
}

/// A scanned card, before the person says yes to it.
#[derive(Debug, Serialize)]
pub struct CardInfo {
    pub id: String,
    pub name: String,
    pub fingerprint: String,
    /// The device was removed from the group and not paired since.
    pub removed: bool,
}

/// Eight hex digits of the key, for both people to compare.
pub fn fingerprint(key: &[u8]) -> String {
    let hash = Sha256::digest(key);
    format!("{:02X}{:02X} {:02X}{:02X}", hash[0], hash[1], hash[2], hash[3])
}

/// What this phone's pairing QR code shows.
pub fn card(store: &Store, platform: &str) -> Result<String> {
    let card = Card {
        id: store.identity.id.clone(),
        name: store.identity.name.clone(),
        platform: platform.into(),
        key: B64.encode(store.identity.public_key),
        adv: B64.encode(store.identity.adv_secret),
        at: Some(now_secs()),
    };
    Ok(format!("{CARD}{}", B64.encode(pack(&card)?)))
}

fn peer_of(store: &Store, text: &str) -> Result<Peer> {
    let body = text.trim().strip_prefix(CARD).ok_or("not a pairing code")?;
    let card: Card = unpack(&B64.decode(body).map_err(|e| e.to_string())?)?;
    let now = now_secs();
    if card.at.is_some_and(|at| at < now - CARD_DAYS || at > now + 24 * 60 * 60) {
        return Err(CARD_OLD.into());
    }
    let peer = Peer {
        id: card.id,
        name: card.name,
        platform: card.platform,
        public_key: B64.decode(card.key).map_err(|e| e.to_string())?,
        adv_secret: B64.decode(card.adv).map_err(|e| e.to_string())?,
        paired_at: 0,
        last_sync: None,
        pending: 0,
        introduced_by: None,
    };
    if peer.public_key.len() != 32 || peer.adv_secret.len() != 16 || !is_id(&peer.id) {
        return Err("not a pairing code".into());
    }
    if peer.id == store.identity.id || peer.public_key == store.identity.public_key {
        return Err("that is this phone".into());
    }
    store.check_pair(&peer.id, &peer.public_key)?;
    Ok(peer)
}

/// Reads a scanned card without pairing, for the person to confirm.
pub fn read_card(store: &Store, text: &str) -> Result<CardInfo> {
    let peer = peer_of(store, text)?;
    Ok(CardInfo {
        fingerprint: fingerprint(&peer.public_key),
        removed: store.was_removed(&peer.id, &peer.public_key)?,
        id: peer.id,
        name: peer.name,
    })
}

/// Pairs with the phone whose card was scanned. The other phone scans this
/// one's card too, so both know each other. A phone removed from the group
/// comes back only with `again`.
pub fn add_card(store: &mut Store, text: &str, again: bool) -> Result<Peer> {
    let peer = peer_of(store, text)?;
    if !again && store.was_removed(&peer.id, &peer.public_key)? {
        return Err(CARD_REMOVED.into());
    }
    store.add_peer(&peer)?;
    Ok(peer)
}

/// Both phones get the same key from their own private key and the other's
/// public one.
fn cipher(store: &Store, peer: &Peer) -> Result<ChaCha20Poly1305> {
    let public: [u8; 32] = peer.public_key.clone().try_into().map_err(|_| "bad key")?;
    let shared = x25519_dalek::StaticSecret::from(store.identity.private_key)
        .diffie_hellman(&x25519_dalek::PublicKey::from(public));
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(None, shared.as_bytes())
        .expand(b"organized-territories-qr", &mut key)
        .map_err(|e| e.to_string())?;
    Ok(ChaCha20Poly1305::new(&key.into()))
}

/// Everything the peer hasn't received as far as this phone knows, sealed for it.
pub fn export(store: &Store, peer_id: &str) -> Result<String> {
    let peer = store.peer(peer_id)?.ok_or("not paired")?;
    let since = store.peer_versions(peer_id)?;
    let contents = Contents {
        versions: store.versions()?,
        cells: store.changes_since(&since)?,
        since: Some(since),
    };
    let header = format!("{}{}", store.identity.id, peer.id);
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let sealed = cipher(store, &peer)?
        .encrypt(
            &nonce.into(),
            Payload {
                msg: &pack(&contents)?,
                aad: header.as_bytes(),
            },
        )
        .map_err(|_| "could not seal")?;
    let mut bytes = header.into_bytes();
    bytes.extend_from_slice(&nonce);
    bytes.extend_from_slice(&sealed);
    Ok(format!("{BUNDLE}{}", B64.encode(bytes)))
}

#[derive(Debug, Serialize)]
pub struct Imported {
    pub name: String,
    pub received: usize,
    pub items: std::collections::BTreeMap<String, usize>,
    pub territories: Vec<crate::store::Touched>,
}

pub fn import(store: &mut Store, text: &str) -> Result<Imported> {
    let body = text.trim().strip_prefix(BUNDLE).ok_or("not a territory transfer")?;
    let bytes = B64.decode(body).map_err(|e| e.to_string())?;
    if bytes.len() < 2 * ID_LEN + 12 {
        return Err("the transfer is incomplete".into());
    }
    let (header, rest) = bytes.split_at(2 * ID_LEN);
    let (nonce, sealed) = rest.split_at(12);
    // split as bytes: a text split inside a character would panic
    let (sender, recipient) = header.split_at(ID_LEN);
    let sender = std::str::from_utf8(sender).map_err(|e| e.to_string())?;
    if recipient != store.identity.id.as_bytes() {
        return Err("this transfer is for another phone".into());
    }
    let peer = store.peer(sender)?.ok_or("the sending phone is not paired")?;
    let plain = cipher(store, &peer)?
        .decrypt(nonce.into(), Payload { msg: sealed, aad: header })
        .map_err(|_| "the transfer did not open")?;
    let contents: Contents = unpack(&plain)?;
    // the cells start where the sender thought this phone was; where it
    // holds less, what lies between is missing, so those numbers stay
    let mine = store.versions()?;
    let adopt: Versions = match &contents.since {
        None => contents.versions.clone(),
        Some(since) => contents
            .versions
            .iter()
            .filter(|(origin, _)| {
                **origin == store.identity.id
                    || mine.get(*origin).copied().unwrap_or(0) >= since.get(*origin).copied().unwrap_or(0)
            })
            .map(|(origin, seq)| (origin.clone(), *seq))
            .collect(),
    };
    let applied = store.merge(&contents.cells, &contents.versions, &adopt)?;
    store.log_sync(&peer.id, &peer.name, 0, &[], &applied, &[])?;
    Ok(Imported {
        name: peer.name,
        received: applied.cells,
        items: applied.items,
        territories: applied.territories,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scanning_each_others_cards_pairs_and_a_bundle_carries_the_changes() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.set_name("Anna").unwrap();
        add_card(&mut b, &card(&a, "android").unwrap(), false).unwrap();
        add_card(&mut a, &card(&b, "ios").unwrap(), false).unwrap();

        a.put("territories", "t1", json!({"number": "1"}).as_object().unwrap())
            .unwrap();
        let bundle = export(&a, &b.identity.id).unwrap();
        let imported = import(&mut b, &bundle).unwrap();
        assert_eq!(imported.name, "Anna");
        assert_eq!(imported.received, 1);
        assert_eq!(b.list("territories").unwrap(), a.list("territories").unwrap());
    }

    #[test]
    fn only_the_intended_phone_opens_a_bundle() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        add_card(&mut a, &card(&b, "ios").unwrap(), false).unwrap();
        add_card(&mut c, &card(&a, "android").unwrap(), false).unwrap();
        let bundle = export(&a, &b.identity.id).unwrap();
        assert!(import(&mut c, &bundle).is_err());
    }

    #[test]
    fn a_bundle_with_a_broken_header_is_refused_without_a_crash() {
        let mut b = Store::in_memory().unwrap();
        // a two-byte character across the middle of the header
        let mut bytes = format!("{}é{}", "a".repeat(15), "b".repeat(15)).into_bytes();
        bytes.extend_from_slice(&[0u8; 40]);
        assert!(import(&mut b, &format!("{BUNDLE}{}", B64.encode(bytes))).is_err());
    }

    #[test]
    fn a_pairing_code_with_a_bad_id_or_secret_is_refused() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let good = |s: &Store| Card {
            id: s.identity.id.clone(),
            name: "Ben".into(),
            platform: "ios".into(),
            key: B64.encode(s.identity.public_key),
            adv: B64.encode(s.identity.adv_secret),
            at: None,
        };
        let bad = [
            Card { id: "éééééééé".into(), ..good(&b) },
            Card { adv: B64.encode([1u8; 2]), ..good(&b) },
        ];
        for card in bad {
            let text = format!("{CARD}{}", B64.encode(pack(&card).unwrap()));
            assert!(add_card(&mut a, &text, false).is_err());
        }
        assert!(a.peers().unwrap().is_empty());
    }

    fn card_made(s: &Store, at: Option<i64>) -> String {
        let card = Card {
            id: s.identity.id.clone(),
            name: "Ben".into(),
            platform: "ios".into(),
            key: B64.encode(s.identity.public_key),
            adv: B64.encode(s.identity.adv_secret),
            at,
        };
        format!("{CARD}{}", B64.encode(pack(&card).unwrap()))
    }

    #[test]
    fn a_card_is_read_before_it_pairs_and_only_while_it_is_new() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let info = read_card(&a, &card(&b, "ios").unwrap()).unwrap();
        assert_eq!(info.fingerprint, fingerprint(&b.identity.public_key));
        assert!(!info.removed);
        assert!(a.peers().unwrap().is_empty());
        let old = card_made(&b, Some(now_secs() - CARD_DAYS - 60));
        assert_eq!(add_card(&mut a, &old, false).err().as_deref(), Some(CARD_OLD));
        // one from before cards had a time still pairs
        add_card(&mut a, &card_made(&b, None), false).unwrap();
        assert_eq!(a.peers().unwrap().len(), 1);
    }

    #[test]
    fn a_removed_device_comes_back_only_when_asked_twice() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let text = card(&b, "ios").unwrap();
        add_card(&mut a, &text, false).unwrap();
        a.remove_peer(&b.identity.id).unwrap();
        assert!(read_card(&a, &text).unwrap().removed);
        assert_eq!(add_card(&mut a, &text, false).err().as_deref(), Some(CARD_REMOVED));
        assert!(a.peers().unwrap().is_empty());
        add_card(&mut a, &text, true).unwrap();
        assert!(!a.was_removed(&b.identity.id, &b.identity.public_key).unwrap());
    }

    #[test]
    fn a_card_with_a_paired_id_and_another_key_is_refused() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let mut fake = Store::in_memory().unwrap();
        add_card(&mut a, &card(&b, "ios").unwrap(), false).unwrap();
        fake.identity.id = b.identity.id.clone();
        let text = card(&fake, "ios").unwrap();
        assert_eq!(read_card(&a, &text).err().as_deref(), Some(crate::store::PAIR_CLASH));
        assert_eq!(a.peer(&b.identity.id).unwrap().unwrap().public_key, b.identity.public_key);
    }

    #[test]
    fn a_bundle_for_a_phone_that_holds_less_than_thought_leaves_the_gap_open() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        add_card(&mut b, &card(&a, "android").unwrap(), false).unwrap();
        add_card(&mut a, &card(&b, "ios").unwrap(), false).unwrap();
        for n in ["1", "2", "3"] {
            a.put("territories", &format!("t{n}"), json!({"number": n}).as_object().unwrap())
                .unwrap();
        }
        // Anna believes Ben has her first two changes; he has none
        let two = Versions::from([(a.identity.id.clone(), 2)]);
        a.record_sync(&b.identity.id, &two).unwrap();
        let bundle = export(&a, &b.identity.id).unwrap();
        assert_eq!(import(&mut b, &bundle).unwrap().received, 1);
        assert_eq!(b.versions().unwrap().get(&a.identity.id), None);
        // so the next sync still brings the first two
        let cells = a.changes_since(&b.versions().unwrap()).unwrap();
        b.apply(&cells, &a.versions().unwrap()).unwrap();
        assert_eq!(b.list("territories").unwrap().len(), 3);
    }
}
