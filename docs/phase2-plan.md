# Phase 2 — Single-trip import/export & AI JSON import: architecture plan (2A)

Written 2026-10-19 for roadmap Phase 2 (`roadmap.md`). **Analysis only**: no application code,
schema or data was changed to produce it. Every claim below was checked against the source at
`c127331` (0.7.4); file paths are given so each can be re-checked.

Delivery is split: **2B** single-trip export/import · **2C** AI JSON activity import · **2D** AI
planning context export. Nothing here is built until the owner approves; §10 lists the decisions
the owner should make first.

---

> **As built in 2B (0.9.0)** — technical reference §17 is authoritative; where this plan differs:
> the archive is `manifest.json` + `trip.json` + `files/` (the manifest split out, per the 2B
> brief); `templateUses` are kept (provenance, as in the full backup) rather than dropped; a file
> that arrives damaged needs an explicit confirmation before the trip is imported without it; the
> mapping sheet shows each saved profile's trips; instants are rebuilt without touching
> `updated_at`. Decisions §10: 1 rows kept as *missing*; 2 new by default, link by choice;
> 3 repeat allowed after a warning; 7 plain `.zip`. 4–6 belong to 2C/2D.
>
> **As built in 2C (0.10.0)** — `phase2c-plan.md` (approved plan and owner refinements) and
> technical reference §18 are authoritative for §6. Differences from §6 below: no booking reference
> and no per-person prices in the format (reported as not imported); `planned` without a date is
> allowed (Timeline *No date yet*); `description` is accepted into notes; `task` is not a kind;
> import is from a file only (no paste) with no *Add as* switch; no Undo — a *Review imported
> activities* list instead; selective export in the same format was added. Decisions §10: 4
> per-person prices reported, not written; 5 ideas by default; 6 is 2D's.

## 1. Current architecture — findings

**Schema** (`src/db/migrations/001…005`, `PRAGMA user_version` = 5). Fourteen tables. Ids are
UUID text from `expo-crypto`; no autoincrement. `PRAGMA foreign_keys = ON` on every connection.

| Table | Defined | Belongs to | Keys | References | Files / external | Personal data | Export notes |
|---|---|---|---|---|---|---|---|
| `trips` | 001, +005 | — | `id` | — | `cover_path` (column exists, **unused** by any screen) | `travellers` (legacy free-text names, JSON), `converted_travellers` (005), `notes` | Root of a trip. `start_date`/`end_date` NOT NULL, `CHECK end ≥ start` |
| `trip_items` | 001 | trip, `ON DELETE CASCADE` | `id`, `trip_id` | — | `details` JSON may hold transport `from/to/carrier/number/seat`, `journeyId`, `reminder`, `refundable`, `pricing` | `confirmation_code`, `notes`, `address`, coordinates | Activities, bookings, places (`status='idea'`), stays, transport, tasks — one table (§5.1/5.2 of CLAUDE.md). `start_utc`/`end_utc` are derived caches |
| `item_participants` | 003 | item, CASCADE | (`item_id`, `traveller_id`) | `travellers` **RESTRICT** | — | who goes to what | Needs the traveller rows to exist first |
| `trip_travellers` | 003, +004 | trip, CASCADE | (`trip_id`, `traveller_id`) | `travellers` **RESTRICT** | — | membership; per-trip `classification` | Per-trip adult/child override |
| `travellers` | 003, +004 | **global** (no trip) | `id` | — | — | name, adult/child | Shared across trips; a profile in use cannot be deleted |
| `trip_notes` | 001 | trip, CASCADE | `id` | — | — | free text (door codes, Wi-Fi) | Straightforward |
| `resources` | 001, +002 | trip **or** item (`CHECK` exactly one), CASCADE; receipts also `expense_id` → expenses CASCADE | `id` | — | `kind='file'`: `stored_path` = `media/<id>.<ext>` (relative); `kind='link'`: `url` | tickets, passports scans if attached, receipts | **One file may be referenced by several rows** (U4, `COPY_RESOURCE_TO_ITEM`): remap per file, not per row. A receipt row has `trip_id` = its trip *and* `expense_id` |
| `expenses` | 002 | trip, CASCADE | `id` | — | receipts via `resources.expense_id` | `label`, `notes` | `amount > 0` minor units. `paid_by`, `split` exist but **nothing writes them yet** (always NULL). Quick Expenses are ordinary rows here (`createExpense`) |
| `payments` | 002 | trip, CASCADE | `id` | — | — | `from_name`, `to_name` (free text) | **Unused** until Phase 3; carry as-is |
| `lists` | 003 | trip, CASCADE — or **global** when `trip_id IS NULL` (reusable) | `id` | `source_list_id` (provenance, **not** an FK) | — | — | A trip's packing/shopping copies go with the trip; reusable lists do not |
| `list_items` | 003 | list, CASCADE | `id` | `traveller_id` → travellers **SET NULL** | — | `note` | `done_at` only on trip copies |
| `templates` | 003 | **global** | `id` | — | — | task/note text | Not trip data; never in a trip export |
| `template_uses` | 003 | trip, CASCADE | (`trip_id`, `template_id`, `applied_at`) | `template_id` provenance only | — | — | Meaningless on another phone |
| `settings` | 001 | **global** key/value | `key` | — | — | `default_travellers` (names) | Keys in `src/repositories/settings.ts`. Never part of a trip |

**Domain and write paths that matter here**
- `src/domain/tripItem.ts` — `TRIP_ITEM_KINDS`, `SUBKINDS` (fixed per kind), `tripItemInputSchema(defaultTz)`:
  the validated input every item write goes through (title ≤ 120, address ≤ 240, lat/lng ranges,
  currency 3 letters, `priceAmount` integer ≥ 0, end not before start, `pricing` total must match).
  `transportDetailsSchema` pins transport `details`; other kinds' `details` are permissive.
- `src/domain/pricing.ts` — C3 per-person lines `{label?, quantity ≥ 1, unitAmount ≥ 0}`; the total
  lives in `price_amount`.
- `src/domain/journey.ts` — legs of one journey share `details.journeyId`; looked up within the
  trip's own items.
- `src/repositories/tripItems.ts` — `createTripItems(db, tripId, inputs, participants)` writes many
  items in one `withTransactionAsync`; `recomputeTripInstants` rebuilds `*_utc` for a trip.
- `src/domain/reminders.ts` + `src/notifications/` — reminders are **reconciled** from the database
  after any change to `trip_items`/`trips`. Anything imported that is confirmed, dated and in the
  future will get reminders automatically, with no extra code — and a trip imported twice gets
  them twice.
- `src/files/useMediaSweep.ts` — the orphan sweep runs **once per launch**: every file in `media/`
  that no `resources.stored_path` names is deleted. It is the existing safety net for files written
  by an operation that never committed.
- `src/domain/resource.ts` — `isStoredPath` (`^media/[A-Za-z0-9][A-Za-z0-9._-]*$`) is the single
  guard against path escape; `SAFE_SCHEMES` limits links to http(s)/geo/mailto/tel.

## 2. Entity / dependency map

```
travellers (global) ◄─RESTRICT── trip_travellers ──CASCADE─► trips ◄─CASCADE── trip_notes
     ▲  ▲                                                     │ ▲ ▲ ▲
     │  └──RESTRICT── item_participants ──CASCADE─► trip_items┘ │ │ └─CASCADE── template_uses ··► templates (global, provenance)
     │                                                 ▲        │ └───CASCADE── expenses ◄─CASCADE── resources (receipt: trip_id + expense_id)
     └────SET NULL── list_items ──CASCADE─► lists ─────┼────────┘ └──CASCADE── payments
                                     (trip copy) ···► lists (reusable, trip_id NULL; source_list_id provenance)
                                                       │
                     resources ──CASCADE (exactly one of trip_id / trip_item_id)
                         │ kind='file' → media/<id>.<ext> on disk (may be shared by several rows)
                         └ kind='link' → url
settings (global, no links)
```

**Trip-owned** (go with a trip): trips, trip_items, item_participants, trip_travellers,
trip_notes, resources (+ files), expenses, payments, lists with `trip_id`, their list_items,
template_uses. **Global** (never "belong" to a trip): travellers, reusable lists and their items,
templates, settings.

## 3. Existing backup system — assessment

| Aspect | Today | Source |
|---|---|---|
| Format | `backup.json` (`formatVersion` 5, `app: 'travel-organizer'`, `exportedAt`, `tables`, `files[]`) + `media/<file>` entries. Formats 1–4 still import (Zod defaults) | `src/domain/export.ts` |
| Serialisation | **Raw rows**, snake_case, exactly as stored — restore reproduces the database, independent of domain refactors | `export.ts` header |
| Read | All tables in **one read transaction** (WAL snapshot) on a second connection (A4) | `repositories/backup.ts` `readAllTables` |
| Packing | `fflate` `zipSync` **in memory**; JSON deflated, files stored; files read in 4 MB chunks | `domain/archive.ts`, `files/storage.ts` |
| Unpacking | `unzipSync` of the **whole** zip in memory; only `backup.json` and entries passing `isStoredPath` are kept — a crafted `../` entry is ignored | `archive.ts` `unpackBackup` |
| Validation | Zod on every row; a **newer** format is refused, never half-imported. No referential pre-check (SQLite FKs are the check) | `parseExportDocument` |
| Integrity | `files[]` lists `storedPath`, `sizeBytes`, `resourceIds`. **No checksum**; sizes are not compared on import | `buildFileManifest` |
| Planning | `planImport(document, existingTripIds, 'merge' \| 'replace', …)` — **keyed on the backup's own ids**: merge skips a trip whose id exists, replace deletes and rewrites it | `export.ts` |
| Apply | **Files first, rows second.** Files are written only if no file of that name exists (names are unique ids); then all rows in **one `withTransactionAsync`**, parents before children. A failed transaction rolls back; files already written become orphans the next launch's sweep removes | `files/backupFiles.ts`, `repositories/backup.ts` |
| Limits | Measured (FB QA): a 380 MB backup exports; a backup with one 150 MB file exports and restores (4 GB emulator). No explicit size limit is enforced | `status.md` FB |
| Per-trip | `filterTablesForTrip(tables, tripId)` already selects one trip with its items, notes, expenses, payments, resources (incl. receipts), trip lists, members, participants, the travellers they use and template uses. **No caller** today | `export.ts` |

**Reusable for single-trip work:** the row Zod schemas, `filterTablesForTrip`, `readAllTables`
(snapshot), chunked file reads, `isStoredPath`, the files-first/rows-in-one-transaction pattern,
the launch sweep as a backstop, `summarise*` wording style.

**Must stay separate:**
- `planImport`/`applyImport` — they **reuse the backup's ids**. Imported as a "new trip" through
  them, a trip from this phone would be *skipped* (merge) or would *replace the original* (replace).
  Single-trip import needs its own planner that **always mints new ids**.
- The `backup.json` document name and `exportDocumentSchema`. A trip archive must not be accepted
  by *Restore a backup* (it would restore under original ids) and a full backup must not be read
  as a trip archive by accident. Distinct document name and `kind` (§4) make the two refuse each
  other with a clear message.
- The full backup format and restore behaviour stay exactly as they are (format 5).

## 4. Proposed single-trip archive

**File:** `Lapland-trip-2026-10-19-1530.zip` (trip name made filename-safe, then the export time,
as `exportFileName` does). A zip, because it is what the backup already uses, what Android's share
sheet, Drive and email handle without help, and what `fflate` packs in node tests.

```
trip.json                 the manifest and all rows
media/<id>.<ext>          each attached file, once (only when files are included)
```

```jsonc
{
  "kind": "travel-organizer-trip",      // ≠ backup.json's document; each importer refuses the other
  "formatVersion": 1,                   // the trip-archive format, versioned on its own
  "schemaVersion": 5,                   // database user_version it was written from
  "app": { "name": "travel-organizer", "version": "0.8.0" },
  "exportId": "uuid",                   // new per export; used to recognise a repeat import (§5.6)
  "exportedAt": "2026-10-19T12:30:00.000Z",
  "includesFiles": true,
  "tripId": "<id as on the exporting phone — provenance only, never reused>",
  "tables": {                           // the backup's raw row shapes and Zod schemas, unchanged
    "trips": [1 row], "tripItems": [], "itemParticipants": [], "tripTravellers": [],
    "travellers": [ only those referenced, see below ], "tripNotes": [], "expenses": [],
    "payments": [], "resources": [], "lists": [ trip copies only ], "listItems": [],
    "listItemRecipients": []        // format 6 (2B-0)
  },
  "files": [
    { "storedPath": "media/<id>.pdf", "sizeBytes": 123456, "sha256": "hex",
      "mimeType": "application/pdf", "resourceIds": ["…"], "included": true }
  ]
}
```

**What goes in and why**
- Built from `filterTablesForTrip` over one `readAllTables` snapshot, then: `settings`,
  `templates` and reusable lists are **never** included (it already leaves them out);
  **`templateUses` dropped** — a template id means nothing on another phone.
- **Travellers:** only rows referenced by `trip_travellers`, `item_participants` or `list_items`,
  and only `id`, `name`, `classification` (plus `sort_order`). The legacy `trips.travellers`
  names and `converted_travellers` travel with the trip row, as they are the trip's own text.
- **Lists:** the trip's copies and their items, ticks kept. `source_list_id` is exported but
  **cleared on import** (it names a list on the other phone).
- **Without attachments** (`includesFiles: false`): every resource row is still exported — the
  labels say what documents existed — with `included: false` in `files[]`. On import those rows
  point at a fresh path that does not exist, so the app's existing *Missing — attach again* state
  shows them honestly. Links are always included.
- **Integrity:** SHA-256 per file (`expo-crypto` `digest(algorithm, BufferSource)` exists in the
  installed version — `node_modules/expo-crypto/build/Crypto.d.ts`; node tests use `node:crypto`,
  injected into the pure code). `sizeBytes` and the hash are checked on import.
- **Booking references, prices, currencies, `is_paid`, dates, zones, notes** are raw columns and
  pass through untouched.

**Privacy note for the export screen:** the archive is the whole trip — booking references,
notes, attachments (tickets, any scanned passport someone attached), traveller names. It says so
before sharing, the way the itinerary PDF does.

## 5. Single-trip import — workflow and id remapping

### 5.1 Stages

1. **Pick** — `expo-document-picker`, copy to cache (as `pickBackup` does), read in chunks.
2. **Inspect, no writes** — size limits (§9.5) before and during unzip; `trip.json` present and
   `kind` matches (else: *"This is a full backup — use Restore a backup"*, or *"Not a trip
   archive"*); `formatVersion` ≤ supported and `schemaVersion` ≤ this app's (else *"Made by a newer
   version of the app — update first"*); Zod over every row; **referential check** (pure
   `checkTripArchive`): exactly one trip, every child's owner present in the archive, every
   referenced traveller present, every receipt's expense present, every file entry's
   `resourceIds` exist; each included file present, size and SHA-256 matching. Damaged or missing
   files are listed, not fatal.
3. **Preview** — one screen: trip name and dates, counts (plans, notes, expenses, lists,
   documents), files missing/damaged, travellers and how each will be matched (§5.3), a
   repeat-import warning (§5.6), reminder count, the trip name it will get.
4. **Commit** — §5.4.
5. **Report** — *"Imported 'Lapland' with 41 plans and 28 documents. 1 document was damaged and is
   marked missing."*, then open the new trip.

### 5.2 Id remapping (pure, `remapTripArchive(archive, newId, travellerChoice)`)

- New UUID for the trip and **every** row id: items, notes, expenses, payments, resources, lists,
  list items. One `Map<oldId, newId>` per table; every foreign key goes through it
  (`trip_id`, `trip_item_id`, `expense_id`, `item_id`, `list_id`, `traveller_id`). An id with no
  mapping is a bug → the import is refused, never written with a dangling key.
- **Files:** new stored path per **distinct** source file (`media/<newResourceId>.<ext>` of its
  first row); every row that shared the file shares the new one. New files never collide with
  or overwrite existing ones, and deleting the original trip later can never take the copy's
  files with it.
- `details.journeyId`: remapped per journey (fresh id, same grouping).
- `source_list_id` → null; `template_uses` not written.
- `created_at`/`updated_at` kept (they record when the plan was made); `*_utc` recomputed with
  the trip's zone after insert (`recomputeTripInstants` logic) rather than trusted.

### 5.3 Travellers

*(Updated after 2B-0, 0.8.0.)* An archive carries `listItemRecipients` (format 6, D33): they are
remapped with the list items (`list_item_id`) and the traveller choice (`traveller_id`) like
participants. **Me never travels**: `settings` is not in a trip archive, so the importing phone's
Me is unchanged and no imported traveller becomes Me by itself. A same-name match with the
importing phone's Me is offered like any other match (*Use existing "Evelina (Me)"*), never assumed.

Never merged silently (FB-12, D31). For each traveller in the archive the preview offers:
**Add as a new traveller** (default) or, when a profile with the same name exists here, **Use
existing "Mia (Child)"**. Same-name matches are offered, never assumed. Per-trip classification
(`trip_travellers.classification`) is kept as exported either way.

### 5.4 Commit — what is atomic and what is compensated

SQLite and the file system cannot share one transaction, so the import is **staged with a
compensating rollback**, extending the pattern the backup already uses:

1. **Write files** to their new `media/` names, verifying each (size + hash) after writing.
   Keep the list of paths written.
2. **One `withTransactionAsync`** inserts every row, parents first (travellers → trip →
   trip_travellers → items → participants → notes → expenses → payments → resources → lists →
   list_items), then recomputes instants and records the import (§5.6).
3. On **any** failure in 1 or 2: the transaction rolls back (no rows), then **delete every file
   written in step 1**.
4. If the app is killed between 1 and the commit, or step 3's delete fails, the files are
   unreferenced and the **next launch's sweep deletes them**. Rows can never point at a file that
   was not written, because rows are written last.

| Failure | Database | Files | User sees |
|---|---|---|---|
| Invalid / unsupported / too large | untouched | none written | why, nothing imported |
| A file write fails (disk full) | untouched | written ones deleted | *Nothing was imported* + reason |
| An insert fails (FK, CHECK) | rolled back | written ones deleted | *Nothing was imported* |
| Crash after files, before commit | untouched | orphans; swept next launch | trip absent; import again |
| Crash after commit | complete | complete | the trip |

Not atomic in the strict sense: between steps 1 and 3 orphan files exist on disk. That is the
only window, it never makes a row lie, and two independent mechanisms clean it.

### 5.5 Never overwrite

Import only ever **adds** a trip. There is no replace mode for a trip archive. Existing rows
are not updated; existing files are not written to (new names only — assert the target does not
exist before writing).

### 5.6 The same archive twice

Recognised by `exportId`: after a successful commit, `{exportId, tripId, importedAt}` is appended
to a `settings` key (`trip_imports`, JSON) — a new key, **no migration**. Also flagged: a trip
here with the same name and dates. The preview then says *"You imported this trip on 12 Nov — it
is 'Lapland'. Importing again makes a second copy, with its own reminders."* and offers **Open the
existing trip** first and **Import as a copy** second, the copy named *"Lapland (2)"*.

## 6. AI JSON activity import (2C)

A separate, deliberately small format. AI output is **untrusted input**: parsed as data only,
never evaluated; no ids; no file references.

### 6.1 Format (version 1)

```jsonc
{
  "format": "travel-organizer-activities",
  "version": 1,
  "trip": { "destination": "Rovaniemi", "startDate": "2026-11-20", "endDate": "2026-11-24" }, // optional, sanity check only
  "activities": [
    {
      "title": "Husky safari",                       // required, ≤ 120
      "kind": "activity",                            // activity | food | stay | transport | other  (default activity; not task)
      "type": "tour",                                // optional subkind; must be valid for the kind, else dropped with a warning
      "status": "idea",                              // idea | planned  (default idea; "planned" → confirmed)
      "priority": "must",                            // must | want | maybe — ideas only
      "date": "2026-11-21",                          // optional YYYY-MM-DD
      "startTime": "13:00", "endTime": "16:00",      // optional HH:mm; a time needs a date
      "endDate": "2026-11-21",                       // optional, for multi-day
      "timeZone": "Europe/Helsinki",                 // optional IANA; default: the trip's
      "location": { "name": "Bearhill Husky", "address": "…", "latitude": 66.5, "longitude": 25.7 },
      "notes": "Warm clothes provided",
      "price": { "amount": "290.00", "currency": "EUR" },   // string or number, ≤ 2 decimals
      "bookingReference": null,                      // only if the user supplied one
      "links": [ { "label": "Website", "url": "https://…" } ],
      "transport": { "from": "HEL", "to": "RVN", "carrier": "Finnair", "number": "AY531" } // transport only
    }
  ]
}
```

**Mapping:** each activity → a `TripItemInput` and validated by the **same**
`tripItemInputSchema(trip.defaultTz)` every form uses, so nothing can be imported that the app's
own form would refuse. Links → `resources` rows (`kind='link'`, `subtype='website'` or `'maps'`)
in the same transaction. Amounts → minor units through the A2 `parseAmount` rules (a number with
more than two decimals, a sign, or a bare `1.234` is refused, not guessed).

### 6.2 Rules

- **Never trusted, never imported:** ids, `is_paid` (always unpaid), participants, files,
  reminder choices, `completed_at`. Unknown fields are **listed** in the preview as *ignored*,
  per activity — not silently dropped, not fatal.
- **Missing stays missing:** no default dates or times are invented; an undated activity is an
  undated idea (it appears on Places).
- A malformed activity is shown as invalid with its reason and cannot be selected; the rest of
  the file still imports. A malformed **file** (not JSON, wrong `format`, newer `version`) is
  refused whole.
- Text is plain text. Links pass only `http`/`https` (stricter than `SAFE_SCHEMES`). The input may
  be wrapped in a Markdown code fence (AI chats do this); the fence is stripped, nothing else is.
- **Add-only.** Nothing existing is updated. Dates outside the trip are allowed (D8) but flagged.

### 6.3 Duplicates

Within the trip and within the file: same normalised title (case, accents, spacing) **and** same
date; or same place name and same date; or coordinates within ~150 m on the same date. Shown as
*"Possible duplicate of 'Husky safari' (Sat 21 Nov)"* and **deselected by default** — the user
can still tick it.

### 6.4 Now vs Phase 3

| Field | 2C | Why |
|---|---|---|
| Title, kind, type, status, priority, dates/times/zone, location, notes, links, transport route | **now** | Existing columns and schemas |
| Price total + currency | **now** | `price_amount`/`price_currency`; unpaid |
| Booking reference | now, **only if present** | Flagged in the preview: AI rarely has a real one |
| Adult/child unit prices (`price.perPerson`) | **wait for Phase 3** | C3 lines could hold them, but Phase 3 ties unit prices to selected participants; importing them now creates data Phase 3 must reinterpret. v1 accepts the field and shows it, writes only the total |
| Participants, paid-by, splits | Phase 3 | Not modelled yet |

## 7. AI planning context export (2D)

```jsonc
{
  "format": "travel-organizer-planning-context", "version": 1,
  "trip": { "destination": "Lapland, Finland", "startDate": "2026-11-20", "endDate": "2026-11-24",
            "timeZone": "Europe/Helsinki" },
  "party": { "adults": 2, "children": 1 },                 // optional switch; counts only, never names
  "base": [ { "from": "2026-11-20", "to": "2026-11-24", "area": "Rovaniemi" } ],   // optional switch
  "days": [ { "date": "2026-11-21",
              "plans": [ { "title": "Husky safari", "kind": "activity", "start": "13:00", "end": "16:00",
                           "place": "Bearhill Husky" } ] } ],
  "savedPlaces": [ { "title": "Arktikum", "kind": "activity", "priority": "want" } ],
  "planningNotes": "We like slow mornings."               // typed in the export sheet, optional
}
```

**Always excluded:** booking references, prices and payments, expenses, traveller names, item
and trip notes, documents and links, addresses of stays (only an *area* — the stay's city or place
name, when switched on), passports (not stored anyway), cancelled items. **Switches** (off by
default, like the PDF's `DEFAULT_PDF_OPTIONS`): *Where we stay (area only)*, *Who is travelling
(counts)*, *Include our saved places*. The exact JSON is shown before sharing.

**The AI template (2C's helper)** is a short text: what to produce, the v1 schema with one
example, the rules (*output only JSON; use null when unknown; never invent prices or booking
references; dates within …*). **2D merges both** into one action — *Plan with AI* — which copies
the instructions, the schema and (optionally) the context in one block to paste into a chat.

## 8. UX

No wizard: each import is **one screen** that changes state (pick → checking → preview → done).

| Action | Where | Flow |
|---|---|---|
| **Export this trip** | Overview → **More** (beside *Share as PDF*) | Sheet: *Include documents and photos* (on; shows total size), privacy line → **Create** → share sheet → *"Archive created — save it somewhere"* (A4 wording) |
| **Import a trip** | Your trips → *Your data* → **Backup & restore** screen, under *Import a backup* | Pick → preview (§5.1) → **Import as a new trip** → opens it |
| **Import activities** | Overview → **More** → *Import activities*, and on Places' **Add** sheet | **Paste** (clipboard; `expo-clipboard` is installed) or **Choose a file** → preview list → **Add n plans** |
| **Plan with AI** (template + context) | Overview → **More** | Sheet with the switches (§7) → **Copy for ChatGPT** / **Share** |

**Activity preview:** a header line (*"9 found · 7 selected · 1 possible duplicate · 1 invalid"*),
one switch *Add as: Ideas (Places) / Plans (Timeline)* when the file does not say, then rows grouped
by date — checkbox, kind tile, title, time, place, price, and under it any warning (duplicate,
outside trip dates, ignored fields, booking reference supplied). Invalid rows greyed with the
reason. Select all / none. A pinned footer **Add 7 plans** (the form footer pattern). Result:
*"Added 7 plans to Lapland"*, with **Undo** for a few seconds (deletes exactly the ids just
created — possible because they are new rows with no dependants yet).

## 9. Data safety & recovery

1. **Transaction boundaries** — 2B: files (compensated) then one row transaction (§5.4). 2C: one
   transaction for all selected items **and** their link rows (`createTripItems` pattern). 2D:
   read-only (one snapshot read).
2. **File staging & cleanup** — new names only; verify after write; delete on failure; launch
   sweep as backstop. The sweep runs once at launch, before any import screen can be reached;
   2B must keep it that way (no sweep triggered while an import is in progress).
3. **Backup prerequisite** — before 2B/2C first reach the owner's phone: a fresh full backup to
   Drive, an update rehearsal from the exact APK on the phone, `install -r` only (session-handoff
   §9). The import screens also offer *Make a full backup first* as a link.
4. **Referential integrity** — pure pre-check (§5.1) **plus** SQLite FKs inside the transaction;
   after commit, a test-only verifier compares row counts and FK closure (`PRAGMA
   foreign_key_check` in node tests).
5. **Size limits** (initial, adjustable after measuring): archive ≤ 500 MB; any single entry ≤
   200 MB uncompressed (checked from the zip directory via fflate's `filter`/`originalSize`
   before inflating — a zip bomb is refused before it is expanded); `trip.json` ≤ 20 MB; ≤ 5,000
   items. AI JSON ≤ 1 MB, ≤ 300 activities. **Known limit:** like the backup, the archive is
   built and read in memory; 2B measures the largest trip on the 4 GB emulator before fixing the
   numbers.
6. **Duplicates** — §5.6 (archives), §6.3 (activities). Never auto-merged, never auto-skipped
   without showing.
7. **Compatibility** — the full backup format, restore and their tests are unchanged; a trip
   archive is refused by restore and vice versa, with a message.
8. **What is not claimed:** the file/database pair is not strictly atomic (§5.4 explains the
   window and its two clean-ups). Behaviour under a kill at every step is tested by injection,
   not assumed.

## 10. Risks, open decisions, implementation order

**Risks**
- Memory on large trips (in-memory zip) — measured in 2B; limits enforced.
- A trip imported twice doubles reminders — warned in the preview (§5.6).
- AI output quality (wrong zones, invented prices) — validation catches format, not truth; the
  preview is the control.
- Sharing a trip archive shares everything in it — stated before export.

**Decisions for the owner** (recommendation first)
1. Archive without attachments keeps file rows as *missing* (recommended) — or drops them.
2. Travellers on import: *new profile* by default, *use existing* offered on a same-name match
   (recommended) — or always new.
3. Repeat import: allowed as a copy after a warning (recommended) — or refused.
4. Per-person (adult/child) prices from AI JSON: shown, total only written until Phase 3
   (recommended) — or written as C3 lines now.
5. Imported AI activities default to **ideas** (Places) unless the file says *planned*
   (recommended), with one switch in the preview — or default to plans.
6. *Plan with AI* as one combined action for template + context (recommended) — or two separate
   exports.
7. A trip archive's file extension: plain `.zip` (recommended: opens everywhere) — or a custom
   extension.

**Order:** 2B → 2C → 2D, each its own version and owner review:
- **2B** (pure first): `domain/tripArchive.ts` — schema, build from tables, `checkTripArchive`,
  `remapTripArchive`, limits; packing with hashes; repository writer; file staging; then the two
  screens; emulator QA and an update rehearsal.
- **2C**: `domain/activityImport.ts` — parse, map to `TripItemInput`, duplicates; preview screen;
  writer; template text.
- **2D**: `domain/planningContext.ts`; the *Plan with AI* sheet.

No migration is foreseen for any of the three (the repeat-import record uses a `settings` key).

## 11. Tests and acceptance criteria

**2B — tests** (node: `better-sqlite3` + `src/db/testing/asyncDatabase.ts`; fixtures from
`scripts/sample-backup.mjs`, never real data)
- Round trip: export a sample trip → import into a database that already holds it and another
  trip → the new trip equals the original **modulo ids** (normalised comparison of every row and
  file hash); the pre-existing rows are **byte-identical** before and after (hash of every table).
- Remap: no new id equals any old id; every FK resolves (`PRAGMA foreign_key_check` empty); shared
  files stay shared; journeys stay grouped; receipts stay with their expenses.
- Twice: two independent copies; `exportId` warning; originals untouched.
- Without files: rows present, files missing, the missing state reported.
- Refusals: not a zip; full backup given to trip import and the reverse; newer `formatVersion` /
  `schemaVersion`; Zod failure; dangling reference; two trips in one archive.
- Hostile archives: entries `../x`, `media/../../x`, `/abs`, `media\\x`, very long names, an entry
  declaring a huge `originalSize`; a hash mismatch; a size mismatch.
- Failure injection: throw at each insert position and at each file write → zero new rows, zero
  new files left (or only files the sweep would delete — asserted with `orphanedStoredPaths`).
- Compatibility: all existing backup tests unchanged and passing; formats 1–5 still restore.

**2B — acceptance:** on the emulator (release build) the Lapland sample trip exports with its 28
files, imports as a second trip whose PDFs open in airplane mode; deleting either copy leaves the
other's files opening; a kill during import leaves no partial trip and the next launch leaves no
orphan files; existing trips, travellers, lists and templates unchanged (export summary before and
after). Typecheck, all tests, update rehearsal over the previous release.

**2C — tests:** valid file → inputs equal to what the form would produce; each rule in §6.2
(unknown fields reported, ids ignored, `is_paid` never set, bad subkind dropped with warning, time
without date refused, invalid zone refused, `12.345`/`-5`/`1.234` refused, code fences stripped,
`javascript:` links refused); duplicates (title/date, accents, place/date, coordinates, inside the
file); selection writes exactly the selected rows in one transaction; failure injection → nothing
written; Undo removes exactly the created ids.
**2C — acceptance:** a ChatGPT-produced file for the sample Lapland trip previews correctly,
duplicates of existing plans are deselected, 7 of 9 selected are added and appear on the
Timeline/Places with their links, nothing else changes, reminders appear only for confirmed timed
future plans.

**2D — tests:** excluded fields never appear in the output for any combination of switches
(property test over the sample trips: no confirmation code, price, name, note text or URL string
from the database occurs in the JSON); switches add exactly their part; cancelled items absent.
**2D — acceptance:** the copied text, pasted into a new chat, yields a file that 2C imports
without errors on the sample trip.
