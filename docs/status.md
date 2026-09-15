# Status

**The** status board. `CLAUDE.md` and `plan.md` link here rather than repeat it, so there is one
place to update and nothing can drift.

Verified against the repo on 2026-09-15, on Windows: **283 tests passing, typecheck clean.** S2 verified on the Android 17 emulator.

> **Next task: finish V1** — the visual foundation is built and committed, but not yet looked at
> on the emulator (it needs the dev client rebuilt for `react-native-svg`). Check Home, trip
> overview, item detail, the item form and the attachment sheet in light and dark mode, fix what
> looks wrong, then tick V1 and start **S3**.

---

## Milestones — what the app can do

Feature map. `docs/plan.md` holds the detail for each.

| | Milestone | ✓ |
|---|---|---|
| **M0** | Architecture decided, private repo, docs | ✅ |
| **M1** | Expo app, dev build, database + migrations, time model, both spikes resolved | ✅ |
| **M2** | Create, edit and delete trips; Home with upcoming and past | ✅ |
| **M3** | TripItems, resources, and local file import with offline access | ✅ |
| **M4** | Trip tabs, the Now screen and the Timeline | ⬜ |
| **M5** | Places and Notes tabs, search within a trip, and item status actions | ⬜ |
| **M6** | Export and import everything as a zip — the only guard against data loss | ⬜ |
| **M7** | Local reminders for dated items | ⬜ |
| **M8** | Receive PDFs, images and links from the Android share sheet | ⬜ |
| **M9** | Visual pass, offline pass, edge cases, release build | ⬜ |

M0–M3 were verified on a device, not just by tests. M3 on the emulator: a PDF attached, opened
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
| **V1** | Visual foundation: colour roles over palette ramps, fonts, icons, shared components, restyle of existing screens | M4 | no | built — emulator check pending |
| **S3** | Trip tabs (Now · Timeline · Places · Notes) with the add button; the Now and Timeline screens | M4 | no | ⬜ |
| **S4** | Places and Notes tabs, search, and item status actions (move to timeline, cancel, restore, delete) | M5 | no | ⬜ |
| **S5** | Export / import screen | M6 | no | ⬜ |
| **S6** | Local notifications | M7 | **yes** | ⬜ |
| **S7** | Share-to-App via the Android share sheet | M8 | **yes** | ⬜ |
| **S8** | Visual pass, offline pass, edge cases, release build | M9 | **yes** | ⬜ |

**V1, what is built:** colour lives in `src/ui/theme/palette.ts` (ramps, the only hex values) and
`roles.ts` (semantic roles for light and a derived dark scheme), read through `useColors()`.
`roles.test.ts` fails if a palette change makes any text role unreadable. Caprasimo and Figtree
load at start-up; icons are Lucide behind a name map in `Icon.tsx`. New shared components: `Card`,
`Tag`, `StatusTag`, `SectionLabel`, `PickerButton`. Restyled: Button, inputs, pickers, chips,
header, Home, trip cards, trip overview, item cards and detail, the item form, and the attachment
list, row, sheet and edit form. Decisions in `docs/decision-log.md` D19–D22.

**V1, not yet done:** nothing has been rendered. Expect to adjust spacing, font line heights and the
dark scheme on first sight.

**Noted during S2, for S8:** the PDF viewer's title bar shows the stored name (`<uuid>.pdf`), a
cosmetic cost of naming files by id. And Android 17's photo picker needs a tap on *Done* even for
a single photo — the system's behaviour, not ours.

**The Bookings tab is gone** (decision log D20): the Timeline covers confirmed items, and trip info
plus Trip documents move to the bottom of Now.

---

## How to continue

| The user says | Do this |
|---|---|
| *"do the next C task"* / *"do the priority work"* | First unticked **C** → finish → commit → tick here. **Stop after C5** |
| *"continue with the plan"* | First unticked task overall — on Windows that is an **S** or **V** |

A task is not done until it is **committed and ticked here**. The conversation does not survive
compaction; this file does.

---

## Open questions

| # | Question | Needed by |
|---|---|---|
| 1 | Multi-day stays render as derived check-in/check-out — confirm the visual treatment. The design sidesteps it (its sample data has a separate "Check in" item) | S3 |
| 2 | Per-item travellers (only 2 of 3 going to one thing) — needed, or notes? **Still open: S1 shipped without it.** Adding it is a new column, so a migration | later |
| ~~3~~ | ~~Trip-level resources: their own screen, or a section on Overview?~~ **Resolved in S2: a "Trip documents" section, built from the same `ResourceList` as item detail. Moves to the bottom of Now in S3.** | — |
| 4 | Notification default lead time, and whether it is per-item configurable | S6 |
| ~~5~~ | ~~Export format: one zip per trip, or one for everything?~~ **Resolved in C5: one archive for everything; `filterTablesForTrip` keeps a per-trip export available with no format change.** | — |
