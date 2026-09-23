use std::collections::BTreeMap;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::hlc::Clock;

pub type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The highest change number seen from each phone. Sending a phone only the
/// cells above its numbers is all a sync needs.
pub type Versions = BTreeMap<String, i64>;

/// One field of one record, with the stamp that decides which write wins and
/// the phone and change number it was written under.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Cell {
    pub t: String,
    pub i: String,
    pub f: String,
    pub v: Value,
    pub s: String,
    pub o: String,
    pub q: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub platform: String,
    #[serde(skip)]
    pub public_key: Vec<u8>,
    #[serde(skip)]
    pub adv_secret: Vec<u8>,
    pub paired_at: i64,
    pub last_sync: Option<i64>,
    /// Changes this phone has that the peer hasn't received yet.
    pub pending: i64,
    /// The phone that introduced this one, when it wasn't paired in person.
    #[serde(default)]
    pub introduced_by: Option<String>,
}

/// A paired phone as passed on to the rest of the circle, with what the
/// sender knows it holds.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Member {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub key: String,
    pub adv: String,
    #[serde(default)]
    pub held: Versions,
}

/// What a sync brought in: stored cells, the records they belong to per
/// table, and how many fields had been changed on both sides.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Applied {
    pub cells: usize,
    pub items: BTreeMap<String, usize>,
    pub conflicts: usize,
}

pub struct Identity {
    pub id: String,
    pub name: String,
    pub private_key: [u8; 32],
    pub public_key: [u8; 32],
    pub adv_secret: [u8; 16],
}

const DELETED: &str = "_deleted";
/// Fields whose clashes nobody needs to hear about.
const QUIET: [&str; 2] = ["order", DELETED];

pub struct Store {
    conn: Connection,
    pub identity: Identity,
    clock: Clock,
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::init(Connection::open(path).map_err(err)?)
    }

    pub fn in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory().map_err(err)?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value BLOB NOT NULL);
             CREATE TABLE IF NOT EXISTS cells(
               tbl TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
               value TEXT NOT NULL, stamp TEXT NOT NULL,
               origin TEXT NOT NULL, seq INTEGER NOT NULL,
               PRIMARY KEY(tbl, id, field));
             CREATE INDEX IF NOT EXISTS cells_origin ON cells(origin, seq);
             CREATE TABLE IF NOT EXISTS versions(origin TEXT PRIMARY KEY, seq INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS peers(
               id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
               public_key BLOB NOT NULL, adv_secret BLOB NOT NULL,
               paired_at INTEGER NOT NULL, last_sync INTEGER,
               versions TEXT NOT NULL DEFAULT '{}');
             CREATE TABLE IF NOT EXISTS removed(id TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS conflicts(
               tbl TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
               kept TEXT NOT NULL, lost TEXT NOT NULL, lost_by TEXT NOT NULL,
               at INTEGER NOT NULL, PRIMARY KEY(tbl, id, field));
             CREATE TABLE IF NOT EXISTS log(
               at INTEGER NOT NULL, peer TEXT NOT NULL, name TEXT NOT NULL,
               sent INTEGER NOT NULL, received INTEGER NOT NULL, items TEXT NOT NULL);",
        )
        .map_err(err)?;
        // added in 0.6; fails harmlessly once the column exists
        let _ = conn.execute("ALTER TABLE peers ADD COLUMN introduced_by TEXT", []);

        let identity = load_identity(&conn)?;
        let last: Option<String> = conn
            .query_row("SELECT max(stamp) FROM cells", [], |r| r.get(0))
            .map_err(err)?;
        Ok(Store {
            conn,
            identity,
            clock: Clock::new(last.as_deref()),
        })
    }

    pub fn set_name(&mut self, name: &str) -> Result<()> {
        set_meta(&self.conn, "name", name.as_bytes())?;
        self.identity.name = name.to_string();
        Ok(())
    }

    /// The live records of a table, each with its `id`. A record deleted on
    /// one phone while another phone edited it stays: the later edit wins.
    pub fn list(&self, table: &str) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, field, value, stamp FROM cells WHERE tbl = ?1 ORDER BY id")
            .map_err(err)?;
        let rows = stmt
            .query_map([table], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(err)?;

        #[derive(Default)]
        struct Record {
            fields: Map<String, Value>,
            deleted: Option<String>,
            newest: String,
        }
        let mut records: BTreeMap<String, Record> = BTreeMap::new();
        for row in rows {
            let (id, field, value, stamp) = row.map_err(err)?;
            let value: Value = serde_json::from_str(&value).map_err(err)?;
            let record = records.entry(id).or_default();
            if field == DELETED {
                if value == Value::Bool(true) {
                    record.deleted = Some(stamp);
                }
            } else {
                record.newest = record.newest.clone().max(stamp);
                record.fields.insert(field, value);
            }
        }
        Ok(records
            .into_iter()
            .filter(|(_, r)| r.deleted.as_ref().is_none_or(|d| &r.newest > d))
            .map(|(id, mut r)| {
                r.fields.insert("id".into(), Value::String(id));
                Value::Object(r.fields)
            })
            .collect())
    }

    /// One stored record, deleted or not, for describing a conflict.
    fn record(&self, table: &str, id: &str) -> Result<Map<String, Value>> {
        let mut stmt = self
            .conn
            .prepare("SELECT field, value FROM cells WHERE tbl = ?1 AND id = ?2")
            .map_err(err)?;
        let rows = stmt
            .query_map([table, id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        let mut fields = Map::new();
        for row in rows {
            let (field, value) = row.map_err(err)?;
            fields.insert(field, serde_json::from_str(&value).map_err(err)?);
        }
        fields.insert("id".into(), Value::String(id.into()));
        Ok(fields)
    }

    /// Writes the fields that differ from what is stored. Returns how many.
    pub fn put(&mut self, table: &str, id: &str, fields: &Map<String, Value>) -> Result<usize> {
        self.write(table, id, fields, false)
    }

    /// `always` writes even an unchanged value, with a new stamp.
    fn write(&mut self, table: &str, id: &str, fields: &Map<String, Value>, always: bool) -> Result<usize> {
        let mut fields = fields.clone();
        let deleted: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, DELETED],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        // writing to a deleted record (an import, an undo) brings it back
        if deleted.as_deref() == Some("true") && !fields.contains_key(DELETED) {
            fields.insert(DELETED.into(), Value::Bool(false));
        }
        let tx = self.conn.transaction().map_err(err)?;
        let mut seq: i64 = tx
            .query_row(
                "SELECT seq FROM versions WHERE origin = ?1",
                [&self.identity.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?
            .unwrap_or(0);

        let mut written = 0;
        for (field, value) in &fields {
            if field == "id" {
                continue;
            }
            let text = value.to_string();
            let current: Option<String> = tx
                .query_row(
                    "SELECT value FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                    params![table, id, field],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if !always && current.as_deref() == Some(text.as_str()) {
                continue;
            }
            seq += 1;
            let stamp = self.clock.tick(&self.identity.id);
            tx.execute(
                "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![table, id, field, text, stamp, self.identity.id, seq],
            )
            .map_err(err)?;
            // an edit here settles a clash on that field
            tx.execute(
                "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, field],
            )
            .map_err(err)?;
            written += 1;
        }
        tx.execute(
            "INSERT OR REPLACE INTO versions VALUES (?1, ?2)",
            params![self.identity.id, seq],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(written)
    }

    /// A deletion is a field like any other, so it syncs and can lose to a
    /// newer edit. Always stamped anew: the record may have been deleted
    /// before and brought back by an edit from another phone.
    pub fn remove(&mut self, table: &str, id: &str) -> Result<()> {
        let mut fields = Map::new();
        fields.insert(DELETED.into(), Value::Bool(true));
        self.write(table, id, &fields, true).map(|_| ())
    }

    pub fn versions(&self) -> Result<Versions> {
        let mut stmt = self
            .conn
            .prepare("SELECT origin, seq FROM versions")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    /// Every stored cell a phone with these versions hasn't seen.
    pub fn changes_since(&self, seen: &Versions) -> Result<Vec<Cell>> {
        let mut stmt = self
            .conn
            .prepare("SELECT tbl, id, field, value, stamp, origin, seq FROM cells ORDER BY origin, seq")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, i64>(6)?,
                ))
            })
            .map_err(err)?;
        let mut cells = Vec::new();
        for row in rows {
            let (t, i, f, v, s, o, q) = row.map_err(err)?;
            if q > seen.get(&o).copied().unwrap_or(0) {
                cells.push(Cell {
                    t,
                    i,
                    f,
                    v: serde_json::from_str(&v).map_err(err)?,
                    s,
                    o,
                    q,
                });
            }
        }
        Ok(cells)
    }

    /// Keeps each incoming cell that is newer than the stored one, then takes
    /// over the sender's versions: what it didn't send, it has overwritten.
    ///
    /// Two writes to the same field clash only when neither phone had seen
    /// the other's (the version vectors tell). The newer one still wins, so
    /// every phone ends up the same, but the other value is kept in
    /// `conflicts` for someone to look at.
    pub fn apply(&mut self, cells: &[Cell], sender: &Versions) -> Result<Applied> {
        let mine = self.versions()?;
        let tx = self.conn.transaction().map_err(err)?;
        let mut applied = Applied::default();
        let mut records = std::collections::BTreeSet::new();
        for cell in cells {
            let stored: Option<(String, String, String, i64)> = tx
                .query_row(
                    "SELECT stamp, value, origin, seq FROM cells
                     WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                    params![cell.t, cell.i, cell.f],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()
                .map_err(err)?;
            let incoming = cell.v.to_string();
            let clashes = applied.conflicts;
            let wins = stored.as_ref().is_none_or(|(stamp, ..)| stamp < &cell.s);

            if let Some((_, value, origin, seq)) = &stored {
                let they_missed_ours = sender.get(origin).copied().unwrap_or(0) < *seq;
                let we_missed_theirs = mine.get(&cell.o).copied().unwrap_or(0) < cell.q;
                if they_missed_ours
                    && we_missed_theirs
                    && origin != &cell.o
                    && value != &incoming
                    && !QUIET.contains(&cell.f.as_str())
                {
                    let (kept, lost, lost_by) = if wins {
                        (&incoming, value, origin)
                    } else {
                        (value, &incoming, &cell.o)
                    };
                    tx.execute(
                        "INSERT OR REPLACE INTO conflicts VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![cell.t, cell.i, cell.f, kept, lost, lost_by, now_secs()],
                    )
                    .map_err(err)?;
                    applied.conflicts += 1;
                }
            }
            if !wins {
                continue;
            }
            if applied.conflicts == clashes {
                // a later edit, made knowing both values, settles an old clash
                tx.execute(
                    "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                    params![cell.t, cell.i, cell.f],
                )
                .map_err(err)?;
            }
            tx.execute(
                "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![cell.t, cell.i, cell.f, incoming, cell.s, cell.o, cell.q],
            )
            .map_err(err)?;
            self.clock.observe(&cell.s);
            applied.cells += 1;
            if records.insert((cell.t.clone(), cell.i.clone())) {
                *applied.items.entry(cell.t.clone()).or_default() += 1;
            }
        }
        for (origin, seq) in sender {
            if origin == &self.identity.id {
                continue;
            }
            tx.execute(
                "INSERT INTO versions VALUES (?1, ?2)
                 ON CONFLICT(origin) DO UPDATE SET seq = max(seq, excluded.seq)",
                params![origin, seq],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(applied)
    }

    /// Fields changed on two phones at once, newest first, with the record
    /// they belong to.
    pub fn conflicts(&self) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT tbl, id, field, kept, lost, lost_by, at FROM conflicts ORDER BY at DESC",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, i64>(6)?,
                ))
            })
            .map_err(err)?;
        let names: BTreeMap<String, String> =
            self.peers()?.into_iter().map(|p| (p.id, p.name)).collect();
        let mut list = Vec::new();
        for row in rows {
            let (table, id, field, kept, lost, lost_by, at) = row.map_err(err)?;
            let parse = |text: &str| serde_json::from_str::<Value>(text).unwrap_or(Value::Null);
            list.push(serde_json::json!({
                "table": table,
                "id": id,
                "field": field,
                "kept": parse(&kept),
                "lost": parse(&lost),
                "mine": lost_by == self.identity.id,
                "by": names.get(&lost_by).cloned().unwrap_or_default(),
                "at": at,
                "record": self.record(&table, &id)?,
            }));
        }
        Ok(list)
    }

    /// Settles a clash: with `use_other`, the value that lost is written
    /// again as a new edit, so it wins on every phone.
    pub fn resolve(&mut self, table: &str, id: &str, field: &str, use_other: bool) -> Result<()> {
        let lost: Option<String> = self
            .conn
            .query_row(
                "SELECT lost FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, field],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        if let (true, Some(lost)) = (use_other, lost) {
            let mut fields = Map::new();
            fields.insert(field.into(), serde_json::from_str(&lost).map_err(err)?);
            self.put(table, id, &fields)?;
        }
        self.conn
            .execute(
                "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, field],
            )
            .map_err(err)?;
        Ok(())
    }

    pub fn log_sync(&self, peer: &str, name: &str, sent: usize, applied: &Applied) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO log VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    now_secs(),
                    peer,
                    name,
                    sent as i64,
                    applied.cells as i64,
                    serde_json::to_string(&applied.items).map_err(err)?
                ],
            )
            .map_err(err)?;
        self.conn
            .execute(
                "DELETE FROM log WHERE rowid NOT IN (SELECT rowid FROM log ORDER BY at DESC LIMIT 50)",
                [],
            )
            .map_err(err)?;
        Ok(())
    }

    /// The latest syncs, newest first.
    pub fn log(&self) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare("SELECT at, peer, name, sent, received, items FROM log ORDER BY at DESC LIMIT 20")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(serde_json::json!({
                    "at": r.get::<_, i64>(0)?,
                    "peer": r.get::<_, String>(1)?,
                    "name": r.get::<_, String>(2)?,
                    "sent": r.get::<_, i64>(3)?,
                    "received": r.get::<_, i64>(4)?,
                    "items": serde_json::from_str::<Value>(&r.get::<_, String>(5)?)
                        .unwrap_or(Value::Null),
                }))
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    pub fn peers(&self) -> Result<Vec<Peer>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, platform, public_key, adv_secret, paired_at, last_sync, versions,
                   introduced_by
                 FROM peers ORDER BY name",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    Peer {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        platform: r.get(2)?,
                        public_key: r.get(3)?,
                        adv_secret: r.get(4)?,
                        paired_at: r.get(5)?,
                        last_sync: r.get(6)?,
                        pending: 0,
                        introduced_by: r.get(8)?,
                    },
                    r.get::<_, String>(7)?,
                ))
            })
            .map_err(err)?;
        let mut peers = Vec::new();
        for row in rows {
            let (mut peer, versions) = row.map_err(err)?;
            let seen: Versions = serde_json::from_str(&versions).unwrap_or_default();
            peer.pending = self.changes_since(&seen)?.len() as i64;
            peers.push(peer);
        }
        Ok(peers)
    }

    pub fn peer(&self, id: &str) -> Result<Option<Peer>> {
        Ok(self.peers()?.into_iter().find(|p| p.id == id))
    }

    pub fn peer_by_key(&self, public_key: &[u8]) -> Result<Option<Peer>> {
        Ok(self.peers()?.into_iter().find(|p| p.public_key == public_key))
    }

    pub fn peer_versions(&self, id: &str) -> Result<Versions> {
        let text: Option<String> = self
            .conn
            .query_row("SELECT versions FROM peers WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?;
        Ok(text
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default())
    }

    pub fn add_peer(&self, peer: &Peer) -> Result<()> {
        if peer.id == self.identity.id {
            return Err("that is this phone".into());
        }
        self.conn
            .execute(
                "INSERT INTO peers(id, name, platform, public_key, adv_secret, paired_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                   platform = excluded.platform, public_key = excluded.public_key,
                   adv_secret = excluded.adv_secret",
                params![
                    peer.id,
                    peer.name,
                    peer.platform,
                    peer.public_key,
                    peer.adv_secret,
                    now_secs()
                ],
            )
            .map_err(err)?;
        // pairing in person again undoes an earlier unpairing
        self.conn
            .execute("UPDATE peers SET introduced_by = NULL WHERE id = ?1", [&peer.id])
            .map_err(err)?;
        self.conn
            .execute("DELETE FROM removed WHERE id = ?1", [&peer.id])
            .map_err(err)?;
        Ok(())
    }

    /// Unpairs; the rest of the circle can't bring the phone back.
    pub fn remove_peer(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM peers WHERE id = ?1", [id])
            .map_err(err)?;
        self.conn
            .execute("INSERT OR IGNORE INTO removed VALUES (?1)", [id])
            .map_err(err)?;
        Ok(())
    }

    /// A phone keeps the name it gives itself.
    pub fn rename_peer(&self, id: &str, name: &str) -> Result<()> {
        if name.is_empty() {
            return Ok(());
        }
        self.conn
            .execute("UPDATE peers SET name = ?2 WHERE id = ?1", params![id, name])
            .map_err(err)?;
        Ok(())
    }

    /// The paired phones to pass on to `to`, so pairing with one phone of
    /// the circle is enough to sync with all of them.
    pub fn circle(&self, to: &str) -> Result<Vec<Member>> {
        let mut members = Vec::new();
        for peer in self.peers()? {
            if peer.id == to {
                continue;
            }
            members.push(Member {
                held: self.peer_versions(&peer.id)?,
                id: peer.id,
                name: peer.name,
                platform: peer.platform,
                key: STANDARD.encode(&peer.public_key),
                adv: STANDARD.encode(&peer.adv_secret),
            });
        }
        Ok(members)
    }

    /// Adds the phones a paired phone passed on. Returns the new ones' names.
    pub fn introduce(&self, members: &[Member], by: &str) -> Result<Vec<String>> {
        let mut added = Vec::new();
        for member in members {
            if member.id == self.identity.id {
                continue;
            }
            let removed: Option<String> = self
                .conn
                .query_row("SELECT id FROM removed WHERE id = ?1", [&member.id], |r| r.get(0))
                .optional()
                .map_err(err)?;
            if removed.is_some() {
                continue;
            }
            let mut held = self.peer_versions(&member.id)?;
            for (origin, seq) in &member.held {
                let entry = held.entry(origin.clone()).or_insert(0);
                *entry = (*entry).max(*seq);
            }
            let versions = serde_json::to_string(&held).map_err(err)?;
            if self.peer(&member.id)?.is_some() {
                // only what it holds; a key never changes second hand
                self.conn
                    .execute(
                        "UPDATE peers SET versions = ?2 WHERE id = ?1",
                        params![member.id, versions],
                    )
                    .map_err(err)?;
                continue;
            }
            let key = STANDARD.decode(&member.key).map_err(err)?;
            let adv = STANDARD.decode(&member.adv).map_err(err)?;
            if key.len() != 32 {
                continue;
            }
            self.conn
                .execute(
                    "INSERT INTO peers(id, name, platform, public_key, adv_secret, paired_at,
                       versions, introduced_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        member.id,
                        member.name,
                        member.platform,
                        key,
                        adv,
                        now_secs(),
                        versions,
                        by
                    ],
                )
                .map_err(err)?;
            added.push(member.name.clone());
        }
        Ok(added)
    }

    /// Remembers what the peer holds after a sync, for the pending count and
    /// for what a QR transfer to it has to carry.
    pub fn record_sync(&self, id: &str, theirs: &Versions) -> Result<()> {
        self.conn
            .execute(
                "UPDATE peers SET last_sync = ?2, versions = ?3 WHERE id = ?1",
                params![id, now_secs(), serde_json::to_string(theirs).map_err(err)?],
            )
            .map_err(err)?;
        Ok(())
    }

    /// Changes no paired phone has received yet. Once one has them, they
    /// travel on through the circle.
    pub fn unsynced(&self) -> Result<i64> {
        Ok(self.peers()?.iter().map(|p| p.pending).min().unwrap_or(0))
    }
}

fn get_meta(conn: &Connection, key: &str) -> Result<Option<Vec<u8>>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .optional()
        .map_err(err)
}

fn set_meta(conn: &Connection, key: &str, value: &[u8]) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO meta VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

fn random<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn fixed<const N: usize>(bytes: Vec<u8>) -> Result<[u8; N]> {
    bytes.try_into().map_err(|_| "bad key".to_string())
}

/// The phone's id, keys and name, made on first start.
fn load_identity(conn: &Connection) -> Result<Identity> {
    if get_meta(conn, "id")?.is_none() {
        let secret = x25519_dalek::StaticSecret::from(random::<32>());
        let public = x25519_dalek::PublicKey::from(&secret);
        set_meta(conn, "id", hex(&random::<8>()).as_bytes())?;
        set_meta(conn, "private_key", secret.as_bytes())?;
        set_meta(conn, "public_key", public.as_bytes())?;
        set_meta(conn, "adv_secret", &random::<16>())?;
    }
    let bytes = |key| -> Result<Vec<u8>> {
        get_meta(conn, key)?.ok_or_else(|| format!("missing {key}"))
    };
    Ok(Identity {
        id: String::from_utf8(bytes("id")?).map_err(err)?,
        name: get_meta(conn, "name")?
            .map(|n| String::from_utf8_lossy(&n).into_owned())
            .unwrap_or_default(),
        private_key: fixed(bytes("private_key")?)?,
        public_key: fixed(bytes("public_key")?)?,
        adv_secret: fixed(bytes("adv_secret")?)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fields(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    /// Lets the clock move on, so the next write is clearly the later one.
    fn later() {
        std::thread::sleep(std::time::Duration::from_millis(3));
    }

    fn sync(a: &mut Store, b: &mut Store) {
        let to_b = a.changes_since(&b.versions().unwrap()).unwrap();
        let to_a = b.changes_since(&a.versions().unwrap()).unwrap();
        let (va, vb) = (a.versions().unwrap(), b.versions().unwrap());
        b.apply(&to_b, &va).unwrap();
        a.apply(&to_a, &vb).unwrap();
    }

    #[test]
    fn lists_what_was_put_and_hides_deleted() {
        let mut s = Store::in_memory().unwrap();
        s.put("territories", "t1", &fields(json!({"number": "1", "city": "Graz"})))
            .unwrap();
        s.put("territories", "t2", &fields(json!({"number": "2"}))).unwrap();
        s.remove("territories", "t2").unwrap();
        assert_eq!(
            s.list("territories").unwrap(),
            vec![json!({"id": "t1", "number": "1", "city": "Graz"})]
        );
    }

    #[test]
    fn unchanged_fields_are_not_rewritten() {
        let mut s = Store::in_memory().unwrap();
        s.put("t", "1", &fields(json!({"a": 1, "b": 2}))).unwrap();
        assert_eq!(s.put("t", "1", &fields(json!({"a": 1, "b": 3}))).unwrap(), 1);
    }

    #[test]
    fn two_phones_converge_after_conflicting_edits() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"name": "North", "city": "Graz"})))
            .unwrap();
        sync(&mut a, &mut b);

        // both edit the same record offline: different fields merge, the
        // same field goes to the later write
        a.put("t", "1", &fields(json!({"name": "North A"}))).unwrap();
        b.put("t", "1", &fields(json!({"city": "Linz"}))).unwrap();
        b.put("t", "1", &fields(json!({"name": "North B"}))).unwrap();
        sync(&mut a, &mut b);

        let expected = vec![json!({"id": "1", "name": "North B", "city": "Linz"})];
        assert_eq!(a.list("t").unwrap(), expected);
        assert_eq!(b.list("t").unwrap(), expected);
        assert_eq!(a.versions().unwrap(), b.versions().unwrap());
    }

    #[test]
    fn changes_travel_through_a_third_phone() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        sync(&mut b, &mut c);
        assert_eq!(c.list("t").unwrap(), a.list("t").unwrap());
        // nothing left to send once everyone has it
        assert!(a.changes_since(&c.versions().unwrap()).unwrap().is_empty());
    }

    #[test]
    fn a_delete_syncs() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        b.remove("t", "1").unwrap();
        sync(&mut a, &mut b);
        assert!(a.list("t").unwrap().is_empty());
    }

    #[test]
    fn keeps_its_identity_across_reopening() {
        let dir = std::env::temp_dir().join(format!("territories-{}", hex(&random::<4>())));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("store.db");
        let id = Store::open(&path).unwrap().identity.id;
        assert_eq!(Store::open(&path).unwrap().identity.id, id);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_clash_keeps_the_newer_value_and_remembers_the_other() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"holder": "Anna", "city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);

        a.put("t", "1", &fields(json!({"holder": "Carl"}))).unwrap();
        later();
        b.put("t", "1", &fields(json!({"holder": "Dora"}))).unwrap();
        sync(&mut a, &mut b);

        assert_eq!(a.list("t").unwrap(), b.list("t").unwrap());
        let (ca, cb) = (a.conflicts().unwrap(), b.conflicts().unwrap());
        assert_eq!((ca.len(), cb.len()), (1, 1));
        assert_eq!(ca[0]["kept"], json!("Dora"));
        assert_eq!(ca[0]["lost"], json!("Carl"));
        assert_eq!(ca[0]["mine"], json!(true));
        assert_eq!(cb[0]["mine"], json!(false));

        // one after the other is no clash
        b.put("t", "1", &fields(json!({"city": "Linz"}))).unwrap();
        sync(&mut a, &mut b);
        later();
        a.put("t", "1", &fields(json!({"city": "Wels"}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.conflicts().unwrap().len(), 1);

        // keeping the other value makes it win everywhere
        later();
        a.resolve("t", "1", "holder", true).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(b.list("t").unwrap()[0]["holder"], json!("Carl"));
        assert!(a.conflicts().unwrap().is_empty());
        assert!(b.conflicts().unwrap().is_empty());
    }

    #[test]
    fn an_edit_made_meanwhile_outlives_a_delete() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        a.remove("t", "1").unwrap();
        later();
        b.put("t", "1", &fields(json!({"n": 2}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.list("t").unwrap(), vec![json!({"id": "1", "n": 2})]);
        assert_eq!(b.list("t").unwrap(), a.list("t").unwrap());
    }

    #[test]
    fn a_record_brought_back_can_be_deleted_again() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("t", "1", &fields(json!({"n": 1}))).unwrap();
        a.remove("t", "1").unwrap();
        later();
        b.put("t", "1", &fields(json!({"n": 2}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.list("t").unwrap().len(), 1);
        later();
        a.remove("t", "1").unwrap();
        sync(&mut a, &mut b);
        assert!(a.list("t").unwrap().is_empty());
        assert!(b.list("t").unwrap().is_empty());
    }

    #[test]
    fn writing_to_a_deleted_record_brings_it_back() {
        let mut s = Store::in_memory().unwrap();
        s.put("t", "1", &fields(json!({"name": "Ben"}))).unwrap();
        s.remove("t", "1").unwrap();
        s.put("t", "1", &fields(json!({"name": "Ben"}))).unwrap();
        assert_eq!(s.list("t").unwrap().len(), 1);
    }

    #[test]
    fn a_sync_reports_the_records_it_brought() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "1", &fields(json!({"n": 1, "city": "Graz"}))).unwrap();
        a.put("assignments", "x", &fields(json!({"publisher": "Ben"}))).unwrap();
        let cells = a.changes_since(&b.versions().unwrap()).unwrap();
        let applied = b.apply(&cells, &a.versions().unwrap()).unwrap();
        assert_eq!(applied.cells, 3);
        assert_eq!(
            applied.items,
            BTreeMap::from([("assignments".into(), 1), ("territories".into(), 1)])
        );
    }
}
