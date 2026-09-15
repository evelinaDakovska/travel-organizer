# Implementation plan

Ten milestones. **Each leaves the repo in a working state.** Risk is deliberately front-loaded:
the two things most likely to force a redesign are checked in M1, not discovered at M4.

Current position and tick boxes: **[`docs/status.md`](status.md)**. This file holds the
detail and done-when criteria; that one holds the state.

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
| **C1** | `domain/timeline.ts` — day grouping, derived check-in/check-out, next-item selection | M4 | ✅ Done |
| **C2** | TripItem Zod schema, row parser, `repositories/tripItems.ts` | M3 | ✅ Done |
| **C3** | `repositories/resources.ts` + `files/storage.ts` | M3 | ✅ Done — `contentUri` open path written, device-verified in S2 |
| **C4** | Tab queries (Bookings / Places / Search) + `repositories/notes.ts` | M5 | ✅ Done |
| **C5** | Export/import format + serialiser | M6 | ✅ Done — open question 5 resolved: one archive for everything |

After C5, the core is complete and this machine's work is finished.

### Surface — do these on Windows, in order

| ID | Task | Milestone | Device? |
|---|---|---|---|
| **S1** | Item create/edit form and item detail screen | M3 | ✅ Done |
| **S2** | Resource UI: pick PDF, pick image, add link, and the reusable `OpenResource` control | M3 | ✅ Done — PDF opened offline on the emulator |
| **V1** | Visual foundation from `docs/design/`: colour roles over palette ramps, fonts, icons, shared components, restyle of existing screens | M4 | ✅ Done — checked on the emulator in light and dark mode |
| **S3** | Trip tabs (Now · Timeline · Places · Notes) with the add button; the Now and Timeline screens | M4 | ✅ Done — verified on the emulator |
| **S4** | Places and Notes tabs, search, and item status actions | M5 | ✅ Done — verified on the emulator |
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

1. ✅ `src/domain/tripItem.ts` — `tripItemInputSchema`, `tripItemWriteValues`, `parseTripItemRow`
2. ✅ `src/repositories/tripItems.ts` — CRUD, **`start_utc` derived on write, never by hand**
3. ✅ Item create/edit form, fields varying by `kind`. **`details` is pinned:** transport only —
   `from`, `to`, `carrier`, `number`, `seat`. It is the one kind with a structural need a column
   cannot meet, because a journey has two endpoints and `location_name` holds one
4. ✅ Item detail screen
5. ✅ `src/files/storage.ts` — import-and-copy, relative↔absolute paths, **GC sweep on app start**
6. ✅ `src/repositories/resources.ts` and `src/domain/resource.ts`
7. ✅ Add a resource: pick a file (`expo-document-picker`) · pick a photo (`expo-image-picker`,
   the Android photo picker) · paste a link, normalised to `https://` and refused unless it is a
   scheme we open
8. ✅ **`OpenResource` component** — one attachment opens directly; several open a bottom sheet.
   On item detail now; the Now card and timeline rows pick it up in S3
9. ✅ Missing-file handling: the row says *File missing from this phone*, and tapping it explains
   instead of crashing
10. ✅ Delete confirmation naming the blast radius — for an item, the number of saved files
11. ✅ Trip-level resources: a *Trip documents* section on the Overview (open question 3)

**Done when:** an item with a PDF can be created, the PDF opens offline, and deleting the item
removes the file on the next GC sweep. **✅ Verified on the emulator 2026-09-13.**

---

## M4 — Trip tabs, Now and Timeline

> **Core: C1.** **Surface: V1, S3.** Design in `docs/design/`; decision log D19–D22.

1. ✅ `src/domain/timeline.ts` — group by local day, order by instant
2. ✅ Multi-day items derive **check-in / check-out** entries
3. ✅ Date-only items sort to the top of their day
4. ✅ **V1** — colour roles over palette ramps, Caprasimo and Figtree, Lucide icons, shared Card,
   Tag, SectionLabel and pill controls, and the existing screens restyled
5. ✅ Next-item derivation — excludes `cancelled` and completed tasks; **includes items dated
   before the trip starts**, and surfaces a check-out
6. ✅ Trip tabs at the bottom — **Now · Timeline · Places · Notes** — with a floating add button
   (D20). Search in the header arrives with S4
7. ✅ Now screen: *Up next* cards with the Open-ticket control, *Open tasks* with a tick, then trip
   facts and Trip documents
8. ✅ Timeline screen: day labels over item cards; a stay reads *Check in* / *Check out* on its two
   days; dated ideas tagged Idea; cancelled items left off; undated confirmed items under *No date yet*
9. ✅ Empty states: nothing upcoming → no *Up next*; no open tasks → *Nothing left to do*
10. ✅ Cold-start straight into the active trip when exactly one is in progress
11. ✅ Tests for all of the above — `src/domain/itinerary.test.ts`, and the attachment query in
    `src/db/resources.queries.test.ts`

**Done when:** the Milan and Lapland sample trips render correctly, and the Now screen matches
reality with the device timezone changed. **Partly verified 2026-09-15:** tabs, a two-day stay and
cold start checked on the emulator. The full sample trips and the timezone change are not yet done;
they belong to the S8 offline and timezone pass.

---

## M5 — Places, Notes, Search, status actions

> **Core: C4.** **Surface: S4.**

Tabs that are queries over one table — the payoff of the domain model.

1. ✅ Bookings query — `status='confirmed'`. **No tab uses it any more** (D20); kept and tested
2. ✅ Places query — `status='idea'`, priority then title, unrated last
3. ✅ Promote a place to a dated plan — `scheduleTripItem`, a single `UPDATE`
4. ✅ `trip_notes` CRUD and pinning — the Notes tab, new and edit screens, and pin to top (S4)
5. ✅ Search across title, notes, location, address, `confirmation_code` **and trip notes** — a
   header search on every trip tab that includes cancelled items (S4)
6. ✅ Cost fields (amount, currency, paid/unpaid) in the item form — shipped with S1
7. ✅ Item status actions (S4): *Move to Timeline* for an idea, *Mark as cancelled* and *Restore*,
   and *Delete* only for ideas and cancelled items (decision log D21)

**Done when:** the app is genuinely usable for a real trip. **Do not travel with it until M6.**
**Verified 2026-09-15** on the emulator: search, notes, cancel and restore, promote, and the delete
rule all work end to end.

---

## M6 — Export / import

> **Core: C5.** **Surface: S5.**

Deliberately before notifications and share-to-app: the app becomes trip-ready at M5, so backup
must exist before the first real trip depends on it.

1. ✅ Format and serialiser — all five tables plus a file manifest, id collisions handled by
   `merge` / `replace`. **Add a pure-JS zip dependency first: there is none yet**
2. Export: write `backup.json` + `media/` into a `.zip`, hand to the Android share sheet (→ Drive)
3. Import: read a `.zip`, then `parseExportDocument` → `planImport` → `applyImport`
4. Enable Android Auto Backup in `app.json` (backstop only)
5. Round-trip test **on a device**: export → wipe app data → import → verify every PDF opens.
   The row round-trip is already covered in node; what is unverified is the zip and the files

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
