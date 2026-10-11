# Travel Organizer — project context

Read this first. It is the durable context for the project: what it is, what has been decided,
what is still open, and the conventions to follow.

| Doc | Role |
|---|---|
| **`CLAUDE.md`** (this file) | Authoritative summary. Decisions, terminology, conventions |
| `docs/session-handoff.md` | **Starting fresh? Read after this file.** How the work goes: decisions in context, the machine, driving a device, what bit us |
| `docs/status.md` | **Status board** — milestones, C, S and N tasks, open questions. The one place status lives |
| `docs/technical-reference.md` | **Single source of truth** for schema, time model, file storage, queries |
| `docs/plan.md` | Step-by-step implementation plan and current position |
| `docs/review-plan.md` | R1–R11 from the independent review (done) |
| `docs/feedback-plan.md` | F1–F6, feedback after showing the app (done; 0.5.0) |
| `docs/decision-log.md` | *Why* things were decided. Rationale only — no authoritative detail |
| `docs/windows-handoff.md` | **Continuing on Windows** — read this instead of `dev-setup.md` there |
| `docs/dev-setup.md` | Machine setup for the macOS machine it was started on |
| `docs/original-spec.md` | The original brief. Historical; superseded where this file disagrees |
| `docs/ideas.md` | Someday/maybe. Deliberately out of scope |
| `docs/user-guide.md` | **How to use the app**, for the owner — every screen, backup, the pre-flight checklist |

---

## 1. What this is

A personal, local-first **Android-only** app that holds everything already decided, booked or
saved for a trip: tickets, boarding passes, hotel confirmations, PDFs, reservation references,
links, saved places and notes.

It is **not** a planner, recommender, search engine or booking service. It organises information
that already exists.

The scenario it is optimised for:

> *"I am travelling, possibly stressed, possibly without internet. I need to know what happens
> next and find the relevant ticket within seconds."*

### The asymmetry that drives every decision

- **Writing** happens at home, on wifi, unhurried, weeks ahead.
- **Reading** happens abroad, stressed, offline, in seconds.

This is a **read-optimised app with a tolerable write path**. Data entry may be a boring form.
Retrieval may not be. Spend complexity on the read side.

Corollary: the app is a filing cabinet whose most valuable content is **binary files it does not
own**. The PDF is the product; everything else is metadata to find it. That is why file handling
and offline access outrank the timeline in priority.

## 2. Product principles

Local-first · offline-first · fast · visually clean · flexible · maintainable.

Prefer simple solutions to clever architecture. Do not build abstractions for features that may
never exist. No enterprise patterns; this is a personal app that should still be maintainable.

## 3. Current phase

**Status board: [`docs/status.md`](docs/status.md) — the single source of truth for what is done.**
Do not duplicate status anywhere else; update that one file.

Work is tracked by **task ID**, not milestone: **C1–C5** (core — domain, schema, repositories,
files, export; no device needed), **S1–S8** (surface — screens and anything needing a device, done
on a personal Windows machine, see `docs/windows-handoff.md`), **U1–U8** (the owner's list after
real use, 2026-10-10), **N1–N6** (features) and **R1–R11** (after an independent review,
`docs/review-plan.md`). All in `docs/status.md`.

The app is in daily use on the owner's phone as a signed release build, **holding a real trip**.
**What is done and what is next lives only in `docs/status.md`**; where the last session stopped is
`docs/session-handoff.md` §11. Anything touching stored data follows the data-safety routine in
that file.
**Plan first:** for non-trivial work, a step-by-step plan the owner approves before any code.

**How to be asked to work:**

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** in `docs/status.md` → finish → commit → tick it there. **Stop after C5** |
| *"continue with the plan"* | First unticked task overall — every C and S is done, so that is a **U**, then an **N** |

**C before S on purpose.** Core mistakes ripple through every screen and migrations are painful;
surface mistakes are visible immediately and cheap to fix. `src/domain/` imports nothing native,
so all C work runs under `npm test` with no emulator. Doing C first means S is wiring known-good,
tested functions to screens rather than designing and building at once.

A task is not done until it is **committed and ticked in `docs/status.md`** — that is what
survives a compacted context.

### Findings already paid for — do not rediscover

1. `getContentUriAsync` **typechecks but throws at runtime**. Use `new File(path).contentUri`.
2. `SQLiteProvider` needs `options={{ enableChangeListener: true }}` — it defaults to `false`, and
   without it every live query silently shows stale data, with no error.
3. `Intl.supportedValuesOf('timeZone')` does **not** exist on Hermes, hence the curated list in
   `src/domain/timezones.ts`.
4. `File.pickFileAsync()` reports the SAF document id (`document:35`) as `name` on Android. Pick
   documents with `expo-document-picker`, which reads the real display name.
5. On Windows the NDK's ninja fails on paths over 260 characters **regardless of
   `LongPathsEnabled`**. Keep the repo at a short path such as `C:\dev\travel-organizer`.
6. `withExclusiveTransactionAsync` writes through a **second connection** the change listener
   never hears, so every live query stays stale until a relaunch. Use `withTransactionAsync`.
7. `expo-share-intent` 8.0.1 **crashes the app** on a shared URI it cannot read. It is patched
   (`patches/`, applied by `patch-package` on install). Re-check the patch when upgrading it.
8. The **dev client cannot be cold-started by a share**: its launcher fails on `ACTION_SEND`.
   Test that path on a release build.
9. **Expo modules ship prebuilt** (`local-maven-repo/…aar`). A `patch-package` patch to one is
   silently ignored unless `package.json` lists it in `expo.autolinking.android.buildFromSource`.
   Check the build log for `:<module>:compileReleaseKotlin`. `expo-notifications` is listed.

## 4. Domain terminology

Use these words precisely, in code and in conversation.

| Term | Meaning |
|---|---|
| **Trip** | A dated journey. Start and end dates are **mandatory**. Has one `default_tz`. |
| **TripItem** | Anything meaningful attached to a trip. The one polymorphic-ish entity. |
| **`kind`** | *What sort of thing:* `transport` `stay` `activity` `food` `task` `other`. 6 structural values that drive behaviour. |
| **`subkind`** | *Cosmetic/filtering:* `flight` `train` `cafe` `museum`… Drives icons and labels. **A fixed enum per kind** (`src/domain/tripItem.ts`), always nullable, never contains `'other'`. **Replaces the transport-mode concept entirely.** |
| **`status`** | *How committed:* `idea` `confirmed` `cancelled`. |
| **Place** | **Not a type.** A Place is a TripItem with `status = 'idea'`. The Places tab is a query. |
| **Booking** | A TripItem with `status = 'confirmed'`. The Bookings tab is a query. |
| **Task** | `kind = 'task'` — dated, completable via `completed_at`. e.g. "check in for flight". |
| **Resource** | A file or link attached to a TripItem *or* a Trip. |
| **Timeline** | A **derived view** over TripItems. Never a separate data model. |
| **Now / Next** | Derived from items, **not** from trip dates. |

## 5. Load-bearing architecture decisions

Full detail in `docs/technical-reference.md`; rationale in `docs/decision-log.md`.

### 5.1 "Place" is a state, not a type

Two independent axes — `kind` (what it is) and `status` (how committed). `place` does not exist as
a type. A recommended café is `kind='food', status='idea'`. A booked museum is
`kind='activity', status='confirmed'`.

This collapses Places, Bookings and Timeline into three queries over one table, and makes
"promote a saved place to a dated plan" a single `UPDATE`.

### 5.2 One `trip_items` table

Plus `trips`, `trip_notes`, `resources`, `settings`, and since migration 002 `expenses` and
`payments` (N5; an expense is not a TripItem, D25). No per-kind tables.
Kind-specific extras live in a Zod-validated `details` JSON column.

### 5.3 Time: store wall-clock + IANA zone, derive the instant

**Never store a bare UTC instant for a user-facing time.** Storing an instant means a flight
departing Sofia at 06:10 renders as 05:10 once the phone switches to Italian time. Every zone
crossing would make the itinerary lie.

Store `start_local` (wall clock, no offset) + `start_tz` (IANA) + `start_precision`, and derive
`start_utc` as a sort key only.

```
Day grouping:  substr(start_local, 1, 10)   -- local date, NEVER utc
Within a day:  ORDER BY start_utc
Countdown:     start_utc - now
```

### 5.4 Resources: one table, two behaviours

`kind='file'` (owned blob, has a lifecycle, can go missing) and `kind='link'` (a string to open).
`wallet`/`maps`/`website` are `subtype` — presentation, not type.

`confirmation_code` lives **on the item**, not as a resource: it is a scalar property wanted in
the header without a join, and its affordance is copy, not open.

### 5.5 File paths are relative, never absolute

The app sandbox path is not stable across reinstalls. Store `media/<uuid>.pdf` and join to
`Paths.document` at read time. Storing the absolute URI means every ticket silently fails after a
reinstall — discovered while abroad.

### 5.6 Orphaned files are collected, not deleted inline

SQLite cascades delete rows, not files. Run a **GC sweep on app start**: any file in the media
directory not referenced by a `resources.stored_path` is deleted. Crash-safe and self-healing.

### 5.7 Items are not confined to the trip's date range

Flight check-in opens 24h before departure; "book the restaurant" is weeks earlier. There is
deliberately **no constraint** tying item dates to `trip.start_date`/`end_date`, and Now/Next is
driven by items rather than trip dates.

### 5.8 SQLite is the source of truth — no global store

No Redux, no Zustand, no TanStack Query. The real need is "re-render when the DB changes", met by
a small `useLiveQuery` hook over `expo-sqlite`'s `addDatabaseChangeListener`.
Never copy DB rows into a global store.

⚠️ **`SQLiteProvider` must be opened with `options={{ enableChangeListener: true }}`.** It
defaults to `false`, and without it `addDatabaseChangeListener` never fires — `useLiveQuery`
silently never refreshes and every screen shows stale data. There is no error and no warning.
This cost a real bug in M2: a created trip did not appear on Home.

## 6. Stack

React Native · **Expo SDK 57 (`>=57.0.17`)** · TypeScript · Expo Router · expo-sqlite · Zod ·
React Hook Form.

Raw SQL with hand-written migrations — no ORM. Plain `StyleSheet` + a tokens file — no UI kit.

`>=57.0.17` is not cosmetic: SDK 57 shipped memory and startup regressions affecting
`react-native-reanimated` users, fixed in 57.0.9 and 57.0.17.

Full list with per-dependency rationale in `docs/technical-reference.md` §8.

## 7. Constraints

- **Android only.** Target device: Samsung Galaxy S26 Ultra. No iOS, no tablets, no older devices.
- **No backend, no accounts, no auth, no sync, no telemetry.** Everything on-device.
- **A custom dev client is required** (`expo prebuild` + `expo run:android`) because
  `expo-share-intent` needs native code. Expo Go cannot run this app.
- **Development targets the emulator by default** (`Medium_Phone_API_36.1`). The physical phone is
  connected only when strictly necessary — see §9.
- Offline access to stored documents is a **core requirement**, not a nice-to-have.

### Explicitly not building
AI features · itinerary generation · flight/hotel search · booking APIs · Gmail integration ·
Google Calendar · Google Wallet API · cloud backend · accounts · collaboration · weather ·
currency conversion · embedded maps · automatic booking parsing.

## 8. Conventions

### Folders
```
app/              expo-router routes; a screen composes feature components. No SQL, no domain logic
src/db/           client + migrations. SQL schema lives here
src/domain/       PURE TS. No React, no SQLite, no Expo imports. All testable logic
src/repositories/ SQL queries. SQL lives here and nowhere else
src/files/        file import, path resolution, GC
src/notifications/ reminders: permission, channel, reconcile with the database
src/hooks/        useLiveQuery and friends
src/ui/           tokens + shared components
src/features/     screen-level composition per feature
```

**The rule that matters: `src/domain/` imports nothing native.** That is what makes the logic
testable in plain Node with no mocking. If a domain module needs an Expo import, the design is
wrong.

### Database
- **Explicit, hand-written, append-only migrations.** Never edit a shipped migration; add a new one.
- `PRAGMA user_version` tracks the schema version.
- `PRAGMA foreign_keys = ON` **on every connection** — it is not persisted in the file.
- `PRAGMA journal_mode = WAL` once at creation — this one *is* persisted.
- All ids are UUIDs generated in app code (`expo-crypto`), never autoincrement.
- All timestamps are TEXT ISO strings. Money is **INTEGER minor units**, never REAL.
- `start_utc` / `end_utc` are derived caches, written **only** by the repository layer.
- Derive UI state through queries. Do not mirror tables into memory.

### Code
- Production-quality readable TypeScript over clever abstractions.
- Zod at every boundary: forms, the `details` JSON column, and share-intent payloads
  (untrusted input from other apps).
- No premature abstraction. Two call sites is not a pattern.

### UI
- The design source is `docs/design/` (Claude Design handoff). Where it contradicts the model,
  `docs/decision-log.md` D22 says which wins.
- **No hex values in components.** Colours are semantic roles read through `useColors()`
  (`src/ui/tokens.ts`); the only hex values live in `src/ui/theme/palette.ts`. To re-theme, change
  the palette and run `roles.test.ts`, which fails if any text role drops below its contrast bar.
- Text styles come from `type.*` (Caprasimo headings, Figtree body). Android picks a face by font
  family, so never set `fontWeight` on these.
- Icons by meaning — `<Icon name="back" />` — so the icon set can be swapped in `Icon.tsx` alone.
  An item's icon comes from `ITEM_ICONS` there, typed against every kind and subkind (a new one
  without an icon does not compile), drawn by `KindTile`: shape tells kinds apart, not colour (D28).

### Testing
Three tiers, detailed in `docs/technical-reference.md` §10:
1. **Pure domain unit tests** — where all the value is. Time conversion, timeline grouping,
   next-item derivation.
2. **SQL + migrations in Node via `better-sqlite3`** — tests the SQL, not Expo's binding.
3. **A manual offline checklist per milestone** — airplane mode, open every PDF, force-kill,
   change device timezone.

No UI snapshot tests.

## 9. Privacy / environment constraint

Development happens on an **IG-owned, Jamf-managed Mac**; the repo is hosted on a **personal
GitHub account** with a repo-local personal git identity. IP-ownership implications were raised
and explicitly accepted by the owner — **do not revisit this**.

Two operational consequences that do still apply:

1. **The laptop is not a safe store.** It can be wiped remotely and is reclaimed on offboarding.
   Personal GitHub is the only off-device copy — push often; treat the working copy as disposable.
2. **Minimise phone→laptop data flow.** Emulator by default. Never `adb pull` personal files.
   Real travel use runs a **release build**, because a debuggable build lets an authorised
   computer read the app's private sandbox — the database and every imported PDF — via
   `adb shell run-as`.

## 10. Open questions

Tracked in [`docs/status.md`](docs/status.md), each tagged with the task that needs it answered.

## 11. How to work on this

- **Do not generate the whole app in one pass.** Incremental, milestone by milestone, each leaving
  the repo working.
- **Do not silently make product decisions** where the spec is ambiguous. Explain the tradeoff,
  recommend one option, wait for confirmation when consequences are downstream-heavy. Use judgment
  freely on small implementation details.
- **Challenge bad technical assumptions.** The owner is a frontend developer with ~1 year of
  professional React Native experience, comfortable with React/RN/TypeScript, and is reviewing all
  code. Discuss architecture, SQLite, native modules and Expo directly. Do not explain basic React.
- **Verify before estimating.** Confirm that an API or data source actually exists before calling
  a task simple. Several decisions here changed after checking current Expo docs rather than
  relying on recall.
- Keep this file updated when an architectural decision changes.
