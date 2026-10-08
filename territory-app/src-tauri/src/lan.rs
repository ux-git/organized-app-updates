//! Sync over the local network, for when Bluetooth can't reach: a computer
//! without it, Bluetooth turned off, or one side that can't advertise.
//!
//! Each device listens on a TCP port and announces it with Bonjour/mDNS
//! (`_territories._tcp`). The announcement carries the same 12-byte beacon
//! as the Bluetooth advertisement, so only paired devices recognise it, it
//! changes every 15 minutes, and it tells whether the data differs. When it
//! does, one side connects and the usual session runs over the stream: the
//! same Noise handshake, the same check that the key is paired.
//!
//! A computer without Bluetooth pairs here too: it shows an invite (a QR code
//! with its key, its addresses and a 6-digit code), and a phone scans it or
//! types the code. Both prove they know the code before anything is shared.
//!
//! Nothing leaves the local network: only private and link-local addresses
//! on the same subnet are dialled or answered, never through a VPN or the
//! mobile network.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use rand::{Rng, RngCore};
use serde::{Deserialize, Serialize};

use crate::pack::{pack, unpack};
use crate::session::{self, Mode, Session, Status, WRONG_CODE};
use crate::store::{now_secs, Result, Store};
use crate::{changed, emit, store, PLATFORM};

pub const SERVICE: &str = "_territories._tcp";
const SCAN_EVERY: Duration = Duration::from_secs(30);
/// The device with the larger id waits this long for the other to connect.
const DEFER: Duration = Duration::from_secs(50);
/// After a try, the same peer rests this long.
const RETRY: Duration = Duration::from_secs(60);
const IO_TIMEOUT: Duration = Duration::from_secs(20);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
/// Strangers can connect too; they fail the handshake, but not in numbers.
const MAX_INBOUND: usize = 4;

static INBOUND: AtomicUsize = AtomicUsize::new(0);

#[derive(Default)]
struct Peers {
    running: Vec<String>,
    tried: HashMap<String, Instant>,
    waiting: HashMap<String, Instant>,
}

static PEERS: Mutex<Option<Peers>> = Mutex::new(None);

fn with_peers<T>(f: impl FnOnce(&mut Peers) -> T) -> Option<T> {
    PEERS
        .lock()
        .ok()
        .map(|mut p| f(p.get_or_insert_with(Peers::default)))
}

pub fn start() {
    thread::spawn(|| loop {
        let _ = serve();
        // the network went away, or iOS took the sockets while in the background
        thread::sleep(SCAN_EVERY);
    });
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok())
        .collect()
}

fn beacon() -> Option<Vec<u8>> {
    let store = store().ok()?;
    if store.paired().ok()?.is_empty() {
        return None;
    }
    session::beacon(&store, now_secs()).ok()
}

fn serve() -> std::io::Result<()> {
    // nothing to announce until a device is paired
    let mut current = loop {
        if let Some(b) = beacon() {
            break b;
        }
        thread::sleep(SCAN_EVERY);
    };

    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))?;
    let port = listener.local_addr()?.port();
    let alive = Arc::new(AtomicBool::new(true));
    {
        let alive = alive.clone();
        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => accept(stream),
                    Err(_) => break,
                }
            }
            alive.store(false, Ordering::Relaxed);
        });
    }

    let mut id = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut id);
    // a fresh name each start, so the announcement says nothing lasting
    let name = format!("t-{}", hex(&id));
    let mut advert = discovery::Advert::new(&name, port, "b", &current)
        .ok_or_else(|| std::io::Error::other("no mDNS"))?;

    thread::sleep(Duration::from_secs(3));
    while alive.load(Ordering::Relaxed) {
        if let Some(next) = beacon() {
            if next != current {
                advert.update(&next);
                current = next;
            }
        }
        for found in discovery::scan(&name) {
            consider(found);
        }
        thread::sleep(SCAN_EVERY);
    }
    Ok(())
}

// ---- only the local network ----

/// A range the internet doesn't route: private, link-local or this device.
fn is_private(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_link_local() || ip.is_loopback()
}

/// Interfaces that can carry a private range far away: VPNs, tunnels and the
/// mobile network.
fn is_remote(interface: &if_addrs::Interface) -> bool {
    const NAMES: [&str; 13] = [
        "tun", "tap", "wg", "ppp", "ipsec", "vpn", "wireguard", "tailscale", "zerotier",
        "rmnet", "ccmni", "pdp_ip", "wwan",
    ];
    let name = interface.name.to_lowercase();
    interface.is_p2p() || NAMES.iter().any(|n| name.contains(n))
}

/// This device's own networks: address and mask of each private one.
fn local_nets() -> Vec<(Ipv4Addr, Ipv4Addr)> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| {
            !i.is_loopback()
                && !is_remote(i)
                && !matches!(i.oper_status, if_addrs::IfOperStatus::Down)
        })
        .filter_map(|i| match i.addr {
            if_addrs::IfAddr::V4(v4) if is_private(v4.ip) => Some((v4.ip, v4.netmask)),
            _ => None,
        })
        .collect()
}

/// Whether the address is on one of these networks, so the bytes stay in it.
fn on_nets(addr: &SocketAddr, nets: &[(Ipv4Addr, Ipv4Addr)]) -> bool {
    let IpAddr::V4(ip) = addr.ip() else { return false };
    if ip.is_loopback() {
        return true;
    }
    let bits = |ip: Ipv4Addr| u32::from(ip);
    is_private(ip)
        && nets
            .iter()
            .any(|(own, mask)| bits(*own) & bits(*mask) == bits(ip) & bits(*mask))
}

fn reachable(addr: &SocketAddr) -> bool {
    on_nets(addr, &local_nets())
}

/// Whether this device is on a local network another could reach it on.
pub fn has_network() -> bool {
    !local_nets().is_empty()
}

fn consider(mut found: discovery::Found) {
    found.addrs.retain(reachable);
    if found.addrs.is_empty() {
        return;
    }
    let Ok(held) = store() else { return };
    let Ok(Some(sighting)) = session::recognise(&held, &found.beacon, now_secs()) else {
        return;
    };
    let me = held.identity.id.clone();
    drop(held);
    let peer = sighting.peer;
    let now = Instant::now();
    let go = with_peers(|p| {
        if !sighting.needs_sync {
            p.waiting.remove(&peer);
            return false;
        }
        if p.running.contains(&peer) || p.tried.get(&peer).is_some_and(|t| now - *t < RETRY) {
            return false;
        }
        // the smaller id connects; the other only when it never came
        let since = *p.waiting.entry(peer.clone()).or_insert(now);
        if me > peer && now - since < DEFER {
            return false;
        }
        p.waiting.remove(&peer);
        p.tried.insert(peer.clone(), now);
        p.running.push(peer.clone());
        true
    })
    .unwrap_or(false);
    if !go {
        return;
    }
    thread::spawn(move || {
        for addr in found.addrs {
            if let Ok(stream) = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
                converse(stream, true, store);
                break;
            }
        }
        with_peers(|p| p.running.retain(|r| r != &peer));
    });
}

fn accept(stream: TcpStream) {
    if !stream.peer_addr().is_ok_and(|addr| reachable(&addr)) {
        return;
    }
    if INBOUND.fetch_add(1, Ordering::SeqCst) >= MAX_INBOUND {
        INBOUND.fetch_sub(1, Ordering::SeqCst);
        return;
    }
    thread::spawn(move || {
        converse(stream, false, store);
        INBOUND.fetch_sub(1, Ordering::SeqCst);
    });
}

/// Runs one sync session over the stream; `open` gives the store for each step.
fn converse<G>(
    mut stream: TcpStream,
    initiator: bool,
    open: impl Fn() -> Result<G>,
) -> Option<Status>
where
    G: std::ops::DerefMut<Target = Store>,
{
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_nodelay(true);
    let mut session = {
        let store = open().ok()?;
        Session::new(&store, Mode::Sync, initiator, PLATFORM).ok()?
    };
    stream.write_all(&session.start()).ok()?;
    let mut buf = vec![0u8; 16 * 1024];
    while !session.finished() {
        let n = match stream.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        let out = {
            let mut store = open().ok()?;
            session.feed(&mut store, &buf[..n])
        };
        if matches!(session.status(), Status::Done { received, .. } if *received > 0) {
            changed();
        }
        if !out.is_empty() && stream.write_all(&out).is_err() {
            break;
        }
    }
    Some(session.status().clone())
}

// ---- pairing by invite ----

pub const INVITE: &str = "OTL1:";
/// How long one code stays good; the page shows a fresh one after.
const INVITE_LIFE: Duration = Duration::from_secs(5 * 60);
/// Wrong codes one invite takes before it closes.
const INVITE_TRIES: u32 = 5;
/// How long a connection may stay quiet before it counts as lost.
const QUIET: Duration = Duration::from_millis(250);

pub const NO_NETWORK: &str = "no local network";
pub const OTHER_NETWORK: &str = "the devices are on different networks";
pub const NOT_REACHABLE: &str = "the other device can't be reached";
pub const NOT_FOUND: &str = "no device shows this code";
pub const EXPIRED: &str = "the code has expired";
pub const TOO_MANY: &str = "too many wrong codes";
pub const LOST: &str = "the connection broke";

#[derive(Serialize, Deserialize)]
struct Card {
    name: String,
    key: String,
    code: String,
    addrs: Vec<String>,
}

#[derive(Serialize)]
pub struct Offer {
    text: String,
    code: String,
    name: String,
    /// When the code runs out, in ms.
    expires: i64,
}

/// The invite on screen: its id, and the person's answer once given.
static HOST: Mutex<Option<(u64, Option<bool>)>> = Mutex::new(None);

fn hosting(id: u64) -> bool {
    HOST.lock().is_ok_and(|h| h.is_some_and(|(open, _)| open == id))
}

fn take_answer(id: u64) -> Option<bool> {
    let mut host = HOST.lock().ok()?;
    match host.as_mut() {
        Some((open, answer)) if *open == id => answer.take(),
        _ => None,
    }
}

/// Where an invite finds the store: the app's own, or a test's.
type Open = fn() -> Result<std::sync::MutexGuard<'static, Store>>;

/// Opens an invite: listens on every local network, announces itself for a
/// typed code, and gives the QR code's text. A new one replaces the last.
pub fn host() -> Result<Offer> {
    host_with(store)
}

fn host_with(open: Open) -> Result<Offer> {
    let nets = local_nets();
    if nets.is_empty() {
        return Err(NO_NETWORK.into());
    }
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let code = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
    let (name, key) = {
        let store = open()?;
        (store.identity.name.clone(), store.identity.public_key)
    };
    let card = Card {
        name: name.clone(),
        key: B64.encode(key),
        code: code.clone(),
        addrs: nets.iter().map(|(ip, _)| format!("{ip}:{port}")).collect(),
    };
    let text = format!("{INVITE}{}", B64.encode(pack(&card)?));
    let id = rand::thread_rng().gen();
    *HOST.lock().map_err(|e| e.to_string())? = Some((id, None));
    let secret = session::invite_secret(&code);
    thread::spawn(move || run_host(id, listener, secret, open));
    Ok(Offer {
        text,
        code,
        name,
        expires: (now_secs() + INVITE_LIFE.as_secs() as i64) * 1000,
    })
}

/// The person's yes or no to the device that answered the invite.
pub fn answer(accept: bool) {
    if let Ok(mut host) = HOST.lock() {
        if let Some((_, answer)) = host.as_mut() {
            *answer = Some(accept);
        }
    }
}

pub fn close() {
    if let Ok(mut host) = HOST.lock() {
        *host = None;
    }
}

fn run_host(id: u64, listener: TcpListener, secret: [u8; 16], open: Open) {
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let mut name = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut name);
    // only says an invite is open; the code itself never goes on the air
    let _advert = discovery::Advert::new(&format!("i-{}", hex(&name)), port, "i", &[1]);
    let end = Instant::now() + INVITE_LIFE;
    let mut wrong = 0;
    while hosting(id) {
        if Instant::now() > end {
            report("host", &failed(EXPIRED));
            break;
        }
        match listener.accept() {
            Ok((stream, addr)) if reachable(&addr) => {
                let _ = stream.set_nonblocking(false);
                let mut session = match open()
                    .and_then(|s| Session::new(&s, Mode::Invite { secret, key: None }, false, PLATFORM))
                {
                    Ok(session) => session,
                    Err(_) => break,
                };
                match talk(stream, &mut session, "host", Some(id), open) {
                    Status::Done { .. } => break,
                    Status::Failed { reason, .. } if reason == WRONG_CODE => {
                        wrong += 1;
                        if wrong >= INVITE_TRIES {
                            report("host", &failed(TOO_MANY));
                            break;
                        }
                    }
                    _ => {}
                }
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(QUIET),
            Err(_) => break,
        }
    }
    if let Ok(mut host) = HOST.lock() {
        if host.is_some_and(|(open, _)| open == id) {
            *host = None;
        }
    }
}

fn failed(reason: &str) -> Status {
    Status::Failed {
        reason: reason.into(),
        peer: None,
    }
}

/// Tells the page how the pairing goes, from the side that showed the code
/// (`host`) or the one that scanned or typed it (`join`).
fn report(role: &str, status: &Status) {
    let mut value = serde_json::to_value(status).unwrap_or_default();
    if let Some(map) = value.as_object_mut() {
        map.insert("role".into(), role.into());
    }
    emit("invite", value);
}

/// Runs an invite's session over the stream. The host's person answers in
/// between (`host` is the invite's id); a stranger's silent try isn't shown.
fn talk<G>(
    mut stream: TcpStream,
    session: &mut Session,
    role: &str,
    host: Option<u64>,
    open: impl Fn() -> Result<G>,
) -> Status
where
    G: std::ops::DerefMut<Target = Store>,
{
    let _ = stream.set_read_timeout(Some(QUIET));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_nodelay(true);
    let mut heard = Instant::now();
    let mut shown: Option<Status> = None;
    let mut buf = vec![0u8; 16 * 1024];
    if stream.write_all(&session.start()).is_err() {
        return failed(NOT_REACHABLE);
    }
    loop {
        let waiting = matches!(session.status(), Status::Confirm { .. });
        if let (true, Some(id)) = (waiting, host) {
            if !hosting(id) {
                break;
            }
            if let Some(accept) = take_answer(id) {
                let out = match open() {
                    Ok(mut store) => session.confirm(&mut store, accept),
                    Err(_) => break,
                };
                if stream.write_all(&out).is_err() {
                    break;
                }
            }
        }
        let status = session.status().clone();
        // the wrong code is news; a connection that never got that far isn't
        let worth = !matches!(status, Status::Connecting)
            && !matches!(&status, Status::Failed { reason, .. } if reason == "handshake failed");
        if worth && shown.as_ref() != Some(&status) {
            report(role, &status);
            shown = Some(status);
        }
        if session.finished() {
            break;
        }
        // a person may take a while to say yes; bytes may not
        let patience = if waiting { INVITE_LIFE } else { IO_TIMEOUT };
        if heard.elapsed() > patience {
            break;
        }
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                heard = Instant::now();
                let out = match open() {
                    Ok(mut store) => session.feed(&mut store, &buf[..n]),
                    Err(_) => break,
                };
                if !out.is_empty() && stream.write_all(&out).is_err() {
                    break;
                }
            }
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => break,
        }
    }
    let status = session.status().clone();
    if matches!(status, Status::Done { .. }) {
        changed();
        return status;
    }
    if session.finished() {
        return status;
    }
    let lost = failed(LOST);
    if shown.is_some() {
        report(role, &lost);
    }
    lost
}

/// Joins the invite whose QR code was scanned.
pub fn join(text: &str) -> Result<Status> {
    let body = text.trim().strip_prefix(INVITE).ok_or("not an invite")?;
    let card: Card = unpack(&B64.decode(body).map_err(|e| e.to_string())?)?;
    let key: [u8; 32] = B64
        .decode(&card.key)
        .ok()
        .and_then(|key| key.try_into().ok())
        .ok_or("not an invite")?;
    let addrs: Vec<SocketAddr> = card.addrs.iter().filter_map(|a| a.parse().ok()).collect();
    let nets = local_nets();
    if nets.is_empty() {
        return Err(NO_NETWORK.into());
    }
    let near: Vec<SocketAddr> = addrs.into_iter().filter(|a| on_nets(a, &nets)).collect();
    if near.is_empty() {
        return Err(OTHER_NETWORK.into());
    }
    let mode = Mode::Invite {
        secret: session::invite_secret(&card.code),
        key: Some(key),
    };
    for addr in near {
        if let Ok(stream) = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
            let mut session = Session::new(&*store()?, mode, true, PLATFORM)?;
            return Ok(talk(stream, &mut session, "join", None, store));
        }
    }
    Err(NOT_REACHABLE.into())
}

/// Joins the invite whose 6-digit code was typed: it asks every open invite
/// on the network, as only the code tells them apart.
pub fn join_code(code: &str) -> Result<Status> {
    join_code_with(code, store)
}

fn join_code_with(code: &str, open: Open) -> Result<Status> {
    let code: String = code.chars().filter(char::is_ascii_digit).collect();
    if code.len() != 6 {
        return Err(WRONG_CODE.into());
    }
    let nets = local_nets();
    if nets.is_empty() {
        return Err(NO_NETWORK.into());
    }
    let mode = Mode::Invite {
        secret: session::invite_secret(&code),
        key: None,
    };
    let mut last = None;
    for _ in 0..3 {
        for found in discovery::scan("").into_iter().filter(|f| f.invite) {
            for addr in found.addrs.iter().filter(|a| on_nets(a, &nets)) {
                let Ok(stream) = TcpStream::connect_timeout(addr, CONNECT_TIMEOUT) else {
                    continue;
                };
                let mut session = Session::new(&*open()?, mode, true, PLATFORM)?;
                let status = talk(stream, &mut session, "join", None, open);
                if !matches!(&status, Status::Failed { reason, .. } if reason == WRONG_CODE) {
                    return Ok(status);
                }
                last = Some(status);
                break;
            }
        }
        if last.is_some() {
            break;
        }
    }
    last.ok_or_else(|| NOT_FOUND.into())
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod discovery {
    //! Apple's own Bonjour (dns_sd): an iPhone may not send multicast itself.

    use std::ffi::{c_char, c_void, CStr, CString};
    use std::net::{SocketAddr, ToSocketAddrs};
    use std::ptr;
    use std::time::{Duration, Instant};

    use super::{hex, unhex, SERVICE};

    type Ref = *mut c_void;
    const FLAGS_ADD: u32 = 0x2;

    type RegisterReply =
        extern "C" fn(Ref, u32, i32, *const c_char, *const c_char, *const c_char, *mut c_void);
    type BrowseReply =
        extern "C" fn(Ref, u32, u32, i32, *const c_char, *const c_char, *const c_char, *mut c_void);
    type ResolveReply = extern "C" fn(
        Ref,
        u32,
        u32,
        i32,
        *const c_char,
        *const c_char,
        u16,
        u16,
        *const u8,
        *mut c_void,
    );

    extern "C" {
        fn DNSServiceRegister(
            sd: *mut Ref,
            flags: u32,
            iface: u32,
            name: *const c_char,
            regtype: *const c_char,
            domain: *const c_char,
            host: *const c_char,
            port: u16,
            txt_len: u16,
            txt: *const c_void,
            reply: Option<RegisterReply>,
            ctx: *mut c_void,
        ) -> i32;
        fn DNSServiceUpdateRecord(
            sd: Ref,
            record: *mut c_void,
            flags: u32,
            len: u16,
            data: *const c_void,
            ttl: u32,
        ) -> i32;
        fn DNSServiceBrowse(
            sd: *mut Ref,
            flags: u32,
            iface: u32,
            regtype: *const c_char,
            domain: *const c_char,
            reply: BrowseReply,
            ctx: *mut c_void,
        ) -> i32;
        fn DNSServiceResolve(
            sd: *mut Ref,
            flags: u32,
            iface: u32,
            name: *const c_char,
            regtype: *const c_char,
            domain: *const c_char,
            reply: ResolveReply,
            ctx: *mut c_void,
        ) -> i32;
        fn DNSServiceRefSockFD(sd: Ref) -> i32;
        fn DNSServiceProcessResult(sd: Ref) -> i32;
        fn DNSServiceRefDeallocate(sd: Ref);
    }

    pub struct Found {
        pub addrs: Vec<SocketAddr>,
        /// A paired device's beacon; empty for an open invite.
        pub beacon: Vec<u8>,
        pub invite: bool,
    }

    fn txt(key: &str, value: &[u8]) -> Vec<u8> {
        let entry = format!("{key}={}", hex(value));
        let mut out = vec![entry.len() as u8];
        out.extend_from_slice(entry.as_bytes());
        out
    }

    fn read_txt(bytes: &[u8], key: &str) -> Option<Vec<u8>> {
        let prefix = format!("{key}=");
        let mut rest = bytes;
        while let Some((&len, tail)) = rest.split_first() {
            let entry = tail.get(..len as usize)?;
            if let Some(value) = entry.strip_prefix(prefix.as_bytes()) {
                return unhex(std::str::from_utf8(value).ok()?);
            }
            rest = &tail[len as usize..];
        }
        None
    }

    /// Waits up to `wait` for the reference's answers.
    fn pump(sd: Ref, wait: Duration, mut done: impl FnMut() -> bool) {
        let end = Instant::now() + wait;
        let fd = unsafe { DNSServiceRefSockFD(sd) };
        while !done() {
            let left = end.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            let mut poll = libc::pollfd {
                fd,
                events: libc::POLLIN,
                revents: 0,
            };
            if unsafe { libc::poll(&mut poll, 1, left.as_millis() as i32) } <= 0 {
                break;
            }
            if unsafe { DNSServiceProcessResult(sd) } != 0 {
                break;
            }
        }
    }

    pub struct Advert(Ref, &'static str);

    // the reference is only used from the thread that owns the Advert
    unsafe impl Send for Advert {}

    extern "C" fn registered(
        _: Ref,
        _: u32,
        _: i32,
        _: *const c_char,
        _: *const c_char,
        _: *const c_char,
        _: *mut c_void,
    ) {
    }

    impl Advert {
        pub fn new(name: &str, port: u16, key: &'static str, value: &[u8]) -> Option<Self> {
            let name = CString::new(name).ok()?;
            let regtype = CString::new(SERVICE).ok()?;
            let record = txt(key, value);
            let mut sd: Ref = ptr::null_mut();
            let err = unsafe {
                DNSServiceRegister(
                    &mut sd,
                    0,
                    0,
                    name.as_ptr(),
                    regtype.as_ptr(),
                    ptr::null(),
                    ptr::null(),
                    port.to_be(),
                    record.len() as u16,
                    record.as_ptr().cast(),
                    Some(registered),
                    ptr::null_mut(),
                )
            };
            if err != 0 {
                return None;
            }
            pump(sd, Duration::from_secs(2), || false);
            Some(Self(sd, key))
        }

        pub fn update(&mut self, value: &[u8]) {
            let record = txt(self.1, value);
            unsafe {
                DNSServiceUpdateRecord(
                    self.0,
                    ptr::null_mut(),
                    0,
                    record.len() as u16,
                    record.as_ptr().cast(),
                    0,
                );
            }
        }
    }

    impl Drop for Advert {
        fn drop(&mut self) {
            unsafe { DNSServiceRefDeallocate(self.0) };
        }
    }

    struct Seen {
        name: CString,
        domain: CString,
        iface: u32,
    }

    extern "C" fn browsed(
        _: Ref,
        flags: u32,
        iface: u32,
        err: i32,
        name: *const c_char,
        _: *const c_char,
        domain: *const c_char,
        ctx: *mut c_void,
    ) {
        if err != 0 || flags & FLAGS_ADD == 0 || name.is_null() || domain.is_null() {
            return;
        }
        let seen = unsafe { &mut *(ctx as *mut Vec<Seen>) };
        let (name, domain) = unsafe { (CStr::from_ptr(name), CStr::from_ptr(domain)) };
        seen.push(Seen {
            name: name.to_owned(),
            domain: domain.to_owned(),
            iface,
        });
    }

    #[derive(Default)]
    struct Resolved {
        host: Option<String>,
        port: u16,
        beacon: Option<Vec<u8>>,
        invite: bool,
    }

    extern "C" fn resolved(
        _: Ref,
        _: u32,
        _: u32,
        err: i32,
        _: *const c_char,
        host: *const c_char,
        port: u16,
        txt_len: u16,
        txt: *const u8,
        ctx: *mut c_void,
    ) {
        if err != 0 || host.is_null() {
            return;
        }
        let out = unsafe { &mut *(ctx as *mut Resolved) };
        out.host = Some(
            unsafe { CStr::from_ptr(host) }
                .to_string_lossy()
                .into_owned(),
        );
        out.port = u16::from_be(port);
        if !txt.is_null() {
            let record = unsafe { std::slice::from_raw_parts(txt, txt_len as usize) };
            out.beacon = read_txt(record, "b");
            out.invite = read_txt(record, "i").is_some();
        }
    }

    pub fn scan(skip: &str) -> Vec<Found> {
        let Ok(regtype) = CString::new(SERVICE) else {
            return Vec::new();
        };
        let mut seen: Vec<Seen> = Vec::new();
        let mut sd: Ref = ptr::null_mut();
        let ctx = &mut seen as *mut Vec<Seen> as *mut c_void;
        let err =
            unsafe { DNSServiceBrowse(&mut sd, 0, 0, regtype.as_ptr(), ptr::null(), browsed, ctx) };
        if err != 0 {
            return Vec::new();
        }
        pump(sd, Duration::from_secs(3), || false);
        unsafe { DNSServiceRefDeallocate(sd) };

        let mut found = Vec::new();
        for item in seen {
            if item.name.to_bytes() == skip.as_bytes() {
                continue;
            }
            let mut out = Resolved::default();
            let mut sd: Ref = ptr::null_mut();
            let ctx = &mut out as *mut Resolved as *mut c_void;
            let err = unsafe {
                DNSServiceResolve(
                    &mut sd,
                    0,
                    item.iface,
                    item.name.as_ptr(),
                    regtype.as_ptr(),
                    item.domain.as_ptr(),
                    resolved,
                    ctx,
                )
            };
            if err != 0 {
                continue;
            }
            pump(sd, Duration::from_secs(2), || out.host.is_some());
            unsafe { DNSServiceRefDeallocate(sd) };
            let Some(host) = out.host else { continue };
            if out.beacon.is_none() && !out.invite {
                continue;
            }
            let addrs = (host.trim_end_matches('.'), out.port)
                .to_socket_addrs()
                .map(|a| a.filter(SocketAddr::is_ipv4).collect())
                .unwrap_or_default();
            found.push(Found {
                addrs,
                beacon: out.beacon.unwrap_or_default(),
                invite: out.invite,
            });
        }
        found
    }
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
mod discovery {
    //! Android and Windows: mDNS from the mdns-sd crate (Android holds a
    //! multicast lock in MainActivity meanwhile).

    use std::net::{IpAddr, SocketAddr};
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};

    use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

    use super::{hex, unhex, SERVICE};

    static DAEMON: OnceLock<Option<ServiceDaemon>> = OnceLock::new();

    fn daemon() -> Option<&'static ServiceDaemon> {
        DAEMON.get_or_init(|| ServiceDaemon::new().ok()).as_ref()
    }

    fn ty() -> String {
        format!("{SERVICE}.local.")
    }

    pub struct Found {
        pub addrs: Vec<SocketAddr>,
        /// A paired device's beacon; empty for an open invite.
        pub beacon: Vec<u8>,
        pub invite: bool,
    }

    pub struct Advert {
        name: String,
        port: u16,
        key: &'static str,
        fullname: String,
    }

    fn info(name: &str, port: u16, key: &str, value: &[u8]) -> Option<ServiceInfo> {
        let value = hex(value);
        ServiceInfo::new(
            &ty(),
            name,
            &format!("{name}.local."),
            (),
            port,
            &[(key, value.as_str())][..],
        )
        .ok()
        .map(ServiceInfo::enable_addr_auto)
    }

    impl Advert {
        pub fn new(name: &str, port: u16, key: &'static str, value: &[u8]) -> Option<Self> {
            let info = info(name, port, key, value)?;
            let fullname = info.get_fullname().to_string();
            daemon()?.register(info).ok()?;
            Some(Self {
                name: name.into(),
                port,
                key,
                fullname,
            })
        }

        pub fn update(&mut self, value: &[u8]) {
            if let (Some(daemon), Some(info)) = (daemon(), info(&self.name, self.port, self.key, value)) {
                let _ = daemon.register(info);
            }
        }
    }

    impl Drop for Advert {
        fn drop(&mut self) {
            if let Some(daemon) = daemon() {
                let _ = daemon.unregister(&self.fullname);
            }
        }
    }

    pub fn scan(skip: &str) -> Vec<Found> {
        let Some(daemon) = daemon() else {
            return Vec::new();
        };
        let Ok(events) = daemon.browse(&ty()) else {
            return Vec::new();
        };
        let own = format!("{skip}.{}", ty());
        let end = Instant::now() + Duration::from_secs(3);
        let mut found = Vec::new();
        while let Some(left) = end.checked_duration_since(Instant::now()) {
            let Ok(event) = events.recv_timeout(left) else {
                break;
            };
            let ServiceEvent::ServiceResolved(service) = event else {
                continue;
            };
            if service.get_fullname() == own {
                continue;
            }
            let beacon = service.get_property_val_str("b").and_then(unhex);
            let invite = service.get_property_val_str("i").is_some();
            if beacon.is_none() && !invite {
                continue;
            }
            let port = service.get_port();
            let addrs = service
                .get_addresses_v4()
                .into_iter()
                .map(|ip| SocketAddr::new(IpAddr::V4(ip), port))
                .collect();
            found.push(Found {
                addrs,
                beacon: beacon.unwrap_or_default(),
                invite,
            });
        }
        let _ = daemon.stop_browse(&ty());
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    #[test]
    fn hex_round_trips() {
        let bytes = [0u8, 1, 0xab, 0xff, 0x10, 0x7f];
        assert_eq!(unhex(&hex(&bytes)).unwrap(), bytes);
        assert!(unhex("abc").is_none());
        assert!(unhex("zz").is_none());
    }

    fn paired(name_a: &str, name_b: &str) -> (Mutex<Store>, Mutex<Store>) {
        let mut a = Store::in_memory().unwrap();
        a.set_name(name_a).unwrap();
        let mut b = Store::in_memory().unwrap();
        b.set_name(name_b).unwrap();
        // pair the two in memory, as the Bluetooth pairing would
        let mut sa = Session::new(&a, Mode::Pair { code: true }, true, "ios").unwrap();
        let mut sb = Session::new(&b, Mode::Pair { code: true }, false, "android").unwrap();
        let mut to_b = sa.start();
        let mut to_a = sb.start();
        for _ in 0..20 {
            let next_a = sb.feed(&mut b, &std::mem::take(&mut to_b));
            let next_b = sa.feed(&mut a, &std::mem::take(&mut to_a));
            to_a.extend(next_a);
            to_b.extend(next_b);
        }
        let mut to_b = sa.confirm(&mut a, true);
        let mut to_a = sb.confirm(&mut b, true);
        for _ in 0..20 {
            let next_a = sb.feed(&mut b, &std::mem::take(&mut to_b));
            let next_b = sa.feed(&mut a, &std::mem::take(&mut to_a));
            to_a.extend(next_a);
            to_b.extend(next_b);
        }
        assert_eq!(a.paired().unwrap().len(), 1);
        (Mutex::new(a), Mutex::new(b))
    }

    #[test]
    fn a_sync_runs_over_tcp() {
        let (a, b) = paired("Anna", "Ben");
        let mut fields = serde_json::Map::new();
        fields.insert("name".into(), serde_json::json!("Altstadt"));
        a.lock().unwrap().put("territories", "t1", &fields).unwrap();

        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let b = Arc::new(b);
        let server = {
            let b = b.clone();
            thread::spawn(move || {
                let (stream, _) = listener.accept().unwrap();
                converse(stream, false, || b.lock().map_err(|e| e.to_string()))
            })
        };
        let stream = TcpStream::connect(addr).unwrap();
        let ours = converse(stream, true, || a.lock().map_err(|e| e.to_string())).unwrap();
        let theirs = server.join().unwrap().unwrap();
        assert!(matches!(ours, Status::Done { .. }), "{ours:?}");
        assert!(
            matches!(theirs, Status::Done { received: 1.., .. }),
            "{theirs:?}"
        );
    }

    #[test]
    fn a_stranger_gets_no_sync() {
        let (a, _) = paired("Anna", "Ben");
        let stranger = Mutex::new(Store::in_memory().unwrap());
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            converse(stream, false, || a.lock().map_err(|e| e.to_string()))
        });
        let stream = TcpStream::connect(addr).unwrap();
        let ours = converse(stream, true, || stranger.lock().map_err(|e| e.to_string())).unwrap();
        let theirs = server.join().unwrap().unwrap();
        assert!(matches!(ours, Status::Failed { .. }), "{ours:?}");
        assert!(matches!(theirs, Status::Failed { .. }), "{theirs:?}");
    }

    #[test]
    fn only_addresses_on_this_network_count() {
        let nets = [(Ipv4Addr::new(192, 168, 1, 20), Ipv4Addr::new(255, 255, 255, 0))];
        let at = |a: [u8; 4]| SocketAddr::from((a, 4000));
        assert!(on_nets(&at([192, 168, 1, 7]), &nets));
        assert!(on_nets(&at([127, 0, 0, 1]), &nets));
        // another private network, reachable only through a router or VPN
        assert!(!on_nets(&at([192, 168, 2, 7]), &nets));
        assert!(!on_nets(&at([10, 0, 0, 7]), &nets));
        // a public address, even on a network that claims it
        let public = [(Ipv4Addr::new(8, 8, 8, 1), Ipv4Addr::new(255, 255, 255, 0))];
        assert!(!on_nets(&at([8, 8, 8, 8]), &public));
    }

    #[test]
    fn an_invite_pairs_over_tcp_once_the_host_says_yes() {
        let host = Mutex::new(Store::in_memory().unwrap());
        host.lock().unwrap().set_name("Office PC").unwrap();
        let phone = Mutex::new(Store::in_memory().unwrap());
        phone.lock().unwrap().set_name("Anna").unwrap();
        let mut fields = serde_json::Map::new();
        fields.insert("name".into(), serde_json::json!("Altstadt"));
        host.lock().unwrap().put("territories", "t1", &fields).unwrap();
        let key = host.lock().unwrap().identity.public_key;
        let secret = session::invite_secret("123456");

        let id = 77;
        *HOST.lock().unwrap() = Some((id, None));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let host = Arc::new(host);
        let server = {
            let host = host.clone();
            thread::spawn(move || {
                let (stream, _) = listener.accept().unwrap();
                let mut session = Session::new(
                    &host.lock().unwrap(),
                    Mode::Invite { secret, key: None },
                    false,
                    "desktop",
                )
                .unwrap();
                talk(stream, &mut session, "host", Some(id), || {
                    host.lock().map_err(|e| e.to_string())
                })
            })
        };
        // the person at the computer says yes a moment later
        let answer = thread::spawn(|| {
            thread::sleep(Duration::from_millis(600));
            answer(true);
        });
        let stream = TcpStream::connect(addr).unwrap();
        let mut session = Session::new(
            &phone.lock().unwrap(),
            Mode::Invite { secret, key: Some(key) },
            true,
            "android",
        )
        .unwrap();
        let ours = talk(stream, &mut session, "join", None, || {
            phone.lock().map_err(|e| e.to_string())
        });
        answer.join().unwrap();
        let theirs = server.join().unwrap();
        close();
        assert!(matches!(ours, Status::Done { received: 1, .. }), "{ours:?}");
        assert!(matches!(theirs, Status::Done { .. }), "{theirs:?}");
        assert_eq!(host.lock().unwrap().peers().unwrap().len(), 1);
    }

    static HOSTING: OnceLock<Mutex<Store>> = OnceLock::new();
    static JOINING: OnceLock<Mutex<Store>> = OnceLock::new();

    fn named(cell: &'static OnceLock<Mutex<Store>>, name: &str) -> Open {
        let mut store = Store::in_memory().unwrap();
        store.set_name(name).unwrap();
        let _ = cell.set(Mutex::new(store));
        if std::ptr::eq(cell, &HOSTING) {
            || HOSTING.get().unwrap().lock().map_err(|e| e.to_string())
        } else {
            || JOINING.get().unwrap().lock().map_err(|e| e.to_string())
        }
    }

    #[test]
    #[ignore = "needs a local network with mDNS"]
    fn a_typed_code_finds_the_computer_and_pairs() {
        let host = named(&HOSTING, "Office PC");
        let phone = named(&JOINING, "Anna");
        let offer = host_with(host).unwrap();
        let yes = thread::spawn(|| {
            thread::sleep(Duration::from_secs(1));
            // until the phone has asked, a yes waits in the slot
            for _ in 0..40 {
                answer(true);
                thread::sleep(Duration::from_millis(250));
            }
        });
        let status = join_code_with(&offer.code, phone).unwrap();
        close();
        yes.join().unwrap();
        assert!(matches!(status, Status::Done { .. }), "{status:?}");
        assert_eq!(host().unwrap().paired().unwrap().len(), 1);
    }

    #[test]
    #[ignore = "needs a local network with mDNS"]
    fn a_wrong_typed_code_pairs_nothing() {
        let host = named(&HOSTING, "Office PC");
        let phone = named(&JOINING, "Anna");
        let offer = host_with(host).unwrap();
        let wrong = format!("{:06}", (offer.code.parse::<u32>().unwrap() + 1) % 1_000_000);
        let status = join_code_with(&wrong, phone).unwrap();
        close();
        assert!(matches!(&status, Status::Failed { reason, .. } if reason == WRONG_CODE), "{status:?}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "needs the network's mDNS"]
    fn bonjour_finds_an_announcement() {
        let advert = discovery::Advert::new("t-test-a", 4321, "b", &[7u8; 12]).unwrap();
        let found = discovery::scan("t-test-b");
        drop(advert);
        assert!(
            found.iter().any(|f| f.beacon == [7u8; 12]),
            "{}",
            found.len()
        );
    }
}
