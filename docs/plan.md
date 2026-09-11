# Implementation plan

Ten milestones. **Each leaves the repo in a working state.** Risk is deliberately front-loaded:
the two things most likely to force a redesign are checked in M1, not discovered at M4.

Current position: **M0–M2 complete. Core of M3 next.**

---

## Execution tracks

Work has explicit IDs so it can be picked up without interpretation.

- **C1–C5 — Core.** Domain logic, schema, repositories, files, export. **No device needed** —
  `src/domain/` imports nothing native, so it all runs under `npm test`. Being done on the
  company-managed Mac.
- **S1–S8 — Surface.** Screens, forms, styling, and everything needing a real device. Being done
  on the personal Windows machine (`docs/windows-handoff.md`).

The split follows **cost of being wrong**, not size. Core mistakes ripple through every screen and
migrations are painful; surface mistakes are visible immediately and cheap to fix. Doing core
first means the surface is wiring known-good, tested functions to screens rather than designing
and building at once.

**To continue here:** *"do the next C task"* — work C1→C5 in order, commit each, stop after C5.
**To continue on Windows:** *"continue with the plan"* — all C will be done; start at S1.

### Core — do these here, in order

| ID | Task | Milestone | Done when |
|---|---|---|---|
| **C1** | `domain/timeline.ts` — day grouping, derived check-in/check-out, next-item selection | M4 | Tests cover: 23:30 keeps its local day · date-only sorts to top of day · multi-day derives two entries · next excludes cancelled and completed tasks · includes items dated **before** the trip · nothing upcoming → no Now |
| **C2** | TripItem Zod schema, row parser, `repositories/tripItems.ts` | M3 | `start_utc` derived on write and never by hand; schema + SQL tests green |
| **C3** | `repositories/resources.ts` + `files/storage.ts` | M3 | Relative↔absolute path handling and the GC sweep are unit tested; the `contentUri` open path is written (device-verified later in S2) |
| **C4** | Tab queries (Bookings / Places / Search) + `repositories/notes.ts` | M5 | Queries tested via `better-sqlite3`, including that Places is `status='idea'` and Bookings is `status='confirmed'` |
| **C5** | Export/import format + serialiser | M6 | Round-trip test in node: all five tables plus a file manifest, nothing lost. **Resolves open question 5** |

After C5, the core is complete and this machine's work is finished.

### Surface — do these on Windows, in order

| ID | Task | Milestone | Device? |
|---|---|---|---|
| **S1** | Item create/edit form and item detail screen | M3 | no |
| **S2** | Resource UI: pick PDF, pick image, add link, and the reusable `OpenResource` control | M3 | **yes** — verify a real PDF opens offline |
| **S3** | Timeline screen and the Overview / Now card | M4 | no |
| **S4** | Bookings, Places and Notes tabs, and search UI | M5 | no |
| **S5** | Export / import screen | M6 | no |
| **S6** | Local notifications | M7 | **yes** |
| **S7** | Share-to-App | M8 | **yes** |
| **S8** | Visual pass, offline pass, edge cases, release build | M9 | **yes** |

`OpenResource` (S2) is the most important control in the app: one file opens directly, several
open a sheet. It belongs on the Overview card, timeline rows and item detail alike — build it
once.

---

## M0 — Decisions and repo ✅

- [x] Analyse the brief; challenge over-engineering
- [x] Verify Expo SDK 57 / RN 0.86 facts against current docs
- [x] Agree the domain model, schema, time strategy, resource model
- [x] Private GitHub repo, repo-local personal git identity
- [x] `CLAUDE.md`, `docs/technical-reference.md`, `docs/decision-log.md`, `docs/plan.md`

---

## M1 — Foundation, spikes, database

**✅ COMPLETE.** Both spikes ran first, before anything was built on top of them — and both
changed what we would otherwise have written.

### 1.1 Scaffold ✅
- [x] Expo SDK 57.0.21, RN 0.86.3, React 19.2.3, TypeScript 6.0.3
- [x] expo-router, expo-dev-client, `scheme: travelorganizer`, package `com.evelinadakovska.travelorganizer`
- [x] `platforms: ["android"]` — iOS and web dropped, this is an Android-only app
- [x] `npx expo prebuild --platform android`
- [x] `expo-doctor` 21/21 checks passing

Two dependency conflicts resolved rather than force-installed:
- `expo-router@57.0.20` pulls `react-dom@19.3.0`, which needs React ≥19.3 while Expo pins 19.2.3.
  Fixed with `npx expo install react-dom` → 19.2.3.
- `babel-preset-expo` is nested under `expo/` and not hoisted, so jest could not resolve it.
  Installed at top level, pinned to the same 57.0.11.
- jest pinned to `~29.7.0` to match what SDK 57 expects (30.x was flagged by expo-doctor).

### 1.2 Spike A — opening a stored PDF ✅ RESOLVED
**`getContentUriAsync` does not exist on the modern API — and is not needed.**
`new File(path).contentUri` is a direct property. See `technical-reference.md` §5.

The trap found: the package root still exports `getContentUriAsync`, but as a **throwing**
deprecation shim. It typechecks and fails at runtime. Never import it.

### 1.3 Spike B — Hermes timezones ✅ RESOLVED
**`@date-fns/tz` works on Hermes with no polyfills.** Verified on device (Android 16 / RN 0.86),
all six conversions correct. Do not add `@formatjs/*`.

**`Intl.supportedValuesOf('timeZone')` is absent on Hermes** — so `src/domain/timezones.ts` holds a
curated list, with a test asserting every id resolves. That test caught two invalid ids on its
first run (`Europe/Reykjavik`, `Asia/Doha`) that would have produced `NaN` instants silently.

### 1.4 Database ✅
- [x] `src/db/client.ts` — WAL once, `foreign_keys = ON` every connection, `PRAGMA user_version`
- [x] `src/db/migrations/001-initial.ts` — full schema, append-only
- [x] `SQLiteProvider` with `onInit={migrate}` and suspense

### 1.5 Domain: time ✅
- [x] `src/domain/time.ts` — `toInstant`, `dayKey`, `timeOfDay`, `minutesUntil`, `isPastDate`
- [x] 15 tests: DST both directions, date-only stability, `T00:00` vs date-only, late-evening
      day grouping, countdown

### 1.6 Test infrastructure ✅
- [x] jest + babel-preset-expo, `testEnvironment: node`, `roots: src/`
- [x] 14 schema tests through `better-sqlite3` using the same migration SQL: applies from 0,
      cascades, and every CHECK constraint — including that `kind='place'` is rejected and that
      an item dated before the trip start is allowed

### 1.7 Environment (not in the original plan)
- [x] `ANDROID_HOME` set in `~/.zshrc.local` (git-ignored); terminal Gradle builds now work
- [x] Android `cmdline-tools` 23.0 installed — the SDK had no `avdmanager`
- [x] Dedicated AVD `travel_organizer_api36` (16G). The existing emulator is a **work** emulator
      with IG apps on it and was left untouched

**34 tests passing. Typecheck clean. App runs on the emulator, DB migrates to `user_version=1`.**

---

## M2 — Trips CRUD + Home

**✅ COMPLETE.**

- [x] `src/domain/trip.ts` — `Trip`, `tripInputSchema`, row parser, `groupTrips`, `isTripActive`,
      `tripDurationDays`
- [x] `src/domain/format.ts` — date ranges, day headings, relative time, money
- [x] `src/repositories/trips.ts` — list, get, create, update, delete, `countTripContents`
- [x] `src/repositories/settings.ts` — key/value, `default_travellers` ("usually travel with")
- [x] `src/hooks/useLiveQuery.ts` — re-runs a query when a watched table changes
- [x] `src/ui/tokens.ts` — light/dark palette, spacing, radius, type scale
- [x] Components: `Screen`, `ScreenHeader`, `Button`, `Field`/`Input`, `DateField`,
      `TimezoneField`, `TripCard`
- [x] Home — Upcoming / Past sections, "happening now" badge, empty state
- [x] Create, edit and delete trip; delete names the blast radius
- [x] Verified on the emulator end to end: create → save → overview → Home

### Decisions taken during M2

**Two levels of timezone validity.** `isKnownTimezone` is the curated picker list;
`isResolvableTimezone` is what storage accepts. Validating against the picker list alone would
reject a perfectly valid zone the device reports but we never curated.

**`@react-native-community/datetimepicker` added** — dates are central to this app and a text
field would be poor. `DateField` emits a bare `YYYY-MM-DD` read from **device-local** components,
never a `Date` or an instant, so the chosen day cannot shift.

**`enableChangeListener` must be set on `SQLiteProvider`.** It defaults to `false`, so
`addDatabaseChangeListener` never fired and `useLiveQuery` silently never refreshed. Found only by
running the app: the created trip did not appear on Home. No error, no warning. Recorded in
`CLAUDE.md` §5.8 and `technical-reference.md` §3.

**Notable SQL lives in `src/db/queries.ts`**, free of native imports, so it can be tested in node
against better-sqlite3. `COUNT_TRIP_CONTENTS` is tested for the cases that matter: it counts files
on items *and* on the trip, ignores links, and does not leak across trips.

---

## M3 — TripItems + Resources + files

> **Core: C2, C3.** **Surface: S1, S2.**

The largest milestone and the one carrying the most risk. Files are here, not later, deliberately.

**Already in place:** `src/domain/tripItem.ts` holds the enums — `TRIP_ITEM_KINDS`,
`TRIP_ITEM_STATUSES`, `PRIORITIES`, and the per-kind `SUBKINDS` taxonomy — with 11 tests.
Start from the Zod schema and repository.

1. `src/domain/tripItem.ts` — add `tripItemInputSchema`, the row parser, and the Zod
   discriminated union for the `details` JSON column
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

> **Core: C1.** **Surface: S3.**

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

> **Core: C4.** **Surface: S4.**

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

> **Core: C5.** **Surface: S5.**

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

> **Surface: S6** (device).

1. `POST_NOTIFICATIONS` runtime permission request at a sensible moment
2. Schedule on item create/update, cancel on delete or date change
3. Default lead time in `settings`
4. Tap → deep link to the item; handle the item having been deleted
5. Reschedule on app start (defensive)

**Done when:** a reminder fires for an upcoming item and taps through correctly.

---

## M8 — Share-to-App

> **Surface: S7** (device only).

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

> **Surface: S8** (device only).

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
