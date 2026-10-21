use std::collections::BTreeMap;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::hlc::{self, Clock};

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
    /// Older versions ignore it. A removed phone goes out with no key, so
    /// they can't add it back either.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub standing: Option<Standing>,
}

/// Whether a phone was last removed from the group or paired again, and
/// when. The later stamp wins on every phone.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Standing {
    pub stamp: String,
    pub removed: bool,
}

/// What a sync brought in: stored cells, the records they belong to per
/// table, the territories they touched, and how many fields had been
/// changed on both sides.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Applied {
    pub cells: usize,
    pub items: BTreeMap<String, usize>,
    pub territories: Vec<Touched>,
    pub conflicts: usize,
    /// Each field a sync changed or offered, for `log_sync` to keep.
    #[serde(skip)]
    pub changes: Vec<Change>,
}

/// One incoming field, as it was here before and as it came. `field` is
/// `RECORD` for a record this phone didn't have. `won` tells which of the
/// two is in effect after the sync; `base` is the stamp it holds then, to
/// tell whether anything changed it since.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Change {
    pub t: String,
    pub i: String,
    pub f: String,
    pub old: Option<String>,
    pub old_stamp: Option<String>,
    pub new: String,
    pub new_stamp: String,
    pub origin: String,
    pub conflict: bool,
    pub won: bool,
    pub base: String,
}

/// A territory a sync changed, by its number, and what changed in it, as
/// kinds from `KINDS`. Older log entries hold "details", "assignment" or
/// "do-not-call".
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Touched {
    pub id: String,
    pub number: String,
    pub what: Vec<String>,
}

pub struct Identity {
    pub id: String,
    pub name: String,
    pub private_key: [u8; 32],
    pub public_key: [u8; 32],
    pub adv_secret: [u8; 16],
}

const DELETED: &str = "_deleted";
/// Synced like the app's tables, so a decision on one phone reaches the
/// others; older versions don't take its cells in.
const DECISIONS: &str = "decisions";
type NewRecord = (Map<String, Value>, String, String);
/// table, record, field, old, new, won, base, decision, sync
type Decidable = (String, String, String, Option<String>, String, bool, String, Option<String>, i64);

/// The field of a change that brought a whole new record.
const RECORD: &str = "*";
/// The tables the app keeps. Cells for any other are not taken in.
pub const TABLES: [&str; 7] = [
    "territories",
    "assignments",
    "do_not_calls",
    "people",
    "categories",
    "settings",
    "profiles",
];
/// Records that belong to a territory and go with it when it is deleted.
const CHILDREN: [&str; 2] = ["assignments", "do_not_calls"];
/// How far a restored phone moves its own change numbers on: past anything
/// a paired phone may hold of its earlier ones.
const RESTORE_GAP: i64 = 1 << 32;
/// Why a pairing is refused: its id or key belongs to another paired phone.
pub const PAIR_CLASH: &str = "the code does not match a paired device";
/// What a sync can do to a territory, in the order it is told.
const KINDS: [&str; 10] = [
    "created",
    "deleted",
    "assigned",
    "returned",
    "assignment-removed",
    "border",
    "details",
    "dnc-added",
    "dnc-changed",
    "dnc-removed",
];
const BORDER: [&str; 5] = ["boundary", "boundaryStyle", "mapShapes", "mapLines", "mapMarkers"];
/// Fields whose clashes nobody needs to hear about.
const QUIET: [&str; 2] = ["order", DELETED];

pub struct Store {
    conn: Connection,
    pub identity: Identity,
    clock: Clock,
}

/// A phone's id as `load_identity` makes it: 16 lowercase hex digits.
pub fn is_id(id: &str) -> bool {
    id.len() == 16 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
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
               at INTEGER NOT NULL, PRIMARY KEY(tbl, id, field, lost_by));
             CREATE TABLE IF NOT EXISTS log(
               at INTEGER NOT NULL, peer TEXT NOT NULL, name TEXT NOT NULL,
               sent INTEGER NOT NULL, received INTEGER NOT NULL, items TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS changes(
               id INTEGER PRIMARY KEY, sync INTEGER NOT NULL,
               tbl TEXT NOT NULL, rid TEXT NOT NULL, field TEXT NOT NULL,
               old TEXT, old_stamp TEXT, new TEXT NOT NULL, new_stamp TEXT NOT NULL,
               origin TEXT NOT NULL, outcome TEXT NOT NULL, won INTEGER NOT NULL,
               base TEXT NOT NULL, decision TEXT, decided TEXT, decided_by TEXT);
             CREATE INDEX IF NOT EXISTS changes_sync ON changes(sync);",
        )
        .map_err(err)?;
        // one losing value per field was kept before; now one per phone
        let conflicts: String = conn
            .query_row("SELECT sql FROM sqlite_master WHERE name = 'conflicts'", [], |r| r.get(0))
            .map_err(err)?;
        if !conflicts.contains("lost_by)") {
            conn.execute_batch(
                "BEGIN;
                 CREATE TABLE conflicts_new(
                   tbl TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
                   kept TEXT NOT NULL, lost TEXT NOT NULL, lost_by TEXT NOT NULL,
                   at INTEGER NOT NULL, PRIMARY KEY(tbl, id, field, lost_by));
                 INSERT INTO conflicts_new SELECT tbl, id, field, kept, lost, lost_by, at FROM conflicts;
                 DROP TABLE conflicts;
                 ALTER TABLE conflicts_new RENAME TO conflicts;
                 COMMIT;",
            )
            .map_err(err)?;
        }
        // added later; each fails harmlessly once the column exists
        for column in [
            "ALTER TABLE peers ADD COLUMN introduced_by TEXT",
            "ALTER TABLE log ADD COLUMN detail TEXT NOT NULL DEFAULT '{}'",
            // an unpairing from before these has no stamp and stays on this phone
            "ALTER TABLE removed ADD COLUMN stamp TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE removed ADD COLUMN gone INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE removed ADD COLUMN name TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE removed ADD COLUMN public_key BLOB",
            "ALTER TABLE changes ADD COLUMN decided_by TEXT",
        ] {
            if let Err(e) = conn.execute(column, []) {
                if !e.to_string().contains("duplicate column") {
                    return Err(err(e));
                }
            }
        }

        // syncs that changed nothing only crowded the history
        conn.execute(
            "DELETE FROM log WHERE sent = 0 AND received = 0
               AND coalesce(json_array_length(detail, '$.removed'), 0) = 0
               AND NOT EXISTS (SELECT 1 FROM changes WHERE changes.sync = log.rowid)",
            [],
        )
        .map_err(err)?;
        conn.execute("DELETE FROM changes WHERE sync NOT IN (SELECT rowid FROM log)", [])
            .map_err(err)?;

        let identity = load_identity(&conn)?;
        // a removal is stamped too, and a later pairing must come after it
        let last: Option<String> = conn
            .query_row(
                "SELECT max(stamp) FROM (SELECT stamp FROM cells UNION ALL SELECT stamp FROM removed)",
                [],
                |r| r.get(0),
            )
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
    /// one phone while another phone edited it stays: the later edit wins,
    /// and brings back what was deleted with it.
    pub fn list(&self, table: &str) -> Result<Vec<Value>> {
        let revived = if CHILDREN.contains(&table) {
            self.revived_children()?
        } else {
            std::collections::BTreeSet::new()
        };
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
                // reordering a list elsewhere doesn't bring a deleted record back
                if field != "order" {
                    record.newest = record.newest.clone().max(stamp);
                }
                record.fields.insert(field, value);
            }
        }
        Ok(records
            .into_iter()
            .filter(|(id, r)| {
                r.deleted.as_ref().is_none_or(|d| &r.newest > d)
                    || revived.contains(&(table.to_string(), id.clone()))
            })
            .map(|(id, mut r)| {
                r.fields.insert("id".into(), Value::String(id));
                Value::Object(r.fields)
            })
            .collect())
    }

    /// Assignments and do-not-calls deleted along with a territory that an
    /// edit made meanwhile brought back. The page deletes them right after
    /// the territory, so their numbers follow its deletion's without a gap.
    fn revived_children(&self) -> Result<std::collections::BTreeSet<(String, String)>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT d.id, d.origin, d.seq FROM cells d
                 WHERE d.tbl = 'territories' AND d.field = ?1 AND d.value = 'true'
                   AND EXISTS (SELECT 1 FROM cells e WHERE e.tbl = d.tbl AND e.id = d.id
                     AND e.field NOT IN (?1, 'order') AND e.stamp > d.stamp)",
            )
            .map_err(err)?;
        let territories: BTreeMap<String, (String, i64)> = stmt
            .query_map([DELETED], |r| Ok((r.get(0)?, (r.get(1)?, r.get(2)?))))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        let mut revived = std::collections::BTreeSet::new();
        if territories.is_empty() {
            return Ok(revived);
        }
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.tbl, c.id, c.origin, c.seq, t.value FROM cells c
                 JOIN cells t ON t.tbl = c.tbl AND t.id = c.id AND t.field = 'territory'
                 WHERE c.tbl IN ('assignments', 'do_not_calls')
                   AND c.field = ?1 AND c.value = 'true'",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([DELETED], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(err)?;
        // per territory, the children its deleting phone deleted after it
        let mut after: BTreeMap<String, Vec<(i64, String, String)>> = BTreeMap::new();
        for row in rows {
            let (table, id, origin, seq, territory) = row.map_err(err)?;
            let Ok(Value::String(territory)) = serde_json::from_str(&territory) else {
                continue;
            };
            if let Some((by, at)) = territories.get(&territory) {
                if &origin == by && seq > *at {
                    after.entry(territory).or_default().push((seq, table, id));
                }
            }
        }
        for (territory, mut children) in after {
            children.sort();
            let first = territories[&territory].1 + 1;
            for (next, (seq, table, id)) in (first..).zip(children) {
                if seq != next {
                    break;
                }
                revived.insert((table, id));
            }
        }
        Ok(revived)
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
        // writing to a deleted record (an import, an undo) brings it back, but
        // not a new place in a list, from a page that missed the deletion
        if deleted.as_deref() == Some("true") && !fields.contains_key(DELETED) {
            let mut changed = Vec::new();
            for (field, value) in &fields {
                if field != "id" && self.field_text(table, id, field)? != Some(value.to_string()) {
                    changed.push(field.as_str());
                }
            }
            if changed.is_empty() || changed.iter().any(|f| *f != "order") {
                fields.insert(DELETED.into(), Value::Bool(false));
            }
        }
        // a savepoint, so it also runs inside `batch`
        let tx = self.conn.savepoint().map_err(err)?;
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
            if field == DELETED && *value == true {
                settle_record(&tx, table, id)?;
            }
            written += 1;
        }
        if written == 0 {
            return Ok(0);
        }
        tx.execute(
            "INSERT OR REPLACE INTO versions VALUES (?1, ?2)",
            params![self.identity.id, seq],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(written)
    }

    /// Runs several writes as one transaction: all of them land, or none.
    pub fn batch<T>(&mut self, f: impl FnOnce(&mut Self) -> Result<T>) -> Result<T> {
        self.conn.execute_batch("BEGIN IMMEDIATE").map_err(err)?;
        let result = f(self);
        let end = if result.is_ok() { "COMMIT" } else { "ROLLBACK" };
        if let Err(e) = self.conn.execute_batch(end) {
            let _ = self.conn.execute_batch("ROLLBACK");
            return Err(err(e));
        }
        result
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

    /// The phones the stored cells were written on.
    fn origins(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT origin FROM cells ORDER BY origin")
            .map_err(err)?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    /// Every stored cell a phone with these versions hasn't seen.
    pub fn changes_since(&self, seen: &Versions) -> Result<Vec<Cell>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT tbl, id, field, value, stamp, seq FROM cells
                 WHERE origin = ?1 AND seq > ?2 ORDER BY seq",
            )
            .map_err(err)?;
        let mut cells = Vec::new();
        for origin in self.origins()? {
            let since = seen.get(&origin).copied().unwrap_or(0);
            let rows = stmt
                .query_map(params![origin, since], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, i64>(5)?,
                    ))
                })
                .map_err(err)?;
            for row in rows {
                let (t, i, f, v, s, q) = row.map_err(err)?;
                cells.push(Cell {
                    t,
                    i,
                    f,
                    v: serde_json::from_str(&v).map_err(err)?,
                    s,
                    o: origin.clone(),
                    q,
                });
            }
        }
        Ok(cells)
    }

    /// How many records `changes_since` would touch: a new territory is one
    /// change to the people using it, not one per field.
    fn pending(&self, seen: &Versions) -> Result<i64> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT tbl, id FROM cells WHERE origin = ?1 AND seq > ?2")
            .map_err(err)?;
        let mut records = std::collections::BTreeSet::new();
        for origin in self.origins()? {
            let since = seen.get(&origin).copied().unwrap_or(0);
            let rows = stmt
                .query_map(params![origin, since], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(err)?;
            for row in rows {
                records.insert(row.map_err(err)?);
            }
        }
        Ok(records.len() as i64)
    }

    /// Paired phones hold more of this phone's changes than it does: it was
    /// restored from a backup. Its own cells move far above their numbers, or
    /// the edits made since would reuse numbers some phone already has, from
    /// before the restore, and never reach it.
    pub fn catch_up(&mut self, theirs: &Versions) -> Result<()> {
        let id = self.identity.id.clone();
        let known = theirs.get(&id).copied().unwrap_or(0);
        let mine = self.versions()?.get(&id).copied().unwrap_or(0);
        // a number no phone reaches is a broken peer, not a backup
        if known <= mine || known > i64::MAX / 4 {
            return Ok(());
        }
        let shift = known + RESTORE_GAP;
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute(
            "UPDATE cells SET seq = seq + ?2 WHERE origin = ?1",
            params![id, shift],
        )
        .map_err(err)?;
        tx.execute(
            "INSERT OR REPLACE INTO versions VALUES (?1, ?2)",
            params![id, mine + shift],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }

    /// The sender's versions, each no higher than this phone already holds
    /// or the cells carry: for a file anyone could have made.
    pub fn capped(&self, claims: &Versions, cells: &[Cell]) -> Result<Versions> {
        let mut top = self.versions()?;
        for cell in cells.iter().filter(|cell| made_by(cell)) {
            let entry = top.entry(cell.o.clone()).or_insert(0);
            *entry = (*entry).max(cell.q);
        }
        Ok(claims
            .iter()
            .map(|(origin, seq)| (origin.clone(), (*seq).min(top.get(origin).copied().unwrap_or(0))))
            .filter(|(_, seq)| *seq > 0)
            .collect())
    }

    /// Phones removed from the group, with when. Their changes from after
    /// that are not taken in.
    fn removals(&self) -> Result<BTreeMap<String, String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, stamp FROM removed WHERE gone = 1 AND stamp <> '' AND id <> ?1")
            .map_err(err)?;
        let rows = stmt
            .query_map([&self.identity.id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    /// Keeps each incoming cell that is newer than the stored one, then takes
    /// over the sender's versions: what it didn't send, it has overwritten.
    ///
    /// Two writes to the same field clash only when neither phone had seen
    /// the other's (the version vectors tell). The newer one still wins, so
    /// every phone ends up the same, but the other value is kept in
    /// `conflicts` for someone to look at. So is a record deleted on one
    /// phone and edited on the other.
    pub fn apply(&mut self, cells: &[Cell], sender: &Versions) -> Result<Applied> {
        self.merge(cells, sender, sender)
    }

    /// `apply`, taking over only the versions in `adopt`.
    pub fn merge(&mut self, cells: &[Cell], sender: &Versions, adopt: &Versions) -> Result<Applied> {
        self.catch_up(adopt)?;
        let mine = self.versions()?;
        let removals = self.removals()?;
        let tx = self.conn.transaction().map_err(err)?;
        let mut applied = Applied::default();
        let mut records = std::collections::BTreeSet::new();
        let mut kept = Vec::new();
        let mut looked = std::collections::BTreeSet::new();
        let mut new = std::collections::BTreeSet::new();
        let mut revived = std::collections::BTreeSet::new();
        let mut buried = std::collections::BTreeSet::new();
        let mut changes: BTreeMap<(String, String, String), Change> = BTreeMap::new();
        // new records' fields, newest stamp and its phone
        let mut fresh: BTreeMap<(String, String), NewRecord> = BTreeMap::new();
        let mut decided = std::collections::BTreeSet::new();
        for cell in cells {
            if !takes(cell, &removals) {
                continue;
            }
            if cell.t == DECISIONS {
                // the newer decision on a change counts, with no clash to keep
                let incoming = cell.v.to_string();
                let stored: Option<(String, String)> = tx
                    .query_row(
                        "SELECT stamp, value FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                        params![cell.t, cell.i, cell.f],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()
                    .map_err(err)?;
                if stored.is_none_or(|(stamp, value)| (stamp, value) < (cell.s.clone(), incoming.clone())) {
                    tx.execute(
                        "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![cell.t, cell.i, cell.f, incoming, cell.s, cell.o, cell.q],
                    )
                    .map_err(err)?;
                    self.clock.observe(&cell.s);
                    applied.cells += 1;
                    decided.insert(cell.i.clone());
                }
                continue;
            }
            let record = (cell.t.clone(), cell.i.clone());
            if looked.insert(record.clone()) {
                let stored: Option<i64> = tx
                    .query_row(
                        "SELECT 1 FROM cells WHERE tbl = ?1 AND id = ?2 LIMIT 1",
                        params![cell.t, cell.i],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                if stored.is_none() {
                    new.insert(record.clone());
                }
            }
            let is_new = new.contains(&record);
            let key = (cell.t.clone(), cell.i.clone(), cell.f.clone());
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
            // the value breaks a tie, so both phones keep the same one
            let wins = stored
                .as_ref()
                .is_none_or(|(stamp, value, ..)| (stamp, value) < (&cell.s, &incoming));
            // by value, so key order or spacing is no clash
            let differs = stored.as_ref().is_none_or(|(_, value, ..)| {
                serde_json::from_str::<Value>(value).map_or(true, |v| v != cell.v)
            });

            // concurrency is what the version vectors say, never which stamp is newer
            if let Some((stamp, value, origin, seq)) = &stored {
                let they_missed_ours = sender.get(origin).copied().unwrap_or(0) < *seq;
                let we_missed_theirs = mine.get(&cell.o).copied().unwrap_or(0) < cell.q;
                if they_missed_ours
                    && we_missed_theirs
                    && origin != &cell.o
                    && differs
                    && !QUIET.contains(&cell.f.as_str())
                {
                    let (kept, lost, lost_by) = if wins {
                        (&incoming, value, origin)
                    } else {
                        (value, &incoming, &cell.o)
                    };
                    if wins {
                        tx.execute(
                            "UPDATE conflicts SET kept = ?4 WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                            params![cell.t, cell.i, cell.f, kept],
                        )
                        .map_err(err)?;
                    }
                    tx.execute(
                        "INSERT OR REPLACE INTO conflicts VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![cell.t, cell.i, cell.f, kept, lost, lost_by, now_secs()],
                    )
                    .map_err(err)?;
                    applied.conflicts += 1;
                    changes.insert(key.clone(), noted(cell, Some((value, stamp)), true, wins));
                }
            }
            if !wins {
                continue;
            }
            if is_new && cell.f != "order" {
                let entry = fresh.entry(record.clone()).or_default();
                entry.0.insert(cell.f.clone(), cell.v.clone());
                if cell.s > entry.1 {
                    entry.1 = cell.s.clone();
                    entry.2 = cell.o.clone();
                }
            }
            if applied.conflicts == clashes {
                // a later edit, made knowing both values, settles an old clash
                tx.execute(
                    "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                    params![cell.t, cell.i, cell.f],
                )
                .map_err(err)?;
                if !is_new && differs && cell.f != "order" {
                    let old = stored.as_ref().map(|(stamp, value, ..)| (value.as_str(), stamp.as_str()));
                    changes.insert(key.clone(), noted(cell, old, false, true));
                }
            }
            let record_key = (cell.t.clone(), cell.i.clone());
            if !QUIET.contains(&cell.f.as_str()) && !revived.contains(&record_key) {
                // an edit made while the other phone deleted the record
                let deletion: Option<(String, String, i64)> = tx
                    .query_row(
                        "SELECT stamp, origin, seq FROM cells
                         WHERE tbl = ?1 AND id = ?2 AND field = ?3 AND value = 'true'",
                        params![cell.t, cell.i, DELETED],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                    )
                    .optional()
                    .map_err(err)?;
                if let Some((stamp, origin, seq)) = deletion {
                    let unseen = sender.get(&origin).copied().unwrap_or(0) < seq
                        && mine.get(&cell.o).copied().unwrap_or(0) < cell.q;
                    if stamp < cell.s && unseen && origin != cell.o {
                        revived.insert(record_key.clone());
                        deleted_while_edited(&tx, &cell.t, &cell.i, &origin)?;
                        applied.conflicts += 1;
                        changes.insert(deletion_key(cell), deletion_change(cell, Some(&stamp), true, true));
                    } else if unseen && origin != cell.o && buried.insert(record_key.clone()) {
                        // the deletion here is newer, so the record stays gone: still a clash
                        tx.execute(
                            "INSERT OR REPLACE INTO conflicts VALUES (?1, ?2, ?3, 'true', 'false', ?4, ?5)",
                            params![cell.t, cell.i, DELETED, cell.o, now_secs()],
                        )
                        .map_err(err)?;
                        applied.conflicts += 1;
                        changes.insert(deletion_key(cell), deletion_change(cell, Some(&stamp), true, false));
                    }
                }
            }
            tx.execute(
                "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![cell.t, cell.i, cell.f, incoming, cell.s, cell.o, cell.q],
            )
            .map_err(err)?;
            if cell.f == DELETED && cell.v == true {
                // a deletion that comes after an edit it hadn't seen leaves the record
                let edit: Option<(String, i64)> = tx
                    .query_row(
                        "SELECT origin, seq FROM cells WHERE tbl = ?1 AND id = ?2
                           AND field NOT IN (?3, 'order') AND stamp > ?4
                         ORDER BY stamp DESC LIMIT 1",
                        params![cell.t, cell.i, DELETED, cell.s],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()
                    .map_err(err)?;
                match edit {
                    None => {
                        settle_record(&tx, &cell.t, &cell.i)?;
                        // an earlier edit here it hadn't seen: the deletion wins, but is a clash
                        if !is_new {
                            if let Some(by) = unseen_edit(&tx, cell, sender, &mine)? {
                                tx.execute(
                                    "INSERT OR REPLACE INTO conflicts VALUES (?1, ?2, ?3, 'true', 'false', ?4, ?5)",
                                    params![cell.t, cell.i, DELETED, by, now_secs()],
                                )
                                .map_err(err)?;
                                applied.conflicts += 1;
                                changes.insert(key.clone(), deletion_change(cell, None, false, true));
                            }
                        }
                    }
                    Some((origin, seq)) => {
                        let unseen = sender.get(&origin).copied().unwrap_or(0) < seq
                            && mine.get(&cell.o).copied().unwrap_or(0) < cell.q;
                        if unseen && origin != cell.o && revived.insert(record_key.clone()) {
                            deleted_while_edited(&tx, &cell.t, &cell.i, &cell.o)?;
                            applied.conflicts += 1;
                            changes.insert(key.clone(), deletion_change(cell, None, false, false));
                        }
                    }
                }
            }
            self.clock.observe(&cell.s);
            applied.cells += 1;
            if records.insert((cell.t.clone(), cell.i.clone())) {
                *applied.items.entry(cell.t.clone()).or_default() += 1;
            }
            kept.push(cell.clone());
        }
        for ((t, i), (mut fields, stamp, origin)) in fresh {
            // made and deleted elsewhere before it ever got here
            if fields.remove(DELETED) == Some(Value::Bool(true)) {
                continue;
            }
            changes.insert(
                (t.clone(), i.clone(), RECORD.into()),
                Change {
                    t,
                    i,
                    f: RECORD.into(),
                    new: Value::Object(fields).to_string(),
                    new_stamp: stamp,
                    origin,
                    won: true,
                    ..Change::default()
                },
            );
        }
        for id in &decided {
            settled_elsewhere(&tx, &self.identity.id, id)?;
        }
        for change in changes.values_mut() {
            change.base = base_of(&tx, &change.t, &change.i, &change.f)?;
        }
        applied.changes = changes.into_values().collect();
        for (origin, seq) in adopt {
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
        applied.territories = self.touched(&kept, &new)?;
        Ok(applied)
    }

    fn field_text(&self, table: &str, id: &str, field: &str) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, field],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    fn field(&self, table: &str, id: &str, field: &str) -> Result<Option<Value>> {
        Ok(self
            .field_text(table, id, field)?
            .and_then(|t| serde_json::from_str(&t).ok()))
    }

    /// The records among these cells the other phone has none of: every
    /// stored cell of theirs is in the batch.
    pub fn unseen(&self, cells: &[Cell]) -> Result<std::collections::BTreeSet<(String, String)>> {
        let mut counts: BTreeMap<(String, String), i64> = BTreeMap::new();
        for cell in cells {
            *counts.entry((cell.t.clone(), cell.i.clone())).or_default() += 1;
        }
        let mut unseen = std::collections::BTreeSet::new();
        for (record, count) in counts {
            let stored: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM cells WHERE tbl = ?1 AND id = ?2",
                    params![record.0, record.1],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if stored == count {
                unseen.insert(record);
            }
        }
        Ok(unseen)
    }

    /// The territories these cells belong to, in number order, with what
    /// changed in each. `new` are the records the receiving phone didn't have.
    pub fn touched(
        &self,
        cells: &[Cell],
        new: &std::collections::BTreeSet<(String, String)>,
    ) -> Result<Vec<Touched>> {
        let mut found: BTreeMap<String, std::collections::BTreeSet<&str>> = BTreeMap::new();
        for cell in cells {
            if cell.f == "order" {
                continue;
            }
            let is_new = new.contains(&(cell.t.clone(), cell.i.clone()));
            let deleted = cell.f == DELETED && cell.v == true;
            // a record written to after its deletion is back
            let revived = cell.f == DELETED && !deleted;
            let what = match cell.t.as_str() {
                "territories" if deleted => "deleted",
                "territories" if is_new || revived => "created",
                "territories" if BORDER.contains(&cell.f.as_str()) => "border",
                "territories" => "details",
                "assignments" if deleted => "assignment-removed",
                "assignments" if is_new || revived => "assigned",
                "assignments" => match cell.f.as_str() {
                    "publisher" | "group" | "assignedOn" => "assigned",
                    "returnedOn" if cell.v.as_str().is_some_and(|s| !s.is_empty()) => "returned",
                    "returnedOn" => "assigned",
                    _ => continue,
                },
                "do_not_calls" if deleted => "dnc-removed",
                "do_not_calls" if is_new || revived => "dnc-added",
                "do_not_calls" => "dnc-changed",
                _ => continue,
            };
            let territory = if cell.t == "territories" {
                Some(cell.i.clone())
            } else {
                self.field(&cell.t, &cell.i, "territory")?
                    .and_then(|v| v.as_str().map(String::from))
            };
            if let Some(territory) = territory {
                found.entry(territory).or_default().insert(what);
            }
        }
        let mut list = Vec::new();
        for (id, what) in found {
            let number = match self.field("territories", &id, "number")? {
                Some(Value::String(n)) => n,
                Some(other) => other.to_string(),
                None => continue,
            };
            // a territory added or deleted needs no more words
            let alone = ["deleted", "created"].into_iter().find(|k| what.contains(k));
            let mut what: Vec<&str> = match alone {
                Some(alone) => vec![alone],
                None => what.into_iter().collect(),
            };
            what.sort_by_key(|k| KINDS.iter().position(|x| x == k));
            list.push(Touched {
                id,
                number,
                what: what.into_iter().map(String::from).collect(),
            });
        }
        // "M9" before "M10": letters first, then the number as a number
        let key = |n: &str| {
            let prefix: String = n.chars().take_while(|c| !c.is_ascii_digit()).collect();
            let digits: String = n[prefix.len()..].chars().take_while(|c| c.is_ascii_digit()).collect();
            (prefix, digits.parse::<u64>().unwrap_or(u64::MAX), n.to_string())
        };
        list.sort_by_key(|t| key(&t.number));
        Ok(list)
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
            self.paired()?.into_iter().map(|p| (p.id, p.name)).collect();
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
                "lostBy": lost_by,
                "at": at,
                "record": self.record(&table, &id)?,
            }));
        }
        Ok(list)
    }

    /// Settles a clash: with `use_other`, the value that lost is written
    /// again as a new edit, so it wins on every phone.
    pub fn resolve(&mut self, table: &str, id: &str, field: &str, use_other: bool) -> Result<()> {
        self.resolve_by(table, id, field, use_other, None)
    }

    /// `resolve`, for the value one phone lost when several did.
    pub fn resolve_by(
        &mut self,
        table: &str,
        id: &str,
        field: &str,
        use_other: bool,
        by: Option<&str>,
    ) -> Result<()> {
        let lost: Option<String> = self
            .conn
            .query_row(
                "SELECT lost FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3
                   AND (?4 IS NULL OR lost_by = ?4)",
                params![table, id, field, by],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        let mut wrote = false;
        if let (true, Some(lost)) = (use_other, lost) {
            if field == DELETED {
                // a deletion is always stamped anew, so it outlives the edit
                self.set_deleted(table, id, lost == "true")?;
            } else {
                let mut fields = Map::new();
                fields.insert(field.into(), serde_json::from_str(&lost).map_err(err)?);
                self.put(table, id, &fields)?;
            }
            wrote = true;
        }
        self.conn
            .execute(
                "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3
                   AND (?4 IS NULL OR lost_by = ?4)",
                params![table, id, field, by],
            )
            .map_err(err)?;
        // the same clash on the sync's list is decided with it
        let pending: Vec<(i64, bool)> = {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT id, won FROM changes WHERE tbl = ?1 AND rid = ?2 AND field = ?3
                       AND outcome = 'conflict' AND decision IS NULL",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![table, id, field], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(err)?;
            rows.collect::<std::result::Result<_, _>>().map_err(err)?
        };
        for (row, won) in pending {
            self.conclude(row, use_other != won, wrote)?;
        }
        Ok(())
    }

    fn set_deleted(&mut self, table: &str, id: &str, deleted: bool) -> Result<()> {
        if deleted {
            return self.remove(table, id);
        }
        let mut fields = Map::new();
        fields.insert(DELETED.into(), Value::Bool(false));
        self.write(table, id, &fields, true).map(|_| ())
    }

    /// What a sync brought in, one field each, with the territory it belongs
    /// to and whether it is still as the sync left it.
    pub fn sync_changes(&self, sync: i64) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.tbl, c.rid, c.field, c.old, c.new, c.origin, c.outcome, c.won,
                   c.base, c.decision, c.new_stamp, l.name, coalesce(c.old_stamp, ''), c.decided_by
                 FROM changes c JOIN log l ON l.rowid = c.sync
                 WHERE c.sync = ?1 ORDER BY c.outcome = 'applied', c.tbl, c.rid, c.field",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([sync], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    [r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?],
                    (r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?),
                    r.get::<_, String>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, bool>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, Option<String>>(10)?,
                    r.get::<_, String>(11)?,
                    r.get::<_, String>(12)?,
                    (r.get::<_, String>(13)?, r.get::<_, Option<String>>(14)?),
                ))
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let names: BTreeMap<String, String> =
            self.paired()?.into_iter().map(|p| (p.id, p.name)).collect();
        let parse = |text: &str| serde_json::from_str::<Value>(text).unwrap_or(Value::Null);
        let decisions: Vec<Value> = self
            .list(DECISIONS)?
            .into_iter()
            .filter(|d| d["by"].as_str() != Some(self.identity.id.as_str()))
            .collect();
        let name_of = |device: &str| {
            names
                .get(device)
                .cloned()
                .unwrap_or_else(|| if device == self.identity.id { self.identity.name.clone() } else { String::new() })
        };
        let mut list = Vec::new();
        for (id, [table, record, field], (old, new), origin, outcome, won, base, decision, stamp, name, (old_stamp, decided_by)) in rows {
            // what another phone decided about this change, latest first
            let remote = decisions
                .iter()
                .filter(|d| d["table"] == table.as_str() && d["record"] == record.as_str() && d["field"] == field.as_str())
                .filter(|d| {
                    let stamps = d.as_object().map(decision_stamps).unwrap_or_default();
                    stamps.contains(&stamp) || (!old_stamp.is_empty() && stamps.contains(&old_stamp))
                })
                .max_by_key(|d| d["at"].as_i64().unwrap_or(0))
                .map(|d| {
                    serde_json::json!({
                        "kind": d["kind"],
                        "by": name_of(d["by"].as_str().unwrap_or_default()),
                    })
                });
            let (territory, context) = self.describe(&table, &record)?;
            let by = if origin == self.identity.id {
                self.identity.name.clone()
            } else {
                names.get(&origin).cloned().unwrap_or(name)
            };
            list.push(serde_json::json!({
                "id": id,
                "table": table,
                "record": record,
                "field": field,
                "before": old.as_deref().map_or(Value::Null, parse),
                "after": parse(&new),
                "conflict": outcome == "conflict",
                "won": won,
                "decision": decision,
                "decidedBy": decided_by.as_deref().map(name_of),
                "remote": remote,
                "current": base_of(&self.conn, &table, &record, &field)? == base,
                "origin": origin,
                "by": by,
                "stamp": stamp,
                "territory": territory,
                "context": context,
            }));
        }
        Ok(list)
    }

    /// The territory a record belongs to, and the fields that name it.
    fn describe(&self, table: &str, record: &str) -> Result<(Value, Map<String, Value>)> {
        let fields = self.record(table, record)?;
        let territory_id = if table == "territories" {
            Some(record.to_string())
        } else {
            fields.get("territory").and_then(Value::as_str).map(String::from)
        };
        let territory = match &territory_id {
            Some(tid) => {
                let get = |f: &str| self.field("territories", tid, f);
                serde_json::json!({ "id": tid, "number": get("number")?, "name": get("name")? })
            }
            None => Value::Null,
        };
        // a border is drawn with the others' current parts
        let mut context = Map::new();
        for (key, value) in fields {
            let wanted = match table {
                "territories" => BORDER.contains(&key.as_str()) || key == "number" || key == "name",
                _ => !key.starts_with('_') && key != "order",
            };
            if wanted {
                context.insert(key, value);
            }
        }
        Ok((territory, context))
    }

    /// The records counted as waiting to sync: what the paired phone furthest
    /// behind is missing, as `peers` counts it, newest first.
    pub fn waiting(&self) -> Result<Vec<Value>> {
        let mut behind: Option<(i64, Versions)> = None;
        // as the app counts: a phone never synced with doesn't count
        for (_, versions) in self.paired_where("last_sync > 0", [])? {
            let seen: Versions = serde_json::from_str(&versions).unwrap_or_default();
            let count = self.pending(&seen)?;
            if behind.as_ref().map_or(true, |(most, _)| count > *most) {
                behind = Some((count, seen));
            }
        }
        let Some((_, seen)) = behind else {
            return Ok(Vec::new());
        };
        let mut found: BTreeMap<(String, String), (Vec<String>, String)> = BTreeMap::new();
        for cell in self.changes_since(&seen)? {
            let (fields, stamp) = found.entry((cell.t, cell.i)).or_default();
            fields.push(cell.f);
            if cell.s > *stamp {
                *stamp = cell.s;
            }
        }
        let mut list = Vec::new();
        for ((table, record), (mut fields, stamp)) in found {
            let stored: i64 = self
                .conn
                .query_row(
                    "SELECT count(*) FROM cells WHERE tbl = ?1 AND id = ?2",
                    [&table, &record],
                    |r| r.get(0),
                )
                .map_err(err)?;
            let deleted = fields.iter().any(|f| f == DELETED)
                && self.field(&table, &record, DELETED)? == Some(Value::Bool(true));
            let added = stored == fields.len() as i64;
            fields.retain(|f| f != DELETED && f != "order");
            fields.sort();
            let (territory, context) = self.describe(&table, &record)?;
            list.push(serde_json::json!({
                "table": table,
                "record": record,
                "fields": fields,
                "stamp": stamp,
                // the other phone has none of it yet
                "added": added,
                "deleted": deleted,
                "territory": territory,
                "context": context,
            }));
        }
        list.sort_by(|a, b| b["stamp"].as_str().cmp(&a["stamp"].as_str()));
        Ok(list)
    }

    /// Takes the incoming value (`theirs`) or the one this phone had for each
    /// change. A value not in effect is written as a new edit, so it syncs;
    /// one already in effect is only marked decided. A change whose field
    /// was edited since is left alone and reported, unless `force`.
    pub fn decide(&mut self, ids: &[i64], theirs: bool, force: bool) -> Result<Vec<Value>> {
        self.batch(|store| {
            let mut results = Vec::new();
            let mut queue: Vec<i64> = ids.to_vec();
            let mut seen = std::collections::BTreeSet::new();
            let mut next = 0;
            while next < queue.len() {
                let id = queue[next];
                next += 1;
                if !seen.insert(id) {
                    continue;
                }
                let row: Option<Decidable> = store
                    .conn
                    .query_row(
                        "SELECT tbl, rid, field, old, new, won, base, decision, sync FROM changes WHERE id = ?1",
                        [id],
                        |r| {
                            Ok((
                                r.get(0)?,
                                r.get(1)?,
                                r.get(2)?,
                                r.get(3)?,
                                r.get(4)?,
                                r.get(5)?,
                                r.get(6)?,
                                r.get(7)?,
                                r.get(8)?,
                            ))
                        },
                    )
                    .optional()
                    .map_err(err)?;
                let Some((table, record, field, old, new, won, base, decision, sync)) = row else {
                    continue;
                };
                // what went or came with a territory goes or comes back with it
                if table == "territories" && (field == DELETED || field == RECORD) {
                    queue.extend(store.children_in(sync, &record, &field, &new)?);
                }
                let in_effect = decision.as_deref().map_or(won, |d| d == "theirs");
                let mut stale = false;
                let mut wrote = false;
                if in_effect != theirs {
                    if !force && base_of(&store.conn, &table, &record, &field)? != base {
                        stale = true;
                    } else if field == RECORD {
                        store.set_deleted(&table, &record, !theirs)?;
                        wrote = true;
                    } else if field == DELETED {
                        let target = if theirs { new } else { old.unwrap_or_else(|| "false".into()) };
                        store.set_deleted(&table, &record, target == "true")?;
                        wrote = true;
                    } else {
                        let target = if theirs { Some(new) } else { old };
                        let value = match target {
                            Some(text) => serde_json::from_str(&text).map_err(err)?,
                            None => Value::Null,
                        };
                        let mut fields = Map::new();
                        fields.insert(field.clone(), value);
                        wrote = store.put(&table, &record, &fields)? > 0;
                    }
                }
                if !stale {
                    store.conclude(id, theirs, wrote)?;
                }
                results.push(serde_json::json!({ "id": id, "done": !stale, "stale": stale }));
            }
            Ok(results)
        })
    }

    /// The assignment and do-not-call changes of one sync that came with a
    /// territory's deletion or creation: the same kind of change to a record
    /// of that territory.
    fn children_in(&self, sync: i64, territory: &str, field: &str, new: &str) -> Result<Vec<i64>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id FROM changes c
                 JOIN cells t ON t.tbl = c.tbl AND t.id = c.rid AND t.field = 'territory'
                 WHERE c.sync = ?1 AND c.tbl IN ('assignments', 'do_not_calls')
                   AND c.field = ?2 AND (?2 = ?3 OR c.new = ?4) AND t.value = ?5",
            )
            .map_err(err)?;
        let territory = Value::String(territory.into()).to_string();
        let rows = stmt
            .query_map(params![sync, field, RECORD, new, territory], |r| r.get(0))
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    /// Marks a change decided and tells the other phones, as a synced
    /// decision record, which value stays and what was written for it.
    fn conclude(&mut self, id: i64, theirs: bool, wrote: bool) -> Result<()> {
        let (table, record, field, old_stamp, new_stamp, conflict): (
            String,
            String,
            String,
            Option<String>,
            String,
            bool,
        ) = self
            .conn
            .query_row(
                "SELECT tbl, rid, field, old_stamp, new_stamp, outcome = 'conflict' FROM changes WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .map_err(err)?;
        self.conn
            .execute(
                "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, record, field],
            )
            .map_err(err)?;
        self.conn
            .execute(
                "UPDATE changes SET decision = ?2, decided = ?3, decided_by = NULL, base = ?4 WHERE id = ?1",
                params![
                    id,
                    if theirs { "theirs" } else { "mine" },
                    now_secs().to_string(),
                    base_of(&self.conn, &table, &record, &field)?
                ],
            )
            .map_err(err)?;
        let written = if wrote {
            let cell = if field == RECORD { DELETED } else { field.as_str() };
            self.field_stamp(&table, &record, cell)?.unwrap_or_default()
        } else {
            String::new()
        };
        let kind = match (theirs, conflict) {
            (true, _) => "applied",
            (false, true) => "declined",
            (false, false) => "undone",
        };
        let chosen = if theirs { Some(new_stamp.clone()) } else { old_stamp.clone() };
        let fields = serde_json::json!({
            "table": table,
            "record": record,
            "field": field,
            "stamps": [new_stamp, old_stamp.unwrap_or_default()],
            "chosen": chosen.unwrap_or_default(),
            "written": written,
            "kind": kind,
            "by": self.identity.id,
            "at": now_secs(),
        });
        let key = format!("{table}/{record}/{field}/{new_stamp}");
        self.put(DECISIONS, &key, fields.as_object().expect("an object"))?;
        Ok(())
    }

    fn field_stamp(&self, table: &str, id: &str, field: &str) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT stamp FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                params![table, id, field],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    pub fn log_sync(
        &self,
        peer: &str,
        name: &str,
        sent: usize,
        sent_territories: &[Touched],
        applied: &Applied,
        removed: &[String],
    ) -> Result<Option<i64>> {
        if sent == 0 && applied.cells == 0 && removed.is_empty() && applied.changes.is_empty() {
            return Ok(None);
        }
        let detail = serde_json::json!({
            "received": applied.territories,
            "sent": sent_territories,
            "removed": removed,
        });
        self.conn
            .execute(
                "INSERT INTO log(at, peer, name, sent, received, items, detail)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    now_secs(),
                    peer,
                    name,
                    sent as i64,
                    applied.cells as i64,
                    serde_json::to_string(&applied.items).map_err(err)?,
                    detail.to_string()
                ],
            )
            .map_err(err)?;
        let sync = self.conn.last_insert_rowid();
        let mut insert = self
            .conn
            .prepare(
                "INSERT INTO changes(sync, tbl, rid, field, old, old_stamp, new, new_stamp,
                   origin, outcome, won, base) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )
            .map_err(err)?;
        for c in &applied.changes {
            insert
                .execute(params![
                    sync,
                    c.t,
                    c.i,
                    c.f,
                    c.old,
                    c.old_stamp,
                    c.new,
                    c.new_stamp,
                    c.origin,
                    if c.conflict { "conflict" } else { "applied" },
                    c.won,
                    c.base
                ])
                .map_err(err)?;
        }
        self.conn
            .execute(
                "DELETE FROM log WHERE rowid NOT IN (SELECT rowid FROM log ORDER BY at DESC LIMIT 50)",
                [],
            )
            .map_err(err)?;
        self.conn
            .execute("DELETE FROM changes WHERE sync NOT IN (SELECT rowid FROM log)", [])
            .map_err(err)?;
        Ok(Some(sync))
    }

    /// The latest syncs, newest first.
    pub fn log(&self) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT at, peer, name, sent, received, items, detail, rowid,
                   (SELECT count(*) FROM changes WHERE sync = log.rowid),
                   (SELECT count(*) FROM changes WHERE sync = log.rowid
                      AND outcome = 'conflict' AND decision IS NULL)
                 FROM log ORDER BY at DESC, rowid DESC LIMIT 30",
            )
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
                    "detail": serde_json::from_str::<Value>(&r.get::<_, String>(6)?)
                        .unwrap_or(Value::Null),
                    "id": r.get::<_, i64>(7)?,
                    "changes": r.get::<_, i64>(8)?,
                    "open": r.get::<_, i64>(9)?,
                }))
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    pub fn peers(&self) -> Result<Vec<Peer>> {
        let mut peers = Vec::new();
        for (mut peer, versions) in self.paired_where("1", [])? {
            let seen: Versions = serde_json::from_str(&versions).unwrap_or_default();
            peer.pending = self.pending(&seen)?;
            peers.push(peer);
        }
        Ok(peers)
    }

    /// The paired phones, without counting what each still needs: that
    /// takes a query per phone and origin, while the store is locked.
    pub fn paired(&self) -> Result<Vec<Peer>> {
        Ok(self.paired_where("1", [])?.into_iter().map(|(peer, _)| peer).collect())
    }

    fn paired_where(&self, filter: &str, values: impl rusqlite::Params) -> Result<Vec<(Peer, String)>> {
        let mut stmt = self
            .conn
            .prepare(&format!(
                "SELECT id, name, platform, public_key, adv_secret, paired_at, last_sync, versions,
                   introduced_by
                 FROM peers WHERE {filter} ORDER BY name"
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(values, |r| {
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
        rows.collect::<std::result::Result<_, _>>().map_err(err)
    }

    /// A paired phone, with no pending count.
    pub fn peer(&self, id: &str) -> Result<Option<Peer>> {
        Ok(self.paired_where("id = ?1", [id])?.pop().map(|(peer, _)| peer))
    }

    pub fn peer_by_key(&self, public_key: &[u8]) -> Result<Option<Peer>> {
        Ok(self
            .paired_where("public_key = ?1", [public_key])?
            .pop()
            .map(|(peer, _)| peer))
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

    /// An id paired with another key, or a key paired under another id,
    /// would let one phone take another's place.
    pub fn check_pair(&self, id: &str, key: &[u8]) -> Result<()> {
        let clash: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1 FROM peers WHERE (id = ?1) <> (public_key = ?2)
                 UNION ALL SELECT 1 FROM removed
                   WHERE public_key IS NOT NULL AND (id = ?1) <> (public_key = ?2)
                 LIMIT 1",
                params![id, key],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        match clash {
            Some(_) => Err(PAIR_CLASH.into()),
            None => Ok(()),
        }
    }

    /// Whether the phone with this id or key was removed from the group and
    /// not paired since.
    pub fn was_removed(&self, id: &str, key: &[u8]) -> Result<bool> {
        Ok(self.standing(id)?.is_some_and(|s| s.removed) || self.removed_by_key(key)?.is_some())
    }

    /// Pairing in person clears a removal from the group, here and, as the
    /// newer stamp, on every other phone.
    pub fn add_peer(&mut self, peer: &Peer) -> Result<()> {
        if peer.id == self.identity.id || peer.public_key == self.identity.public_key {
            return Err("that is this phone".into());
        }
        self.check_pair(&peer.id, &peer.public_key)?;
        self.conn
            .execute(
                "INSERT INTO peers(id, name, platform, public_key, adv_secret, paired_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                   platform = excluded.platform, adv_secret = excluded.adv_secret",
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
        self.conn
            .execute("UPDATE peers SET introduced_by = NULL WHERE id = ?1", [&peer.id])
            .map_err(err)?;
        let stamp = self.clock.tick(&self.identity.id);
        let standing = Standing { stamp, removed: false };
        self.set_standing(&peer.id, &standing, &peer.name, Some(&peer.public_key))?;
        if self.is_removed()? {
            let stamp = self.clock.tick(&self.identity.id);
            let (id, name) = (self.identity.id.clone(), self.identity.name.clone());
            self.set_standing(&id, &Standing { stamp, removed: false }, &name, None)?;
        }
        Ok(())
    }

    /// Removes the phone from the whole group: every phone that hears of it
    /// drops it, and none adds it back until someone pairs with it again.
    pub fn remove_peer(&mut self, id: &str) -> Result<()> {
        if id == self.identity.id {
            return Err("that is this phone".into());
        }
        let peer = self.peer(id)?;
        let stamp = self.clock.tick(&self.identity.id);
        let name = peer.as_ref().map(|p| p.name.as_str()).unwrap_or_default();
        let key = peer.as_ref().map(|p| p.public_key.as_slice());
        self.set_standing(id, &Standing { stamp, removed: true }, name, key)?;
        self.conn
            .execute("DELETE FROM peers WHERE id = ?1", [id])
            .map_err(err)?;
        Ok(())
    }

    fn standing(&self, id: &str) -> Result<Option<Standing>> {
        self.conn
            .query_row("SELECT stamp, gone FROM removed WHERE id = ?1", [id], |r| {
                Ok(Standing { stamp: r.get(0)?, removed: r.get(1)? })
            })
            .optional()
            .map_err(err)
    }

    fn set_standing(&self, id: &str, standing: &Standing, name: &str, key: Option<&[u8]>) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO removed(id, stamp, gone, name, public_key) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET stamp = excluded.stamp, gone = excluded.gone,
                   name = CASE WHEN excluded.name = '' THEN name ELSE excluded.name END,
                   public_key = coalesce(excluded.public_key, public_key)",
                params![id, standing.stamp, standing.removed, name, key],
            )
            .map_err(err)?;
        Ok(())
    }

    /// Whether this phone was removed from its group and not paired since.
    pub fn is_removed(&self) -> Result<bool> {
        Ok(self.standing(&self.identity.id)?.is_some_and(|s| s.removed))
    }

    /// When the phone with this key was removed from the group, if it was.
    pub fn removed_by_key(&self, key: &[u8]) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT stamp FROM removed WHERE public_key = ?1 AND gone = 1 AND stamp <> ''",
                [key],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }

    /// Takes a phone's standing when it is newer than the one known here.
    /// A removal drops the phone; this phone's own removal drops them all.
    /// Returns the name of a paired phone it dropped.
    pub fn take_standing(&mut self, id: &str, standing: &Standing, name: &str) -> Result<Option<String>> {
        if !is_id(id) || !hlc::plausible(&standing.stamp) {
            return Ok(None);
        }
        if self.standing(id)?.is_some_and(|known| known.stamp >= standing.stamp) {
            return Ok(None);
        }
        self.clock.observe(&standing.stamp);
        let peer = self.peer(id)?;
        let key = peer.as_ref().map(|p| p.public_key.as_slice());
        self.set_standing(id, standing, name, key)?;
        if !standing.removed {
            return Ok(None);
        }
        if id == self.identity.id {
            self.conn.execute("DELETE FROM peers", []).map_err(err)?;
            return Ok(None);
        }
        self.conn
            .execute("DELETE FROM peers WHERE id = ?1", [id])
            .map_err(err)?;
        // what it changed after its removal came in through a phone that
        // hadn't heard of it yet
        self.conn
            .execute(
                "DELETE FROM cells WHERE origin = ?1 AND stamp > ?2",
                params![id, standing.stamp],
            )
            .map_err(err)?;
        Ok(peer.map(|p| p.name))
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
    /// Removals and pairings again go along, the removed phones with no key.
    pub fn circle(&self, to: &str) -> Result<Vec<Member>> {
        let mut standings: BTreeMap<String, (String, Standing)> = BTreeMap::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT id, name, stamp, gone FROM removed")
                .map_err(err)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        Standing { stamp: r.get(2)?, removed: r.get(3)? },
                    ))
                })
                .map_err(err)?;
            for row in rows {
                let (id, name, standing) = row.map_err(err)?;
                if hlc::valid(&standing.stamp) {
                    standings.insert(id, (name, standing));
                }
            }
        }
        let mut members = Vec::new();
        for peer in self.paired()? {
            if peer.id == to {
                continue;
            }
            members.push(Member {
                held: self.peer_versions(&peer.id)?,
                standing: standings.remove(&peer.id).map(|(_, s)| s),
                id: peer.id,
                name: peer.name,
                platform: peer.platform,
                key: STANDARD.encode(&peer.public_key),
                adv: STANDARD.encode(&peer.adv_secret),
            });
        }
        for (id, (name, standing)) in standings {
            members.push(Member {
                id,
                name,
                platform: String::new(),
                key: String::new(),
                adv: String::new(),
                held: Versions::new(),
                standing: Some(standing),
            });
        }
        Ok(members)
    }

    /// Takes the standings a paired phone passed on, then adds the phones it
    /// is paired with. Returns the names of the phones added and dropped.
    pub fn introduce(&mut self, members: &[Member], by: &str) -> Result<(Vec<String>, Vec<String>)> {
        let mut dropped = Vec::new();
        for member in members {
            // a phone can't vouch for itself
            if member.id == by {
                continue;
            }
            if let Some(standing) = &member.standing {
                dropped.extend(self.take_standing(&member.id, standing, &member.name)?);
            }
        }
        if self.is_removed()? {
            return Ok((Vec::new(), dropped));
        }
        let mut added = Vec::new();
        for member in members {
            if member.id == self.identity.id || !is_id(&member.id) {
                continue;
            }
            // a peer list from a phone that hasn't heard yet brings no one back
            if self.standing(&member.id)?.is_some_and(|s| s.removed) {
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
            // one bad entry spoils neither the others nor the sync
            let (Ok(key), Ok(adv)) = (STANDARD.decode(&member.key), STANDARD.decode(&member.adv))
            else {
                continue;
            };
            if key.len() != 32 || adv.len() != 16 || key == self.identity.public_key {
                continue;
            }
            // a paired key under another id would lock that phone out
            let taken: Option<i64> = self
                .conn
                .query_row("SELECT 1 FROM peers WHERE public_key = ?1", [&key], |r| r.get(0))
                .optional()
                .map_err(err)?;
            if taken.is_some() {
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
        Ok((added, dropped))
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

    /// A one-way transfer shows what its sender holds, with no session to
    /// say so: kept with what is already known of it, never lowered.
    pub fn note_held(&self, id: &str, theirs: &Versions) -> Result<()> {
        let known: Option<String> = self
            .conn
            .query_row("SELECT versions FROM peers WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?;
        let Some(known) = known else { return Ok(()) };
        let mut held: Versions = serde_json::from_str(&known).unwrap_or_default();
        for (origin, seq) in theirs {
            let entry = held.entry(origin.clone()).or_insert(0);
            *entry = (*entry).max(*seq);
        }
        self.record_sync(id, &held)
    }

    /// Changes no paired phone has received yet. Once one has them, they
    /// travel on through the circle.
    pub fn unsynced(&self) -> Result<i64> {
        Ok(self.peers()?.iter().map(|p| p.pending).min().unwrap_or(0))
    }
}

fn noted(cell: &Cell, old: Option<(&str, &str)>, conflict: bool, won: bool) -> Change {
    Change {
        t: cell.t.clone(),
        i: cell.i.clone(),
        f: cell.f.clone(),
        old: old.map(|(value, _)| value.to_string()),
        old_stamp: old.map(|(_, stamp)| stamp.to_string()),
        new: cell.v.to_string(),
        new_stamp: cell.s.clone(),
        origin: cell.o.clone(),
        conflict,
        won,
        base: String::new(),
    }
}

fn deletion_key(cell: &Cell) -> (String, String, String) {
    (cell.t.clone(), cell.i.clone(), DELETED.into())
}

/// A record deleted on one phone and edited on the other, as a change of
/// its deletion: `gone_here` when this phone had it deleted.
fn deletion_change(cell: &Cell, old_stamp: Option<&str>, gone_here: bool, won: bool) -> Change {
    let (old, new) = if gone_here { ("true", "false") } else { ("false", "true") };
    Change {
        f: DELETED.into(),
        old: Some(old.into()),
        old_stamp: old_stamp.map(String::from),
        new: new.into(),
        conflict: true,
        ..noted(cell, None, true, won)
    }
}

/// A phone that edited the record of this incoming deletion, unseen by it,
/// while this phone hadn't seen the deletion either.
fn unseen_edit(conn: &Connection, cell: &Cell, sender: &Versions, mine: &Versions) -> Result<Option<String>> {
    if mine.get(&cell.o).copied().unwrap_or(0) >= cell.q {
        return Ok(None);
    }
    let mut stmt = conn
        .prepare(
            "SELECT origin, seq FROM cells WHERE tbl = ?1 AND id = ?2
               AND field NOT IN (?3, 'order') AND origin <> ?4 ORDER BY stamp DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![cell.t, cell.i, DELETED, cell.o], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(err)?;
    for row in rows {
        let (origin, seq) = row.map_err(err)?;
        if sender.get(&origin).copied().unwrap_or(0) < seq {
            return Ok(Some(origin));
        }
    }
    Ok(None)
}

/// The stamp a change is judged by: its field's, or for a whole record or
/// its deletion, the record's newest.
fn base_of(conn: &Connection, table: &str, id: &str, field: &str) -> Result<String> {
    let sql = if field == RECORD || field == DELETED {
        "SELECT coalesce(max(stamp), '') FROM cells WHERE tbl = ?1 AND id = ?2 AND field <> 'order' AND ?3 = ?3"
    } else {
        "SELECT coalesce(max(stamp), '') FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3"
    };
    conn.query_row(sql, params![table, id, field], |r| r.get(0)).map_err(err)
}

/// A decision record's fields, read straight from the cells.
fn decision_of(conn: &Connection, id: &str) -> Result<Map<String, Value>> {
    let mut stmt = conn
        .prepare("SELECT field, value FROM cells WHERE tbl = ?1 AND id = ?2")
        .map_err(err)?;
    let rows = stmt
        .query_map(params![DECISIONS, id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?;
    let mut fields = Map::new();
    for row in rows {
        let (field, value) = row.map_err(err)?;
        fields.insert(field, serde_json::from_str(&value).map_err(err)?);
    }
    Ok(fields)
}

/// The stamps a decision speaks about: both values of the clash, and the
/// edit it wrote.
fn decision_stamps(decision: &Map<String, Value>) -> Vec<String> {
    let mut stamps: Vec<String> = decision
        .get("stamps")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default();
    if let Some(written) = decision.get("written").and_then(Value::as_str) {
        stamps.push(written.to_string());
    }
    stamps.retain(|s| !s.is_empty());
    stamps
}

/// Another phone decided a clash this phone has open too: its pick is the
/// value that stays, so the clash closes here as well.
fn settled_elsewhere(conn: &Connection, me: &str, id: &str) -> Result<()> {
    let decision = decision_of(conn, id)?;
    let text = |key: &str| decision.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
    let (by, chosen) = (text("by"), text("chosen"));
    if by == me || chosen.is_empty() {
        return Ok(());
    }
    let stamps = decision_stamps(&decision);
    let mut stmt = conn
        .prepare(
            "SELECT id, coalesce(old_stamp, ''), new_stamp FROM changes
             WHERE tbl = ?1 AND rid = ?2 AND field = ?3 AND outcome = 'conflict' AND decision IS NULL",
        )
        .map_err(err)?;
    let rows: Vec<(i64, String, String)> = stmt
        .query_map(params![text("table"), text("record"), text("field")], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(err)?
        .collect::<std::result::Result<_, _>>()
        .map_err(err)?;
    for (row, old, new) in rows {
        if !stamps.contains(&old) && !stamps.contains(&new) {
            continue;
        }
        let theirs = if chosen == new {
            "theirs"
        } else if chosen == old {
            "mine"
        } else {
            continue;
        };
        let base = base_of(conn, &text("table"), &text("record"), &text("field"))?;
        conn.execute(
            "UPDATE changes SET decision = ?2, decided = ?3, decided_by = ?4, base = ?5 WHERE id = ?1",
            params![row, theirs, now_secs().to_string(), by, base],
        )
        .map_err(err)?;
        conn.execute(
            "DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2 AND field = ?3",
            params![text("table"), text("record"), text("field")],
        )
        .map_err(err)?;
    }
    Ok(())
}

/// A deleted record's clashes are nobody's concern any more.
fn settle_record(conn: &Connection, table: &str, id: &str) -> Result<()> {
    conn.execute("DELETE FROM conflicts WHERE tbl = ?1 AND id = ?2", params![table, id])
        .map_err(err)?;
    Ok(())
}

/// Kept as a clash of the deletion: the record stays, and resolving it with
/// the other value deletes it again.
fn deleted_while_edited(conn: &Connection, table: &str, id: &str, deleted_by: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO conflicts VALUES (?1, ?2, ?3, 'false', 'true', ?4, ?5)",
        params![table, id, DELETED, deleted_by, now_secs()],
    )
    .map_err(err)?;
    Ok(())
}

/// A stamp in the right shape, not from the far future, made by the phone
/// the cell claims.
fn made_by(cell: &Cell) -> bool {
    hlc::plausible(&cell.s) && hlc::device(&cell.s) == Some(cell.o.as_str()) && is_id(&cell.o)
}

/// Whether an incoming cell may be stored: well made, for a table the app
/// keeps, and not by a removed phone after its removal.
fn takes(cell: &Cell, removals: &BTreeMap<String, String>) -> bool {
    made_by(cell)
        && (TABLES.contains(&cell.t.as_str()) || cell.t == DECISIONS)
        && removals.get(&cell.o).is_none_or(|removal| cell.s <= *removal)
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
        s.put("people", "1", &fields(json!({"a": 1, "b": 2}))).unwrap();
        assert_eq!(s.put("people", "1", &fields(json!({"a": 1, "b": 3}))).unwrap(), 1);
    }

    #[test]
    fn two_phones_converge_after_conflicting_edits() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"name": "North", "city": "Graz"})))
            .unwrap();
        sync(&mut a, &mut b);

        // both edit the same record offline: different fields merge, the
        // same field goes to the later write
        a.put("people", "1", &fields(json!({"name": "North A"}))).unwrap();
        b.put("people", "1", &fields(json!({"city": "Linz"}))).unwrap();
        b.put("people", "1", &fields(json!({"name": "North B"}))).unwrap();
        sync(&mut a, &mut b);

        let expected = vec![json!({"id": "1", "name": "North B", "city": "Linz"})];
        assert_eq!(a.list("people").unwrap(), expected);
        assert_eq!(b.list("people").unwrap(), expected);
        assert_eq!(a.versions().unwrap(), b.versions().unwrap());
    }

    #[test]
    fn changes_travel_through_a_third_phone() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        sync(&mut b, &mut c);
        assert_eq!(c.list("people").unwrap(), a.list("people").unwrap());
        // nothing left to send once everyone has it
        assert!(a.changes_since(&c.versions().unwrap()).unwrap().is_empty());
    }

    #[test]
    fn a_delete_syncs() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        b.remove("people", "1").unwrap();
        sync(&mut a, &mut b);
        assert!(a.list("people").unwrap().is_empty());
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
        a.put("people", "1", &fields(json!({"holder": "Anna", "city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);

        a.put("people", "1", &fields(json!({"holder": "Carl"}))).unwrap();
        later();
        b.put("people", "1", &fields(json!({"holder": "Dora"}))).unwrap();
        sync(&mut a, &mut b);

        assert_eq!(a.list("people").unwrap(), b.list("people").unwrap());
        let (ca, cb) = (a.conflicts().unwrap(), b.conflicts().unwrap());
        assert_eq!((ca.len(), cb.len()), (1, 1));
        assert_eq!(ca[0]["kept"], json!("Dora"));
        assert_eq!(ca[0]["lost"], json!("Carl"));
        assert_eq!(ca[0]["mine"], json!(true));
        assert_eq!(cb[0]["mine"], json!(false));

        // one after the other is no clash
        b.put("people", "1", &fields(json!({"city": "Linz"}))).unwrap();
        sync(&mut a, &mut b);
        later();
        a.put("people", "1", &fields(json!({"city": "Wels"}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.conflicts().unwrap().len(), 1);

        // keeping the other value makes it win everywhere
        later();
        a.resolve("people", "1", "holder", true).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(b.list("people").unwrap()[0]["holder"], json!("Carl"));
        assert!(a.conflicts().unwrap().is_empty());
        assert!(b.conflicts().unwrap().is_empty());
    }

    #[test]
    fn an_edit_made_meanwhile_outlives_a_delete() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1}))).unwrap();
        sync(&mut a, &mut b);
        a.remove("people", "1").unwrap();
        later();
        b.put("people", "1", &fields(json!({"n": 2}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.list("people").unwrap(), vec![json!({"id": "1", "n": 2})]);
        assert_eq!(b.list("people").unwrap(), a.list("people").unwrap());
    }

    #[test]
    fn a_record_brought_back_can_be_deleted_again() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1}))).unwrap();
        a.remove("people", "1").unwrap();
        later();
        b.put("people", "1", &fields(json!({"n": 2}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.list("people").unwrap().len(), 1);
        later();
        a.remove("people", "1").unwrap();
        sync(&mut a, &mut b);
        assert!(a.list("people").unwrap().is_empty());
        assert!(b.list("people").unwrap().is_empty());
    }

    #[test]
    fn writing_to_a_deleted_record_brings_it_back() {
        let mut s = Store::in_memory().unwrap();
        s.put("people", "1", &fields(json!({"name": "Ben"}))).unwrap();
        s.remove("people", "1").unwrap();
        s.put("people", "1", &fields(json!({"name": "Ben"}))).unwrap();
        assert_eq!(s.list("people").unwrap().len(), 1);
    }

    #[test]
    fn an_undone_deletion_reaches_the_other_phone() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("assignments", "x", &fields(json!({"publisher": "Ben", "order": 0}))).unwrap();
        sync(&mut a, &mut b);
        a.remove("assignments", "x").unwrap();
        sync(&mut a, &mut b);
        assert!(b.list("assignments").unwrap().is_empty());
        later();
        // undo writes the record again as it was
        a.put("assignments", "x", &fields(json!({"publisher": "Ben", "order": 0}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(b.list("assignments").unwrap(), a.list("assignments").unwrap());
        assert_eq!(b.list("assignments").unwrap().len(), 1);
    }

    #[test]
    fn a_sync_names_the_territories_it_changed() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t12", &fields(json!({"number": "12"}))).unwrap();
        a.put("territories", "t3", &fields(json!({"number": "3"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("assignments", "x", &fields(json!({"territory": "t12", "publisher": "Ben"})))
            .unwrap();
        a.put("do_not_calls", "d", &fields(json!({"territory": "t3", "address": "Main 1"})))
            .unwrap();
        a.put("territories", "t12", &fields(json!({"city": "Xanten"}))).unwrap();
        let cells = a.changes_since(&b.versions().unwrap()).unwrap();
        let applied = b.apply(&cells, &a.versions().unwrap()).unwrap();
        assert_eq!(
            applied.territories,
            vec![
                Touched { id: "t3".into(), number: "3".into(), what: vec!["dnc-added".into()] },
                Touched {
                    id: "t12".into(),
                    number: "12".into(),
                    what: vec!["assigned".into(), "details".into()]
                },
            ]
        );
    }

    #[test]
    fn a_group_on_an_assignment_syncs_as_an_assignment() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1"}))).unwrap();
        a.put("assignments", "x", &fields(json!({"territory": "t1", "publisher": "Ben"})))
            .unwrap();
        sync(&mut a, &mut b);
        a.put("assignments", "x", &fields(json!({"group": "Group 3"}))).unwrap();
        assert_eq!(received(&a, &mut b), vec![told("1", &["assigned"])]);
        let row = b.list("assignments").unwrap().into_iter().find(|r| r["id"] == "x").unwrap();
        assert_eq!(row["group"], "Group 3");
        assert_eq!(row["publisher"], "Ben");
    }

    fn received(a: &Store, b: &mut Store) -> Vec<(String, Vec<String>)> {
        let cells = a.changes_since(&b.versions().unwrap()).unwrap();
        let applied = b.apply(&cells, &a.versions().unwrap()).unwrap();
        applied.territories.into_iter().map(|t| (t.number, t.what)).collect()
    }

    fn told(number: &str, what: &[&str]) -> (String, Vec<String>) {
        (number.into(), what.iter().map(|w| w.to_string()).collect())
    }

    #[test]
    fn a_new_territory_is_only_added() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t5", &fields(json!({"number": "5", "boundary": [[1, 2]]})))
            .unwrap();
        a.put("assignments", "x", &fields(json!({"territory": "t5", "publisher": "Ben"})))
            .unwrap();
        assert_eq!(received(&a, &mut b), vec![told("5", &["created"])]);
    }

    #[test]
    fn a_deleted_territory_is_only_deleted() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t5", &fields(json!({"number": "5"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t5", &fields(json!({"city": "Graz"}))).unwrap();
        a.remove("territories", "t5").unwrap();
        assert_eq!(received(&a, &mut b), vec![told("5", &["deleted"])]);
    }

    #[test]
    fn a_sync_tells_each_change_in_order() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1"}))).unwrap();
        a.put("territories", "t2", &fields(json!({"number": "2"}))).unwrap();
        a.put("assignments", "x", &fields(json!({"territory": "t1", "publisher": "Ben"})))
            .unwrap();
        a.put("assignments", "y", &fields(json!({"territory": "t2", "publisher": "Ann"})))
            .unwrap();
        a.put("do_not_calls", "d", &fields(json!({"territory": "t2", "address": "Main 1"})))
            .unwrap();
        a.put("do_not_calls", "e", &fields(json!({"territory": "t2", "address": "Main 2"})))
            .unwrap();
        sync(&mut a, &mut b);

        a.put("territories", "t1", &fields(json!({"mapLines": [], "order": 3}))).unwrap();
        a.put("assignments", "x", &fields(json!({"returnedOn": "2026-09-01", "months": 2})))
            .unwrap();
        a.remove("assignments", "y").unwrap();
        a.put("do_not_calls", "d", &fields(json!({"address": "Main 3"}))).unwrap();
        a.remove("do_not_calls", "e").unwrap();
        a.put("do_not_calls", "f", &fields(json!({"territory": "t2", "address": "Main 4"})))
            .unwrap();
        a.put("territories", "t2", &fields(json!({"name": "Park"}))).unwrap();
        assert_eq!(
            received(&a, &mut b),
            vec![
                told("1", &["returned", "border"]),
                told("2", &["assignment-removed", "details", "dnc-added", "dnc-changed", "dnc-removed"]),
            ]
        );
    }

    #[test]
    fn the_sender_tells_new_records_but_not_new_territories() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t2", &fields(json!({"number": "2", "boundary": []}))).unwrap();
        a.put("do_not_calls", "d", &fields(json!({"territory": "t1", "address": "Main 1"})))
            .unwrap();
        let cells = a.changes_since(&b.versions().unwrap()).unwrap();
        let mut new = a.unseen(&cells).unwrap();
        new.retain(|(table, _)| table != "territories");
        let sent: Vec<_> =
            a.touched(&cells, &new).unwrap().into_iter().map(|t| (t.number, t.what)).collect();
        assert_eq!(sent, vec![told("1", &["dnc-added"]), told("2", &["border", "details"])]);
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

    #[test]
    fn a_reorder_elsewhere_does_not_bring_a_deleted_record_back() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1, "order": 0}))).unwrap();
        a.put("people", "2", &fields(json!({"n": 2, "order": 1}))).unwrap();
        sync(&mut a, &mut b);
        a.remove("people", "1").unwrap();
        later();
        b.put("people", "1", &fields(json!({"order": 1}))).unwrap();
        b.put("people", "2", &fields(json!({"order": 0}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(a.list("people").unwrap(), vec![json!({"id": "2", "n": 2, "order": 0})]);
        assert_eq!(b.list("people").unwrap(), a.list("people").unwrap());
    }

    fn cell(value: &str, stamp: &str) -> Cell {
        Cell {
            t: "people".into(),
            i: "1".into(),
            f: "n".into(),
            v: json!(value),
            s: stamp.into(),
            o: "00000000000000aa".into(),
            q: 1,
        }
    }

    #[test]
    fn a_stamp_tie_ends_the_same_on_both_phones() {
        let stamp = hlc::encode(1, 0, "00000000000000aa");
        let (x, y) = (cell("x", &stamp), cell("y", &stamp));
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.apply(std::slice::from_ref(&x), &Versions::new()).unwrap();
        a.apply(std::slice::from_ref(&y), &Versions::new()).unwrap();
        b.apply(&[y], &Versions::new()).unwrap();
        b.apply(&[x], &Versions::new()).unwrap();
        assert_eq!(a.list("people").unwrap(), vec![json!({"id": "1", "n": "y"})]);
        assert_eq!(b.list("people").unwrap(), a.list("people").unwrap());
    }

    #[test]
    fn a_cell_with_a_malformed_stamp_is_ignored() {
        let mut s = Store::in_memory().unwrap();
        s.put("people", "1", &fields(json!({"n": "mine"}))).unwrap();
        // "z" sorts after every real stamp and would win for ever
        let applied = s.apply(&[cell("theirs", "zzz")], &Versions::new()).unwrap();
        assert_eq!(applied.cells, 0);
        assert_eq!(s.list("people").unwrap(), vec![json!({"id": "1", "n": "mine"})]);
    }

    #[test]
    fn a_deleted_record_takes_its_clashes_with_it() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"holder": "Anna"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("people", "1", &fields(json!({"holder": "Carl"}))).unwrap();
        later();
        b.put("people", "1", &fields(json!({"holder": "Dora"}))).unwrap();
        sync(&mut a, &mut b);
        assert_eq!((a.conflicts().unwrap().len(), b.conflicts().unwrap().len()), (1, 1));
        later();
        a.remove("people", "1").unwrap();
        assert!(a.conflicts().unwrap().is_empty());
        sync(&mut a, &mut b);
        assert!(b.conflicts().unwrap().is_empty());
    }

    fn peer_of(s: &Store) -> Peer {
        Peer {
            id: s.identity.id.clone(),
            name: s.identity.name.clone(),
            platform: "ios".into(),
            public_key: s.identity.public_key.to_vec(),
            adv_secret: s.identity.adv_secret.to_vec(),
            paired_at: 0,
            last_sync: None,
            pending: 0,
            introduced_by: None,
        }
    }

    fn member(s: &Store, name: &str) -> Member {
        Member {
            id: s.identity.id.clone(),
            name: name.into(),
            platform: "ios".into(),
            key: STANDARD.encode(s.identity.public_key),
            adv: STANDARD.encode(s.identity.adv_secret),
            held: Versions::new(),
            standing: None,
        }
    }

    #[test]
    fn a_circle_list_with_bad_entries_adds_only_the_good_ones() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let c = Store::in_memory().unwrap();
        a.add_peer(&peer_of(&b)).unwrap();
        let members = [
            Member { id: "00000000000000aa".into(), key: "not base64!".into(), ..member(&c, "X") },
            // Ben's key under another id would lock Ben out
            Member { id: "00000000000000bb".into(), ..member(&b, "Fake Ben") },
            Member { id: "../../x".into(), ..member(&c, "Y") },
            Member { adv: STANDARD.encode([1u8; 3]), ..member(&c, "Z") },
            member(&a, "Me"),
            member(&c, "Carl"),
        ];
        assert_eq!(a.introduce(&members, &b.identity.id).unwrap().0, vec!["Carl".to_string()]);
        assert_eq!(a.peer_by_key(&b.identity.public_key).unwrap().unwrap().id, b.identity.id);
        assert_eq!(a.peers().unwrap().len(), 2);
    }

    #[test]
    fn an_unchanged_put_writes_nothing() {
        let mut s = Store::in_memory().unwrap();
        s.put("people", "1", &fields(json!({"n": 1}))).unwrap();
        let before = s.conn.total_changes();
        assert_eq!(s.put("people", "1", &fields(json!({"n": 1}))).unwrap(), 0);
        assert_eq!(s.conn.total_changes(), before);
    }

    #[test]
    fn a_batch_lands_whole_or_not_at_all() {
        let mut s = Store::in_memory().unwrap();
        let failed: Result<()> = s.batch(|s| {
            s.put("people", "1", &fields(json!({"n": 1})))?;
            Err("the page sent a bad write".into())
        });
        assert!(failed.is_err());
        assert!(s.list("people").unwrap().is_empty());
        assert!(s.versions().unwrap().is_empty());
        s.batch(|s| {
            s.put("people", "1", &fields(json!({"n": 1})))?;
            s.remove("people", "1")?;
            s.put("people", "2", &fields(json!({"n": 2})))
        })
        .unwrap();
        assert_eq!(s.list("people").unwrap(), vec![json!({"id": "2", "n": 2})]);
    }

    #[test]
    fn changes_since_and_pending_follow_each_phone_separately() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"n": 1, "m": 2}))).unwrap();
        b.put("people", "2", &fields(json!({"n": 3}))).unwrap();
        sync(&mut a, &mut b);
        let seen = Versions::from([(a.identity.id.clone(), 1)]);
        let cells = a.changes_since(&seen).unwrap();
        let mut sent: Vec<_> = cells.iter().map(|c| (c.o.clone(), c.q)).collect();
        sent.sort();
        let mut expected = vec![(a.identity.id.clone(), 2), (b.identity.id.clone(), 1)];
        expected.sort();
        assert_eq!(sent, expected);
        a.add_peer(&peer_of(&b)).unwrap();
        a.record_sync(&b.identity.id, &seen).unwrap();
        assert_eq!(a.peers().unwrap()[0].pending, 2);
    }

    #[test]
    fn pending_counts_records_not_fields() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        a.add_peer(&peer_of(&b)).unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1", "name": "A", "city": "B"})))
            .unwrap();
        assert_eq!(a.peers().unwrap()[0].pending, 1);
    }

    #[test]
    fn waiting_lists_what_the_count_counts_newest_first() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        a.add_peer(&peer_of(&b)).unwrap();
        a.put("territories", "t1", &fields(json!({"number": "M12", "name": "Mitte"})))
            .unwrap();
        // not synced yet: the app counts nothing, so nothing is listed
        assert!(a.waiting().unwrap().is_empty());
        a.record_sync(&b.identity.id, &a.versions().unwrap()).unwrap();
        later();
        a.put("territories", "t1", &fields(json!({"number": "M12", "name": "Mitte Nord"})))
            .unwrap();
        later();
        a.put("assignments", "a1", &fields(json!({"territory": "t1", "publisher": "Max Muster"})))
            .unwrap();
        let list = a.waiting().unwrap();
        assert_eq!(list.len() as i64, a.peers().unwrap()[0].pending);
        assert_eq!(list[0]["table"], "assignments");
        assert_eq!(list[0]["added"], true);
        assert_eq!(list[0]["territory"]["number"], "M12");
        assert_eq!(list[0]["context"]["publisher"], "Max Muster");
        assert_eq!(list[1]["record"], "t1");
        assert_eq!(list[1]["added"], false);
        assert_eq!(list[1]["fields"], json!(["name"]));
        assert!(list[0]["stamp"].as_str() > list[1]["stamp"].as_str());
        a.remove("assignments", "a1").unwrap();
        assert_eq!(a.waiting().unwrap()[0]["deleted"], true);
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("territories-{name}-{}", hex(&random::<4>())));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn databases_from_older_versions_open_and_upgrade() {
        // 0.5 had no removed, conflicts or log; 0.6 had a log without detail
        let v05 = "CREATE TABLE meta(key TEXT PRIMARY KEY, value BLOB NOT NULL);
            CREATE TABLE cells(tbl TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
              value TEXT NOT NULL, stamp TEXT NOT NULL, origin TEXT NOT NULL, seq INTEGER NOT NULL,
              PRIMARY KEY(tbl, id, field));
            CREATE INDEX cells_origin ON cells(origin, seq);
            CREATE TABLE versions(origin TEXT PRIMARY KEY, seq INTEGER NOT NULL);
            CREATE TABLE peers(id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
              public_key BLOB NOT NULL, adv_secret BLOB NOT NULL, paired_at INTEGER NOT NULL,
              last_sync INTEGER, versions TEXT NOT NULL DEFAULT '{}');
            INSERT INTO peers(id, name, platform, public_key, adv_secret, paired_at)
              VALUES ('00000000000000aa', 'Ben', 'ios', zeroblob(32), zeroblob(16), 1);";
        let v06 = format!(
            "{v05} CREATE TABLE log(at INTEGER NOT NULL, peer TEXT NOT NULL, name TEXT NOT NULL,
              sent INTEGER NOT NULL, received INTEGER NOT NULL, items TEXT NOT NULL);
            INSERT INTO log VALUES (1, '00000000000000aa', 'Ben', 2, 3, '{{}}');"
        );
        for schema in [v05.to_string(), v06] {
            let dir = scratch("upgrade");
            let path = dir.join("store.db");
            Connection::open(&path).unwrap().execute_batch(&schema).unwrap();
            for _ in 0..2 {
                let mut s = Store::open(&path).unwrap();
                assert_eq!(s.peers().unwrap()[0].introduced_by, None);
                s.put("people", "1", &fields(json!({"n": 1}))).unwrap();
                s.log_sync("00000000000000aa", "Ben", 1, &[], &Applied::default(), &[]).unwrap();
                assert!(s.log().unwrap().iter().all(|entry| entry["detail"].is_object()));
            }
            std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn a_sync_that_changed_nothing_is_not_logged() {
        let s = Store::in_memory().unwrap();
        s.log_sync("00000000000000aa", "Ben", 0, &[], &Applied::default(), &[]).unwrap();
        assert!(s.log().unwrap().is_empty());
        s.log_sync("00000000000000aa", "Ben", 2, &[], &Applied::default(), &[]).unwrap();
        assert_eq!(s.log().unwrap().len(), 1);
    }

    /// Phones that are all paired with each other.
    fn group(names: &[&str]) -> Vec<Store> {
        let mut stores: Vec<Store> = names
            .iter()
            .map(|name| {
                let mut s = Store::in_memory().unwrap();
                s.set_name(name).unwrap();
                s
            })
            .collect();
        for i in 0..stores.len() {
            for j in 0..stores.len() {
                if i != j {
                    let peer = peer_of(&stores[j]);
                    stores[i].add_peer(&peer).unwrap();
                }
            }
        }
        // what happens next is later than every pairing, not just in counter
        later();
        stores
    }

    /// Two phones pass each other their circle lists. Returns what each dropped.
    fn meet(g: &mut [Store], i: usize, j: usize) -> (Vec<String>, Vec<String>) {
        let [a, b] = g.get_disjoint_mut([i, j]).unwrap();
        let (to_a, to_b) = (b.circle(&a.identity.id).unwrap(), a.circle(&b.identity.id).unwrap());
        let (ia, ib) = (a.identity.id.clone(), b.identity.id.clone());
        (a.introduce(&to_a, &ib).unwrap().1, b.introduce(&to_b, &ia).unwrap().1)
    }

    fn knows(s: &Store, other: &Store) -> bool {
        s.peer(&other.identity.id).unwrap().is_some()
    }

    #[test]
    fn a_removal_spreads_to_every_phone_of_the_group() {
        let mut g = group(&["Anna", "Ben", "Carl", "Dora", "Xena"]);
        let x = g[4].identity.id.clone();
        g[0].remove_peer(&x).unwrap();
        assert!(!knows(&g[0], &g[4]));
        assert_eq!(meet(&mut g, 0, 1), (vec![], vec!["Xena".to_string()]));
        meet(&mut g, 1, 2);
        // Dora hears it from Carl, never having met Anna
        assert_eq!(meet(&mut g, 2, 3), (vec![], vec!["Xena".to_string()]));
        for s in &g[..4] {
            assert!(!knows(s, &g[4]));
            assert_eq!(s.peers().unwrap().len(), 3);
        }
        // news heard twice is no news
        assert_eq!(meet(&mut g, 3, 0), (vec![], vec![]));
        let me = g[0].identity.id.clone();
        assert!(g[0].remove_peer(&me).is_err());
    }

    #[test]
    fn a_stale_peer_list_does_not_bring_a_removed_phone_back() {
        let mut g = group(&["Anna", "Ben", "Carl", "Xena"]);
        let (x, c) = (g[3].identity.id.clone(), g[2].identity.id.clone());
        g[0].remove_peer(&x).unwrap();
        // Carl hasn't heard: he passes Xena on, cleared when he paired with her
        let stale = g[2].circle(&g[0].identity.id).unwrap();
        assert!(stale.iter().any(|m| m.id == x && m.standing.as_ref().is_some_and(|s| !s.removed)));
        assert!(g[0].introduce(&stale, &c).unwrap().0.is_empty());
        // and as an older version sends it, with no standings at all
        let old: Vec<Member> = stale.into_iter().map(|m| Member { standing: None, ..m }).collect();
        assert!(g[0].introduce(&old, &c).unwrap().0.is_empty());
        assert!(!knows(&g[0], &g[3]));
        meet(&mut g, 0, 2);
        assert!(!knows(&g[2], &g[3]));
    }

    #[test]
    fn older_versions_find_no_key_to_add_a_removed_phone_with() {
        let mut g = group(&["Anna", "Ben", "Xena"]);
        let x = g[2].identity.id.clone();
        g[0].remove_peer(&x).unwrap();
        let list = serde_json::to_string(&g[0].circle(&g[1].identity.id).unwrap()).unwrap();
        // what a version without standings reads of it
        #[derive(Deserialize)]
        struct Old {
            id: String,
            key: String,
        }
        let old: Vec<Old> = serde_json::from_str(&list).unwrap();
        let xena = old.iter().find(|m| m.id == x).unwrap();
        assert_eq!(STANDARD.decode(&xena.key).unwrap().len(), 0);
    }

    #[test]
    fn pairing_again_after_a_removal_clears_it_everywhere() {
        let mut g = group(&["Anna", "Ben", "Carl", "Xena"]);
        let (a, x) = (g[0].identity.id.clone(), g[3].identity.id.clone());
        g[0].remove_peer(&x).unwrap();
        let old_news = g[0].circle(&g[1].identity.id).unwrap();
        meet(&mut g, 0, 2);
        later();
        // Ben never heard of the removal and pairs with Xena in person
        let xena = peer_of(&g[3]);
        g[1].add_peer(&xena).unwrap();
        // Carl learned of the removal, then of the pairing, which is newer
        meet(&mut g, 1, 2);
        assert!(knows(&g[2], &g[3]));
        meet(&mut g, 2, 0);
        assert!(knows(&g[0], &g[3]));
        assert_eq!(g[0].peer(&x).unwrap().unwrap().introduced_by, Some(g[2].identity.id.clone()));
        // the old removal, passed on late, doesn't undo it
        assert!(g[1].introduce(&old_news, &a).unwrap().1.is_empty());
        assert!(knows(&g[1], &g[3]));
    }

    fn outline(points: usize, shift: f64) -> Value {
        let ring: Vec<Value> = (0..points)
            .map(|i| json!([16.0 + i as f64 * 1e-4 + shift, 48.0 + (i % 7) as f64 * 1e-4]))
            .collect();
        json!([{"type": "Polygon", "coordinates": [ring], "style": {"color": "#e53", "weight": 3}}])
    }

    #[test]
    fn a_border_edited_on_two_phones_at_once_is_a_conflict() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1", "boundary": outline(10, 0.0)})))
            .unwrap();
        sync(&mut a, &mut b);

        let (mine, theirs) = (outline(3000, 0.001), outline(2500, 0.002));
        a.put("territories", "t1", &fields(json!({"boundary": mine, "mapLines": [[1, 2], [3, 4]]})))
            .unwrap();
        later();
        b.put("territories", "t1", &fields(json!({"boundary": theirs, "mapLines": [[5, 6]]})))
            .unwrap();
        sync(&mut a, &mut b);

        let clashes = a.conflicts().unwrap();
        let mut clashed: Vec<_> = clashes.iter().map(|c| c["field"].as_str().unwrap()).collect();
        clashed.sort();
        assert_eq!(clashed, ["boundary", "mapLines"]);
        assert_eq!(b.conflicts().unwrap().len(), 2);
        // both whole borders, to show side by side
        let boundary = clashes.iter().find(|c| c["field"] == "boundary").unwrap();
        assert_eq!(boundary["kept"], theirs);
        assert_eq!(boundary["lost"], mine);
        assert_eq!(boundary["mine"], json!(true));
        assert_eq!(boundary["record"]["boundary"], theirs);

        later();
        a.resolve("territories", "t1", "boundary", true).unwrap();
        a.resolve("territories", "t1", "mapLines", false).unwrap();
        sync(&mut a, &mut b);
        for s in [&a, &b] {
            let t = &s.list("territories").unwrap()[0];
            assert_eq!(t["boundary"], mine);
            assert_eq!(t["mapLines"], json!([[5, 6]]));
        }
        assert!(a.conflicts().unwrap().is_empty());
        // keeping the value that won writes nothing, so Ben is still asked
        let left = b.conflicts().unwrap();
        assert_eq!((left.len(), &left[0]["field"]), (1, &json!("mapLines")));
        b.resolve("territories", "t1", "mapLines", false).unwrap();
        assert!(b.conflicts().unwrap().is_empty());
    }

    #[test]
    fn a_border_edited_one_after_the_other_is_no_conflict() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1", "boundary": outline(10, 0.0)})))
            .unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t1", &fields(json!({"boundary": outline(2000, 0.001)}))).unwrap();
        sync(&mut a, &mut b);
        later();
        b.put("territories", "t1", &fields(json!({"boundary": outline(2000, 0.002)}))).unwrap();
        sync(&mut a, &mut b);
        assert!(a.conflicts().unwrap().is_empty());
        assert!(b.conflicts().unwrap().is_empty());
        assert_eq!(a.list("territories").unwrap()[0]["boundary"], outline(2000, 0.002));

        // the same shapes drawn on both phones at once, stored with other
        // spacing and key order, are no clash either
        let shapes = json!([{"id": "s1", "kind": "circle", "center": [16.1, 48.2], "radius": 40}]);
        a.put("territories", "t1", &fields(json!({"mapShapes": shapes}))).unwrap();
        b.put("territories", "t1", &fields(json!({"mapShapes": shapes}))).unwrap();
        a.conn
            .execute(
                "UPDATE cells SET value = ?1 WHERE field = 'mapShapes'",
                [r#"[ { "radius": 40, "center": [16.1, 48.2], "kind": "circle", "id": "s1" } ]"#],
            )
            .unwrap();
        sync(&mut a, &mut b);
        assert!(a.conflicts().unwrap().is_empty());
        assert!(b.conflicts().unwrap().is_empty());
    }

    fn ms_from_now(hours: i64) -> u64 {
        ((now_secs() + hours * 3600) * 1000) as u64
    }

    #[test]
    fn a_stamp_more_than_30_days_ahead_is_not_taken_in() {
        let mut s = Store::in_memory().unwrap();
        // a week ahead: a phone whose date is off still syncs
        let soon = cell("soon", &hlc::encode(ms_from_now(24 * 7), 0, "00000000000000aa"));
        let far = Cell { i: "2".into(), ..cell("far", &hlc::encode(ms_from_now(24 * 40), 0, "00000000000000aa")) };
        assert_eq!(s.apply(&[soon, far], &Versions::new()).unwrap().cells, 1);
        assert_eq!(s.list("people").unwrap().len(), 1);
        let far = Standing { stamp: hlc::encode(ms_from_now(24 * 40), 0, "00000000000000aa"), removed: true };
        s.take_standing("00000000000000bb", &far, "Ben").unwrap();
        assert_eq!(s.standing("00000000000000bb").unwrap(), None);
    }

    #[test]
    fn a_cell_from_another_device_than_its_stamp_or_for_no_table_is_ignored() {
        let mut s = Store::in_memory().unwrap();
        let stamp = hlc::encode(1, 0, "00000000000000aa");
        let cells = [
            Cell { o: "00000000000000bb".into(), ..cell("borrowed", &stamp) },
            Cell { t: "secrets".into(), ..cell("unknown", &stamp) },
            Cell { o: "../x".into(), ..cell("bad", &hlc::encode(1, 0, "../x")) },
        ];
        assert_eq!(s.apply(&cells, &Versions::new()).unwrap().cells, 0);
        assert!(s.changes_since(&Versions::new()).unwrap().is_empty());
    }

    #[test]
    fn a_restored_phone_numbers_its_changes_past_what_any_phone_holds() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        for i in 0..15 {
            a.put("people", &format!("p{i}"), &fields(json!({"n": i}))).unwrap();
        }
        sync(&mut a, &mut b);
        for i in 15..25 {
            a.put("people", &format!("p{i}"), &fields(json!({"n": i}))).unwrap();
        }
        sync(&mut a, &mut c);
        // back to a backup from its fifth change: Ben holds 15 of them, Carl 25
        let id = a.identity.id.clone();
        a.conn.execute("DELETE FROM cells WHERE origin = ?1 AND seq > 5", [&id]).unwrap();
        a.conn.execute("DELETE FROM cells WHERE origin <> ?1", [&id]).unwrap();
        a.conn.execute("UPDATE versions SET seq = 5 WHERE origin = ?1", [&id]).unwrap();

        sync(&mut a, &mut b);
        a.put("people", "new", &fields(json!({"n": "after the restore"}))).unwrap();
        sync(&mut a, &mut b);
        // Carl never meets Anna, and still gets her new edit through Ben
        sync(&mut b, &mut c);
        assert!(c.list("people").unwrap().iter().any(|p| p["id"] == "new"));
        assert_eq!(c.list("people").unwrap().len(), 26);
    }

    #[test]
    fn a_new_place_in_a_list_does_not_bring_a_deleted_record_back() {
        let mut s = Store::in_memory().unwrap();
        s.put("assignments", "x", &fields(json!({"publisher": "Ben", "order": 0}))).unwrap();
        s.remove("assignments", "x").unwrap();
        s.put("assignments", "x", &fields(json!({"publisher": "Ben", "order": 1}))).unwrap();
        assert!(s.list("assignments").unwrap().is_empty());
        s.put("assignments", "x", &fields(json!({"publisher": "Carl", "order": 2}))).unwrap();
        assert_eq!(s.list("assignments").unwrap()[0]["publisher"], "Carl");
    }

    #[test]
    fn an_edit_brings_a_deleted_territory_back_with_what_went_with_it() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "1"}))).unwrap();
        for (table, id) in [("assignments", "old"), ("assignments", "x"), ("do_not_calls", "d")] {
            a.put(table, id, &fields(json!({"territory": "t1", "n": id}))).unwrap();
        }
        a.remove("assignments", "old").unwrap();
        sync(&mut a, &mut b);
        // as the page deletes a territory: the territory, then what is in it
        a.batch(|s| {
            s.remove("territories", "t1")?;
            s.remove("assignments", "x")?;
            s.remove("do_not_calls", "d")
        })
        .unwrap();
        later();
        b.put("territories", "t1", &fields(json!({"city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);

        for s in [&a, &b] {
            assert_eq!(s.list("territories").unwrap().len(), 1);
            let ids: Vec<_> = s.list("assignments").unwrap().iter().map(|r| r["id"].clone()).collect();
            assert_eq!(ids, [json!("x")]);
            assert_eq!(s.list("do_not_calls").unwrap().len(), 1);
            let clashes = s.conflicts().unwrap();
            assert_eq!(clashes.len(), 1);
            assert_eq!((&clashes[0]["field"], &clashes[0]["lost"]), (&json!(DELETED), &json!(true)));
        }
        assert_eq!(a.conflicts().unwrap()[0]["mine"], json!(true));

        // deleting it after all takes it away everywhere
        later();
        b.resolve("territories", "t1", DELETED, true).unwrap();
        sync(&mut a, &mut b);
        for s in [&a, &b] {
            assert!(s.list("territories").unwrap().is_empty());
            assert!(s.conflicts().unwrap().is_empty());
        }
    }

    #[test]
    fn what_a_removed_phone_changed_after_its_removal_is_refused_and_dropped() {
        let mut g = group(&["Anna", "Ben", "Xena"]);
        let x = g[2].identity.id.clone();
        g[0].remove_peer(&x).unwrap();
        later();
        g[2].put("people", "p1", &fields(json!({"name": "from Xena"}))).unwrap();
        let [a, b, xena] = g.get_disjoint_mut([0, 1, 2]).unwrap();
        // Ben hasn't heard and takes it in; Anna doesn't, even through Ben
        sync(xena, b);
        assert_eq!(b.list("people").unwrap().len(), 1);
        let to_a = b.changes_since(&a.versions().unwrap()).unwrap();
        a.apply(&to_a, &b.versions().unwrap()).unwrap();
        assert!(a.list("people").unwrap().is_empty());
        // once Ben hears of the removal, it goes on his phone too
        meet(&mut g, 0, 1);
        assert!(g[1].list("people").unwrap().is_empty());
    }

    #[test]
    fn a_phone_cannot_vouch_for_itself() {
        let mut g = group(&["Anna", "Ben", "Xena"]);
        let (b, x) = (g[1].identity.id.clone(), g[2].identity.id.clone());
        g[0].remove_peer(&x).unwrap();
        g[1].remove_peer(&x).unwrap();
        later();
        // Xena passes on that she was paired again
        let mut me = member(&g[2], "Xena");
        let stamp = g[1].clock.tick(&b);
        me.standing = Some(Standing { stamp, removed: false });
        assert!(g[1].introduce(&[me], &x).unwrap().0.is_empty());
        assert!(g[1].standing(&x).unwrap().unwrap().removed);
    }

    #[test]
    fn the_clock_starts_after_a_removal_stored_here() {
        let dir = scratch("clock");
        let path = dir.join("store.db");
        let stamp = hlc::encode(ms_from_now(1), 0, "00000000000000bb");
        let mut s = Store::open(&path).unwrap();
        s.take_standing("00000000000000bb", &Standing { stamp: stamp.clone(), removed: true }, "Ben")
            .unwrap();
        drop(s);
        let mut s = Store::open(&path).unwrap();
        s.put("people", "p1", &fields(json!({"n": 1}))).unwrap();
        assert!(s.changes_since(&Versions::new()).unwrap()[0].s > stamp);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_pairing_that_would_swap_an_id_or_a_key_is_refused() {
        let mut a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        let c = Store::in_memory().unwrap();
        a.add_peer(&peer_of(&b)).unwrap();
        // the same phone again is fine
        a.add_peer(&peer_of(&b)).unwrap();
        let other_key = Peer { public_key: c.identity.public_key.to_vec(), ..peer_of(&b) };
        let other_id = Peer { id: c.identity.id.clone(), ..peer_of(&b) };
        for peer in [other_key, other_id] {
            assert_eq!(a.add_peer(&peer).err().as_deref(), Some(PAIR_CLASH));
        }
        assert_eq!(a.peer(&b.identity.id).unwrap().unwrap().public_key, b.identity.public_key);
        // nor under the id of a removed phone
        a.remove_peer(&b.identity.id).unwrap();
        let other_key = Peer { public_key: c.identity.public_key.to_vec(), ..peer_of(&b) };
        assert_eq!(a.add_peer(&other_key).err().as_deref(), Some(PAIR_CLASH));
        assert!(a.was_removed(&b.identity.id, &b.identity.public_key).unwrap());
    }

    #[test]
    fn a_file_claims_no_more_than_it_brings() {
        let mut a = Store::in_memory().unwrap();
        a.put("people", "p1", &fields(json!({"n": 1}))).unwrap();
        let cells = a.changes_since(&Versions::new()).unwrap();
        let claims = Versions::from([
            (a.identity.id.clone(), 1_000_000),
            ("00000000000000bb".to_string(), 1_000_000),
        ]);
        let s = Store::in_memory().unwrap();
        let capped = s.capped(&claims, &cells).unwrap();
        assert_eq!(capped, Versions::from([(a.identity.id.clone(), 1)]));
    }

    /// `sync`, logged on both phones as a real sync is: each phone's log id.
    fn sync_logged(a: &mut Store, b: &mut Store) -> (i64, i64) {
        let to_b = a.changes_since(&b.versions().unwrap()).unwrap();
        let to_a = b.changes_since(&a.versions().unwrap()).unwrap();
        let (va, vb) = (a.versions().unwrap(), b.versions().unwrap());
        let got_b = b.apply(&to_b, &va).unwrap();
        let got_a = a.apply(&to_a, &vb).unwrap();
        let (ida, idb) = (a.identity.id.clone(), b.identity.id.clone());
        let on_a = a.log_sync(&idb, "B", to_b.len(), &[], &got_a, &[]).unwrap().unwrap_or(0);
        let on_b = b.log_sync(&ida, "A", to_a.len(), &[], &got_b, &[]).unwrap().unwrap_or(0);
        (on_a, on_b)
    }

    /// Moves a field's stamp `days` back, as if written then.
    fn backdate(s: &Store, field: &str, days: u64) {
        let ms = ms_from_now(0) - days * 24 * 3600 * 1000;
        let stamp = hlc::encode(ms, 0, &s.identity.id);
        s.conn
            .execute("UPDATE cells SET stamp = ?1 WHERE field = ?2", params![stamp, field])
            .unwrap();
    }

    fn changes_of(s: &Store, sync: i64, field: &str) -> Vec<Value> {
        s.sync_changes(sync)
            .unwrap()
            .into_iter()
            .filter(|c| c["field"] == field)
            .collect()
    }

    fn ids(changes: &[Value]) -> Vec<i64> {
        changes.iter().map(|c| c["id"].as_i64().unwrap()).collect()
    }

    #[test]
    fn edits_a_week_apart_unseen_by_each_other_clash_whichever_is_newer() {
        for a_first in [true, false] {
            let mut a = Store::in_memory().unwrap();
            let mut b = Store::in_memory().unwrap();
            a.put("people", "1", &fields(json!({"holder": "Anna"}))).unwrap();
            backdate(&a, "holder", 14);
            sync(&mut a, &mut b);
            a.put("people", "1", &fields(json!({"holder": "Carl"}))).unwrap();
            b.put("people", "1", &fields(json!({"holder": "Dora"}))).unwrap();
            // Monday's edit on one phone, Thursday's on the other
            backdate(if a_first { &a } else { &b }, "holder", 7);
            let (on_a, on_b) = sync_logged(&mut a, &mut b);

            for (s, sync, newer_here) in [(&a, on_a, !a_first), (&b, on_b, a_first)] {
                let found = changes_of(s, sync, "holder");
                assert_eq!(found.len(), 1);
                assert_eq!(found[0]["conflict"], json!(true));
                // the incoming value is in effect where it was the newer one
                assert_eq!(found[0]["won"], json!(!newer_here));
                assert_eq!(s.conflicts().unwrap().len(), 1);
            }
            assert_eq!(a.list("people").unwrap(), b.list("people").unwrap());
        }
    }

    #[test]
    fn a_clean_change_is_logged_with_what_was_there_before() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz", "order": 1})))
            .unwrap();
        let (_, first) = sync_logged(&mut a, &mut b);
        // a new record is one change, not one per field
        let new = b.sync_changes(first).unwrap();
        assert_eq!(new.len(), 1);
        assert_eq!((&new[0]["field"], &new[0]["after"]["city"]), (&json!("*"), &json!("Graz")));

        a.put("territories", "t1", &fields(json!({"city": "Linz", "order": 2}))).unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        let all = b.sync_changes(on_b).unwrap();
        assert_eq!(all.len(), 1, "a new place in a list is no change to show");
        let c = &all[0];
        assert_eq!((&c["before"], &c["after"]), (&json!("Graz"), &json!("Linz")));
        assert_eq!((&c["conflict"], &c["current"]), (&json!(false), &json!(true)));
        assert_eq!(c["territory"]["number"], json!("4"));
    }

    #[test]
    fn an_undo_syncs_as_a_plain_edit_without_a_clash() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t1", &fields(json!({"city": "Linz"}))).unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        let change = changes_of(&b, on_b, "city");
        let done = b.decide(&ids(&change), false, false).unwrap();
        assert_eq!(done[0]["done"], json!(true));
        assert_eq!(b.list("territories").unwrap()[0]["city"], json!("Graz"));

        let (on_a, _) = sync_logged(&mut a, &mut b);
        assert_eq!(a.list("territories").unwrap()[0]["city"], json!("Graz"));
        assert!(a.conflicts().unwrap().is_empty() && b.conflicts().unwrap().is_empty());
        let back = changes_of(&a, on_a, "city");
        assert_eq!(back[0]["conflict"], json!(false));
        assert_eq!(changes_of(&b, on_b, "city")[0]["decision"], json!("mine"));
    }

    #[test]
    fn an_undo_after_a_later_edit_is_refused_unless_forced() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t1", &fields(json!({"city": "Linz"}))).unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        b.put("territories", "t1", &fields(json!({"city": "Wels"}))).unwrap();

        let change = changes_of(&b, on_b, "city");
        assert_eq!(change[0]["current"], json!(false));
        let refused = b.decide(&ids(&change), false, false).unwrap();
        assert_eq!((&refused[0]["done"], &refused[0]["stale"]), (&json!(false), &json!(true)));
        assert_eq!(b.list("territories").unwrap()[0]["city"], json!("Wels"));
        b.decide(&ids(&change), false, true).unwrap();
        assert_eq!(b.list("territories").unwrap()[0]["city"], json!("Graz"));
    }

    #[test]
    fn every_phone_whose_value_lost_on_a_field_is_kept() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        let mut c = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"holder": "Anna"}))).unwrap();
        sync(&mut a, &mut b);
        sync(&mut b, &mut c);
        a.put("people", "1", &fields(json!({"holder": "A"}))).unwrap();
        later();
        b.put("people", "1", &fields(json!({"holder": "B"}))).unwrap();
        later();
        c.put("people", "1", &fields(json!({"holder": "C"}))).unwrap();
        sync(&mut a, &mut b);
        sync(&mut b, &mut c);

        let clashes = b.conflicts().unwrap();
        let mut lost: Vec<_> = clashes.iter().map(|c| c["lost"].as_str().unwrap()).collect();
        lost.sort();
        assert_eq!(lost, ["A", "B"]);
        assert!(clashes.iter().all(|c| c["kept"] == json!("C")));
        // one of them taken back leaves the other
        let by = a.identity.id.clone();
        b.resolve_by("people", "1", "holder", false, Some(&by)).unwrap();
        assert_eq!(b.conflicts().unwrap()[0]["lost"], json!("B"));
    }

    #[test]
    fn some_changes_can_be_taken_back_and_others_left() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz", "holder": "Anna"})))
            .unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t1", &fields(json!({"city": "Linz", "holder": "Carl"}))).unwrap();
        later();
        b.put("territories", "t1", &fields(json!({"city": "Wels", "holder": "Dora"}))).unwrap();
        let (on_a, _) = sync_logged(&mut a, &mut b);

        let both = a.sync_changes(on_a).unwrap();
        assert_eq!(both.len(), 2);
        assert!(both.iter().all(|c| c["conflict"] == json!(true) && c["won"] == json!(true)));
        // keep this phone's holder, leave the city for later
        a.decide(&ids(&changes_of(&a, on_a, "holder")), false, false).unwrap();
        let t = &a.list("territories").unwrap()[0];
        assert_eq!((&t["holder"], &t["city"]), (&json!("Carl"), &json!("Wels")));
        let entry = &a.log().unwrap()[0];
        assert_eq!((&entry["changes"], &entry["open"]), (&json!(2), &json!(1)));
        assert_eq!(changes_of(&a, on_a, "city")[0]["decision"], Value::Null);
        // and Carl reaches the other phone without a new clash
        sync(&mut a, &mut b);
        assert_eq!(b.list("territories").unwrap()[0]["holder"], json!("Carl"));
        assert_eq!(b.conflicts().unwrap().len(), 1);
    }

    #[test]
    fn an_older_edit_lost_to_a_newer_deletion_is_a_clash() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("people", "1", &fields(json!({"name": "Ben"}))).unwrap();
        backdate(&a, "name", 14);
        sync(&mut a, &mut b);
        a.put("people", "1", &fields(json!({"name": "Benno"}))).unwrap();
        backdate(&a, "name", 7);
        b.remove("people", "1").unwrap();
        let (on_a, on_b) = sync_logged(&mut a, &mut b);

        assert!(a.list("people").unwrap().is_empty() && b.list("people").unwrap().is_empty());
        for (s, sync) in [(&a, on_a), (&b, on_b)] {
            let found = changes_of(s, sync, "_deleted");
            assert_eq!(found[0]["conflict"], json!(true), "{found:?}");
            assert_eq!(s.conflicts().unwrap().len(), 1);
        }
        // the edit wins after all: the record comes back everywhere
        a.decide(&ids(&changes_of(&a, on_a, "_deleted")), false, false).unwrap();
        sync(&mut a, &mut b);
        assert_eq!(b.list("people").unwrap()[0]["name"], json!("Benno"));
    }

    #[test]
    fn a_new_record_taken_back_is_deleted() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("do_not_calls", "d1", &fields(json!({"address": "Main St 1", "territory": "t1"})))
            .unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        b.decide(&ids(&b.sync_changes(on_b).unwrap()), false, false).unwrap();
        sync(&mut a, &mut b);
        assert!(a.list("do_not_calls").unwrap().is_empty());
    }

    #[test]
    fn clashes_kept_one_per_field_before_move_to_one_per_phone() {
        let dir = scratch("conflicts");
        let path = dir.join("store.db");
        Connection::open(&path)
            .unwrap()
            .execute_batch(
                "CREATE TABLE conflicts(tbl TEXT NOT NULL, id TEXT NOT NULL, field TEXT NOT NULL,
                   kept TEXT NOT NULL, lost TEXT NOT NULL, lost_by TEXT NOT NULL,
                   at INTEGER NOT NULL, PRIMARY KEY(tbl, id, field));
                 INSERT INTO conflicts VALUES ('people', '1', 'n', '1', '2', 'aa', 1);",
            )
            .unwrap();
        let s = Store::open(&path).unwrap();
        assert_eq!(s.conflicts().unwrap().len(), 1);
        s.conn
            .execute("INSERT INTO conflicts VALUES ('people', '1', 'n', '1', '3', 'bb', 1)", [])
            .unwrap();
        drop(s);
        assert_eq!(Store::open(&path).unwrap().conflicts().unwrap().len(), 2);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_decision_on_one_phone_closes_the_same_clash_on_the_other() {
        // whichever value was in effect on the deciding phone
        for a_newer in [false, true] {
            let mut a = Store::in_memory().unwrap();
            let mut b = Store::in_memory().unwrap();
            a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz"}))).unwrap();
            sync(&mut a, &mut b);
            if a_newer {
                b.put("territories", "t1", &fields(json!({"city": "Wels"}))).unwrap();
                later();
                a.put("territories", "t1", &fields(json!({"city": "Linz"}))).unwrap();
            } else {
                a.put("territories", "t1", &fields(json!({"city": "Linz"}))).unwrap();
                later();
                b.put("territories", "t1", &fields(json!({"city": "Wels"}))).unwrap();
            }
            let (on_a, on_b) = sync_logged(&mut a, &mut b);
            assert_eq!(changes_of(&b, on_b, "city")[0]["decision"], Value::Null);

            // A keeps its own value, declining B's
            a.decide(&ids(&changes_of(&a, on_a, "city")), false, false).unwrap();
            sync_logged(&mut a, &mut b);

            let row = &changes_of(&b, on_b, "city")[0];
            assert_eq!(row["decision"], json!("theirs"), "a_newer {a_newer}");
            assert!(!row["decidedBy"].is_null());
            assert_eq!(row["remote"]["kind"], json!("declined"));
            assert!(b.conflicts().unwrap().is_empty());
            assert_eq!(b.log().unwrap()[0]["open"], json!(0));
            for s in [&a, &b] {
                assert_eq!(s.list("territories").unwrap()[0]["city"], json!("Linz"));
            }
        }
    }

    #[test]
    fn an_undo_shows_on_the_phone_whose_change_was_undone() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4", "city": "Graz"}))).unwrap();
        sync(&mut a, &mut b);
        a.put("territories", "t1", &fields(json!({"city": "Linz"}))).unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        b.decide(&ids(&changes_of(&b, on_b, "city")), false, false).unwrap();
        let (on_a, _) = sync_logged(&mut a, &mut b);
        let row = &changes_of(&a, on_a, "city")[0];
        assert_eq!((&row["before"], &row["after"]), (&json!("Linz"), &json!("Graz")));
        assert_eq!(row["remote"]["kind"], json!("undone"));
        // a decision is no change of its own to list
        assert!(a.sync_changes(on_a).unwrap().iter().all(|c| c["table"] != "decisions"));
    }

    #[test]
    fn a_territory_comes_back_with_what_was_deleted_with_it() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t1", &fields(json!({"number": "4"}))).unwrap();
        a.put("assignments", "a1", &fields(json!({"territory": "t1", "publisher": "Anna"}))).unwrap();
        a.put("do_not_calls", "d1", &fields(json!({"territory": "t1", "address": "Main St 1"}))).unwrap();
        a.put("do_not_calls", "d2", &fields(json!({"territory": "t9", "address": "Elsewhere 2"}))).unwrap();
        sync(&mut a, &mut b);
        for (table, id) in [("territories", "t1"), ("assignments", "a1"), ("do_not_calls", "d1"), ("do_not_calls", "d2")] {
            a.remove(table, id).unwrap();
        }
        let (_, on_b) = sync_logged(&mut a, &mut b);
        let territory: Vec<_> = changes_of(&b, on_b, "_deleted")
            .into_iter()
            .filter(|c| c["table"] == "territories")
            .collect();
        b.decide(&ids(&territory), false, false).unwrap();
        assert_eq!(b.list("territories").unwrap().len(), 1);
        assert_eq!(b.list("assignments").unwrap().len(), 1);
        // only what belonged to it
        assert_eq!(b.list("do_not_calls").unwrap(), vec![json!({"id": "d1", "territory": "t1", "address": "Main St 1"})]);
        sync(&mut a, &mut b);
        assert_eq!(a.list("assignments").unwrap().len(), 1);
    }

    #[test]
    fn a_territory_taken_back_takes_its_new_records_with_it() {
        let mut a = Store::in_memory().unwrap();
        let mut b = Store::in_memory().unwrap();
        a.put("territories", "t2", &fields(json!({"number": "5"}))).unwrap();
        a.put("assignments", "a2", &fields(json!({"territory": "t2", "publisher": "Anna"}))).unwrap();
        let (_, on_b) = sync_logged(&mut a, &mut b);
        let created: Vec<_> = b
            .sync_changes(on_b)
            .unwrap()
            .into_iter()
            .filter(|c| c["table"] == "territories")
            .collect();
        b.decide(&ids(&created), false, false).unwrap();
        assert!(b.list("territories").unwrap().is_empty());
        assert!(b.list("assignments").unwrap().is_empty());
    }
}
