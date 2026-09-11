# Status

**The** status board. `CLAUDE.md` and `plan.md` link here rather than repeat it, so there is one
place to update and nothing can drift.

Verified against the repo on 2026-09-11: **236 tests passing, typecheck clean.** Core track reviewed and the findings fixed.

> **Core track complete.** Next work is **S1**, on the Windows machine — see
> [`docs/windows-handoff.md`](windows-handoff.md).

---

## Milestones — what the app can do

Feature map. `docs/plan.md` holds the detail for each.

| | Milestone | ✓ |
|---|---|---|
| **M0** | Architecture decided, private repo, docs | ✅ |
| **M1** | Expo app, dev build, database + migrations, time model, both spikes resolved | ✅ |
| **M2** | Create, edit and delete trips; Home with upcoming and past | ✅ |
| **M3** | TripItems, resources, and local file import with offline access | ⬜ |
| **M4** | Timeline grouped by day, and the Overview / Now card | ⬜ |
| **M5** | Bookings, Places and Notes tabs, and search within a trip | ⬜ |
| **M6** | Export and import everything as a zip — the only guard against data loss | ⬜ |
| **M7** | Local reminders for dated items | ⬜ |
| **M8** | Receive PDFs, images and links from the Android share sheet | ⬜ |
| **M9** | Visual pass, offline pass, edge cases, release build | ⬜ |

M0–M2 were verified on a device, not just by tests.

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

| | Task | Milestone | Device | ✓ |
|---|---|---|---|---|
| **S1** | Item create / edit form and item detail screen | M3 | no | ⬜ |
| **S2** | Resource UI: pick PDF, pick image, add link, and the `OpenResource` control | M3 | **yes** | ⬜ |
| **S3** | Timeline screen and the Overview / Now card | M4 | no | ⬜ |
| **S4** | Bookings, Places and Notes tabs, and search UI | M5 | no | ⬜ |
| **S5** | Export / import screen | M6 | no | ⬜ |
| **S6** | Local notifications | M7 | **yes** | ⬜ |
| **S7** | Share-to-App via the Android share sheet | M8 | **yes** | ⬜ |
| **S8** | Visual pass, offline pass, edge cases, release build | M9 | **yes** | ⬜ |

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
| 1 | Multi-day stays render as derived check-in/check-out — confirm the visual treatment | S3 |
| 2 | Per-item travellers (only 2 of 3 going to one thing) — needed, or notes? | S1 |
| 3 | Trip-level resources: their own screen, or a section on Overview? | S2 |
| 4 | Notification default lead time, and whether it is per-item configurable | S6 |
| ~~5~~ | ~~Export format: one zip per trip, or one for everything?~~ **Resolved in C5: one archive for everything; `filterTablesForTrip` keeps a per-trip export available with no format change.** | — |
