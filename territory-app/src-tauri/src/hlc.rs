use std::time::{SystemTime, UNIX_EPOCH};

/// A hybrid logical clock. Its stamps are strings that sort in time order, so
/// the newest write to a field wins by plain string comparison; the device id
/// at the end breaks ties between two phones writing in the same millisecond.
pub struct Clock {
    ms: u64,
    counter: u32,
}

/// The most a counter can hold in its six hex digits.
const MAX_COUNTER: u32 = 0xff_ffff;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn encode(ms: u64, counter: u32, device: &str) -> String {
    format!("{ms:013x}-{counter:06x}-{device}")
}

/// Only stamps in the exact shape `encode` makes sort in time order.
fn decode(stamp: &str) -> Option<(u64, u32)> {
    let mut parts = stamp.splitn(3, '-');
    let (ms, counter, device) = (parts.next()?, parts.next()?, parts.next()?);
    let hex = |s: &str, n| s.len() == n && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    if !hex(ms, 13) || !hex(counter, 6) || device.is_empty() {
        return None;
    }
    Some((u64::from_str_radix(ms, 16).ok()?, u32::from_str_radix(counter, 16).ok()?))
}

pub fn valid(stamp: &str) -> bool {
    decode(stamp).is_some()
}

impl Clock {
    pub fn new(last: Option<&str>) -> Self {
        let (ms, counter) = last.and_then(decode).unwrap_or((0, 0));
        Clock { ms, counter }
    }

    pub fn tick(&mut self, device: &str) -> String {
        let now = now_ms();
        if now > self.ms {
            self.ms = now;
            self.counter = 0;
        } else if self.counter < MAX_COUNTER {
            self.counter += 1;
        } else {
            self.ms += 1;
            self.counter = 0;
        }
        encode(self.ms, self.counter, device)
    }

    /// Moves the clock past a stamp from another phone, so a later local edit
    /// wins over it even when this phone's wall clock runs behind.
    pub fn observe(&mut self, stamp: &str) {
        if let Some(seen) = decode(stamp) {
            if seen > (self.ms, self.counter) {
                (self.ms, self.counter) = seen;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_sort_in_time_order() {
        let mut clock = Clock::new(None);
        let a = clock.tick("aa");
        let b = clock.tick("aa");
        assert!(b > a);
        assert!(encode(0x10, 0, "zz") < encode(0x100, 0, "aa"));
    }

    #[test]
    fn a_later_local_edit_beats_a_stamp_from_the_future() {
        let mut clock = Clock::new(None);
        let future = encode(now_ms() + 60_000, 3, "bb");
        clock.observe(&future);
        assert!(clock.tick("aa") > future);
    }

    #[test]
    fn a_full_counter_moves_on_to_the_next_millisecond() {
        let last = encode(now_ms() + 60_000, MAX_COUNTER, "aa");
        let mut clock = Clock::new(Some(&last));
        let next = clock.tick("aa");
        assert!(next > last && valid(&next), "{next} after {last}");
    }

    #[test]
    fn only_well_formed_stamps_are_valid() {
        assert!(valid(&encode(1, 2, "aa")));
        for stamp in ["", "zz", "0000000000001-000002", "0000000000001-0000002-aa", "000000000000A-000002-aa"] {
            assert!(!valid(stamp), "{stamp}");
        }
    }
}
