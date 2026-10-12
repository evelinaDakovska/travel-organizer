# Review plan — R0–R11

An independent review of the app (ChatGPT, product and technical, at commit `813a0f7`) was checked
against the code on 2026-10-11, at `6a09622` plus the uncommitted N6 work. This file is the plan
that came out of it: what was confirmed, what needs a decision, and the steps, in order.

**Status: decided, not started.** The owner answered all eight decisions on 2026-10-11 (§7;
rationale in `decision-log.md` D27). N6 is done (0.3.1; on the phone in 0.5.1 since 2026-10-12). Each step is ticked
in `docs/status.md` → *R — after the review*.

The objective, in the review's words: *"I am travelling, slightly late, possibly cold or stressed,
and I need the right ticket, address, and current event immediately."*

---

## 1. What the review got right about the foundation

Kept as is: SQLite as the source of truth with `useLiveQuery`, the Timeline derived from
TripItems, wall clock + IANA zone with the instant derived, app-owned files with relative paths
and the sweep, versioned backup with older formats still importing, domain + SQL tests and update
rehearsals. No rewrite, no new stack, no ORM, no backend.

## 2. Each finding, checked against the code

| # | Finding | Verdict | Evidence |
|---|---|---|---|
| 3 | An event leaves Now once it starts | **Confirmed** | `upNext` (`src/domain/itinerary.ts`) keeps entries with `instant >= now`. A single-day item has one entry (`role: 'full'`), so it leaves at its start. A multi-day stay or overnight journey keeps its *Check out* / *Arrives* entry, so those mostly stay |
| 4 | Date-only entries leave Now after midnight | **Confirmed** | Same filter; a date-only moment resolves to local midnight |
| 5 | Transport zones easy to overlook | **Confirmed in part; N6 covers the form** | Item detail shows a zone only for an override (`withZone` in `src/domain/timezones.ts`); an inherited zone is invisible. N6's chip in `MomentField` always names the zone in the form, not on detail. See conflict 1 |
| 6 | Query errors look like empty or missing data | **Confirmed** | ~20 screens use `useLiveQuery`; only Timeline reads `error`. Now shows *"This trip no longer exists"* after a failed first read; a failed task read shows *"Nothing left to do."* |
| 7 | Share-to-app can save part of a share | **Confirmed** | `saveShare` (`src/features/share/saveShare.ts`) creates the item, then attaches files one by one, each its own write. The error says *"Share it again"*, which creates a second item |
| 8 | "Booked" used where "planned" is meant | **Confirmed** | `STATUS_HINTS` in `ItemForm.tsx`, the status hint in `app/share.tsx`, Places' empty text and its *Booked* heading. Dated ideas do show on the Timeline (`timelineEntries` drops only cancelled) |
| 9 | No direct access to the primary ticket | **Optional improvement** | Works as designed (`OpenResource`). `subtype='ticket'` exists; `resources.sort_order` exists but nothing ever changes it |
| 10 | Timeline does not focus on today | **Confirmed** | A plain `ScrollView` from the first day |
| 11 | A paid booking can be counted twice | **Product decision** | Nothing in the expense flow warns |
| 12 | Unknown refunds treated as coming back | **A U6 decision, open to revisit** | `countsAsSpent` in `bookingCosts.ts`; recorded in `status.md` under U6 |
| 13 | Docs have drifted | **Confirmed** | `expo-image` in `technical-reference.md` §8 but not in `package.json`; routes in `app/` hold real composition, not "thin". Also found: `nextEntries` in `src/domain/timeline.ts` has no caller outside tests |
| 15 | Checks before the trip | **Mostly on the list already** | *Final phone QA* in `status.md` has the reminder, idle and zone-change items. See conflict 2 |

## 3. Two conflicts with our own rules

**1 — N6 and "do not silently infer zones from place names".** The `ItemForm` effect also runs
when an *existing* item is opened: it sets the city's zone with `shouldDirty`, and the hint under
the time says so; edit a flight's price, press Save, and its zone changes too. Step R0 proposed
*suggest only* for existing items. **Resolved — the owner keeps N6 as built** (N6 decision B,
`decision-log.md` D26): the fill is visible in the form, says so under the time, can be undone
with one tap, and nothing is written until Save. R0 is dropped.

**2 — "Restore into a clean installation" on the phone.** That means uninstalling, which the
data-safety rule forbids. A clean-install restore of a format-2 backup is an **emulator** check
(Gap B did it with sample data). On the phone: `install -r` only.

## 4. Data safety, for every step

**No step needs a migration, a backup-format change, or a native change.** Nothing rewrites
stored data on its own. The only writes to existing rows are N6's per-item zone fix, and only on
the owner's tap. R5 changes how shared files are copied and cleaned up (file ownership) — called
out in that step. The release follows the usual routine (§6).

---

## 5. The steps

Each is one commit with its tests, ticked in `status.md`. Pure logic goes in `src/domain/` first,
tested in node, then the screen.

### Priority 1 — retrieval and correctness while travelling

#### R0 — dropped

The owner keeps N6 as built (§3, conflict 1).

#### R1 — Now: *Happening now*

- **Change:** a new pure `nowSections(items, now)` in `src/domain/itinerary.ts` returning
  `{ happening, today, maybeToday, upNext }`. `upNext` itself is left alone; Now switches to
  `nowSections`. A *Happening now* section above *Up next*, each card with its attachments as today.
- **Rules (decisions 2–5):**
  - Confirmed, has a time of day, not a task, not a stay. Cancelled never.
  - With an end: from `start` until **15 minutes after `end`**; in those 15 minutes the card reads
    *Ended 11:15*.
  - With no end: for **60 minutes** after the start.
  - An overnight journey is happening between departure and arrival (plus the 15 minutes); the
    card shows *Arrives 06:40 · Rovaniemi*, and its *Arrives* entry is **not** repeated in Up next.
  - Overlapping events all show, by start.
  - A stay is never a Happening card: during it, its *Check out* entry is in Up next as today.
- **Tests:** before the start, exactly at it, during, exactly at the end, inside the 15 minutes,
  exactly 15 minutes after, later; no end (inside and past the 60 minutes); cancelled; overnight
  transport (and no duplicate *Arrives*); two overlapping activities; a multi-day stay (not
  happening, its check-out still in Up next); a task and an idea (never).
- **Emulator:** the Husky tour case from the review with the clock set during it, and just after.

#### R2 — Now: *Today, no fixed time* and *Maybe today*

- **Change:** the `today` and `maybeToday` parts of `nowSections`, shown between *Happening now*
  and *Up next*, as two separate groups.
- **Rules (decision 6):**
  - "Today" is the date in **the item's own zone** (its start zone), never a midnight instant.
  - *Today, no fixed time:* confirmed, date-only, not a task. A multi-day date-only item shows on
    every day of its range. Before its day it stays in Up next as now.
  - *Maybe today:* **ideas** dated today, date-only, same day rule. Kept apart from the confirmed
    group so a maybe never reads as a plan.
  - Tasks never: *Open tasks* already lists them.
- **Tests:** morning, noon and 23:59 on the day; the next day; the device in another zone than
  the item; item zone ≠ trip zone; multi-day; cancelled; a dated idea (in *Maybe today*, not the
  confirmed group); a dated task (in neither).

#### R3 — Zones on item detail and in the journey form

- **Change:** for transport, item detail always names the effective zone on both ends —
  *13:50 · Helsinki* — whether set or inherited from the trip. Other kinds unchanged (a one-zone
  trip would be noise). The journey form gets the hint: *"Departure and arrival use the local time
  at each end. Check both zones."*
- **Files:** `app/item/[itemId]/index.tsx`, a helper beside `withZone`, `JourneyFields.tsx`.
- **Tests:** the helper: override vs inherited, both ends.
- **Emulator:** a Helsinki → Frankfurt leg: typed times unchanged, countdown correct; change the
  device zone and nothing moves.

#### R4 — Loading, failed, missing, empty, stale

- **Change:** a pure helper turning `{ data, error, loading }` into one of `loading`, `failed`
  (first read failed), `missing` (read succeeded, `null`), `empty`, `ready`, `stale` (refresh
  failed, old data kept). One small inline component: the message and **Retry** (`refetch`).
  *"Could not refresh. Showing what was loaded before."* when stale. No framework.
- **Screens, one by one:** Now, Timeline, Places, Notes, Expenses, item / note / resource / expense
  detail, the edit screens, search, Home.
- **Tests:** the helper, each state.
- **Emulator:** a temporary `__DEV__`-only switch that makes a chosen read fail, to see each
  screen's text for a first-read failure, a refresh failure, recovery by the automatic retry and by
  Retry. Removed before the commit.

### Priority 2 — faster access and predictable imports

#### R5 — Share-to-app keeps what worked and says what failed (decision 7, option B)

- **Change:**
  1. Copy each shared file in (`importAsInput`, as expense receipts do), **collecting** which
     succeeded and which failed, by name, instead of stopping at the first failure.
  2. If **none** succeeded: nothing is written — no new item. *"Nothing was saved. Share it
     again."*
  3. Otherwise create the item (if new) and the rows for the files that copied in **one**
     `withTransactionAsync`, as `createExpense` does. `createTripItem` opens no transaction of its
     own (checked), so it can run inside one. If that write fails, delete the copies at once and
     say *Nothing was saved*; the start-up sweep stays the fallback.
  4. Partial success opens the item and says so explicitly, before anything else — an alert, not
     a passing toast: *"Saved 2 of 3 files. Not saved: boarding-pass-3.pdf. Share it again and
     choose **Add to an existing item** → Flight to Munich."*
- **Retrying without a duplicate:** the share screen already offers *an existing item* as a
  destination; the message names it. No new retry machinery.
- **The same rules** for a share to an existing item or to trip documents (there the item exists,
  so only the file count matters).
- **File ownership:** copies without rows exist only for the length of the save; if the app dies
  mid-way they are orphans the sweep collects. Not atomic across the filesystem, and the docs will
  not claim it is.
- **Pure part:** the message from `{ saved, failed names, target }`, tested — every case's text
  says exactly what was saved.
- **Tests:** SQL in node — one file, several, a failing row write rolls back the item and its
  rows together. Messages: all saved, 2 of 3, 0 of 3, a link.
- **Release build on the emulator** (the dev client cannot be cold-started by a share): one PDF,
  three images, a link; app open and closed. A failing file is hard to produce for real; a
  temporary `__DEV__` switch failing the third copy, removed before the commit.

#### R6 — *Open ticket*

- **Change, no migration:** exactly one attachment with `subtype='ticket'` → **Open ticket**
  opens it directly. Several tickets → the sheet lists only the tickets (*Open tickets (3)*).
  Everything else goes under **Other documents**. No ticket → behaviour as today.
- **Why no "primary" column:** nothing stored can point at a removed file; a file shared between
  items is fine because subtype is per row.
- **Caveat:** a shared or picked file arrives as `generic`; the owner marks tickets on the
  attachment's page.
- **Files:** `src/domain/resource.ts` (pure grouping and labels, tested), `OpenResource.tsx`
  (used by item detail and `EntryCard`).
- **Tests:** no ticket, one, three, a ticket plus a website and a map.

#### R7 — Timeline: Today

- **Change:** during the trip, scroll to today **once** when the screen first opens — never on a
  data update. Today's heading highlighted. A **Today** button to jump back. If today has no
  entries, land on the next day that has. Before or after the trip: start at the top as now. A
  strip of days to jump between can wait.
- **"Today" here** is the device's date: this is navigation, not correctness.
- **Pure part:** which day to land on, tested (before, during, after, a day with no entries, items
  dated outside the trip).
- **Emulator:** returning from item detail keeps the position; an edit while reading another day
  does not jump.

### Priority 3 — money and documentation

#### R8 — Wording: *planned* is not *booked*

- *Confirmed plan* / *In your itinerary* / *Add to itinerary* where no reservation is meant;
  *Booked* only for a reservation. The status chip stays *Confirmed*.
- Strings: `STATUS_HINTS` (`ItemForm.tsx`), the share status hint (`app/share.tsx`), Places' empty
  text and its *Booked* heading, *Move to Timeline* (item detail and `schedule.tsx`), the
  `BookingsView` texts where they mean planned items, and `docs/user-guide.md`.
- No new status, no new field.

#### R9 — Double counting

- One line in the expense form: *"Paying for a booking? Mark the booking Paid — adding it here
  counts it twice."* And the same rule in the user guide.

#### R10 — Unknown refunds (decision 8)

- Totals keep their meaning — expected cost of the trip. A cancelled item with refundability
  **not said** is still not counted, but Bookings now says so: *"EUR 180 cancelled, refund not
  specified — not counted."*
- **Pure:** `tripExpenses` gains an `unknownRefund` amount per currency, tested.
- No refund lifecycle.

#### R11 — Documentation reconciled with the code

- Drop `expo-image` from `technical-reference.md` §8.
- `CLAUDE.md` §8: describe `app/` as it is (routes that compose screens), rather than move working
  screens.
- Delete `nextEntries` (no caller) and its tests.
- Status lives only in `status.md`: trim the status repeated in `CLAUDE.md` §3 and the top of
  `session-handoff.md` to a pointer. Keep the past-bug explanations, marked as history.

---

## 6. Release and the phone

N6 (0.3.1, built and rehearsed, waiting) and R1–R7 ship together as **0.4.0** (R8–R11 too, if ready). The usual routine
(`session-handoff.md` §9):

1. The owner makes a **fresh Drive backup**.
2. **Update rehearsal on the emulator** from the exact 0.3.0 APK, `install -r`: timelines, alarms,
   trip documents, expenses and the export summary identical before and after.
3. **Emulator only:** a format-2 backup with expenses and receipts restored into a clean install —
   records, links, file count, files opening.
4. On the phone: `adb install -r --user 0`, never uninstall.

In the same phone session, from *Final phone QA*:

- Tickets opened in **airplane mode**; force-close and reopen offline.
- Change the phone's time zone: transport times, ordering and reminders do not move.
- A reminder after the phone has been **locked and idle** for an hour or more.
- The **memory-pressure** notification patch observed firing.
- The owner checks the **Lapland legs' zones** on the phone — nothing is changed for them.

Unit tests, emulator checks and phone checks prove different things; each step's notes in
`status.md` say which was done where.

---

## 7. Decisions — answered by the owner, 2026-10-11

Rationale in `decision-log.md` D27.

| # | Question | Answer | vs recommendation |
|---|---|---|---|
| 1 | N6 on an existing item | **Keep N6 as built** — fill on opening, visible, written only on Save (D26). R0 dropped | changed |
| 2 | What goes in *Happening now* | **Confirmed, timed, not tasks, not stays** | as recommended |
| 3 | A timed event with no end stays happening for | **60 minutes** | as recommended |
| 4 | Grace after an event ends | **15 minutes**, the card reading *Ended 11:15* | changed (was none) |
| 5 | Overnight transport | **Happening between departure and arrival; *Arrives* not repeated in Up next** | as recommended |
| 6 | "Today" for date-only entries | **The item's own zone; confirmed plans, plus dated ideas in a separate *Maybe today*; no tasks; multi-day on each day** | changed (ideas added) |
| 7 | Share-to-app failure policy | **Option B — keep what worked, say explicitly what failed and how to retry** | changed (was A) |
| 8 | Cancelled with refund not specified | **Not counted, but shown as "not counted"** | as recommended |
