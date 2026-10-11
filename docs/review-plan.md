# Review plan — R0–R11

An independent review of the app (ChatGPT, product and technical, at commit `813a0f7`) was checked
against the code on 2026-10-11, at `6a09622` plus the uncommitted N6 work. This file is the plan
that came out of it: what was confirmed, what needs a decision, and the steps, in order.

**Status: written, not started. The decisions at the end are recommendations awaiting the
owner's answer.** Work starts after N6 is finished (another session is on it). Each step is ticked
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

**1 — N6 and "do not silently infer zones from place names".** The uncommitted `ItemForm` effect
also runs when an *existing* item is opened: it sets the city's zone with `shouldDirty`, and the
hint under the time says so. Edit a flight's price, press Save, and its zone changes too. For a
**new** entry, filling the zone from the city is visible (the chip, the hint, *Use Helsinki time*)
and is what the owner asked for. For an **existing** item, recommended: **suggest only** — the
hint and a button, nothing written until tapped — which is what `ZoneNotice` on detail already
does. This is step R0.

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

#### R0 — Finish N6, suggest-only on existing items

- **Change:** the `ItemForm` effect fills a zone only on a **new** item (or for a city typed in
  this editing session); on opening an existing item it does nothing, and the hint under the time
  offers *Use Munich time* as a button. `JourneyFields` creates only new items, so it is unchanged.
- **Files:** `src/features/items/ItemForm.tsx`, `src/ui/components/MomentField.tsx`.
- **Docs:** add N6 to `status.md` (it is not there yet).
- **Tests:** `zoneHints.test.ts` as is; the "new vs existing" rule as a small pure function if it
  needs one.
- **Emulator:** open a Lapland leg saved without a zone, change only its price, Save — the zone
  is unchanged; the detail notice still offers the fix. A new leg Munich → Helsinki fills both ends.
- **Data:** none written without a tap.

#### R1 — Now: *Happening now*

- **Change:** a new pure `nowSections(items, now)` in `src/domain/itinerary.ts` returning
  `{ happening, today, upNext }`. `upNext` itself is left alone; Now switches to `nowSections`.
  A *Happening now* section above *Up next*, each card with its attachments as today.
- **Rules (decisions 2–5):** confirmed, timed, not a task, not a stay; `start <= now < end`;
  no end → for 60 minutes after the start; nothing after the end; an overnight journey is happening
  between departure and arrival, and its *Arrives* entry is not repeated in Up next; overlapping
  events all show, by start; cancelled never.
- **Tests:** before the start, exactly at it, during, exactly at the end, after; no end (inside
  and past the 60 minutes); cancelled; overnight transport (and no duplicate *Arrives*); two
  overlapping activities; a multi-day stay (not happening, its check-out still in Up next); a
  task and an idea (never).
- **Emulator:** the Husky tour case from the review with the clock set during it.

#### R2 — Now: *Today, no fixed time*

- **Change:** the `today` part of `nowSections`, shown between *Happening now* and *Up next*.
- **Rules (decision 6):** confirmed, date-only, not a task, not an idea; "today" is the date in
  **the item's own zone**; a multi-day date-only item shows on every day of its range. Before its
  day it stays in Up next as now.
- **Tests:** morning, noon and 23:59 on the day; the next day; the device in another zone than
  the item; item zone ≠ trip zone; multi-day; cancelled; a dated idea and a dated task (excluded).

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

#### R5 — Share-to-app saves all or nothing (decision 7, option A)

- **Change:** copy every shared file in first (`importAsInput`, as expense receipts do), then
  create the item (if new) and all its resource rows in **one** `withTransactionAsync`, as
  `createExpense` does. On any failure, delete the copies at once; the start-up sweep stays the
  fallback. The same for a share to an existing item or to trip documents. `createTripItem` opens no
  transaction of its own (checked), so it can run inside one.
- **Wording:** the error becomes *"Nothing was saved. Share it again."* — now true, and sharing
  again cannot duplicate.
- **File ownership:** copies without rows exist only for the length of the save; if the app dies
  mid-way they are orphans the sweep collects. Not atomic across the filesystem, and the docs will
  not claim it is.
- **Tests:** SQL in node — one file, several, a failing row write rolls everything back
  (no item, no resources). The copy-then-cleanup order as a pure plan if it can be one.
- **Release build on the emulator** (the dev client cannot be cold-started by a share): one PDF,
  three images, a link; app open and closed.

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

R0–R7 can ship together as **0.4.0** (R8–R11 too, if ready). The usual routine
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

## 7. Decisions — awaiting the owner

Recommended answer in bold.

| # | Question | Recommended |
|---|---|---|
| 1 | N6 on an existing item | **Suggest only; fill automatically only on new entries** |
| 2 | What goes in *Happening now* | **Confirmed, timed, not tasks, not stays** (a stay's *Check out* is already in Up next) |
| 3 | A timed event with no end stays happening for | **60 minutes** (alternative: until the next event starts) |
| 4 | Grace after an event ends | **None** — the Timeline still has it |
| 5 | Overnight transport | **Happening between departure and arrival; *Arrives* not repeated in Up next** |
| 6 | "Today" for date-only entries | **The item's own zone; no tasks, no ideas; multi-day on each day** |
| 7 | Share-to-app failure policy | **Option A — all or nothing** |
| 8 | Cancelled with refund not specified | **Not counted, but shown as "not counted"** (alternative: count it as spent) |
