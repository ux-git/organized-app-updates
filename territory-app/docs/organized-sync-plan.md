# Territories inside Organized: storage and sync plan

Status: proposal, nothing implemented. Written 2026-09-29 from reading the
Organized app and organized-api; the closest analog is `upcoming_events`.

## 0. Blocker to fix first (API)

`cong_settings` on this branch already carries `territory_access`,
`territory_restricted_categories` and `territory_restricted_types`
(`definition/settings.ts`, `services/dexie/schema.ts`, the encryption map).
In data-sync mode the client uploads the whole `cong_settings` object, and the
API rejects unknown keys with `INVALID_BACKUP_PAYLOAD` (`backup-payload.ts`).
Add those keys to `CONG_SETTINGS_KEYS` in organized-api before this branch
ships, or every settings-editor sync fails.

## 1. Tables

Two synced tables; the small settings go into `cong_settings`.

- `territories`: `&territory_uid, territory_data` with
  `{ _deleted, updatedAt, number, name, city, type, categories, households,
  cardLost, daysSinceCovered, boundary?, boundaryStyle?, mapShapes?, mapLines?,
  mapMarkers?, phoneNumbers?, notes?, requestedBy?, reviewNeeded?,
  doNotCalls: (DoNotCall & { updatedAt, _deleted })[] }`.
  `status`, `holder` and `daysOut` are not stored; `withAssignments`
  recomputes them.
- `territory_assignments`: `&assignment_uid, territory_uid, assignment_data`
  with `{ _deleted, updatedAt, publisher, publisher_uid?, assignedOn,
  returnedOn?, serviceYear, months, startMonth, endMonth, campaign?, note?,
  card? }`.
- `cong_settings.territory_categories / territory_overdue_months /
  territory_boundary` as `{ value, updatedAt }`, like `territory_access`.

Why: Organized merges whole records by `updatedAt`, but arrays of objects with
`id` + `updatedAt` merge per item (persons' privileges do), so do-not-calls can
stay nested with per-item stamps and `_deleted`. Assignments get their own
rows: they are the multi-writer, high-churn part (assigned at the desk,
returned on the phone) and the only part that may later be filtered per
publisher. Ids stay the standalone app's ids (UUIDs).

## 2. Encryption and visibility

- Both tables shared-key encrypted (`territory_data` / `assignment_data` under
  the access code), like `upcoming_events`. Not the master key: it would lock
  a non-elder territory servant out, and publishers must read the card.
- Phase 1: every role downloads both tables in full; the UI enforces
  `own | view | request` as it does now.
- Phase 2 hardening: plaintext `holder_uid` / `publisher_uid` on the rows and a
  public `territory_access`, so the API can send publishers only their own
  rows. Assignments store display names today; add `publisher_uid` at assign
  time and keep `publisher` for the cards and the standalone app.
- Pocket accounts cannot write congregation tables, so publisher requests and
  field-added do-not-calls need a user-table path later.

## 3. Roles

A `territories` right like `upcoming_events`, on both sides. Capability
`territoryEditor = elder || serviceCommittee || role 'territories'`; the
upload of both tables is gated by it.

## 4. Sync flow

API: both keys in `recordDatasetFields` and `BackupData`, storage as one JSON
blob per table (`territories/main.txt`, `territory_assignments/main.txt`),
metadata getters, download for every role after `upcoming_events`.
Client: load both tables in `dbGetTableData`, restore functions cloned from
`dbRestoreUpcomingEvents` (decrypt, fold `_deleted/updatedAt`, `syncFromRemote`),
upload blocks gated by `territoryEditor && send_local`, metadata keys. Deletes
are soft. Upload is already chunked.

## 5. Migration with minimal page churn

All writers already go through `setTerritories(prev => …)` and the settings
atoms. Make `territoriesState` a read/write derived atom: read assembles
`Territory[]` from the two Dexie-fed atoms; write sets them optimistically,
diffs by id, stamps `updatedAt`, `bulkPut`s changed rows, soft-deletes missing
ids, and marks `send_local`. Dexie version bump with the two schemas; drop
`atomWithDefault(sampleTerritories)`. The standalone app replaces
`services/dexie/territories.ts` through its alias mechanism with a no-op
writer, so its own persistence keeps flowing through the same setter.

## 6. Test mode

`dbTerritoriesDummy()` after `dbUpcomingEventsDummy()`: today's sample
territories with the test-mode name mapping, split into the two shapes,
`bulkPut`; settings seeded. Production starts empty.

## 7. Interop with the standalone app

Phase 1: both tables in the Organized JSON export/import.
Phase 2: read and write `.territories` files (`OTA1:` + base64url(deflate(JSON
of cells))): fold cells to rows keeping the newest stamp per field; export one
cell per field with `o = 'organized'`. The Rust restore caps foreign versions
and applies last-writer-wins, so a round trip is safe.

## 8. Effort and risks

About 5.5 days: client tables and write-through atoms 1.5, backup worker and
metadata 1, API 1, rights UI 0.5, test mode 0.5, JSON export/import 0.5,
standalone stub 0.5. Phase 2 interop 1–2 days, uid hardening 1 day.

Risks: the settings whitelist blocker; payload size (200 territories with
boundaries and shapes ≈ 1–3 MB per table, re-sent whole on every sync; round
coordinates to 5 decimals); whole-record last-writer-wins on `territory_data`
when two servants edit one territory offline; names instead of uids until
`publisher_uid` exists; download filters must stay in lockstep on both sides.
