# Status

**The** status board. `CLAUDE.md` and `plan.md` link here rather than repeat it, so there is one
place to update and nothing can drift.

Verified against the repo on 2026-09-15, on Windows: **296 tests passing, typecheck clean.** S2, V1 and S3 verified on the Android 17 emulator.

> **Next task: S4** — give Places and Notes their actions: write, edit and pin notes; move an idea
> onto the timeline; cancel, restore and delete by the decision log D21 rule; and search from the
> header. Until search exists, a cancelled item cannot be reached from any tab.

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
| **M5** | Places and Notes tabs, search within a trip, and item status actions | ⬜ |
| **M6** | Export and import everything as a zip — the only guard against data loss | ⬜ |
| **M7** | Local reminders for dated items | ⬜ |
| **M8** | Receive PDFs, images and links from the Android share sheet | ⬜ |
| **M9** | Visual pass, offline pass, edge cases, release build | ⬜ |

M0–M4 were verified on a device, not just by tests. M3 on the emulator: a PDF attached, opened
with airplane mode on, and its file was swept after the item was deleted.

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
| **S4** | Places and Notes actions, search, and item status actions (move to timeline, cancel, restore, delete) | M5 | no | ⬜ |
| **S5** | Export / import screen | M6 | no | ⬜ |
| **S6** | Local notifications | M7 | **yes** | ⬜ |
| **S7** | Share-to-App via the Android share sheet | M8 | **yes** | ⬜ |
| **S8** | Visual pass, offline pass, edge cases, release build | M9 | **yes** | ⬜ |

**S3, what was built:** a trip is now `app/trip/[tripId]/(tabs)/` — Now, Timeline, Places and Notes
behind a custom bottom bar, with the add button floating above it. Tabs read the trip from
`TripIdProvider` (`src/features/trips/TripContext.tsx`), because a tab reached through the bar is
not handed the route's `tripId`. What each tab shows comes from `src/domain/itinerary.ts`:
- **Now** — *Up next* (the next three confirmed, non-task entries, check-outs included), *Open
  tasks* with a tick, then trip facts and Trip documents.
- **Timeline** — entries grouped by local day; dated ideas stay, cancelled items do not; confirmed
  items with no date are listed under *No date yet* so they are never lost.
- **Places** and **Notes** — read-only lists for now; their actions are S4.
- Cards carry an Open control when the item has attachments, from one query per tab
  (`listItemResourcesForTrip`) rather than one per card.
- Launching the app opens straight into the trip when exactly one is in progress.

**S3, how it was verified:** on the emulator — all four tabs, opening an item from a tab and coming
back, the add button, a two-day hotel stay showing *Check in* and *Check out* on their days with
the check-out under *Up next*, and a cold start landing on the active trip. No errors in the Metro
log after a clean relaunch. The *database is locked* errors seen earlier appear only while routes
are added or removed during development, which forces a full reload.

**V1, what was built:** colour lives in `src/ui/theme/palette.ts` (ramps, the only hex values) and
`roles.ts` (semantic roles for light and a derived dark scheme), read through `useColors()`.
`roles.test.ts` fails if a palette change makes any text role unreadable. Caprasimo and Figtree
load at start-up; icons are Lucide behind a name map in `Icon.tsx`. Verified in light and dark mode.
The first launch after a rebuild shows a blank cream screen for a while: that is Metro bundling
~3,600 modules and the fonts arriving over the dev server, not a hang.

**Noted during S2, for S8:** the PDF viewer's title bar shows the stored name (`<uuid>.pdf`), a
cosmetic cost of naming files by id. And Android 17's photo picker needs a tap on *Done* even for
a single photo — the system's behaviour, not ours.

**The Bookings tab is gone** (decision log D20): the Timeline covers confirmed items, and trip facts
plus Trip documents sit at the bottom of Now.

---

## How to continue

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** → finish → commit → tick here. **Stop after C5** |
| *"continue with the plan"* | First unticked task overall — on Windows that is an **S** |

A task is not done until it is **committed and ticked here**. The conversation does not survive
compaction; this file does.

---

## Open questions

| # | Question | Needed by |
|---|---|---|
| ~~1~~ | ~~Multi-day stays render as derived check-in/check-out — confirm the visual treatment~~ **Resolved in S3: each end is its own card on its own day, titled *Check in* / *Check out* for a stay, *Departs* / *Arrives* for a journey, *Starts* / *Ends* otherwise (`entryRoleLabel`). Nothing is drawn on the days in between. Cheap to change if it reads wrong on a real trip.** | — |
| 2 | Per-item travellers (only 2 of 3 going to one thing) — needed, or notes? **Still open: S1 shipped without it.** Adding it is a new column, so a migration | later |
| ~~3~~ | ~~Trip-level resources: their own screen, or a section on Overview?~~ **Resolved in S2: a "Trip documents" section, built from the same `ResourceList` as item detail. Now at the bottom of the Now tab.** | — |
| 4 | Notification default lead time, and whether it is per-item configurable | S6 |
| ~~5~~ | ~~Export format: one zip per trip, or one for everything?~~ **Resolved in C5: one archive for everything; `filterTablesForTrip` keeps a per-trip export available with no format change.** | — |
