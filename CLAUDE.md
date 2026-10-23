# Travel Organizer — project context

Read this first. It is the durable context for the project: what it is, what has been decided,
what is still open, and the conventions to follow.

| Doc | Role |
|---|---|
| **`CLAUDE.md`** (this file) | Authoritative summary. Decisions, terminology, conventions |
| `docs/product-status.md` | **Product status & feature matrix** — readiness per feature and where it was verified (phone, beta phone, emulator) |
| `docs/next-session.md` | **The latest handoff**: where the work stands, the rules that bind, the next tasks waiting for the owner |
| `docs/session-handoff.md` | **Starting fresh? Read after this file.** How the work goes: decisions in context, the machine, driving a device, what bit us |
| `docs/status.md` | **Engineering status board** — what is done and how it was verified, task by task; open questions |
| `docs/MASTER_ROADMAP.md` | **The long-term product roadmap** (owner's baseline, 2026-10-20): every phase's goals, requirements and exit gates, rules that must not drift, the beta/release track, the deferred/discovery backlog; §21 records the owner's answers to the cross-check (2026-10-20) |
| `docs/roadmap.md` | **The roadmap overview**: Phases 1–8 and their state, done in order, each only when the owner asks; links to the master roadmap and phase plans |
| `docs/technical-reference.md` | **Single source of truth** for schema, time model, file storage, queries |
| `docs/plan.md` | Step-by-step implementation plan and current position |
| `docs/review-plan.md` | R1–R11 from the independent review (done) |
| `docs/feedback-plan.md` | F1–F6, feedback after showing the app (done; 0.5.0) |
| `docs/paid-plan.md` | F7, paid or not at a glance (done; 0.5.1, on the phone) |
| `docs/fieldbook-plan.md` | The design review of 0.5.1: fixes A1–A7, the Fieldbook redesign B1–B11, additions C1–C5, decisions FB-1… (0.6.0) |
| `docs/directions-plan.md` | Google Maps directions and timeline connectors (0.7.0) |
| `docs/phase2-plan.md` | Roadmap Phase 2 architecture (2A): single-trip archive (built as 2B, 0.9.0), AI JSON import, planning context |
| `docs/phase2c-plan.md` | 2C plan as approved, with the owner's refinements and what was built (0.10.0) |
| `docs/phase2d-plan.md` | 2D (Plan with AI) plan as approved, with the owner's refinements and what was built (0.11.0) |
| `docs/phase3-plan.md` | Roadmap Phase 3 (travellers, pricing, shared expenses): the 3A audit, the owner's decisions (§15), 3B as built (0.12.0), the starting point for 3D-1 |
| `docs/ai-activities-format.md` | **The public activities JSON format** (v1) for AI assistants and tools — schema in `docs/schema/` |
| `docs/decision-log.md` | *Why* things were decided. Rationale only — no authoritative detail |
| `docs/windows-handoff.md` | **Continuing on Windows** — read this instead of `dev-setup.md` there |
| `docs/dev-setup.md` | Machine setup for the macOS machine it was started on |
| `docs/original-spec.md` | The original brief. Historical; superseded where this file disagrees |
| `docs/ideas.md` | Someday/maybe. Deliberately out of scope |
| `docs/user-guide.md` | **How to use the app**, for the owner — every screen, backup, the pre-flight checklist |

---

## 1. What this is

A local-first **Android-only** app, built for the owner and, since 0.7.3, shared as a sideloaded
**friends-only beta**. It holds everything already decided, booked or
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
`docs/product-status.md` is the feature-level view of the same facts (what a tester can use, and
where it was verified); keep the two in step, and when they disagree `status.md` wins.
**What comes next: [`docs/roadmap.md`](docs/roadmap.md)** (overview; the long-term product roadmap is
[`docs/MASTER_ROADMAP.md`](docs/MASTER_ROADMAP.md)) — Phases 1–8, one at a time; a phase
starts only when the owner asks for it.

Work is tracked by **task ID**, not milestone: **C1–C5** (core — domain, schema, repositories,
files, export; no device needed), **S1–S8** (surface — screens and anything needing a device, done
on a personal Windows machine, see `docs/windows-handoff.md`), **U1–U8** (the owner's list after
real use, 2026-10-10), **N1–N6** (features), **R1–R11** (after an independent review,
`docs/review-plan.md`) and **FB** — A1–A7, B1–B11, C1–C5 (the design review of 0.5.1,
`docs/fieldbook-plan.md`), **0.7.x** (directions, adult/child travellers, the beta) and **P1–P8**, the
roadmap's phases. All in `docs/status.md`.

The app is in daily use on the owner's phone as a signed release build, **holding a real trip**.
**What is done and what is next lives only in `docs/status.md`**; where the last session stopped is
`docs/session-handoff.md` §11. Anything touching stored data follows the data-safety routine in
that file.
**Plan first:** for non-trivial work, a step-by-step plan the owner approves before any code.

**How to be asked to work:**

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** in `docs/status.md` → finish → commit → tick it there. **Stop after C5** |
| *"continue with the plan"* / *"the next phase"* | The next phase in `docs/roadmap.md`, **only if the owner has asked for it** — never start the following phase on your own |

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
10. **Change events arrive one per row.** A live query that re-reads per event slows a batch write to
    a crawl (300 rows: 43 s, minutes with more screens open). `useLiveQuery` waits for a pause —
    keep it that way, and debounce any new change listener the same way.

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

**People — six concepts, never conflated** (2B-0, D33):

| Term | Meaning | Stored |
|---|---|---|
| **Traveller profile** | A person, kept once, reused across trips: name + adult/child/unspecified | `travellers` (global) |
| **Me** | The profile that is the person using the app *on this phone*. A local mark, not an account, not an owner, not a payer | `settings.me_traveller_id` → a `travellers` id |
| **Trip membership** | Who is on a trip, with a per-trip classification | `trip_travellers` |
| **Activity participant** | Who goes to one booking/plan. None = *not specified*, never "everyone". A new plan or saved place made in the item form starts with every trip member ticked; joining a trip adds nobody to existing items (3B) | `item_participants` |
| **List recipient** | Who a packing/shopping item is for — any number; never a quantity | `list_item_recipients` |
| **Financially responsible adult** | *Future (Phase 3)*: who pays for a child. Not modelled yet | — |
| *(Account user, trip owner)* | *Future (accounts/shared trips)*. Neither exists; Me must not be reused as either | — |

## 5. Load-bearing architecture decisions

Full detail in `docs/technical-reference.md`; rationale in `docs/decision-log.md`.

### 5.1 "Place" is a state, not a type

Two independent axes — `kind` (what it is) and `status` (how committed). `place` does not exist as
a type. A recommended café is `kind='food', status='idea'`. A booked museum is
`kind='activity', status='confirmed'`.

This collapses Places, Bookings and Timeline into three queries over one table, and makes
"promote a saved place to a dated plan" a single `UPDATE`.

### 5.2 One `trip_items` table

Plus `trips`, `trip_notes`, `resources`, `settings`, since migration 002 `expenses` and
`payments` (N5; an expense is not a TripItem, D25), and since migration 003 `travellers`,
`trip_travellers`, `item_participants`, `lists`, `list_items`, `templates`, `template_uses`
(Fieldbook C1–C5). Migration 004 adds adult/child `classification` to `travellers` and
`trip_travellers`; 005 adds `trips.converted_travellers`; 006 adds `list_item_recipients`
(`list_items.traveller_id` is legacy since). Migration 007 (3D-1, 0.14.0, branch `phase-3d1`) adds
`booking_payments` and `expenses.trip_item_id` / `payer_id`; booking references have no ON DELETE
action, so a booking with money records cannot be deleted alone (backup format 8). Migration 008
(3D-2, 0.15.0, same branch) adds `cost_shares` and `trip_cover`, both keyed to
`trip_travellers(trip_id, traveller_id)` so nobody off the trip can hold or cover a share (backup
format 9). Migration 009 (3E, 0.16.0) adds `settlements` (backup format 10); migration 010 (0.16.1,
review P1) adds `unsplit_confirmations`, one per cost, ended by any write to that cost's split
(triggers) and by any financial edit (`endChangedConfirmations`, called by every money write — a new
one must call it too), so a stored one always matches the cost's fingerprint (backup format 11).
Migration 011 (0.16.2) adds `settlement_reviews`: a shared cost leaving a currency with settlements
is refused until the person continues (`SettlementReviewNeeded`), then recorded as an open review that
holds that currency's suggestions until *Settlements still stand* — every money write goes through
`moneyWrites.afterMoneyWrite` (backup format 12).
Migration 012 (Phase 4, 0.17.0) adds `trips.report_currency`, `trip_rates` (typed-in rates, exact
decimal text, each set against a stored base) and `charged_amount` / `charged_currency` on expenses
and booking payments; a converted total is worked out on demand, never stored, and balances stay per
currency (backup format 13; D45).
Backup format 7 (0.13.0: same tables as 6; price lines in
`details` may carry who they are for, group prices and extras). No per-kind tables.
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

- **Android only.** Target device: Samsung Galaxy S26 Ultra; the beta also runs on a smaller
  Android phone, so layouts must hold on a narrow screen. No iOS (deferred), no tablets.
- **No backend, no accounts, no auth, no sync, no telemetry** in the current scope. Everything
  on-device. Accounts and sync are *Discovery*, not excluded (see the status table below).
- **A custom dev client is required** (`expo prebuild` + `expo run:android`) because
  `expo-share-intent` needs native code. Expo Go cannot run this app.
- **Development targets the emulator by default** (`Pixel_10_Pro`, 1280×2856). The owner's primary
  phone is never connected, installed on or tested with without explicit permission. A separate
  **secondary** beta phone may be used only in a testing session the owner has explicitly approved,
  with synthetic data only (`docs/MASTER_ROADMAP.md` §3.1) — see also §9. Phones come last, after
  review and emulator testing: the primary phone (real trip) gets **only risk-free changes until
  the trip has passed**, and the risky ones after it, never before; the secondary phone (the
  owner's husband's, no real data) tests **all changes** (owner, 2026-10-23).
- Offline access to stored documents is a **core requirement**, not a nice-to-have.
- **One exception to "no backend"**: the in-app feedback form (0.7.x) posts to a small Cloudflare
  Worker (`server/feedback-worker/`) that emails the owner. It is **off** behind
  `FEATURE_FEEDBACK_ENABLED` (D31) and carries no trip data. It is switched on, and the worker
  deployed, only before the first friends APK, through its own pre-beta task (`status.md` *B1*).

### What is in and out of scope

Five statuses (owner, 2026-10-20, D38; `docs/MASTER_ROADMAP.md` §1.1). **"Not building now" never
means "never building."** Ideas move between statuses; none is removed to make documents agree.

| Status | Meaning | Items |
|---|---|---|
| **Implemented** | In the app | Importing AI-written activities from JSON (2C) and *Plan with AI* (2D) — the app reads and writes files, it calls no AI service; 3C–3E; currency conversion with typed-in rates (4, on `phase-3d1`) |
| **Approved/planned** | On the roadmap; **only the current phase is authorised** | A full-day map (5), trips without dates (6), Google Maps place import (7), an `.ics` export (8); the feedback deployment before the friends beta (*B1*) |
| **Deferred** | Possibly wanted later; not current scope | iOS · shopping-list estimated prices · full itinerary templates · monetisation |
| **Discovery** | Needs research and a separate owner decision | AI integrations in the app (an AI API, in-app itinerary generation) · Gmail integration · automatic booking parsing / email and document extraction · cloud backend, accounts, sync and collaboration · weather and travel monitoring · a passport vault · peer-to-peer sharing |
| **Explicitly excluded** | Not part of the product unless the owner reverses it | Flight/hotel search · booking APIs (the app is not a search engine or booking service, §1) · Google Wallet API |

The *Explicitly excluded* row is the earlier "explicitly not building" list minus what the owner
asked to keep open; it is unchanged otherwise and is the owner's to confirm. Detail and per-item
reasoning: `docs/MASTER_ROADMAP.md` §17.

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
- The design source is the **Fieldbook** redesign, `docs/fieldbook-plan.md` Part B (0.6.0). The
  earlier handoff in `docs/design/` is history; where either contradicts the model,
  `docs/decision-log.md` D22 says which wins.
- **No hex values in components.** Colours are semantic roles read through `useColors()`
  (`src/ui/tokens.ts`); the only hex values live in `src/ui/theme/palette.ts`. To re-theme, change
  the palette and run `roles.test.ts`, which fails if any text role drops below its contrast bar.
- Text styles come from `type.*` (Figtree only, since the Fieldbook redesign). Android picks a face by font
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
