//! Pairing by holding two phones together, over NFC. One phone answers as a
//! card (Android's host card emulation), the other reads it (an Android phone
//! in reader mode, or an iPhone with Core NFC). The pairing session's bytes
//! ride in ISO 7816 APDUs: the reader sends its part in each command and the
//! card answers with its own, until both sessions are done.
//!
//! The APDUs stay short (at most 240 bytes of data each way), which every
//! phone's NFC stack handles without extended-length support.

use crate::session::{Mode, Session, Status};
use crate::store::{Result, Store};

/// Our proprietary application id: F0 followed by "ORGTERR".
pub const AID: [u8; 8] = [0xF0, 0x4F, 0x52, 0x47, 0x54, 0x45, 0x52, 0x52];
const INS_SELECT: u8 = 0xA4;
const INS_DATA: u8 = 0x10;
const CLA_DATA: u8 = 0x80;
pub const MAX_DATA: usize = 240;
/// Rounds before the reader gives up; a pairing takes about ten.
const MAX_ROUNDS: usize = 200;

const OK: [u8; 2] = [0x90, 0x00];
const NOT_FOUND: [u8; 2] = [0x6A, 0x82];
const NOT_READY: [u8; 2] = [0x69, 0x85];

fn take(outbox: &mut Vec<u8>) -> Vec<u8> {
    let n = outbox.len().min(MAX_DATA);
    outbox.drain(..n).collect()
}

fn finished(status: &Status) -> bool {
    matches!(status, Status::Done { .. } | Status::Failed { .. })
}

/// The phone being read.
#[derive(Default)]
pub struct Card {
    session: Option<Session>,
    outbox: Vec<u8>,
}

impl Card {
    /// Answers one command. `listening` is false unless Meet is open, so a
    /// phone never pairs from a tap it didn't expect.
    pub fn apdu(&mut self, store: &mut Store, apdu: &[u8], listening: bool, platform: &str) -> Vec<u8> {
        if apdu.len() < 4 {
            return NOT_FOUND.to_vec();
        }
        let (ins, body) = (apdu[1], &apdu[4..]);
        if ins == INS_SELECT {
            let aid = body.get(1..1 + usize::from(*body.first().unwrap_or(&0)));
            if !listening || aid != Some(&AID[..]) {
                return NOT_FOUND.to_vec();
            }
            return match Session::new(store, Mode::Pair { code: false }, false, platform) {
                Ok(mut session) => {
                    self.outbox = session.start();
                    self.session = Some(session);
                    OK.to_vec()
                }
                Err(_) => NOT_READY.to_vec(),
            };
        }
        let Some(session) = self.session.as_mut() else {
            return NOT_READY.to_vec();
        };
        if ins != INS_DATA {
            return NOT_FOUND.to_vec();
        }
        // a lone fifth byte is Le (no data); otherwise it is Lc, then the data
        let data = if body.len() > 1 {
            let length = usize::from(body[0]);
            body.get(1..1 + length).unwrap_or(&body[1..])
        } else {
            &[][..]
        };
        if !data.is_empty() {
            let out = session.feed(store, data);
            self.outbox.extend(out);
        }
        let mut response = take(&mut self.outbox);
        response.extend_from_slice(&OK);
        response
    }

    pub fn status(&self) -> Option<&Status> {
        self.session.as_ref().map(|s| s.status())
    }

    /// Everything this side had to say has been read.
    pub fn done(&self) -> bool {
        self.status().is_some_and(finished) && self.outbox.is_empty()
    }
}

/// The phone doing the reading.
pub struct Reader {
    session: Session,
    outbox: Vec<u8>,
    selected: bool,
    rounds: usize,
    quiet: bool,
}

pub fn select_apdu() -> Vec<u8> {
    let mut apdu = vec![0x00, INS_SELECT, 0x04, 0x00, AID.len() as u8];
    apdu.extend_from_slice(&AID);
    apdu.push(0x00);
    apdu
}

fn data_apdu(data: &[u8]) -> Vec<u8> {
    let mut apdu = vec![CLA_DATA, INS_DATA, 0x00, 0x00];
    if !data.is_empty() {
        apdu.push(data.len() as u8);
        apdu.extend_from_slice(data);
    }
    // Le: whatever the card has, up to 256 bytes
    apdu.push(0x00);
    apdu
}

impl Reader {
    pub fn new(store: &Store, platform: &str) -> Result<Self> {
        let mut session = Session::new(store, Mode::Pair { code: false }, true, platform)?;
        let outbox = session.start();
        Ok(Reader {
            session,
            outbox,
            selected: false,
            rounds: 0,
            quiet: false,
        })
    }

    /// The next command to send, or None when the pairing is over.
    pub fn next(&mut self) -> Option<Vec<u8>> {
        if !self.selected {
            return Some(select_apdu());
        }
        let over = finished(self.session.status()) && self.outbox.is_empty() && self.quiet;
        if over || self.rounds >= MAX_ROUNDS {
            return None;
        }
        self.rounds += 1;
        Some(data_apdu(&take(&mut self.outbox)))
    }

    /// The card's answer to the last command.
    pub fn response(&mut self, store: &mut Store, response: &[u8]) -> Result<()> {
        if response.len() < 2 || response[response.len() - 2..] != OK {
            return Err("the other phone is not in Meet".into());
        }
        let data = &response[..response.len() - 2];
        if !self.selected {
            self.selected = true;
            return Ok(());
        }
        self.quiet = data.is_empty();
        if !data.is_empty() {
            let out = self.session.feed(store, data);
            self.outbox.extend(out);
        }
        Ok(())
    }

    pub fn status(&self) -> &Status {
        self.session.status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn android_routes_our_application_id_to_the_card() {
        let xml = include_str!("../gen/android/app/src/main/res/xml/tap_aid.xml");
        let hex: String = AID.iter().map(|b| format!("{b:02X}")).collect();
        assert!(xml.contains(&format!("\"{hex}\"")), "tap_aid.xml must list {hex}");
    }

    fn store(name: &str) -> Store {
        let mut s = Store::in_memory().unwrap();
        s.set_name(name).unwrap();
        s
    }

    /// Runs a tap: the reader's commands go to the card and back.
    fn tap(reader_store: &mut Store, card_store: &mut Store, card: &mut Card, listening: bool) -> Reader {
        let mut reader = Reader::new(reader_store, "ios").unwrap();
        while let Some(command) = reader.next() {
            assert!(command.len() <= 5 + MAX_DATA + 1, "command too long");
            let answer = card.apdu(card_store, &command, listening, "android");
            assert!(answer.len() <= MAX_DATA + 2, "answer too long");
            if reader.response(reader_store, &answer).is_err() {
                break;
            }
        }
        reader
    }

    #[test]
    fn a_tap_pairs_both_phones() {
        let mut a = store("Anna");
        let mut b = store("Ben");
        let mut card = Card::default();
        let reader = tap(&mut a, &mut b, &mut card, true);
        assert!(matches!(reader.status(), Status::Done { name, .. } if name == "Ben"));
        assert!(matches!(card.status(), Some(Status::Done { name, .. }) if name == "Anna"));
        assert!(card.done());
        assert_eq!(a.peers().unwrap()[0].name, "Ben");
        assert_eq!(b.peers().unwrap()[0].name, "Anna");
    }

    #[test]
    fn a_phone_not_in_meet_does_not_answer() {
        let mut a = store("Anna");
        let mut b = store("Ben");
        let mut card = Card::default();
        let reader = tap(&mut a, &mut b, &mut card, false);
        assert!(matches!(reader.status(), Status::Connecting));
        assert!(a.peers().unwrap().is_empty());
        assert!(b.peers().unwrap().is_empty());
    }

    #[test]
    fn long_names_and_many_known_phones_still_fit_the_short_apdus() {
        let mut a = store(&"Annemarie ".repeat(20));
        let mut b = store("Ben");
        // versions from many phones make the hello message longer than one APDU
        for i in 0..40 {
            let mut other = store(&format!("P{i}"));
            other
                .put("t", &format!("x{i}"), json!({"n": i}).as_object().unwrap())
                .unwrap();
            let cells = other.changes_since(&Default::default()).unwrap();
            a.apply(&cells, &other.versions().unwrap()).unwrap();
        }
        let mut card = Card::default();
        let reader = tap(&mut a, &mut b, &mut card, true);
        assert!(matches!(reader.status(), Status::Done { .. }), "{:?}", reader.status());
        assert!(card.done());
    }

    #[test]
    fn select_with_another_application_id_is_refused() {
        let mut b = store("Ben");
        let mut card = Card::default();
        let mut select = select_apdu();
        select[6] ^= 0xFF;
        assert_eq!(card.apdu(&mut b, &select, true, "android"), NOT_FOUND.to_vec());
    }
}
