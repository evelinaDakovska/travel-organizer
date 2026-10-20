# Status

**The** engineering status board: what is done, how it was verified, what is next. [`product-status.md`](product-status.md) is the feature-level view of the same facts; where the two disagree, this file wins. Scope of upcoming work: [`roadmap.md`](roadmap.md).

Verified against the repo on 2026-10-20, on Windows: **1119 tests passing across 66 suites, typecheck clean.**

> **Where things are (2026-10-19)**
> - **Latest release build: 0.11.0** (versionCode 18) — Phase **2D**, Plan with AI (no migration),
>   verified end to end on emulators and as a release update over 0.10.0, **not installed on any
>   phone**: `%USERPROFILE%/.travel-organizer/travel-organizer-0.11.0.apk`. **Phase 2 is complete.**
> - Before it: **0.10.0** (versionCode 17) — Phase **2C**, AI activity import and
>   selective export (no migration), verified end to end on emulators and as a release update over
>   0.9.0, **not installed on any phone**: `%USERPROFILE%/.travel-organizer/travel-organizer-0.10.0.apk`.
> - Before it: **0.9.0** (versionCode 16) — Phase **2B**, single-trip export and import
>   (no migration), verified end to end on emulators and as a release update over 0.8.0, **not
>   installed on any phone**: `%USERPROFILE%/.travel-organizer/travel-organizer-0.9.0.apk`. Before
>   it, **0.8.0** (2B-0, migration 006) and **0.7.4** (Phase 1), neither on a phone.
>   Before it, **0.7.3** (versionCode 13) was the first **friends-only beta**
>   (`release/TravelOrganizer-0.7.3-beta.apk`, gitignored), tested by friends on a second, smaller
>   Android phone; their feedback became Phase 1.
> - **On the owner's phone: not recorded.** A pre-update phone backup was taken on 2026-10-14
>   (`backups/`, gitignored), 0.7.1 was bumped "for in-place device update" that day, and the
>   0.7.2 Overview, traveller-picker and Places changes are reported as checked on the S26 Ultra —
>   so the phone holds **0.7.1 or later**. Confirm with the owner (with permission:
>   `adb shell dumpsys package com.evelinadakovska.travelorganizer | grep versionName`) before
>   rehearsing any update.
> - **Next: the roadmap** ([`roadmap.md`](roadmap.md), section *P* below). Phase 1 (0.7.4), 2B-0
>   (0.8.0), 2B (0.9.0), 2C (0.10.0) and 2D (0.11.0) are done and wait for the owner's review;
>   **Phase 3 waits for approval**.

---

## Milestones — what the app can do

Feature map. `docs/plan.md` holds the detail for each.

| | Milestone | ✓ |
|---|---|---|
| **M0** | Architecture decided, private repo, docs | ✅ |
| **M1** | Expo app, dev build, database + migrations, time model, both spikes resolved | ✅ |
| **M2** | Create, edit and delete trips; Home with upcoming and past | ✅ |
| **M3** | TripItems, resources, and local file import with offline access | ✅ |
| **M4** | Trip tabs, the Now screen and the Timeline | ✅ |
| **M5** | Places and Notes tabs, search within a trip, and item status actions | ✅ |
| **M6** | Export and import everything as a zip — the only guard against data loss | ✅ |
| **M7** | Local reminders for dated items | ✅ |
| **M8** | Receive PDFs, images and links from the Android share sheet | ✅ |
| **M9** | Visual pass, offline pass, edge cases, release build | ⬜ — emulator ✅, the phone checks are in *Final phone QA* |

M0–M6 were verified on a device, not just by tests. M6 is in, so a copy can now live off the phone —
**export before every trip**, and travel with a release build (S8), never the dev build.

---

## C — core track · no device needed

Domain logic, schema, repositories, files, export. `src/domain/` imports nothing native, so all of
this runs under `npm test`. **Ordered by cost of being wrong, not by feature order.**

| | Task | Milestone | ✓ |
|---|---|---|---|
| **C1** | `domain/timeline.ts` — day grouping, derived check-in/check-out, next-item selection | M4 | ✅ |
| **C2** | TripItem Zod schema, row parser, and the trip items repository | M3 | ✅ |
| **C3** | Resources repository and `files/storage.ts` — import, paths, GC sweep | M3 | ✅ |
| **C4** | Tab queries for Bookings, Places and Search, plus the notes repository | M5 | ✅ |
| **C5** | Export / import format and serialiser | M6 | ✅ |

Done-when criteria for each are in `docs/plan.md` → *Execution tracks*.

**Deferred out of C2 deliberately:** the `details` JSON column stays a permissive
`Record<string, unknown>`. A per-kind discriminated union would be guessing at fields before the
form exists to reveal them, and it is a JSON column, so tightening it is a code change rather than
a migration. Pin it down in **S1**.

---

## S — surface track · personal Windows machine

Screens, forms, styling, and everything needing a real device. See `docs/windows-handoff.md`.
The design to build is in **`docs/design/`** (`README.md` and `travel-app-prototype.html`); where
it disagrees with the model, `docs/decision-log.md` D22 says which wins.

| | Task | Milestone | Device | ✓ |
|---|---|---|---|---|
| **S1** | Item create / edit form and item detail screen | M3 | no | ✅ |
| **S2** | Resource UI: pick PDF, pick image, add link, and the `OpenResource` control | M3 | **yes** | ✅ |
| **V1** | Visual foundation: colour roles over palette ramps, fonts, icons, shared components, restyle of existing screens | M4 | no | ✅ |
| **S3** | Trip tabs (Now · Timeline · Places · Notes) with the add button; the Now and Timeline screens | M4 | no | ✅ |
| **S4** | Places and Notes actions, search, and item status actions (move to timeline, cancel, restore, delete) | M5 | no | ✅ |
| **S5** | Export / import screen | M6 | no | ✅ |
| **S6** | Local notifications | M7 | **yes** | ✅ |
| **S7** | Share-to-App via the Android share sheet | M8 | **yes** | ✅ — cold start verified on the release build |
| **S8** | Visual pass, offline pass, edge cases, release build | M9 | **yes** | ✅ built — phone checks in *Final phone QA* |

**S8, what was built:**
- **Release build, signed with a private key** (decision log D24). `plugins/withReleaseSigning.js`
  reads the keystore from Gradle properties outside the repo, and falls back to the debug key when
  they are absent. `windows-handoff.md` has the commands and the backup warning.
- **`scripts/sample-backup.mjs`** builds the plan's two fixture trips, Milan and Lapland, as a backup
  zip: 41 items, 28 PDFs, invented details. Load it through *Import*.
- **Times say their zone** when it differs from the trip's: *Sat 19 Sep · 06:10 · Sofia*
  (`entryZoneLabel`).
- **The PDF viewer shows the label**, *Bus ticket.pdf*, not the stored id. The file is opened
  through a label-named copy in the cache (`viewerFileName`).
- **A rental car is picked up and dropped off**, instead of departing and arriving.
- **Places cards** no longer repeat *No date*, and priority is capitalised.
- **Import asks for notification permission** when the restored trips have upcoming reminders.
  Before, a restored phone never asked.

**S8, how it was verified:** the release APK was installed on the emulator. It is signed with the
private certificate and not debuggable: `run-as` is refused. With **airplane mode on and no Metro**,
the sample backup imported, PDFs opened from Now, the attachment chooser and Trip documents, and a PDF
shared from Files **to the closed app** opened the share screen. That closes S7's cold-start gap. With
the emulator switched to Tokyo time and the app force-killed, Milan's times stayed at 06:10, 07:40
and 15:00. Checked in light and dark mode. The rebuilt APK installed over the old one and kept its
data, so updates work.

**S7, what was built:** `app/share.tsx` receives what other apps send. `src/domain/share.ts` parses
the payload through Zod into files, a link or text. A Maps share (“Duomo di Milano” plus a link)
becomes a link titled with the place. The screen suggests a trip: the one under way, else the next,
else the latest. A link defaults to *New place* (an idea, with kind and priority), a file to *An
item*, and text to *New note*. Files go through the same copy-then-row `attachFile` as the pickers.
The manifest accepts `text/*`, `image/*` and `application/pdf`, singly and several at once.

**S7, how it was verified:** on the emulator, with the app running — a Maps-style share saved as a
Food place with its Map link; a PDF shared from the Files app's own share sheet attached to Hotel
Brera, copied into `media/` and opened; text saved as a note. **Found and fixed:**
`expo-share-intent` 8.0.1 crashed the whole app when a share pointed at a file it could not read.
Its `getFileInfo` reads the first row of an empty query. Both entry points are now wrapped by
`patches/expo-share-intent+8.0.1.patch`, applied on `npm install` through `patch-package`, and the
layout says *Could not read what was shared* instead. **Not verifiable in the dev build:** sharing
to the app while it is closed. The dev-client launcher fails on the share intent itself (`Set.addAll`
on null) before any app code runs. A release build has no launcher, so this is checked in S8.

**S6, what was built:** reminders by kind (decision log D23). Travel reminds 3 hours before, a stay
on the morning of check-in, an activity, meal or other item 1 hour before, a task at its time, and a
date with no time at 09:00. There is a *Remind me / No reminder* switch on booked items, and item
detail says the rule in words. `src/notifications/` reconciles Android's scheduled set with the
database on launch and after every change. Permission is asked right after saving the first item
that would remind. The app holds `USE_EXACT_ALARM` so reminders fire on time.

**S6, how it was verified:** on the emulator — the permission prompt appeared after saving a timed
To-do, and not before. The reminder fired on the *reminders* channel with *To do at 18:16*. Tapping
it opened the item, both with the app running and after the process was killed. Editing the time
moved the alarm, and *No reminder* removed it. Before `USE_EXACT_ALARM`, Android scheduled the alarm
as inexact with a 2-minute window. With it, `dumpsys alarm` shows `window=0
exactAllowReason=policy_permission`.

**S5, what was built:** `app/backup.tsx`, reached from the backup icon on Home and from *Restore from
a backup* on the empty Home. *Export everything* zips `backup.json` and `media/` with `fflate`
(`src/domain/archive.ts`) and hands it to the share sheet (`expo-sharing`). *Import a backup* picks a
zip, says what it will add, and on confirmation writes files first and rows second
(`src/files/backupFiles.ts`). *Keep mine* / *Use the backup's* choose `merge` or `replace`. Android
Auto Backup was already on (`allowBackup="true"` is Expo's default) and stays a backstop only.

**S5, how it was verified:** on the emulator — export opened the share sheet and the zip held
`backup.json` plus the PDF; the zip was copied to Downloads, the app's data wiped, and the zip
restored from the empty Home; both trips came back and the restored trip document opened in the PDF
viewer. **Found and fixed on the way:** the import used `withExclusiveTransactionAsync`, which writes
through a second connection the change listener never hears — Home still said *No trips yet* until a
relaunch. It now uses `withTransactionAsync`. And the shared `Button` kept a stale *busy*
accessibility description after its spinner, so it now sets `accessibilityLabel` explicitly.

**S4, what was built:**
- **Item status actions** on item detail, from `statusActions` in `src/domain/status.ts`: *Move to
  Timeline* for an idea (a screen that asks for a day, then `scheduleTripItem` → confirmed);
  *Mark as cancelled* for a confirmed item, with a confirmation; *Restore* for a cancelled one; and
  *Delete* only for ideas and cancelled items, naming how many saved files go with it. A confirmed
  item says *mark it as cancelled first* instead (decision log D21). Delete is no longer on the Edit
  screen, so the rule lives in one place. `UPDATE_TRIP_ITEM_STATUS` changes status and nothing else.
- **Notes**: new and edit screens under `app/note/` — title, body, pin to the top, delete. The Notes
  tab has a *New note* button and each card opens its note.
- **Search**: a search icon in every trip tab's header opens `app/trip/[tripId]/search.tsx`, which
  matches items — cancelled ones included, so their documents stay reachable — and notes as you type.

**S4, how it was verified:** on the emulator — searching for an item and for text inside a note, the
empty result; creating, pinning, finding and deleting a note; cancelling a confirmed stay (it left
the Timeline and Now), finding it by search and restoring it; creating an idea, moving it onto
today's timeline, then cancelling and deleting it. No errors in the Metro log.

**S3, what was built:** a trip is `app/trip/[tripId]/(tabs)/` — Now, Timeline, Places and Notes behind
a custom bottom bar, with the add button floating above it. Tabs read the trip from `TripIdProvider`
(`src/features/trips/TripContext.tsx`), because a tab reached through the bar is not handed the
route's `tripId`. What each tab shows comes from `src/domain/itinerary.ts`: *Up next* (the next three
confirmed, non-task entries, check-outs included) and *Open tasks* on Now; entries grouped by local
day on the Timeline, with dated ideas kept, cancelled items left off and undated confirmed items under
*No date yet*. Launching the app opens straight into the trip when exactly one is in progress.

**V1, what was built:** colour lives in `src/ui/theme/palette.ts` (ramps, the only hex values) and
`roles.ts` (semantic roles for light and a derived dark scheme), read through `useColors()`.
`roles.test.ts` fails if a palette change makes any text role unreadable. Caprasimo and Figtree
load at start-up; icons are Lucide behind a name map in `Icon.tsx`. Verified in light and dark mode.
The first launch after a rebuild shows a blank cream screen for a while: that is Metro bundling
~3,600 modules and the fonts arriving over the dev server, not a hang.

**Development note:** *database is locked* errors appear in the Metro log only while routes are added
or removed, which forces a full reload over a connection that is still open. None on a clean launch.

**Noted during S2, for S8:** the PDF viewer's title bar shows the stored name (`<uuid>.pdf`), a
cosmetic cost of naming files by id. And Android 17's photo picker needs a tap on *Done* even for
a single photo — the system's behaviour, not ours.

**The Bookings tab is gone** (decision log D20): the Timeline covers confirmed items, and trip facts
plus Trip documents sit at the bottom of Now.

---

## N — next features · approved 2026-09-18 (history; the roadmap replaces this list)

Borrowed from Notion after the owner asked what it does well. Each one fits the product rules in
`CLAUDE.md`: offline, on the phone only, no accounts or sync. Notion's collaboration and cloud sync
were deliberately left out. Suggested order: N1 and N2 first, because both serve "find it in
seconds" and are cheap.

| | Feature | ✓ |
|---|---|---|
| **N1** | All documents in a trip, in one list — built as **B11** *Trip documents* (0.6.0) | ✅ |
| **N2** | Checklists inside notes — **superseded** by C1 packing and shopping lists (0.6.0) | — |
| **N3** | Start a trip from a previous one — built as **C5** templates (0.6.0) | ✅ |
| **N4** | Search across all trips — not on the roadmap yet | ⬜ |
| **N5a** | Expenses tab without splitting — migration 002, receipts, backup format 2. Built as 0.3.0, rehearsed; decisions answered, Gaps A–D done, regression pass clean, rehearsed on the owner's real data, documented; **on the phone since 2026-10-11** (0.3.0): [`n5-plan.md`](n5-plan.md) | ✅ |
| **N5b** | Splitting — **replaced by roadmap Phase 3** (D32). Earlier spec: [`expenses-spec.md`](expenses-spec.md) | — |
| **N6** | A journey's time zone from its city: filled with a hint, a tappable zone chip, old flights flagged with a one-tap fix (D26). Built and rehearsed as 0.3.1; on the phone since 2026-10-12 (0.5.1). Plan and audit: [`n6-plan.md`](n6-plan.md). Review step R0 proposed changing decision B; the owner kept it (R0 dropped) | ✅ |

**N1 — All documents.** Every file and link in a trip — attached to the trip *and* to its items — in
one list, each row showing which item it belongs to, and opening in one tap. For when you know you
have "the Belvedere tickets" but not which item they hang off.
- Data exists already: `listItemResourcesForTrip` plus `listResources` for trip-level documents.
  Reuse `ResourceRow` and `openResource`; group or sort by item (`groupResourcesByItem`).
- **Decide first:** where it opens from. D20 fixed four tabs, so an icon in the trip header next to
  search, or a *See all documents* link under *Trip documents* on Now — not a fifth tab.
- Done when every attachment in the Milan sample trip is reachable from the list and opens offline.

**N2 — Checklists in notes.** Packing lists with ticks. Lines written as `- [ ] Adapter` render as
tappable checkboxes; a tap rewrites that line to `- [x]`.
- **No migration:** the checklist lives in the note's `body` text, so it survives export/import and
  stays readable as plain text. Pure parse and toggle functions in `src/domain/note.ts`, tested.
- Needs: a way to add a line from the note screen (a *New item* field under the list), and a count on
  the Notes card (*3 of 12 packed*).
- **Decide:** whether ticked lines sink to the bottom.

**N3 — Start from a previous trip.** When creating a trip, *Copy from…* an earlier one to bring over
reusable parts, the way Notion templates are used.
- **Decide what is copied** before building. Suggested: tasks and notes, with checklists reset to
  unticked. Not bookings, places, or attachments, which belong to the old trip.
- **Dates:** a copied task keeps its offset from the trip start ("2 days before departure"). An
  undated task stays undated. The time zone follows the new trip.
- One transaction, like `applyImport`. Reminders pick the new tasks up by themselves through the
  reconcile in `src/notifications/`.

**N4 — Search across all trips.** A search icon on Home, finding items, notes and attachment labels
in every trip ("passport scan", "insurance"). Results are grouped by trip, and each opens where it
lives.
- Reuse `searchPattern` and the LIKE-escaping rules (technical reference §2), and add resource
  labels to what is searched. The per-trip queries gain a version without `trip_id`, tested in node
  like `SEARCH_TRIP_ITEMS`.
- Cancelled items stay findable, the same as in per-trip search.

---

## R — after the review · done 2026-10-11; on the phone since 2026-10-12 (0.5.1)

An independent product and technical review (at `813a0f7`), checked against the code. The plan,
the verdict on each finding, and the owner’s **eight decisions (answered, D27)** are in
[`review-plan.md`](review-plan.md). N6 is done; R1–R7 ship with it as 0.4.0. No step needs a migration, a backup-format
change or a native change; R5 changes how shared files are copied.

| | Step | ✓ |
|---|---|---|
| ~~R0~~ | ~~Finish N6 as suggest-only on existing items~~ — **dropped**: the owner keeps N6 decision B (D26) | — |
| **R1** | Now: *Happening now* — an event stays while it is on, 15 min after its end, 60 min if it has none (`nowSections`) | ✅ |
| **R2** | Now: *Today, no fixed time* and *Maybe today* (ideas) — date-only entries through their day, in the item's zone | ✅ |
| **R3** | Transport zones named on both ends on item detail; the journey form's hint | ✅ |
| **R4** | Loading, failed, missing, empty and stale told apart on every screen, with Retry | ✅ |
| **R5** | Share-to-app keeps what worked and says exactly what failed and how to retry | ✅ |
| **R6** | *Open ticket* from `subtype='ticket'`, other documents behind it | ✅ |
| **R7** | Timeline opens on today during the trip; a Today button | ✅ |
| **R8** | Wording: *planned* is not *booked* | ✅ |
| **R9** | Expense form: mark a booking Paid rather than adding it again | ✅ |
| **R10** | Cancelled with refund not specified: shown as not counted | ✅ |
| **R11** | Documentation reconciled with the code | ✅ |

**R1 + R2, what was built:** `nowSections` in `src/domain/itinerary.ts` (with `happeningNote`,
`todayNote`, and `localDateIn` in `time.ts`); Now renders *Happening now*, *Today, no fixed
time*, *Maybe today* and *Up next* through one small `NowSection`; `EntryCard` takes a `note`
line. `upNext` is unchanged. One rule beyond the decisions, from the same reasoning as stays:
anything **longer than 24 hours** (a rental car, a festival pass) is never a Happening card; its
end waits in Up next. `useNow` now also refreshes on returning to the app.

**R1 + R2, how it was verified:** 21 new domain tests (the reviewer's list). On the emulator, dev
build, sample Lapland trip, the clock moved with `cmd alarm set-time` and the app brought back
from the background each time: 21 Nov 13:05 — *Husky safari · Until 16:00* with its voucher, not
repeated in Up next; 16:10 — *Ended 16:00*; 16:16 — gone; 20 Nov 23:00 — the sleeper train
*Arrives Sat 21 Nov · 07:40*, its arrival not repeated; the 3-day rental car never a card;
22 Nov 00:05 — *Santa Claus Village* under *Today, no fixed time*; 22:00 — the Northern lights
hunt *Ends Mon 23 Nov · 01:00* above Santa Claus Village. *Maybe today* is covered by tests only
(the sample has no dated idea).

**R3, what was built:** `withJourneyZone` (`src/domain/timezones.ts`): on a transport item's detail
page both ends always name their zone, inherited or set — *Departs Friday, 20 November · 09:20 ·
Sofia time* / *Arrives … 12:15 · Helsinki time*. The item form calls a journey's ends *Departs* /
*Arrives* (*Pick up* / *Drop off* for a car) with the hint *Each end is in the local time where it
happens. Check both zones*; the leg form's hint says the same. No stored data changes.

**R3, how it was verified:** 3 new tests. On the emulator: *Flight to Helsinki* (Sofia set on the
item, Helsinki from the trip) reads both zones on detail and in Edit; with the device switched to
Asia/Tokyo the times and zones are unchanged. Found on the way: moving the emulator clock with
`cmd alarm set-time` and then reloading the JS leaves the dev client on a white screen; set the
clock back before any reload.

**R4, what was built:** `queryView` and `isStale` (`src/hooks/queryView.ts`, 8 tests) and three
small components in `QueryStates.tsx`, used on Home, Now, Timeline, Places, Notes, Expenses, item /
note / attachment / expense detail, edit item, edit trip, new item, *Move to Timeline*, *Attach to
an item*, search and the share screen. Beyond the review's list: Expenses spun forever after a
failed read; Home replaced the whole trip list with the error text when a refresh failed, and a
first failure there could have led to *No trips yet — Restore from a backup*; item detail would have
said *nothing attached* where the ticket is; an expense's delete warning would have counted no
receipts. And a real bug in `useLiveQuery`: on new inputs it kept the previous record with
`loading: false` until the new read landed — now it reads as loading from that render.

**R4, how it was verified:** on the emulator with a temporary development-only switch (removed
before the commit) failing `trip_items` reads in time windows: Now, Timeline, Places and Expenses
each said *Could not load …* with *Try again*, never empty; a 2-second failure recovered by the
automatic retry; a task ticked while reads failed gave *Could not refresh. Showing what was loaded
before.* over the earlier data, and *Try again* afterwards cleared it and showed the task done; item
detail opened during a failure said *Could not load this item*, and *Try again* opened it. The
*missing* state is unchanged and covered by tests. Found on the way: editing a module everything
imports while the dev client runs can leave Fast Refresh with *database is locked*; a cold restart
clears it (development only).

**R5, what was built:** `saveShare` copies each shared file with `importAsInput`, keeping the ones
that copy and the names of those that do not; `saveSharedRows` (`src/repositories/share.ts`)
writes the new item and every row in one transaction; a failed write deletes the copies and says
*Nothing was saved. Try again.*; no file copied means nothing written. A partial share shows
`shareOutcomeMessage` before anything else (not dismissable by tapping outside), then opens the
item. `attachFile` is now private to `attach.ts`. New test helper `src/db/testing/asyncDatabase.ts`
runs repository functions over `better-sqlite3`, so a transaction is tested, not only its SQL.

**R5, how it was verified:** 4 repository tests (item and rows together; a failing row rolls the
item back too — checked to fail on the constraint, not on test setup; all or none for an existing
owner; a deleted item) and 5 message tests. On the emulator, dev build, the app already open (a
share cannot cold-start the dev client): three PDFs shared from Files as a *New item*, with a
temporary development-only switch failing the third copy (removed before the commit) — the alert
*Saved 2 of 3 files. Not saved: boarding-pass-3.pdf …* named the new item, OK opened it with two
files; sharing the third again into *An item → boarding-pass-1* gave three files and still one
item. Still to do on a **release** build: a share to the closed app (part of the 0.4.0 rehearsal).

**R6, what was built:** `openGroups` (`src/domain/resource.ts`, 5 tests) splits an item's attachments
into the ones marked *Ticket* (main button: one opens directly, several open a sheet titled
*Tickets*) and the rest (a secondary button: one named, several *Other documents (n)*). With
nothing marked ticket it is one button, as before. No migration, nothing stored.

**R6, how it was verified:** on the emulator, sample Lapland: *Flight to Helsinki* reads *Open
Boarding pass SOF-HEL* over *Open Flight booking*, the sleeper *Open Sleeper tickets* over *Open
Cabin details*; the main button opened the PDF straight into the viewer. The several-tickets sheet
is the existing sheet with its list and title changed; its grouping is tested.

**R7, what was built:** `landingDay` (`src/domain/timeline.ts`, 5 tests): during the trip, the first
day with entries from today (device date). The Timeline scrolls there once, when that day is first
laid out; today's heading carries a *Today* tag; a **Today** button in the header scrolls back. A
strip of days to jump between was left for later, as planned.

**R7, how it was verified:** on the emulator, clock at 22 Nov 12:00: the Timeline opened on *Sun 22
Nov · Today*; scrolled up to 18 Nov, a task ticked on Now, back on the Timeline — still on 18 Nov;
an item opened and closed — still there; **Today** scrolled back to 22 Nov. With the real clock
(11 Oct, before the trip): no Today button, the list starts at 18 Nov.

**R8, what was built:** wording only. *Confirmed* is "in your itinerary" — booked or simply
decided: the status hints in the item form and the share screen, Places (*In your itinerary*
heading, its subtitle and empty text), *Add to itinerary* instead of *Move to Timeline* on item
detail and its screen, one line in Bookings, and the user guide. *Booking* stays where it means a
reservation: the item form's section with the confirmation code and price, Expenses' *Bookings*.
No new status or field. Seen on the emulator: Places and an idea's *Add to itinerary*.

**R9:** one line under the amount in the expense form — *Paying for something already booked? Mark
that booking Paid instead — adding it here too counts it twice.* — and the same rule in the user
guide. No reconciliation. Seen on the emulator in *New expense*.

**R10, what was built:** `refundNotSaid` (`src/domain/bookingCosts.ts`, 3 tests): cancelled, priced,
refundability not set — per currency, never across. The totals are unchanged (U6's rule: expected
cost). Bookings shows a *Refund not specified* section with the amount, *not counted above*, and the
items. **Verified** on the emulator: the sample *Husky safari* (EUR 290) cancelled — the trip total
fell by 290 as before and the section listed it; restored afterwards.

**R11, what was done:** every `src/…`/`app/…` path in the current docs checked against the tree
(three stale ones fixed or marked as history); `expo-image` dropped from the dependency table; the
"routes are thin" rule in `CLAUDE.md` and the technical reference rewritten to say what `app/`
really holds (screens composing feature components; no SQL, no domain logic) rather than moving
working screens; the file tree brought up to date; status removed from `CLAUDE.md` §3 and
`session-handoff.md` §2, which had drifted (§2 still said 0.2.0 was on the phone), leaving
pointers here; `nextEntries`, `minutesUntilEntry` and `entriesOnDay` deleted with their tests (no
callers; `nowSections` covers what `nextEntries` was for); the emulator lessons of this session in
`session-handoff.md` §7.

**0.4.0 = N6 + R1–R11, rehearsed on the emulator as the phone will get it (2026-10-11).** Release
build, versionCode 6, signed with the release key (SHA-256 `63:8D:C6:86…52:35:E7`), kept as
`%USERPROFILE%.travel-organizer	ravel-organizer-0.4.0.apk`. Fresh **0.3.0** (the APK on the phone)
→ sample backup → one expense with a PDF receipt (Lapland total EUR 2930.00) → both timelines, trip
documents, expense totals and alarms (28) recorded → **0.4.0 installed with `install -r`**. Result:
first-install time unchanged, no crash, everything identical except the open buttons, which now
name the ticket (R6, as intended); alarms 28; a ticket opened in airplane mode; a PDF shared from
Files to the **closed** app cold-started into *Save to a trip* and landed in Trip documents.
**Not yet on the phone.** Next: the owner makes a fresh Drive backup, connects the phone, and
`adb -s R5GL22FE9QY install -r --user 0` the APK; the open *Final phone QA* checks go in the same
session.


---

## F — feedback from a senior frontend developer (the owner's husband) and the owner · 2026-10-11

Planned in [`feedback-plan.md`](feedback-plan.md) (owner: go). Ships as 0.5.0 with N6 and R1–R11.

| | Feedback | ✓ |
|---|---|---|
| **F1** | Tell kinds apart at a glance (task, activity, stay, travel…) — an icon, or a border — without reading, and without a rainbow of colours. Research first | ✅ |
| **F2** | The **+** button shows a different icon when it does something else (e.g. adds an expense on the Expenses tab) | ✅ |
| **F3** | Now: *This trip* at the top; *Open tasks* gets a way to see the completed ones | ✅ |
| **F4** | Detail pages hide fields that are empty | ✅ |
| **F5** | An expense opens a detail page, with Edit, not the form directly | ✅ |
| **F6** | An image attachment shows a small round thumbnail of itself, not *IMG* | ✅ |
| **F7** | Paid or not, at a glance on Now, the Timeline and elsewhere (owner, 2026-10-12). Plan: [`paid-plan.md`](paid-plan.md), D29 | ✅ |

**F1, F2, F4, what was built and seen on the emulator (dev build, sample data):**
- **F1:** `ITEM_ICONS` in `Icon.tsx`, typed against every kind and subkind (a missing icon fails the
  typecheck); `itemIconKey` (tested) picks the subkind's or the kind's; `KindTile` draws it in the
  soft accent tile (first tried `surfaceSunken`: too faint on a card, changed after a screenshot),
  on `EntryCard`, `ItemRow` and item detail. Seen: a plane and a train on Now and the Timeline.
- **F2:** `addActionFor` (tested): a receipt with a small + on Expenses, a notebook with a small +
  on Notes, which now adds a **note**; the duplicate *New note* button is gone. Seen: both buttons,
  Notes' opening *New note*.
- **F4:** item detail shows no *When* without a date, and an empty *Tickets & links* is its heading
  and add buttons only (`ResourceList`'s `emptyText` is optional). Seen on a task and an idea.

**F3, what was built:** `TripBand` sits under Now's header, outside the list, on `surfaceSunken`:
*Finland · 20–24 Nov 2026*, then *In 40 days / Day 2 of 5 / Ended · Helsinki time · the travellers*
(`tripPhase`, `tripPhaseLabel` in `trip.ts`, 5 tests across month ends). The old *This trip* card
and `TripSummary` are gone; the trip's own notes, if any, show at the bottom as *Trip notes*. Under
*Open tasks*, **Show done (n)** unfolds the done ones (`doneTasks`, tested; newest first), struck
through, and their circle un-ticks them; with every task done the list says *All done.*

**F3, how it was verified:** on the emulator: the band read *Finland · 20–24 Nov 2026 / In 40 days ·
Helsinki time · Evelina, Sample Friend* and stayed while the list scrolled; a task ticked → *Show
done (1)* → shown struck through → un-ticked from there → back in Open tasks.

**F5, what was built:** `app/expense/[expenseId]/index.tsx` is a read-only page — the category
icon and title, the amount large, *Category* (when a label is the title), *Date*, *Description* if
any, **Receipts** (open, add) and **Delete expense** — with **Edit** at the top; the form moved,
unchanged apart from its title, to `app/expense/[expenseId]/edit.tsx`, without receipts or Delete.
**Deviation from the plan:** Delete moved to the detail page, as on items — on the edit screen it
would have returned to a detail page whose expense was gone. `Fact` moved out of item detail to
`src/ui/components/Fact.tsx`, its second user.

**F5, how it was verified:** on the emulator: an expense added (Transport, EUR 450) → tapped →
detail → Edit → amount 32 → *Save changes* → back on the detail page reading EUR 32.00 → *Delete
expense* → back on the list, total EUR 1680.00 again.

**F6, what was built:** `ResourceRow` shows an image file as a round thumbnail of itself in the
44 px circle the badge used, with React Native's `Image` (`resizeMethod="resize"`: decoded at the
size shown, not the photo's). A missing file keeps its red badge; a file that cannot be decoded falls
back to *IMG*. PDFs and links keep their badges. Everywhere attachments are listed: item and expense
detail, Trip documents, the open sheets.

**F6, how it was verified:** on the emulator: a PNG attached to *Arktikum museum* with + File
showed its picture in the circle beside *Image · 7 KB*; the map link beside it kept *MAP*.

**End-to-end pass on the emulator, 2026-10-11/12** (owner's request, after F1–F6). Dev build for
most of it, then the **release** build for the pickers and offline. Done through the UI, each step
read back from the screen:
- **Trips:** created *Vienna E2E* (Austria, 11–13 Oct picked as a range, Vienna zone, two travellers,
  notes) → opened straight into Now: band *Day 1 of 3 · Vienna time · Evelina, Tester*, *Trip
  notes* at the bottom. Milan: band *Ended*; *Delete trip* named *18 items and 12 saved files*,
  then gone from Home.
- **Items:** an activity 22:00–23:50 with place, address, code, price → *Happening now · Until
  23:50*; edited to *Paid*. A journey Vienna → Munich → Sofia with a connection: Munich kept Vienna
  time (same clock), Sofia's arrival switched to *Sofia time* with its hint (N6); detail *Departs …
  Vienna time / Arrives … Sofia time* (R3), *Rest of this journey*. A date-only stay over three days
  → *Today, no fixed time · Until Tue 13 Oct*. An undated task from *Open tasks → Add* (no *When*,
  F4). A café idea with *Must* from Places → *Add to itinerary* on 12 Oct → confirmed, morning
  reminder. Cancel → *Restore* offered → Delete.
- **Attachments:** a link; a PDF renamed and marked *Ticket* → *Open Belvedere ticket* above *Open
  belvedere.at* (R6); *Also attach to an item* onto the café; the café deleted → the ticket still
  opened from the Belvedere. A camera photo and a gallery photo as receipts (release build), with
  their thumbnails (F6); a receipt opened in airplane mode.
- **Search** by confirmation code and by a note's body; a miss says so. **Notes:** + adds a note
  (F2), pinned, found, deleted; open search results updated live.
- **Expenses:** two added, totals bookings + spending per currency, Bookings view (*Paid*), detail →
  Edit → amount changed → back on detail → Delete (F5).
- **Backup:** *Export everything* opened the share sheet with the zip; *Import* with *Keep mine* of a
  backup already on the phone said *nothing will change*. **Timeline** opened on today with *Today*.

**Found and fixed:** a connection's date picker opened on the trip's first day when *With
connections* created both legs at once (`legDefaultDate`, `1d7fe84`).

**Found, not an app bug:** on the **dev client** both image pickers fail with *Attempting to launch
an unregistered ActivityResultLauncher* — the dev launcher replaces the activity the picker
registered with. The same steps on the **release** build open the camera (first permission grant
included) and the gallery. Test pickers on a release build.

**0.5.0 = N6 + R1–R11 + F1–F6, rehearsed as the phone will get it (2026-10-12).** versionCode 7,
release key `63:8D:C6:86…52:35:E7`, kept as `travel-organizer-0.5.0.apk`. Fresh 0.3.0 → sample
backup → an expense with a PDF receipt (EUR 2930.00) → snapshot → `install -r` 0.5.0 → first
install time unchanged, no crash, both trips' timelines, trip documents and expense totals identical
apart from the ticket buttons' labels and the trip band (both intended), alarms 28 before and after.
**Never installed** — 0.5.1 replaced it (0.4.0 never went on either).

**F7, what was built** (plan and its review: `docs/paid-plan.md`; rule: D29): a second pill beside
the status on confirmed items — **To pay** (danger tone, wallet) with a price and not paid, **Paid**
(neutral, tick) when marked paid, with or without a price; nothing otherwise, and never on ideas or
cancellations. `paymentStatus` / `paymentStatuses` in `bookingCosts.ts` (7 tests); a journey's
unpriced legs take their journey's state, *To pay* winning a disagreement. `Tag` takes an icon;
`PaymentTag` on `EntryCard` (Now, Timeline), `ItemRow` (Places, search, legs, Bookings, *No date
yet*), `TaskRow` and the item detail header. The card's top row wraps rather than cut the time.
ItemRow's price line lost its gold "unpaid" colour (the pill says it now). No schema, data, query or
native change — `is_paid` exists since migration 001.

**F7, how it was verified:** 582 tests, typecheck clean. On the emulator, release build over 0.5.0
with the sample data: Now and the Timeline show *Paid* on the priced bookings (both ends of the
sleeper, the cabin's check-in), nothing on *Santa Claus Village* (no price); *Flight to Helsinki*
given EUR 180 not paid → *To pay* on Now and on its detail page; the longest top row (*Confirmed*,
*To pay*, *Fri 20 Nov · 09:20 · Sofia*) fits on one line at 1280 px; light and dark mode; Places'
ideas have no pill, *In your itinerary* shows *Paid*. Journey inheritance is covered by tests only
(the sample data has no journey).

**0.5.1 = N6 + R1–R11 + F1–F7, rehearsed as the phone will get it (2026-10-12).** versionCode 8,
release key `63:8D:C6:86…52:35:E7` (checked with `apksigner`, same as 0.3.0), kept as
`travel-organizer-0.5.1.apk`. Fresh **0.3.0** → sample backup → a Groceries expense with a PDF
receipt (Lapland EUR 2930.00) → snapshot → `install -r` 0.5.1. Result: first-install time
unchanged, no crash, alarms 28 before and after; both timelines identical **line for line, in
order**, once the intended additions are set aside (ticket button labels R6, *Paid* pills F7); Now
differs only by the trip band (F3) and those same additions; expenses EUR 2930.00; export *2 trips
and 29 saved files* before and after; a boarding pass opened in airplane mode.

**0.5.1 on the phone — 2026-10-12.** The owner made a fresh Drive backup first, then
`adb -s R5GL22FE9QY install -r --user 0 travel-organizer-0.5.1.apk` over 0.3.0 — no uninstall.
`versionName=0.5.1`, first-install time 2026-09-18 unchanged, 10 alarms before and after; the app
launched with no crash in logcat and Home listed the trips (checked by filtered UI dump only — no
trip details read). The owner then checked their trip on the phone: everything fine.

---

## FB — Fieldbook: the design review of 0.5.1 · 2026-10-13

The owner's review (`travel-organizer-design-review.html`): seven engineering findings, the
Fieldbook redesign and eight approved additions. Plan and every decision taken:
[`fieldbook-plan.md`](fieldbook-plan.md). Run end to end without stopping for approval at the
owner's request; the decisions (FB-1…) are listed there for the owner to go through.

| | Step | ✓ |
|---|---|---|
| **A1** | A free booking owes nothing: no *To pay*, not in the cost lists | ✅ |
| **A2** | Amounts read exactly or refused — never a different number | ✅ |
| **A3** | Date-only ends and the event cutoff counted in calendar days (DST) | ✅ |
| **A4** | Export reads one snapshot, says *Archive created*, timestamped name | ✅ — size measured in QA, see below |
| **A5** | A failed read never claims *missing* or *empty*; Now waits for its first read | ✅ |
| **A6** | A zone filled from a city follows the city; *Munich time*, not Berlin | ✅ |
| **A7** | Finished plans marked archived | ✅ |
| **B1–B2** | Tokens (cool neutral, one action blue, attention and success; Figtree only) and the shared primitives | ✅ |
| **B3** | Timeline by day: a rail of every trip day, Before / After / No date, Add a plan on an empty day | ✅ |
| **B4** | Item detail: both ends of a journey, the ticket first, Copy reference, More sheet | ✅ |
| **B5** | Overview (was Now): before vs during the trip, one lead panel, Undo on a task | ✅ |
| **B6** | Your trips: the next trip as a cover with its route; Backup & restore as a row | ✅ |
| **B7** | Places: Saved / In itinerary, grouped by priority | ✅ |
| **B8** | Expenses: one total, Bookings / Spending without repeating it | ✅ |
| **B9** | Notes: title and a two-line preview, pinned first | ✅ |
| **B10** | Add / edit: kind first, Type and Reminder as selects, folded optional sections, Save pinned | ✅ |
| **B11** | Trip documents (N1): every document, tickets first, on this phone / link / missing | ✅ |
| **C** | Migration 003 (seven tables) and backup format 3; run on the emulator over the sample backup, the release rehearsal over 0.5.1 is in QA below | ✅ |
| **C1** | Packing and shopping lists: presets copied into a trip, ticked only on the trip copy | ✅ |
| **C2** | Travellers: a list of people, chosen per trip and per item; old names converted by tap | ✅ |
| **C3** | A price per person: lines of quantity × price, the total kept in step | ✅ |
| **C4** | Itinerary PDF: every day, both ends of each journey, documents named; names, references, tasks, lists and costs only when chosen | ✅ |
| **C5** | Templates: save a trip's preparation, apply it to a new trip with dates rebased | ✅ |
| **QA** | Full code review and QA of 0.6.0; release built and rehearsed over 0.5.1 | ✅ |
| **Phone** | 0.6.0 on the owner's phone | — never installed alone; superseded by 0.7.x (see *0.7.x*) |

**Code review, what it found and fixed** (each committed, with a test where the logic allows):
a template saved from a trip with long notes, or a task over a year from the start, could never be
used (its schema had limits the trip's rows do not); a double tap could save twice or pop two
screens (`useBusy`); *Use a template* could add a template twice on a double tap; a failed
*Save as template* failed silently; a non-number quantity gave Zod's raw message; five controls were
not announced as buttons. Left as it is, by design or for later: the older forms (item, note,
expense) show no message when a database write fails — rare on a local database; noted, not
changed.

**QA, what it found and fixed — there since S5:** `File.bytes()` returns a whole file as one array
on the app's Java heap. One 100 MB attachment made every export fail, and a 150 MB backup could be
made but **not restored**. Files are now read in 4 MB chunks, and a picked backup is copied to the
cache first (a `content://` handle lost its descriptor part-way). Measured on the emulator (4 GB
RAM, 192 MB heap limit): a 380 MB backup exports; a backup holding one 150 MB file exports and
restores.

**The rehearsal (final APK, `%USERPROFILE%\.travel-organizer\travel-organizer-0.6.0.apk`, same key
as 0.5.1):** fresh 0.5.1 → sample backup → a task ticked, *Check in for the flight home* set to *No
reminder* → 12 alarms recorded, export *2 trips and 28 saved files* → 0.6.0 with `install -r`.
First-install time unchanged, no crash, migration 003 ran, the same 12 alarms at the same times,
the task still done, the reminder still *Off*, the timeline's times identical, export *Archive
created with 2 trips and 28 saved files*. In airplane mode a boarding pass opened and the
itinerary PDF was made and shared. On the release build: a PDF shared from Files cold-started the
app and saved as a new item; old typed names became travellers by tap, and on the second trip were
offered as *Use "Evelina"*; a profile in use could not be deleted; a preset list copied into a trip
and ticked, with Undo.

---

## P — the roadmap · from 2026-10-19

Scope of each phase: [`roadmap.md`](roadmap.md). Rationale: D32. One phase at a time; each starts
only when the owner asks.

| | Phase | ✓ |
|---|---|---|
| **P1** | UI & navigation: trip context in tab headers, active bottom tab, *Notes & lists* label on small phones, bottom-sheet corners — **0.7.4**, emulator; not on a phone yet | ✅ |
| **P2·2B-0** | "Me" — one traveller profile marked as the person using the app — and several people per packing/shopping item. **0.8.0**, emulator; not on a phone yet | ✅ |
| **P2·2B** | Single-trip export and import: Export trip (complete or without attachments), Import a trip as a new trip, traveller mapping, duplicate detection, staged import with rollback. **0.9.0**, emulator E2E; not on a phone | ✅ |
| **P2·2C** | AI activity import and selective export: a public, versioned JSON format with JSON Schema and AI instructions; Import activities (preview, validation tiers, duplicates, selection, one transaction, review list); Export activities (filters, privacy filtering, re-importable). **0.10.0**, emulator E2E; not on a phone | ✅ |
| **P2·2D** | Plan with AI: the trip as Markdown for an AI assistant — presets or own request, allowlisted fields, scrubbed titles, optional stays (as nights) and traveller counts, exact preview, Copy/Share of that very text, a compact activities-format block. **0.11.0**, emulator E2E; not on a phone | ✅ |
| **P2** | Single-trip import/export & AI JSON import — **2A** architecture and audit done ([`phase2-plan.md`](phase2-plan.md), 2026-10-19); 2B-0, **2B** (single-trip archive) and **2C** (AI activity import, selective export) and **2D** (Plan with AI) done — awaiting the owner's review | ✅ |
| **P3** | Travellers, pricing & shared expenses (replaces N5b) | ⬜ |
| **P4** | Currency conversion | ⬜ |
| **P5** | Full-day map | ⬜ |
| **P6** | Trips without fixed dates | ⬜ |
| **P7** | Google Maps place import | ⬜ |
| **P8** | Google Calendar export (.ics) | ⬜ |

**P1, what was built (0.7.4, versionCode 14).** No schema, data or native change.
- **Trip context in tab headers.** `ScreenHeader` takes an optional `context` line above the title
  (`type.bodyStrong`, ink colour, up to two lines); `TripTabHeader` (`src/features/trips/`) gives
  Timeline, Places, Expenses and Notes & lists the trip (`tripContextLine`: *Lapland, Finland*,
  the destination left out when the name already holds it; 4 tests) above the tab's title and the
  dates below it, muted. Overview is unchanged. Places loses its old descriptive subtitle (*Saved
  ideas, and where your plans are*) for the dates, as on the other tabs.
- **Active tab.** `TripTabBar`: a 28 × 3 dp accent bar at the top edge of the active tab (always
  laid out, transparent when inactive, so nothing moves), the accent on icon and label, and a
  semibold label — never colour alone. `accessibilityState.selected` as before.
- **One-line labels.** Every label is `numberOfLines={1}`. *Notes & lists* has a `shortLabel`,
  *Notes*, used only when the full label — measured unseen at its active (semibold) width — is
  wider than the tab; the screen title keeps *Notes & lists*. Labels follow the font scale up to
  **1.15×** (`maxFontSizeMultiplier`): at 1.2× and above, *Overview* and *Expenses* no longer fit a
  360 dp phone.
- **Sheet corners.** Root cause: the scrim was a flex sibling *above* the sheet, so it ended at
  the sheet's square top edge; outside each rounded corner the screen showed through undimmed —
  the "second corner". The scrim is now a full-screen layer behind the sheet. Shared `Sheet`, so
  every bottom sheet is fixed.
- **Beyond the brief, in the same component:** a sheet's text field was hidden by the keyboard
  (the app is edge to edge, so Android does not resize the window — the same reason as
  `FormScroll`). `Sheet` now pads itself with `KeyboardAvoidingView`, keeps below the status bar,
  lets its list shrink and scroll, and its taps go through with the keyboard open
  (`keyboardShouldPersistTaps="handled"`). Seen on *Add traveller* and *Quick expense*.

**P1, how it was verified.** 899 tests, typecheck clean (no lint is configured). Release 0.7.4,
release key `63:8D:C6:86…52:35:E7`, installed with `install -r` over **0.7.3** on the emulator
(first-install time kept). Before and after screenshots from 0.7.3 and 0.7.4. Light and dark;
1280 × 2856 at 480 dpi (≈ 427 dp) and a small phone simulated with `wm size 720x1520` /
`wm density 320` (360 dp); font scale 1.0, 1.3 and 2.0. Before: *Notes & lists* wrapped to two
lines at 360 dp and its icon rode up; after: one line everywhere, all labels on the same baseline,
the short label from 360 dp at 1.0 and on the large screen at 1.3. Corners magnified 4× before and
after, light and dark: one continuous curve. Selected tab correct after tapping, after search →
Back, after backgrounding, after leaving the trip and coming back; Back from a tab still goes to
Overview as before. Testing created one throwaway trip (*P1 Test Saariselka…*, a child traveller
*Mia*) on the emulator; the existing test trip was not changed. **Not tested:** on a physical
phone (neither phone was connected); three-button navigation.

**2D, what was built (0.11.0, versionCode 18).** Plan: `phase2d-plan.md`. Decisions: D36. Technical:
technical reference §19. No migration, no new dependency, no network, no writes.
- **Plan with AI** (Overview → More): *What would you like help with?* (five presets or *In my own
  words*, verbatim, ≤ 500 characters) → *What to include* (always: destination, dates, the
  itinerary; switches: ideas on, *Where we stay* off, *Who is travelling* off; a line naming what is
  never included) → *Exactly what will be shared*, with *Review this text before sharing. Activity
  titles and place names may contain personal information.* above it → **Copy for ChatGPT** /
  **Share** (the very string shown) → a pointer to Import activities.
- **The text**: request, trip, every day (empty days said; 3+ in a row collapsed), times as stored
  with a zone where it differs, overnight items on both days, *Planned, no date yet*, before/after
  the trip, ideas with priority and *considering <date>*, stays as nights (switch), traveller counts
  (switch), instructions to keep plans and not invent, a compact activities-format block. To-dos
  and cancelled plans never. Deterministic.
- **Privacy**: one allowlist mapper; the repository reads only the trip, its items and its
  travellers' classifications; titles and place names scrubbed (the trip's booking references,
  emails, links, phone-like and long digit runs), keeping dates, times, road and flight numbers.

**2D, how it was verified.** 1119 tests (37 new: privacy negatives with fake codes, emails, phones,
passport/card/IBAN strings, private URLs, notes, names, prices for all 8 switch combinations; scrub
keeps/removes; days, zones, overnight, undated, before/after, empty and one-day trips, years;
stays once as nights; counts; every intention and verbatim request; the format block imports;
determinism under reordering; 300 items; the repository reads one trip and changes nothing),
typecheck clean. **End to end** on `TO_2B_Test` (debuggable 0.11.0 over 0.10.0, three synthetic
trips imported as archives): A–J **pass** — every preview **byte-identical** to the text computed
from a copy of the emulator's database; Copy (pasted back) and Share (share sheet text) identical to
the preview; no planted fake or stored private value in any preview; all table hashes identical
before and after; 360 dp, dark, font 1.3/2.0, Back. **J**: release 0.11.0 `install -r` over 0.10.0
on `Pixel_10_Pro`, every captured screen identical; 2B import, 2C import/export and Plan with AI
work. Found and fixed: Copy label cut short; a literal `https://...` in the format block made a
receiver see a link; a phone number read as a date. Log:
`%USERPROFILE%\Pictures\TravelOrganizer-0.11.0-2D-e2e\E2E-LOG.md`. **Not tested:** a physical phone;
pasting into ChatGPT itself; three-button navigation.

**2C, what was built (0.10.0, versionCode 17).** Plan: `phase2c-plan.md`. Decisions: D35. Technical:
technical reference §18. Public format: `ai-activities-format.md`. No migration; no new native
dependency (`ajv` is a dev dependency for tests only).
- **The format** — `travel-organizer-activities` version 1: title, kind/type, idea/planned,
  priority, date/times/zones, location, notes/description, price (total + currency), links,
  transport route. JSON Schema in `docs/schema/`, shared from the app; AI instructions copied from
  the app. Tests keep docs, schema, template and parser in step (ajv).
- **Import activities** (Overview → More): document picker (any type, ≤ 1 MB checked before
  reading) → fatal file errors refused whole; per-activity errors shown and unselectable; warnings;
  every unknown field listed as not imported with a reason → duplicates against the trip and inside
  the file, unticked with the reason → select/deselect, notices for priced plans (*unpaid booking
  cost, not a payment*) and plans that will remind → one transaction → *Review imported
  activities* (live list into the item screens; no bulk delete).
- **Export activities** (Overview → More): All · Ideas · Planned, tick rows, share a JSON file.
  To-dos and cancelled plans not offered; wallet/ticket/confirmation links, booking references,
  people, files, paid state, reminders, ids never written; every activity re-checked by the importer.
- **Shared fixes from E2E:** `useLiveQuery` waits for a pause in change events (300-row import 43 s →
  3 s); `Segments` labels one line at any font size.

**2C, how it was verified.** 1082 tests (90 new: format and every field rule, fatal/invalid/warning/
ignored tiers, prototype keys and depth, fences, amounts and currencies, links, zones, duplicates incl.
no false positives, preview counts and notices, the write in one transaction with failure injected at
every insert, existing rows byte-identical, export privacy against the fixture, round trip into
another trip, schema ⇔ parser agreement on good and bad files, docs examples), typecheck clean.
**End to end** on `TO_2B_Test` (Android 17, debuggable build of the same code over 0.9.0, synthetic
data, real document picker): scenarios A–I **pass** — AI file with every field checked in UI and DB;
3 of 9; duplicates and override; ten invalid/hostile files; export checked outside the app (schema
valid, 0 of 96 private values); round trip; injected DB failure, triple tap, kill mid-transaction;
restart; 360 dp, dark, font 1.3/2.0, Back, empty trip, 300 rows. Then **J**: release-signed 0.10.0
`install -r` over 0.9.0 on `Pixel_10_Pro` — same key, first install kept, every captured screen
identical (trips, expenses, recipients, Me), a PDF opens, *Import a trip* works, AI import/export
work. Found and fixed: silent preview rows for TalkBack, faded error text, the batch-write slowdown,
the footer at font 2.0, a wrapping segment, chevrons on tick rows, *Choose another file*. Matrix and
screenshots: `%USERPROFILE%\Pictures\TravelOrganizer-0.10.0-2C-e2e\E2E-LOG.md`. **Not tested:** a
physical phone; three-button navigation; TalkBack by ear.

**2B, what was built (0.9.0, versionCode 16).** Decisions: D34. Technical: technical reference §17.
No migration; full backup and restore unchanged apart from refusing a trip archive with a pointer.
- **Export trip** (Overview → More): *Complete trip* (default) or *Without attachments*; a document
  whose file is already missing is named first and the export goes ahead only if accepted; the
  archive says when it is partial. `manifest.json` (format 1, row format 6, schema 6, export id,
  source trip, SHA-256 and size of every file and of the data) + `trip.json` (the trip's rows only)
  + `files/` (each distinct file once). Never in it: settings (so not Me), templates, reusable lists,
  other trips or travellers.
- **Import a trip** (Backup & restore → *One trip*): one screen — pick → check → preview (counts,
  name it will get, unavailable files, *imported before* / *already on this phone*) → traveller
  mapping (new by default; link to a saved profile only by choice; same-name profiles offered and
  told apart by their trips; one profile cannot stand for two) → confirm (and confirm again for a
  damaged file or a repeat) → staged import → *Open the trip*.
- Untrusted input: directory checks before inflating (names, repeats, count, sizes — a zip bomb is
  refused unexpanded), manifest, data checksum, rows through the backup's schemas, every reference
  inside the archive. New ids for everything; files written under new names, read back and hashed,
  then one transaction; failure rolls back and deletes the files written; a kill in between leaves
  orphans the launch sweep removes. Repeats recognised through `settings.trip_imports`.

**2B, how it was verified.** 992 tests (57 new: archive build/open/plan/limits/hostile zips,
repository round trip into a database holding the original, rollback, provenance), typecheck clean.
**End to end** on a dedicated emulator (`TO_2B_Test`, Android 17, fresh install, a debuggable build
of the same code so storage could be inspected) with a synthetic two-trip fixture: scenarios A–K all
**pass** — complete export checked outside the app; import into the same installation identical to
the original value for value; traveller mapping incl. Me; attachments open and stay independent;
partial export shows every document as missing; duplicate warning and cancel; ten invalid/hostile
archives refused without writing anything; file-write failure, database failure, full storage, a kill
during import and the restart after it; persistence; 360 dp, dark, font 1.3/2.0. Then the
**release-signed** APK installed with `install -r` over 0.8.0 on `Pixel_10_Pro`: same key, data
kept, export works, an archive from the other emulator imports and its PDF opens. Full matrix and 41
screenshots: `%USERPROFILE%\Pictures\TravelOrganizer-0.9.0-2B-e2e\E2E-LOG.md`. Found and fixed
during it: imported plans' `updated_at` was re-stamped; same-name profiles were indistinguishable in
the mapping sheet; three wording/size issues. **Not tested:** a physical phone; three-button
navigation.

**2B-0, what was built (0.8.0, versionCode 15).** Decisions: D33. Technical: technical reference §16.
- **Me:** `settings.me_traveller_id` names an existing traveller profile — no parallel traveller
  system, one Me by construction, a local identity (not an account, not an owner). *Travellers →
  Which traveller are you?* (`app/me.tsx`): pick an existing profile (confirmed) or add yourself
  (Adult by default); rename through the profile; *This is not me — choose another*. *Trips you are
  not on yet* lists them, current and upcoming ticked, past not, and adds Me as a **member only**
  after a confirmation that says so. New trips start with Me ticked. Pickers show *Evelina (Me)*.
  The Me profile cannot be deleted until another is chosen.
- **Recipients:** **migration 006** — `list_item_recipients`, filled from every
  `list_items.traveller_id` (left as it was, legacy). The list item's *For* is a multi-select
  (`TravellerPicker`), with *Add new traveller* offering saved profiles not on the trip (linked to
  the trip) or a new one, ticked on return. Rows read *For Evelina, Misho* or *For Everyone* (every
  current trip traveller chosen — display only). Copies, *Save as reusable* and *Add to packing
  list* carry the people. Same meaning on packing and shopping, trip and reusable lists.
- **Backup format 6**; formats 1–5 restore with each old single *For* as one recipient.
- Fixed on the way: the picker's tick was drawn in the accent colour on an accent fill — invisible.

**2B-0, how it was verified.** 935 tests (36 new: migration 006 from a phone-shaped version-5
database — every old row identical, each single *For* one recipient, idempotent, failed batch leaves
nothing; recipients repository; Me repository; format-6 round trip, format-5 upgrade, *Keep mine*
untouched, per-trip selection), typecheck clean. Release 0.8.0, same key (`63:8D:C6:86…52:35:E7`).
**Update rehearsal on the emulator:** a synthetic **format-5** backup (three travellers, a trip with
a booking for Misho, an expense, trip and reusable lists with single *For*s) imported into **0.7.4**
→ list read *10 · Misho*, *Mitko*, nothing → **0.8.0 with `install -r`** (first-install time kept),
migration 006 ran, no errors in logcat → *For Misho*, *For Mitko*, nothing: identical. Me linked to
the existing *Evelina*; *Add me to 2 trips* confirmed; the booking's *Who's going* still *Misho*,
EUR 290.00 *Paid*, reference unchanged. *Hand warmers* for all three → *For Everyone*; Mia linked
from the add sheet onto the trip and *Merino* → *For Mia, Mitko*; *Hand warmers* then read the three
names (Mia joined later — the saved selection did not change). Survived a cold restart. A second
synthetic format-5 backup restored on 0.8.0 → *For Aunt Vera*, and its trip is offered, not joined,
under *Trips you are not on yet*. New trip: only *Evelina (Me)* ticked. *Export everything* → archive
created. Light, dark, 427 dp and 360 dp. **Not tested:** a physical phone; the owner's real data.

---

## 0.7.x — directions, adult/child travellers, the beta · 2026-10-13 → 10-16

Built after 0.6.0, largely from the owner's use on the phone. Recorded here after the fact
(2026-10-19) from the commits and `product-status.md`; per-release verification notes were not
written at the time, so this says what each release contains and only the verification that was
recorded.

| Version | versionCode | What it added | Commits |
|---|---|---|---|
| **0.7.0** | 10 | Google Maps directions: `domain/directions.ts`, `DirectionsSheet` (from: current location / previous stop / the stay for that day / a saved place; a mode), connector rows between located plans on the Timeline, *How to get there* on item detail, *Directions* on Overview's lead. No API key, no location permission ([`directions-plan.md`](directions-plan.md)). Then fixes D1–D7 to endpoint and route-day stay resolution, and review fixes C1/C2 | `375a057` → `a65763a` |
| — | — | Muted deep-teal palette (`palette.ts`) and the PDF's styles with it | `d26d04c` |
| **0.7.1** | 11 | Adult / child / not specified travellers: **migration 004** (`classification` on `travellers` and `trip_travellers`; a trip can override), **backup format 4**; pricing lines suggested from the trip's adults and children; reusable-list copy review; **migration 005** (`trips.converted_travellers`) so a converted typed name never reappears, **backup format 5**; atomic, idempotent legacy-name conversion | `c368ee0` → `5a1621b`, `cc38497` |
| **0.7.2** | 12 | Places rows without prices or payment pills (`ItemRow showFinancials={false}`); `TravellerPicker` on New / Edit trip; Overview by stage (upcoming; ongoing with *Now / Up next* and *Your stay*; a past summary); **Quick Expense** sheet from Overview, with receipt photos; in-app feedback (`app/feedback.tsx`, `server/feedback-worker/`) behind `FEATURE_FEEDBACK_ENABLED`, **off** (D31) | `065d6bb` → `5f7f013` |
| **0.7.3** | 13 | App icon Design B (adaptive foreground, background, monochrome); the friends-only beta build | `ba749a2` |

**Recorded verification:** 895 tests across 54 suites, typecheck clean. Migrations 004 and 005 are
tested in node (`migrations.test.ts`), formats 4 and 5 in `backup.queries.test.ts` and
`export.test.ts`. The release ran on the emulator (`Pixel_10_Pro`, ≤ 4 GB RAM): cold start,
navigation, the itinerary PDF offline, a full zip export. The Places, traveller-picker and
Overview changes are reported as checked on the owner's S26 Ultra; the beta on a friend's smaller
phone.

**Not recorded, worth knowing before the next phone update:** an update rehearsal of 0.7.x over
the exact APK on the phone (the routine in `session-handoff.md` §9). The 0.7.x APKs were not kept
with the others in `%USERPROFILE%/.travel-organizer/` (0.7.3 is in the repo's `release/`), and
which version the phone holds is not written down.

---

## U — the owner's list after real use · 2026-10-10

Collected while planning a real trip on the phone, with that trip's data already in the app.
**Ahead of N1–N4.** The rule for all of it: **no schema migration**. New per-item facts go in the
`details` JSON column, so every row already on the phone stays exactly as it is, and the update is
an install over the top with the same signing key. Before installing on the phone: the owner
exports a backup to Drive, and the update is rehearsed on the emulator over the 0.1.0 APK.

| | Task | ✓ |
|---|---|---|
| **U1** | Small fixes: Delete trip clears the navigation bar; forms scroll the focused field above the keyboard; time zones found by country and city (Milan, Italy); EUR by default; *+* on *Open tasks*; pick several files or photos at once; **the price field kept its decimal point** | ✅ |
| **U2** | Dates: a new item opens on the trip's start date; an end follows its start and cannot precede it; the trip's dates picked as one range | ✅ |
| **U3** | Reminder time chosen per item (at the time … the day before), the by-kind rule staying the default | ✅ |
| **U4** | A trip document also attached to an item — one file, shown in both places | ✅ |
| **U5** | Places: *Open in Maps* for an address; place names suggested from the trip; booked items with an address listed on Places | ✅ |
| **U6** | Refundable or not, and the trip's expenses: booked items plus cancelled non-refundable ones, paid and to pay, per currency | ✅ |
| **U7** | Flights with connections and a return: one form creates each leg as its own item, linked by `details.journeyId` | ✅ |
| **U8** | Phone: owner exports to Drive, rehearsal on the emulator over 0.1.0, release build installed over the top | ✅ |
| **U9** | Expenses: the card on Now opens a page listing every expense, *To pay* then *Paid* (0.2.1) | ✅ |

**U1, what was built:** `FormScroll` replaces each form's `KeyboardAvoidingView`, which had been
switched off on Android (`behavior` was iOS-only). The app draws edge to edge, where `adjustResize`
no longer resizes the window, so the view pads itself. Time zones carry their country and cities
(`TIMEZONE_PLACES`), filed by the clock they keep — Bali is on Makassar time, the Canaries are not
on Madrid's. The picker row says what matched: *Rome · Milan · Italy*. A task added from *+ Add*
starts as confirmed, so it does not also appear on Places as an idea. A currency without a price is
not stored.

**Found during U1 — already on the phone in 0.1.0:** the price field rendered itself from the stored
minor units on every keystroke, so the decimal point vanished as it was typed: *12.50* saved as
**1,250.00**, and *12,50* the same way. `PriceInput` now keeps the typed text, and `parseAmount`
reads a point or a comma. Prices the owner entered with cents should be checked.

**U1, how it was verified:** on the emulator with the sample trips — Delete trip clears the gesture
bar; the trip form's last field, Notes, sits above the keyboard (every form uses the same
`FormScroll`); *milan*, *italy*
and *bali* find Rome and Makassar on Hermes; a task from *+ Add* opened as confirmed with EUR and
saved; *12,50* saved as EUR 12.50; two PDFs picked in one go both attached.

**U2, what was built:** *Add a date* fills in `defaultItemDate` — the trip's first day, or today
while the trip is under way — on the item form and on *Move to Timeline*. *Add an end* fills in the
start. Moving the start carries an end on an earlier day along (`followStart`), keeping its time and
zone, and the end's picker refuses days before the start (`minDate`). The trip's dates are one
**`DateRangeField`**: a calendar the app draws (`domain/calendar.ts`), since Android's picker has no
range mode — tap the first day, then the last; nothing changes until *Use these dates*.

**U2, how it was verified:** on the emulator — Lapland's dates picked as 18–26 Nov on one calendar
(9 days) and saved; a new item's date and end both opened on 18 Nov, not today; moving the start to
21 Nov moved the end with it, and the end's picker had 20 Nov disabled.

**U3, what was built:** `details.reminder` holds a choice — *Usual*, at the time, 15 or 30
minutes, 1 or 3 hours before, that morning, the day before, or none. *Usual* is stored as nothing,
so every item saved before U3 keeps the by-kind rule unchanged, and a value this version does not
know reads as *Usual* rather than switching the reminder off. *The day before* is the same wall-clock
time in the item's own zone, not 24 hours, which differ across a clock change. The form names the
usual rule (*Usual for this kind: 3 hours before*). Changing an item's kind now drops only the route
fields from `details` (`detailsForKind`); before, it dropped everything but the reminder.

**U3, how it was verified:** on the emulator — the Helsinki flight (Fri 20 Nov, 09:20 Sofia) set to
*The day before*; item detail says *The day before, same time*, and `dumpsys alarm` holds an exact
alarm for 2026-11-19 07:20Z, which is 09:20 in Sofia.

**U4, what was built:** *Also attach to an item* on any attachment opens `app/resource/attach-to.tsx`:
the trip's items in timeline order, those already holding it greyed out. Choosing one inserts a
second `resources` row pointing at the **same** `stored_path` or `url` (`COPY_RESOURCE_TO_ITEM`) —
no bytes copied, no migration. The GC sweep collects only files no row references, so the file
stays while either row exists; the backup manifest already lists every row per file. Removing one
of them says *The file stays where else it is attached*; deleting an item or a trip counts each file
once and leaves out files still held elsewhere (`COUNT_ITEM_OWN_FILES`, `COUNT_TRIP_CONTENTS` now
`DISTINCT`).

**U4, how it was verified:** SQL in node — shared row, sweep keeps the file until both rows go,
counts, cascade on trip delete. On the emulator — Lapland's *Winter driving guide* attached to the
rental car showed and opened there; removed from the car, the dialog said the file stays; after a
relaunch (the sweep runs on start) the trip's copy still opened in the PDF viewer.

**U5, what was built:** `src/domain/places.ts`. *Open in Maps* on item detail for anything with a
place or address: a `geo:` link (`mapsUrl`) — the name and address searched together, coordinates
pinned when present — which Android gives to the installed maps app, offline maps included. No
Google API, key or network of our own. Typing a place offers names already written in any trip, this
one first (`SELECT_KNOWN_PLACES`, `suggestPlaces`); a tap fills the place, and the address only when
it is empty. Places has a second section, *Booked*: confirmed items with a place or address, in
timeline order (`bookedPlaces`).

**U5, how it was verified:** on the emulator — Lapland's Places listed the ideas, then *Booked* with
the rental car (Rovaniemi station) and the cabin; *Open in Maps* on the cabin opened Google Maps on
the search; typing *rov* on the cabin's edit form offered *Rovaniemi station* and *Near Rovaniemi*,
and a tap filled the place.

**U6, what was built:** `details.refundable` — true, false, or absent for *not said*, which is every
item saved before U6. The form offers *Refundable / Not refundable* once there is a price; item detail
says it beside *Paid*. **Expenses** on Now (`tripExpenses`, `ExpensesCard`): per currency, never
converted — the total, how many items, paid and to pay, and how much of it went on cancellations
that were not refundable. Counted: confirmed items with a price, and cancelled ones marked not
refundable. A cancellation marked refundable, or not marked, is assumed to come back.

**U6, how it was verified:** on the emulator, Lapland — Expenses read EUR 1692.50 over 6 items,
1680.00 paid and 12.50 to pay, which matches the sample data's five paid bookings plus the 12.50
to-do added in U1. The Northern lights hunt (EUR 180) marked not refundable, then cancelled: the
total stayed and the card said *Includes EUR 180.00 for cancelled bookings that were not refundable*.

**U7, what was built:** `src/domain/journey.ts` and `JourneyFields`. Creating a *Travel* item offers
*Direct / With connections* and *One way / With return*. Either one turns When and the route into
legs — *Way out*, *Way back* — each with from, to, departure, arrival (each with its own zone),
number and seat; a new connection starts where the last leg landed, the way back where the way out
ended. Back to direct folds the legs into one, first departure to last arrival. On save every leg
is checked (a departure is required; a leg cannot leave before the previous one lands, compared as
instants across zones) and parsed by the item schema **before anything is written**; then
`createTripItems` writes them in one transaction. Each leg is its own transport item —
*Flight to Milan (1/2)*, *(2/2)*, *Return: Flight to Milan* — sharing status, confirmation, notes,
reminder and refundable, with the price on the first leg only so expenses count it once, and the
same `details.journeyId`. Item detail lists the *Rest of this journey*. Editing stays per leg.

**U7, how it was verified:** on the emulator — a confirmed flight Sofia → Vienna → Milan with a return
Milan → Sofia: saving without the return's departure was refused with the leg marked and nothing
written; with it, three items were created and each lists the other two.

**U8, the rehearsal — done on the emulator, 2026-10-10.** Release **0.2.0** (versionCode 2), signed
with the same key as 0.1.0 (certificate `638dc686…`, checked with `apksigner`). The exact 0.1.0 APK
from `%USERPROFILE%\.travel-organizer` was installed and loaded with the sample backup (2 trips,
41 items, 4 notes, 28 files), and a reminder was switched off in it. Then 0.2.0 went on with
`adb install -r` — no uninstall — as it will on the phone. Afterwards: the first-install time was
kept; the export still said *Backed up 2 trips and 28 saved files*; both trips' timelines matched
the 0.1.0 capture line for line; 13 alarms before and after; the reminder switched off in 0.1.0
read *Off*; with **airplane mode on**, PDFs opened from an item, from Trip documents and from the
attachment chooser; Expenses read the old prices correctly.

**Found during U8, present in 0.1.0:** after moving between trips, a Timeline once showed *Nothing on
the timeline yet* while Now showed the items — until a relaunch. `useLiveQuery` turned a failed read
into no data and never retried. Fixed in `b95eb4e`: a failed read keeps its last data, logs, and
retries (0.3 s, 1 s, 3 s); the Timeline says it could not load rather than that the trip is empty.
Verified by injecting two read failures (since removed). The native cause of the failed read did
not reproduce on demand and is still unknown.

**The APK to install** is the one rebuilt after that fix (`app-release.apk`, also copied to
`%USERPROFILE%.travel-organizer	ravel-organizer-0.2.0.apk`). The rehearsal was repeated on it: fresh
0.1.0 plus the sample backup, then this APK over the top — same export counts, Lapland identical line
for line, a boarding pass opened with airplane mode on.

**U8, done on the phone — 2026-10-11.** The owner exported to Drive first. Import was then proven on
the emulator: a fresh 0.2.0 with no data restored the sample backup, both timelines matched the
originals line for line and a PDF opened in airplane mode; the backup code is unchanged since 0.1.0.
On the phone, *Import* with *Keep mine* on the Drive zip read it whole and changed nothing. Then
0.2.0 went on with `adb install -r --user 0` — no uninstall — and launched without a crash.

**Watch for, from the phone:** the owner reports a flight showing **EUR 92326.00** that was **993.26**
in 0.1.0. Not explained yet: `formatMoney` and every display of a price are unchanged since M2, no
migration ran, and only *Edit → Save* writes a price. The owner did **not** edit it after the update, saw
993.26 on the item page, has corrected it by hand, and thinks it may have been their own typing
error — every other price was right. **Keep in mind: if a price is ever wrong again, suspect this
first** and compare with the latest Drive backup before anyone retypes it. The Drive backup holds the value from before. Note: the U1 "×100" bug
was found by typing with `adb input`; on the phone's keyboard 0.1.0 may have kept the decimal point
(a controlled input whose value does not change is not reset), so that claim is unproven there.

**U9, what was built** (history — since then the module is `bookingCosts.ts` and the page was
removed in N5a): `expenseGroups` in `src/domain/expenses.ts` — the items behind the totals,
split into to pay and paid, in trip order. `app/trip/[tripId]/expenses.tsx` shows the totals card,
then each item as an `ItemRow` that opens the item. The card on Now gets *See each expense*.
**Verified** on the emulator with release 0.2.1 installed over 0.2.0: Lapland lists its five items
(EUR 1680.00), and an item opens from the list.

**Decided with the owner:** item dates stay unrestricted (CLAUDE.md §5.7) — only the default
changes. *Open tasks* keeps its name. Each flight leg is its own item so its zone, reminder and
timeline place keep working. Expenses never convert currencies.

---

## How to continue

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** → finish → commit → tick here. **Stop after C5** |
| *"continue with the plan"* / *"the next phase"* | The next phase in [`roadmap.md`](roadmap.md) — **only when the owner has asked for it**. Never start the following phase on your own |

A task is not done until it is **committed and ticked here**. The conversation does not survive
compaction; this file does.

---

## Final phone QA

One session on the Galaxy S26 Ultra, with the **release** build, once S8 is done. Each line is
something the emulator cannot prove.

Run on 2026-09-18 with release 0.1.0 (Android 16, One UI). The owner asked to QA **the app itself**
and to leave notifications and the other system integrations for later.

**The app, end to end — ✅ all passed on the phone:** import of the sample backup; creating a trip
(dates, time-zone search); a stay spanning three days; a flight leaving Vienna and landing in Sofia;
an idea with a priority; *Move to Timeline*, cancel, restore, the delete rule and delete; editing an
item and a trip, both reaching Timeline and Home live; attaching a PDF, a photo and a link; opening
the PDF (viewer titled *qa-ticket.pdf*); renaming and removing an attachment; the attachment
chooser; a pinned note, edited, found by search inside its body, deleted; completing a task from
Now; exporting a backup to the share sheet; with **airplane mode** on — cold start, a PDF, a photo,
search; deleting a trip with its items and files.

**Found and fixed during it:**
- **F1** — the trip card said *Times shown in Europe/Vienna*; it now says *Vienna time*.
- **F2** — item detail showed the **end** of a journey without its zone: a flight landing in Sofia
  read *until … 16:50* on a Vienna trip, an hour out. Both ends now carry their own zone
  (`withZone`): *until Tuesday, 22 September · 19:20 · Sofia*.
- **Reminders could be lost under memory pressure.** A reminder set for a minute after a restart
  fired on time, but Android's low-memory killer ended the app three seconds later — between
  expo-notifications' own relay broadcasts (trigger → receive → present) — and it was never shown.
  `patches/expo-notifications+57.0.20.patch` presents it inside the alarm's own receiver when the app
  is not in the foreground. Expo ships this module prebuilt, so `package.json` sets
  `expo.autolinking.android.buildFromSource` for it — without that the patch is silently ignored.
  **Installed, not yet verified on the phone** (owner: leave notifications for now).

**Seen, not app bugs:** a photo attachment opens Android's *Open with* chooser on a phone with two
image viewers — pick one and *Always* once. Samsung's **Auto Blocker** must be off to install.

**Verified earlier in the session:** 25 reminders scheduled as exact alarms after the import, and
one fired on time with the phone locked and dozing; tapping it opened the item. Reminders were
re-registered after a restart.

**Still to do on the phone, when wanted:**
- [x] Share a PDF from **Gmail** and a link from **Chrome**, app open *and* closed (M8 done-when) —
      Chrome's page title and link arrived as a new place and as a trip document; Gmail's 470 KB PDF
      was saved and opened from the app, and a share to the **closed** app cold-started into the
      share screen for both
- [x] Share a place from **Google Maps** — arrived titled *Lower Belvedere*, its `maps.app.goo.gl`
      link saved as a Map and reopened Google Maps; **three images at once** from Google Photos
      arrived with their names and sizes
- [ ] The memory-pressure reminder fix, observed firing on the phone
- [ ] A reminder after an hour or more locked and idle (Samsung battery optimisation)
- [ ] Change the phone's time zone: times do not move (proven on the emulator)
- [ ] Export a backup **to Drive**, then restore it
- [ ] Delete the sample Milan and Lapland trips before real use
- [ ] Afterwards: **USB debugging off**, *Stay awake* off, **Auto Blocker** back on

## Open questions

| # | Question | Needed by |
|---|---|---|
| ~~1~~ | ~~Multi-day stays render as derived check-in/check-out — confirm the visual treatment~~ **Resolved in S3: each end is its own card on its own day, titled *Check in* / *Check out* for a stay, *Departs* / *Arrives* for a journey, *Starts* / *Ends* otherwise (`entryRoleLabel`). Nothing is drawn on the days in between. Cheap to change if it reads wrong on a real trip.** | — |
| ~~2~~ | ~~Per-item travellers (only 2 of 3 going to one thing) — needed, or notes?~~ **Resolved in C2 / 0.7.1: implemented via `item_participants` join table. Item form allows ticking participating travellers; distinct profile selection with classifications (Adult/Child/Not specified).** | — |
| ~~3~~ | ~~Trip-level resources: their own screen, or a section on Overview?~~ **Resolved in S2: a "Trip documents" section, built from the same `ResourceList` as item detail. Now at the bottom of the Now tab.** | — |
| ~~4~~ | ~~Notification default lead time, and whether it is per-item configurable~~ **Resolved in S6: by kind, with an on/off switch per item (decision log D23).** | — |
| ~~5~~ | ~~Export format: one zip per trip, or one for everything?~~ **Resolved in C5: one archive for everything; `filterTablesForTrip` keeps a per-trip export available with no format change.** | — |
