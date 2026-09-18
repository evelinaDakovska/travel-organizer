# Decision log

**Why** things were decided. No authoritative detail — for schema, model and conventions see
`docs/technical-reference.md`, which wins on any disagreement.

Each entry records the decision, the alternatives rejected, and the reasoning. Written so a future
session can tell a considered choice from an accident.

---

## D1 — "Place" is a state, not a type

**Decision:** `place` does not exist as a `kind`. Two axes: `kind` (what it is) and `status`
(how committed). The Places tab is `WHERE status = 'idea'`.

**The brief proposed** `place` as a sibling of `transport`/`stay`/`activity`/`food`.

**Why that was wrong:** the brief's own examples contradict it. A recommended café is semantically
**food**; a viewpoint is **activity**; a vintage shop is **other**. What makes them "Places" is not
their category — it is that they are **not yet committed to**. Meanwhile the Duomo Fast Track is an
activity, *is* a place (address, coordinates, opens in Maps), *and* is booked.

The boundary the brief drew is not where the domain's seam is. The seam is commitment.

**Consequences:** resolves the brief's TripItem-vs-Place question and its booking-status question
simultaneously; makes "some activities booked, others merely planned" a one-column difference; and
collapses three planned milestones into one.

---

## D2 — One `trip_items` table, not a separate `places` table

**Decision:** option A from the brief — one table.

**Considered:** a separate `places` table. Genuine arguments for it: different lifecycle, no dates,
different query patterns, no nullable date columns on something that never has dates.

**Why one table won:**

1. **Promotion.** The brief explicitly wants a saved place to later gain a date. One table:
   `UPDATE trip_items SET start_local = …`. Two tables: DELETE + INSERT + re-point every attached
   resource, and the id changes, breaking any notification referencing it. Decisive.
2. **Resources attach to both.** A café recommendation has a website; a booked restaurant has a
   confirmation. Two tables forces a polymorphic FK on `resources` — the exact complexity a split
   was supposed to avoid.
3. **Search and a future trip-map need the union.** Booked activities have coordinates too. Two
   tables means `UNION` forever.

**Explicitly not decided on "fewer tables is tidier."** The brief warned against forcing genuinely
different concepts together for elegance; this is the opposite case — the concepts are the same.

---

## D3 — Status: three values, not five

**Decision:** `idea` | `confirmed` | `cancelled`.

**The brief floated** `idea` / `planned` / `booked` / `cancelled` / `completed`.

**Rejected:**
- `planned` vs `idea` — a distinction that will not be reliably maintained in practice.
- `completed` as a status — derivable for a booking (`end_utc < now`).

**`cancelled` earns its place for one concrete reason:** when something is cancelled you still need
the cancellation confirmation PDF. Deleting the item destroys the evidence. So it is kept, hidden
from Timeline and Now, greyed in lists.

**`completed_at` was later added for tasks only** (see D9), because for a task "done" depends on
the user acting, not on time passing. That is the one place the concept is not derivable.

---

## D4 — Time: wall-clock + IANA zone, derived instant

**Decision:** store `start_local` + `start_tz` + `start_precision`; derive `start_utc` as a sort key.

**Rejected:** storing a UTC instant (the obvious default).

**Why:** a flight departing Sofia at 06:10 (UTC+3) would render as 05:10 once the phone switches to
Italian time on landing. Every zone crossing would make the itinerary lie. The same bug moves a
date-only hotel check-in to the wrong day. For a travel app this is not an edge case — it is the
normal case.

**Why `start_utc` is stored rather than computed on read:** ordering and "what's next" then happen
in SQL instead of by loading every row into JS. It is a denormalised cache, written only by the
repository layer.

**Why `start_precision` is stored rather than inferred from string length:** `T00:00` is a real
time and must stay distinguishable from "date known, time unknown". That is user intent, not a
formatting detail.

**Accepted limitation:** IANA database changes can stale the cached instants. Negligible for trips
booked months ahead; a recompute function fixes it if it ever matters.

---

## D5 — Resources: one table, two behaviours

**Decision:** one `resources` table, `kind ∈ {file, link}`, with a cosmetic `subtype`.

**The brief floated** splitting into `Attachment` / `Link` / `Reference`, and a seven-value type
enum.

**Rejected, because those are not three things:**
- `url`, `wallet`, `maps` are all *a URL with a different icon* — that is presentation, so it
  became `subtype`.
- `email` has no meaning until Gmail import exists. Today an "email" is either a saved PDF (file)
  or a link. **Dropped.**
- `bookingReference` is not an attachment at all — it is a scalar property of the booking, wanted in
  the item header without a join, and its affordance is *copy*, not *open*. **Moved onto the item
  as `confirmation_code`.**

What remains is genuinely two behaviours: an owned blob with a lifecycle, and a string to open.
They share parent, label, ordering, list rendering and delete flow. Splitting them would double
every query for a difference of four nullable columns.

---

## D6 — File paths are relative

**Decision:** store `media/<uuid>.pdf`, join to `Paths.document` at read time.

**Why:** the app sandbox path is **not stable across reinstalls**. The brief correctly warned
against persisting the *external* URI, but the sharper trap is persisting the app's *own* absolute
path — every ticket then silently fails after a reinstall, discovered while abroad.

---

## D7 — Orphaned files are garbage-collected, not deleted inline

**Decision:** a GC sweep on app start deletes media files not referenced by any resource row.

**Rejected:** delete-rows-then-unlink-files in a transaction. SQLite cascades rows but knows
nothing about disk, so the two can diverge if the app dies mid-delete.

**Why GC wins:** crash-safe, ~20 lines, and self-healing regardless of how an orphan arose.

---

## D8 — Items are not confined to the trip's date range

**Decision:** no constraint tying item dates to `trip.start_date`/`end_date`. Now/Next is driven by
items, not trip dates.

**Why:** flight check-in opens 24h before departure and "book the restaurant" is weeks earlier.
Both must surface in Now. Constraining item dates to the trip window would make the feature
impossible.

---

## D9 — `kind = 'task'` plus `completed_at`

**Decision:** tasks are TripItems, not a separate concept.

**Why:** a task is dated, belongs to a trip, appears in Timeline and Now, and fires notifications —
all things `trip_items` already does. The only thing it needs beyond that is a done state that time
cannot derive. One extra `kind` value and one nullable column.

---

## D10 — `subkind`, not `TransportDetails`

**Decision:** one nullable `subkind` column.

**Rejected:** the brief's structured `TransportDetails` type with `mode`, `terminal`, `gate`, `seat`.

**Why:** `subkind` turned out to solve two problems at once — distinguishing café from restaurant,
*and* replacing transport mode entirely (`flight`/`train`/`bus`/`ferry`/`car` are just subkinds).

**`gate` and `terminal` were dropped outright** as stale by design: the gate changes 40 minutes
before boarding, will never be hand-updated, and the attached boarding pass is authoritative.

**On why we cannot auto-update them like Google Wallet does:** Wallet updates because the *airline
pushes* changes into Google's pass API. It is the airline doing the updating, not Wallet reading
anything. With no airline feed that is not reproducible, and scraping airline sites is fragile and
ToS-hostile. So Wallet is the live pass and this app is the index — we store the Wallet link *and*
a link to the airline's manage-booking page.

**`seat` was kept** in `details`: assigned at booking and stable, unlike the gate.

---

## D11 — Notes are their own table

**Decision:** a `trip_notes` table, not a single trip-level text field and not `trip_items`.

**The brief** listed Notes as one of four trip views but described one text field.

**Why a separate table:** the owner wants many titled notes per trip. Notes have no date, status,
priority or location — forcing them into `trip_items` would be exactly the over-abstraction the
brief warned against. Distinct from `trip_items.notes`, which remains a per-item annotation.

---

## D12 — No global state store

**Decision:** SQLite is the source of truth. A ~40-line `useLiveQuery` hook over
`addDatabaseChangeListener` covers re-render-on-change.

**Rejected:** Redux Toolkit, Zustand, TanStack Query.

**Why:** there is no server, so no cache-invalidation problem and nothing for TanStack Query to do.
The only real need is "re-render when the DB changes". Copying rows into a global store is what the
brief explicitly warned against.

---

## D13 — Raw SQL, not an ORM

**Decision:** hand-written migrations and raw SQL with Zod row parsers.

**Considered seriously:** Drizzle ORM — typed queries, real migration tooling, an official
expo-sqlite integration.

**Why raw SQL won:** the brief asked for explicit migrations and no magical schema synchronisation.
`drizzle-kit generate` is exactly the kind of generated-migration flow that was ruled out. The
tradeoff is real and Drizzle remains a reasonable future change if hand-written SQL becomes a drag.

---

## D14 — Search is `LIKE`, not FTS5

**Decision:** `LIKE '%q%'` across title, notes, location and confirmation code.

**Why:** a personal trip has fewer than 100 items. FTS5 is ceremony at that scale. Revisit if it
ever feels slow, which it will not.

---

## D15 — Backup: manual export, Auto Backup as backstop

**Decision:** a `.zip` export/import as the real mechanism; Android Auto Backup enabled but not
relied on. Scheduled at **M6**, before notifications and share-to-app.

**Why this was raised at all:** the brief ruled out cloud, accounts and sync, and never asked for
export. The consequence was that a lost or reset phone would destroy every trip and every imported
ticket with no copy anywhere. That was a gap, not a decision.

**Why Auto Backup is not the plan:** size-capped, only runs on wifi + charging + idle, and only
restores during new-device setup.

**Why M6 rather than late:** the app becomes trip-ready at M5, so backup must exist before the
first real trip depends on it.

---

## D16 — Development build from M1

**Decision:** `expo prebuild` + custom dev client from the first milestone.

**Rejected:** Expo Go until share-to-app at M8.

**Why:** `expo-share-intent` contains native code and cannot run in Expo Go, so a dev client is
needed eventually regardless. Building eight milestones in Expo Go and meeting the native shell at
M8 invites a late pile-up of surprises. Iteration speed is identical once built — only adding
native dependencies requires a rebuild.

---

## D17 — Risk front-loaded in the milestone order

**Decision:** files move from M5 to M3; the two API spikes run in M1; export moves to M6.

**Why:** the highest-uncertainty items are the ones that could force a redesign —
`getContentUriAsync` on the new expo-file-system API, and `date-fns/tz` on Hermes. Both gate core
systems (opening documents, the entire time model). Both are ~20 minutes to check. Discovering
either at M4, with four milestones stacked on top, is the bad outcome.

---

## D18 — Repo, machine and data-flow constraints

**Decision:** developed on the IG-owned Jamf-managed Mac; hosted on personal GitHub with a
repo-local personal git identity; emulator as the default test target.

**Why the Mac:** Claude Code access is tied to it, and assistance throughout is a premise of the
project. The personal machine is Windows with no subscription.

**IP-ownership implications were raised and explicitly accepted by the owner. Not to be revisited.**

**What still applies, independent of that judgement:**
- The laptop can be wiped remotely and is reclaimed on offboarding, so personal GitHub is the only
  off-device copy.
- Phone→laptop data flow is minimised: emulator by default, never `adb pull` personal files,
  revoke USB debugging authorisations after physical-device sessions.
- **Real travel use runs a release build.** A debuggable build lets an authorised computer read the
  app's private sandbox — the database and every imported PDF — via `adb shell run-as`. A release
  build does not. This is the single most effective mitigation.

---

## D19 — The Organic design, with colour behind semantic roles

**Decision:** adopt the Claude Design handoff in `docs/design/` — the Organic system with a canal-teal
and stone-gold accent, Caprasimo headings over Figtree, pill controls and ~32px cards. Colour lives
in three layers: `src/ui/theme/palette.ts` (raw ramps, the only hex values), `roles.ts` (semantic
roles per scheme) and `useColors()`. Components ask for a role, never a hex or a ramp step.

**Why:** the owner asked that changing the palette be easy. With a role layer a re-theme edits one
file, and `roles.test.ts` checks every role's contrast, so a new palette that makes text unreadable
fails a test instead of shipping.

**Where the implementation departs from the handoff, deliberately:**
- A **dark scheme** is derived from the same ramps; the design is light only and the app follows
  the system setting.
- **Muted text** uses neutral-700, not the design's text-at-55%: that measures 3.6:1 on cream, below
  the 4.5:1 body text needs, and muted text carries dates and places.
- **Icons** are Lucide through `react-native-svg`, behind a map of semantic names in `Icon.tsx`, so
  changing the icon set is one file.
- **Fonts** load at start-up from `@expo-google-fonts`, bundled with the app, so they need no network.

---

## D20 — Four trip tabs; no Bookings tab

**Decision:** a trip is **Now · Timeline · Places · Notes** as bottom tabs with a floating add button.
Search is a header action. Trip info and Trip documents sit at the bottom of Now.

**Rejected:** the planned Bookings tab.

**Why:** the Timeline already shows every confirmed, dated item; Bookings repeated it grouped by kind.
Four tabs reach comfortably one-handed on a tall phone. `SELECT_BOOKINGS` stays, tested, with no
screen using it yet.

---

## D21 — A confirmed item is cancelled before it can be deleted

**Decision:** Delete is offered for ideas and cancelled items. A confirmed item offers Cancel instead.

**Why:** a booked item holds the tickets, and those files may be the only copies. One mis-tap should
not destroy them. Cancelling first keeps the documents (D3) and makes a deletion deliberate. The
cost is two steps to remove a confirmed item entered by mistake.

---

## D22 — Where the handoff disagreed with the model, the model won

**Decision:** the handoff is followed for look and structure, not where it contradicts earlier
decisions. The owner confirmed each of these:
- **Cancelled items stay off the Timeline and Now** (D3). The prototype showed them dimmed in place.
- **A dated idea stays on its day**, tagged Idea. The prototype left all ideas off the Timeline.
- **The item form keeps `MomentField`.** The prototype's trip-day select and free-text time cannot
  express a time zone, a date-only moment or a day outside the trip (D4, D8).
- **Up-next cards keep the Open-ticket control.** The prototype omitted it, and finding the ticket in
  seconds is the scenario the app exists for.

---

## D23 — Reminders by kind, reconciled rather than tracked

**Decision:** the default lead time depends on the kind of item: 3 hours before travel, the morning
of a check-in, 1 hour before an activity or meal, and a task at its own time. Each item can switch
its reminder off, but there is no custom time per item. Android's scheduled set is reconciled
against the database, rather than scheduled from every place that writes an item. The app holds
`USE_EXACT_ALARM`.

**Why:** a single lead time fits a coffee and a flight equally badly. One on/off switch covers the
real need (“don't remind me about this one”) without a new column. A time per item can come later
from `details` with no migration. Items are written from six places and change indirectly too,
through a trip zone change or an import. Reconciling from one listener makes a missed call site
impossible. Inexact alarms can arrive very late for reminders scheduled days ahead. `USE_EXACT_ALARM`
fixes that, and the Play policy that restricts it doesn't apply to a sideloaded app.

**Rejected:** a single default lead time in settings (open question 4, option 2); a custom time per
item; asking for the notification permission at launch.

---

## D24 — Sideloaded, signed with a private key

**Decision:** the app is installed as a release APK signed with a keystore that is generated on the
build machine and kept outside the repo. It is not published on any store. `plugins/withReleaseSigning.js`
wires the key into the regenerated `android/` project and falls back to the debug key when it is absent.

**Why:** the generated project signs release builds with React Native's debug key. That key is
public, so anyone could sign an APK that Android would accept as an update to this app, and the
update would inherit the database and every stored PDF. A private key closes that. A store listing
would add review, a developer account and policy constraints (see `USE_EXACT_ALARM`, D23) for an app
with one user.

**Cost:** the keystore must be backed up. Losing it means the next version can only be installed by
uninstalling, which deletes the data unless a backup was exported first.
