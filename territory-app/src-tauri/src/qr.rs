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
use sha2::Sha256;

use crate::session::{pack, unpack};
use crate::store::{Cell, Peer, Result, Store, Versions};

const CARD: &str = "OTC1:";
const BUNDLE: &str = "OTB1:";
const ID_LEN: usize = 16;

#[derive(Serialize, Deserialize)]
struct Card {
    id: String,
    name: String,
    platform: String,
    key: String,
    adv: String,
}

#[derive(Serialize, Deserialize)]
struct Contents {
    versions: Versions,
    cells: Vec<Cell>,
}

/// What this phone's pairing QR code shows.
pub fn card(store: &Store, platform: &str) -> Result<String> {
    let card = Card {
        id: store.identity.id.clone(),
        name: store.identity.name.clone(),
        platform: platform.into(),
        key: B64.encode(store.identity.public_key),
        adv: B64.encode(store.identity.adv_secret),
    };
    Ok(format!("{CARD}{}", B64.encode(pack(&card)?)))
}

/// Pairs with the phone whose card was scanned. The other phone scans this
/// one's card too, so both know each other.
pub fn add_card(store: &Store, text: &str) -> Result<Peer> {
    let body = text.trim().strip_prefix(CARD).ok_or("not a pairing code")?;
    let card: Card = unpack(&B64.decode(body).map_err(|e| e.to_string())?)?;
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
    if peer.public_key.len() != 32 || peer.id.len() != ID_LEN {
        return Err("not a pairing code".into());
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
    let contents = Contents {
        versions: store.versions()?,
        cells: store.changes_since(&store.peer_versions(peer_id)?)?,
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
    let header_text = std::str::from_utf8(header).map_err(|e| e.to_string())?;
    let (sender, recipient) = header_text.split_at(ID_LEN);
    if recipient != store.identity.id {
        return Err("this transfer is for another phone".into());
    }
    let peer = store.peer(sender)?.ok_or("the sending phone is not paired")?;
    let plain = cipher(store, &peer)?
        .decrypt(nonce.into(), Payload { msg: sealed, aad: header })
        .map_err(|_| "the transfer did not open")?;
    let contents: Contents = unpack(&plain)?;
    let applied = store.apply(&contents.cells, &contents.versions)?;
    store.log_sync(&peer.id, &peer.name, 0, &[], &applied)?;
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
        add_card(&b, &card(&a, "android").unwrap()).unwrap();
        add_card(&a, &card(&b, "ios").unwrap()).unwrap();

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
        let a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        add_card(&a, &card(&b, "ios").unwrap()).unwrap();
        add_card(&c, &card(&a, "android").unwrap()).unwrap();
        let bundle = export(&a, &b.identity.id).unwrap();
        assert!(import(&mut c, &bundle).is_err());
    }
}
