//! Sync over the local network, for when Bluetooth can't reach: a computer
//! without it, Bluetooth turned off, or one side that can't advertise.
//!
//! Each device listens on a TCP port and announces it with Bonjour/mDNS
//! (`_territories._tcp`). The announcement carries the same 12-byte beacon
//! as the Bluetooth advertisement, so only paired devices recognise it, it
//! changes every 15 minutes, and it tells whether the data differs. When it
//! does, one side connects and the usual session runs over the stream: the
//! same Noise handshake, the same check that the key is paired.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use rand::RngCore;

use crate::session::{self, Mode, Session, Status};
use crate::store::{now_secs, Result, Store};
use crate::{changed, store, PLATFORM};

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
    let mut advert = discovery::Advert::new(&name, port, &current)
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

fn consider(found: discovery::Found) {
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
        pub beacon: Vec<u8>,
    }

    fn txt(beacon: &[u8]) -> Vec<u8> {
        let entry = format!("b={}", hex(beacon));
        let mut out = vec![entry.len() as u8];
        out.extend_from_slice(entry.as_bytes());
        out
    }

    fn read_txt(bytes: &[u8]) -> Option<Vec<u8>> {
        let mut rest = bytes;
        while let Some((&len, tail)) = rest.split_first() {
            let entry = tail.get(..len as usize)?;
            if let Some(value) = entry.strip_prefix(b"b=") {
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

    pub struct Advert(Ref);

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
        pub fn new(name: &str, port: u16, beacon: &[u8]) -> Option<Self> {
            let name = CString::new(name).ok()?;
            let regtype = CString::new(SERVICE).ok()?;
            let record = txt(beacon);
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
            Some(Self(sd))
        }

        pub fn update(&mut self, beacon: &[u8]) {
            let record = txt(beacon);
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
            out.beacon = read_txt(unsafe { std::slice::from_raw_parts(txt, txt_len as usize) });
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
            let (Some(host), Some(beacon)) = (out.host, out.beacon) else {
                continue;
            };
            let addrs = (host.trim_end_matches('.'), out.port)
                .to_socket_addrs()
                .map(|a| a.filter(SocketAddr::is_ipv4).collect())
                .unwrap_or_default();
            found.push(Found { addrs, beacon });
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
        pub beacon: Vec<u8>,
    }

    pub struct Advert {
        name: String,
        port: u16,
        fullname: String,
    }

    fn info(name: &str, port: u16, beacon: &[u8]) -> Option<ServiceInfo> {
        let value = hex(beacon);
        ServiceInfo::new(
            &ty(),
            name,
            &format!("{name}.local."),
            (),
            port,
            &[("b", value.as_str())][..],
        )
        .ok()
        .map(ServiceInfo::enable_addr_auto)
    }

    impl Advert {
        pub fn new(name: &str, port: u16, beacon: &[u8]) -> Option<Self> {
            let info = info(name, port, beacon)?;
            let fullname = info.get_fullname().to_string();
            daemon()?.register(info).ok()?;
            Some(Self {
                name: name.into(),
                port,
                fullname,
            })
        }

        pub fn update(&mut self, beacon: &[u8]) {
            if let (Some(daemon), Some(info)) = (daemon(), info(&self.name, self.port, beacon)) {
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
            let Some(beacon) = service.get_property_val_str("b").and_then(unhex) else {
                continue;
            };
            let port = service.get_port();
            let addrs = service
                .get_addresses_v4()
                .into_iter()
                .map(|ip| SocketAddr::new(IpAddr::V4(ip), port))
                .collect();
            found.push(Found { addrs, beacon });
        }
        let _ = daemon.stop_browse(&ty());
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "needs the network's mDNS"]
    fn bonjour_finds_an_announcement() {
        let advert = discovery::Advert::new("t-test-a", 4321, &[7u8; 12]).unwrap();
        let found = discovery::scan("t-test-b");
        drop(advert);
        assert!(
            found.iter().any(|f| f.beacon == [7u8; 12]),
            "{}",
            found.len()
        );
    }
}
