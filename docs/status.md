# Status

**The** status board. `CLAUDE.md` and `plan.md` link here rather than repeat it, so there is one
place to update and nothing can drift.

Verified against the repo on 2026-09-18, on Windows: **366 tests passing, typecheck clean.** S2–S8 verified on the Android 17 emulator, then the app end to end **on the Galaxy S26 Ultra** with the release build.

> **The app is in use on the owner's phone** — release build 0.1.0, installed 2026-09-18. What is
> left is in *Final phone QA* below: the reminder checks the owner chose to leave for later, and
> tidying the phone after testing. **Next features: N1–N4** below, approved but not started.

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

## N — next features · approved 2026-09-18, not started

Borrowed from Notion after the owner asked what it does well. Each one fits the product rules in
`CLAUDE.md`: offline, on the phone only, no accounts or sync. Notion's collaboration and cloud sync
were deliberately left out. Suggested order: N1 and N2 first, because both serve "find it in
seconds" and are cheap.

| | Feature | ✓ |
|---|---|---|
| **N1** | All documents in a trip, in one list | ⬜ |
| **N2** | Checklists inside notes | ⬜ |
| **N3** | Start a trip from a previous one | ⬜ |
| **N4** | Search across all trips | ⬜ |

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
| **U4** | A trip document also attached to an item — one file, shown in both places | ⬜ |
| **U5** | Places: *Open in Maps* for an address; place names suggested from the trip; booked items with an address listed on Places | ⬜ |
| **U6** | Refundable or not, and the trip's expenses: booked items plus cancelled non-refundable ones, paid and to pay, per currency | ⬜ |
| **U7** | Flights with connections and a return: one form creates each leg as its own item, linked by `details.journeyId` | ⬜ |
| **U8** | Phone: owner exports to Drive, rehearsal on the emulator over 0.1.0, release build installed over the top | ⬜ |

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

**Decided with the owner:** item dates stay unrestricted (CLAUDE.md §5.7) — only the default
changes. *Open tasks* keeps its name. Each flight leg is its own item so its zone, reminder and
timeline place keep working. Expenses never convert currencies.

---

## How to continue

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** → finish → commit → tick here. **Stop after C5** |
| *"continue with the plan"* | First unticked task overall. Every C and S task is done, so that is an **N** |

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
| 2 | Per-item travellers (only 2 of 3 going to one thing) — needed, or notes? **Still open: S1 shipped without it.** Adding it is a new column, so a migration | later |
| ~~3~~ | ~~Trip-level resources: their own screen, or a section on Overview?~~ **Resolved in S2: a "Trip documents" section, built from the same `ResourceList` as item detail. Now at the bottom of the Now tab.** | — |
| ~~4~~ | ~~Notification default lead time, and whether it is per-item configurable~~ **Resolved in S6: by kind, with an on/off switch per item (decision log D23).** | — |
| ~~5~~ | ~~Export format: one zip per trip, or one for everything?~~ **Resolved in C5: one archive for everything; `filterTablesForTrip` keeps a per-trip export available with no format change.** | — |
