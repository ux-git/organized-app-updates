use std::collections::BTreeMap;
use std::path::Path;

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
}

pub struct Identity {
    pub id: String,
    pub name: String,
    pub private_key: [u8; 32],
    pub public_key: [u8; 32],
    pub adv_secret: [u8; 16],
}

const DELETED: &str = "_deleted";

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
               versions TEXT NOT NULL DEFAULT '{}');",
        )
        .map_err(err)?;

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

    /// The live records of a table, each with its `id`.
    pub fn list(&self, table: &str) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, field, value FROM cells WHERE tbl = ?1 ORDER BY id")
            .map_err(err)?;
        let rows = stmt
            .query_map([table], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .map_err(err)?;

        let mut records: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
        for row in rows {
            let (id, field, value) = row.map_err(err)?;
            let value = serde_json::from_str(&value).map_err(err)?;
            records.entry(id).or_default().insert(field, value);
        }
        Ok(records
            .into_iter()
            .filter(|(_, fields)| fields.get(DELETED) != Some(&Value::Bool(true)))
            .map(|(id, mut fields)| {
                fields.remove(DELETED);
                fields.insert("id".into(), Value::String(id));
                Value::Object(fields)
            })
            .collect())
    }

    /// Writes the fields that differ from what is stored. Returns how many.
    pub fn put(&mut self, table: &str, id: &str, fields: &Map<String, Value>) -> Result<usize> {
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
        for (field, value) in fields {
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
            if current.as_deref() == Some(text.as_str()) {
                continue;
            }
            seq += 1;
            let stamp = self.clock.tick(&self.identity.id);
            tx.execute(
                "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![table, id, field, text, stamp, self.identity.id, seq],
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
    /// newer restore.
    pub fn remove(&mut self, table: &str, id: &str) -> Result<()> {
        let mut fields = Map::new();
        fields.insert(DELETED.into(), Value::Bool(true));
        self.put(table, id, &fields).map(|_| ())
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
    pub fn apply(&mut self, cells: &[Cell], sender: &Versions) -> Result<usize> {
        let tx = self.conn.transaction().map_err(err)?;
        let mut applied = 0;
        for cell in cells {
            let stored: Option<String> = tx
                .query_row(
                    "SELECT stamp FROM cells WHERE tbl = ?1 AND id = ?2 AND field = ?3",
                    params![cell.t, cell.i, cell.f],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if stored.is_some_and(|s| s >= cell.s) {
                continue;
            }
            tx.execute(
                "INSERT OR REPLACE INTO cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![cell.t, cell.i, cell.f, cell.v.to_string(), cell.s, cell.o, cell.q],
            )
            .map_err(err)?;
            self.clock.observe(&cell.s);
            applied += 1;
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

    pub fn peers(&self) -> Result<Vec<Peer>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, platform, public_key, adv_secret, paired_at, last_sync, versions
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
        Ok(())
    }

    pub fn remove_peer(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM peers WHERE id = ?1", [id])
            .map_err(err)?;
        Ok(())
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

    /// Changes that at least one paired phone hasn't received.
    pub fn unsynced(&self) -> Result<i64> {
        Ok(self.peers()?.iter().map(|p| p.pending).max().unwrap_or(0))
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
}
