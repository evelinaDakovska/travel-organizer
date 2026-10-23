# Phase 6 — Trips without fixed dates (plan, 2026-10-23)

Roadmap: `MASTER_ROADMAP.md` §12. The owner asked for this phase to be planned, built and tested in
one run ("start phase 6 with plan and implement, then test"), as with Phases 4 and 5: this plan is
written first and not waited on. Every product decision is listed in §2 for review.

Data rules still bind: emulator and synthetic data only, no phone, no release APK, no merge to `main`.
This phase **has a migration (014) that rebuilds the `trips` table**. It is explained in §3 and is a
*risky* change in the owner's sense (2026-10-23): the primary phone gets it only after the trip has
passed.

## 1. What exists

- `trips.start_date` and `trips.end_date` are `NOT NULL`, with `CHECK (end_date >= start_date)`
  (migration 001). `Trip.startDate` / `endDate` are `string` everywhere.
- 35 places read them: Home grouping and the cover, the trip phase (*In 39 days*, *Day 2 of 5*,
  *Ended*), the Overview header and lead, the Timeline rail (day numbers, Before/After), the day map's
  fallback day, the trip form, the item form's default date, templates (offsets from the first day),
  the itinerary PDF, the AI planning context and the activities import (out-of-range warnings), share
  to the app (which trip is offered first), Me (which trips to join), the list screen, backups and the
  single-trip archive.
- Items are already free of the trip's dates (CLAUDE.md §5.7). Undated items already exist and show
  under *No date* on the Timeline. Now/Next is derived from items. Reminders are per item.

## 2. Decisions (for the owner's review)

**P6-1 — Two states, no partial dates.** A trip is *dated* (start and end) or *undated* (neither).
A start without an end, or a month only, is not supported: there would be no day rail to draw and
the app would have to invent the missing end. A rough time (*spring 2027*) goes in the trip's notes.

**P6-2 — Undated is stored as NULL, never a placeholder date.** Migration 014 makes both columns
nullable, with a CHECK that they are both set or both empty and, when set, in order. No sentinel
date is ever written, so no screen can show a fabricated date by mistake.

**P6-3 — The time zone stays required.** `default_tz` is the destination's zone, not a date. It is
still chosen in the form (the device's zone by default) and is what an item's time is read in.

**P6-4 — Home.** Three groups: *Upcoming* (dated, unchanged), then **Dates not set** (undated, most
recently changed first), then *Past trips* (unchanged). The cover is only ever a dated trip. An
undated trip row says *Dates not set* where a dated one gives its dates and length. An undated trip
is never *active*, so the app never jumps into it on launch.

**P6-5 — Overview.** The phase is *Dates not set* (a fourth `TripPhase`). The screen is laid out as
before a trip: *Get ready* tasks, the lead is the first journey still to come, else what is next.
The header subtitle is *Dates not set*.

**P6-6 — Timeline.** No *Day N*, no *Before* or *After*: those count from a first day that does not
exist. The rail is *All*, then each date that has an entry (labelled by its date, *22 Nov* over *Sun*),
then *No date*. It opens on *All*. Adding from a date's stop dates the plan on that day, as now.

**P6-7 — No relative days (Day 1 / Day 2) in this phase.** That needs a stored relative day per item
and a rule for turning it into a date when the trip gets dates; it is a model change of its own,
recorded for later. In an undated trip a plan has a real date or none, as anywhere else.

**P6-8 — Setting dates later moves nothing.** Edit trip has *Dates: Set / Not decided yet*.
- Turning dates on changes only the two columns. Items, ids, documents, costs, shares, settlements,
  participants and reminders are untouched; undated plans stay under *No date*, dated ones fall on
  their days.
- Turning dates off is allowed for the same reason: nothing hangs on them. Plans keep their dates.
- A new trip starts dated (today to today, as now); *Not decided yet* is one tap.

**P6-9 — Templates.** Using a template on an undated trip adds its tasks **without dates**: an offset
(*2 days before*) has no first day to count from. The preview says so. Saving a template from an
undated trip saves its tasks undated.

**P6-10 — Plan with AI and the activities import.** The planning context says *Dates not set*
(`startDate`/`endDate` null in the JSON) and lists dated plans by their dates. The import gives no
*outside the trip's dates* warning for an undated trip; dated activities keep their dates.

**P6-11 — PDF, backups, the trip ZIP.** The itinerary PDF says *Dates not set*. The backup and archive
row format become **15**, because a format-14 app cannot store a null date; it refuses a format-15
file as *from a newer version* instead of failing halfway. Older files read as before.

**P6-12 — Elsewhere.** Share to the app offers a current or upcoming dated trip first, then undated
trips, then past ones. Me's *add to trips* counts undated trips as not finished. The item form's date
picker opens on today for an undated trip. The day map opens on the first date with plans, else shows
its empty state.

**P6-13 — Unchanged for dated trips.** Every dated path keeps its behaviour; the regression tests in
§5 pin it.

## 3. Migration 014 — `trips` dates nullable

SQLite cannot drop `NOT NULL` in place, so the table is rebuilt with SQLite's documented procedure
(`lang_altertable.html`, *Making Other Kinds Of Table Schema Changes*):

1. `PRAGMA foreign_keys = OFF` **outside** the transaction — it is a no-op inside one. With it on,
   dropping `trips` would cascade-delete every item, expense and file row of every trip.
2. In one transaction: `CREATE TABLE trips_new` with the same columns, in the same order, with the
   nullable dates and the new CHECK; `INSERT INTO trips_new SELECT` every column; `DROP TABLE trips`;
   `ALTER TABLE trips_new RENAME TO trips`; recreate any index on `trips`; `PRAGMA foreign_key_check`
   must return nothing, or the transaction is rolled back; then `user_version = 14`.
3. `PRAGMA foreign_keys = ON` again, whatever happened.

The runner (`src/db/client.ts`) gains one flag per migration, `rebuildsTables`, which does steps 1–3.
The child tables' `REFERENCES trips(id) ON DELETE CASCADE` name the table, so they point at the new one
after the rename (SQLite ≥ 3.26, `legacy_alter_table` off).

**Tests (Node, better-sqlite3):** a phone-shaped database at 13, upgraded: every table's rows identical
(trips with its columns in the same order), foreign keys and integrity clean, deleting a trip still
cascades to its items, expenses and rates, and the new CHECK refuses one date without the other or an
end before a start. 6 → 14 in one start-up, as on the phone. A failed foreign-key check leaves the
database at 13.

**On the emulator:** a copy of the 0.18.1 database upgraded on device and compared table by table
(`dbdiff.js`), as for 012 and 013.

## 4. Steps

1. **Data.** Migration 014 and the runner flag; `Trip` and `TripInput` dates nullable with
   `isDated`; repositories; backup and archive format 15.
2. **Domain.** `tripPhase` *undated*, `groupTrips` three groups, `dayStops` without day numbers,
   `defaultItemDate`, `overviewPlan`, share's trip choice, planning context, activities import,
   templates, PDF.
3. **Screens.** Trip form (*Dates*), Home, cover, Overview, Timeline, day map, templates, Me, list,
   import screens.
4. **Docs.** Technical reference (schema 14, format 15), decision log D48, CLAUDE.md §4 *Trip*,
   roadmap and master roadmap, status, product status, user guide, next session; version 0.19.0.
5. **Emulator E2E** (§5).

## 5. Verification

- **Node:** the migration tests above; domain tests for each decision; a dated-trip regression set
  (phase, grouping, rail, lead, templates, PDF, context) unchanged.
- **Emulator, synthetic data:** create an undated trip; it sits under *Dates not set* on Home; add a
  saved place, an undated task and a dated plan; Timeline rail and *No date*; Overview header; PDF;
  Plan with AI copy; set dates, everything stays; remove them again; a template on the undated trip;
  backup and trip ZIP round trip; the 13 → 14 upgrade compared table by table. Also the 2D case that
  was N/A: *Plan with AI* on an undated trip.
