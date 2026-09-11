# Implementation plan

Ten milestones. **Each leaves the repo in a working state.** Risk is deliberately front-loaded:
the two things most likely to force a redesign are checked in M1, not discovered at M4.

Current position: **M0 complete. M1 next.**

---

## M0 — Decisions and repo ✅

- [x] Analyse the brief; challenge over-engineering
- [x] Verify Expo SDK 57 / RN 0.86 facts against current docs
- [x] Agree the domain model, schema, time strategy, resource model
- [x] Private GitHub repo, repo-local personal git identity
- [x] `CLAUDE.md`, `docs/technical-reference.md`, `docs/decision-log.md`, `docs/plan.md`

---

## M1 — Foundation, spikes, database

**The two spikes come first.** If either fails, the design changes now — cheaply.

### 1.1 Scaffold
1. `npx create-expo-app@latest . --template blank-typescript` (into the existing repo)
2. Pin `expo@>=57.0.17`
3. Add `expo-router`, `expo-dev-client`; configure entry point and `app.json`
4. Set Android package id, `minSdk`, app name
5. `npx expo prebuild --clean`
6. `npx expo run:android` → boots on AVD `Medium_Phone_API_36.1`

**Done when:** the dev client launches on the emulator and hot-reload works.

### 1.2 Spike A — opening a stored PDF ⚠️
Gates the single most important action in the app.

1. Add `expo-file-system`, `expo-document-picker`, `expo-intent-launcher`
2. Throwaway screen: pick a PDF → copy into `Paths.document/media/` → open via intent
3. **Establish whether `getContentUriAsync` exists on the new class-based API** or whether
   `expo-file-system/legacy` is required
4. Confirm the copied file opens after the original is deleted

**Done when:** a PDF opens in Android's viewer from an app-owned copy. **Record the answer in
`technical-reference.md` §5.**

*If it fails:* fall back to `expo-sharing`, or an in-app viewer. Decide before M3.

### 1.3 Spike B — Hermes timezones ⚠️
The entire time model rests on this.

1. Add `date-fns` + `@date-fns/tz`
2. On-device: convert `2026-09-19T06:10` + `Europe/Sofia` → UTC and back
3. Test across a DST boundary
4. Check whether `Intl.supportedValuesOf('timeZone')` exists in Hermes
5. Determine whether formatjs polyfills are actually needed

**Done when:** conversions are correct on-device without polyfills — or the polyfill cost is
measured and accepted. **Record in `technical-reference.md` §4.**

### 1.4 Database
1. `src/db/client.ts` — open, `journal_mode=WAL` once, `foreign_keys=ON` every connection
2. `src/db/migrations/001-initial.ts` — the full schema from `technical-reference.md` §3
3. Migration runner using `PRAGMA user_version`, wired to `SQLiteProvider` `onInit`
4. `src/hooks/useLiveQuery.ts` over `addDatabaseChangeListener`

### 1.5 Domain: time
1. `src/domain/time.ts` — the `LocalDateTime` type, wall-clock ↔ instant, precision, formatting
2. Tests: DST boundary, date-only stability under device-zone change, `T00:00` vs date-only

### 1.6 Test infrastructure
1. Jest + `better-sqlite3`
2. Migration test: applies cleanly from 0; cascades work; CHECK constraints reject bad rows

**Milestone done when:** app boots on the emulator, DB migrates on first launch, `time.ts` tests
pass, both spikes answered and recorded.

---

## M2 — Trips CRUD + Home

1. `src/domain/trip.ts` + Zod schema
2. `src/repositories/trips.ts` — create, update, delete, list, get
3. `src/ui/tokens.ts` — colour, spacing, type scale
4. Home (`app/index.tsx`) — Upcoming and Past sections, trip cards
5. Create/edit trip form (React Hook Form + Zod): name, destination, **mandatory** dates,
   `default_tz` (default from `expo-localization`), travellers
6. Delete with confirmation
7. Past-trip bucketing: `end_date < today's device-local date`
8. Empty state: no trips yet

**Done when:** trips can be created, edited, deleted, and bucket correctly into Upcoming/Past.

---

## M3 — TripItems + Resources + files

The largest milestone and the one carrying the most risk. Files are here, not later, deliberately.

1. `src/domain/tripItem.ts` — `kind`, `subkind`, `status`, `priority`, Zod discriminated union
   for `details`
2. `src/repositories/tripItems.ts` — CRUD, **`start_utc` derived on write, never by hand**
3. Item create/edit form, fields varying by `kind`
4. Item detail screen
5. `src/files/storage.ts` — import-and-copy, relative↔absolute paths, **GC sweep on app start**
6. `src/repositories/resources.ts`
7. Add a resource: pick PDF · pick image/screenshot · paste link
8. **`OpenResource` component** — one file opens directly; several open a bottom sheet.
   Reused on Overview, timeline rows and item detail. The most important control in the app
9. Missing-file handling: render unavailable, never crash
10. Delete confirmation naming the blast radius ("removes 6 items and 11 saved files")
11. Trip-level resources (`resources.trip_id`)

**Done when:** an item with a PDF can be created, the PDF opens offline, and deleting the item
removes the file on the next GC sweep.

---

## M4 — Timeline + Overview / Now

1. `src/domain/timeline.ts` — group by `substr(start_local,1,10)`, order by `start_utc`
2. Multi-day items derive **check-in / check-out** entries
3. Date-only items sort to the top of their day
4. Timeline screen with day headers
5. Next-item derivation — excludes `cancelled` and completed tasks; **includes items dated before
   the trip starts**
6. Overview screen: TODAY · NEXT (with countdown) · AFTER THAT · `[Open tickets]`
7. Empty states: nothing scheduled today; nothing upcoming at all → **no Now card**
8. Cold-start straight into the active trip when exactly one is in progress
9. Tests for all of the above

**Done when:** the Milan and Lapland sample trips render correctly, and the Now card matches
reality with the device timezone changed.

---

## M5 — Bookings, Places, Notes, Search

Three tabs that are three queries over one table — the payoff of the domain model.

1. Bookings tab — `status='confirmed'`, grouped by `kind`
2. Places tab — `status='idea'`, ordered by priority then title
3. Promote a place to a dated plan — a single `UPDATE`
4. `trip_notes` CRUD + Notes tab, pinning
5. Search — `LIKE '%q%'` across title, notes, location, `confirmation_code`
6. Cost fields (amount, currency, paid/unpaid) in the item form

**Done when:** the app is genuinely usable for a real trip. **Do not travel with it until M6.**

---

## M6 — Export / import

Deliberately before notifications and share-to-app: the app becomes trip-ready at M5, so backup
must exist before the first real trip depends on it.

1. Export: all five tables → JSON + document files → `.zip`
2. Hand to the Android share sheet (→ Drive)
3. Import: read a `.zip`, restore rows and files, handle id collisions
4. Enable Android Auto Backup in `app.json` (backstop only)
5. Round-trip test: export → wipe app data → import → verify every PDF opens

**Done when:** a full export/import round-trip loses nothing.

---

## M7 — Local notifications

1. `POST_NOTIFICATIONS` runtime permission request at a sensible moment
2. Schedule on item create/update, cancel on delete or date change
3. Default lead time in `settings`
4. Tap → deep link to the item; handle the item having been deleted
5. Reschedule on app start (defensive)

**Done when:** a reminder fires for an upcoming item and taps through correctly.

---

## M8 — Share-to-App

1. `expo-share-intent` v8+, `androidIntentFilters: ["text/*","application/pdf","image/*"]`
2. `expo prebuild` + rebuild the dev client
3. `app/share.tsx` — pick trip → new item or attach to existing
4. **Copy the incoming file immediately**; validate the payload with Zod
5. Cold-start path (app closed when sharing)
6. Shared URL → save as a Place with title and priority
7. Test on the **physical device** — real share sheet, real apps. Revoke USB debugging after

**Done when:** sharing a PDF from Gmail and a URL from Chrome both land correctly, app open *and*
closed.

---

## M9 — Polish, offline, edge cases

1. Full offline pass: airplane mode, open every PDF, force-kill, change timezone
2. Edge cases from the brief: invalid URL · file missing · item cancelled · date changed ·
   duplicate filenames · notification for a deleted item
3. Visual pass against the brief's direction — spacious, card-based, strong hierarchy, scannable
4. Performance with a realistic trip (~50 items, ~30 files)
5. **Build a release APK and install it on the phone for real use** (not the dev build — see
   `CLAUDE.md` §9)

**Done when:** a real trip can be run from the app, offline, end to end.

---

## Sample data

Use the two real trips from the brief as fixtures — they exercise different shapes:

- **Milan, 19–22 Sep 2026** — flight, transfer, hotel, a timed booked activity, plus several
  undated recommendations at mixed priorities.
- **Finland / Lapland, 20–24 Nov 2026** — multi-leg (Sofia → Helsinki → Rovaniemi), an overnight
  sleeper train, a rental car, and a mix of booked and merely-planned activities. This is the one
  that proves the timeline cannot just be a list of attractions.

Seed data comes from these, **never from real bookings** (see `CLAUDE.md` §9).
