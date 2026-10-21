# Phase 3D-1 — money records linked to bookings: plan, answers and as built (0.14.0)

Written 2026-10-21 at `e5e72e4` (0.13.0), after the owner's review of 3B and 3C. It turns
`phase3-plan.md` §17 and §18.2 (L-1–L-4) into an exact proposal. **Nothing here is built.** It needs
migration 007, which the data-safety rules say is explained and agreed before it is written, so
implementation starts only after the owner approves this plan (§10 lists the questions).

Where this plan and `phase3-plan.md` §§7–8, 12 or 17 differ, this plan is the proposal and those
are history.

## 1. Scope

**In 3D-1:**
- Payments recorded against a booking: a deposit and the balance as separate records, each with an
  optional payer, a date and a note.
- Linking an existing or new expense to a booking, so that it is a payment for that booking and
  not spending of its own.
- An optional payer on an expense. It is *Not recorded* unless the person picks one (§15 *8*).
- Aggregation that counts every cost once, the legacy *Paid* reading, and a warning for a likely
  duplicate that isn't linked.
- Blocking deletions that would lose money history, with an explicit way to resolve each one.
- Migration 007, backup format 8, trip archive rowFormat 8, and the release rehearsal.

**Not in 3D-1:** cost shares and splits, *Covered by* for children, a responsible adult, balances,
settlements, refunds, currency conversion, and the full flow for removing a traveller who has money
records (3D-2 designs that flow; 3D-1 only blocks the removal, §6).

## 2. The three money records (L-4)

| Record | What it is | Stored | Counts as |
|---|---|---|---|
| **Standalone expense** | Spending not tied to any booking: a taxi, groceries, a souvenir | `expenses` row, `trip_item_id IS NULL` | **Spending.** Part of the trip total in its own right |
| **Payment against a booking** | Money paid towards a booking's price: a deposit, a final payment or the whole price | `booking_payments` row (new) | **Paid on that booking.** Never spending and never a cost |
| **Linked expense** | An expense record (category, label, receipts, payer) the person has said pays for a booking, typically one logged before the link existed | `expenses` row, `trip_item_id` set | **Paid on that booking**, exactly like a payment. Never spending |

A booking's **cost** is its `price_amount`, counted once. Nothing else is ever a cost of that
booking.

**Why two kinds of record on a booking:** a payment is the light way to say "EUR 100 deposit on
3 May". A linked expense lets an expense that already exists, perhaps with its receipt, stop being
counted twice without being deleted or converted. Neither is turned into the other automatically.

## 3. Aggregation rules (per currency, never converted)

For a booking *b* with a price *P* in currency *C* (only *C* is allowed on its records, §5):

```
recorded(b) = Σ booking_payments(b).amount + Σ linked expenses(b).amount
paid(b)     = b.is_paid ? P : min(recorded(b), P)
toPay(b)    = P − paid(b)
overpaid(b) = max(recorded(b) − P, 0)          -- shown, never added to any total
```

- **Legacy *Paid* (§15 *6*):** `is_paid = 1` keeps its meaning, *fully paid*. When there are no
  records, the booking reads ***Paid — not recorded by whom***, as today. When there are some
  records, they describe the part that is known: *Paid EUR 250 · EUR 100 recorded (Ana), EUR 150 not
  recorded by whom*. **No amount, payer or payment row is ever invented**, and `is_paid` is never
  written by anything except the person's own *Paid* switch.
- **Paid by records:** with `is_paid = 0`, the booking reads *Paid EUR 100 of 250 · To pay EUR 150*.
  When the records reach *P*, it reads *Paid* (computed). The switch stays off unless the person
  turns it on.
- **Which bookings count:** unchanged (`countsAsSpent`). A confirmed booking counts; a
  non-refundable cancellation counts; ideas, refundable cancellations and cancellations with the
  refund not specified don't. A cancelled booking keeps its records and shows them, and its
  records count only where the booking counts. Refunds stay out of Phase 3.
- **Trip total** = Σ cost of the bookings that count + Σ **standalone** expenses, per currency.
  *Spending* = standalone expenses only. A linked expense is listed under its booking.
- **The owner's example:** a EUR 250 booking with a EUR 100 deposit and a EUR 150 final payment
  (payments, linked expenses, or one of each) is cost 250, paid 250, to pay 0, and spending is
  unchanged. It is never EUR 500.
- **Journeys:** the price lives on the first leg (U7), so records attach to the leg that holds the
  price. The other legs take its paid state for display, as today (`paymentStatuses`).

The display reads the derived state in every place that shows paid or to pay today: the Expenses
tab, the item screen, the cards (`PaymentTag`), the Overview and the PDF costs appendix. The PDF
shows amounts only, never payer names (§15 *7*).

## 4. Migration 007 — exact DDL [for approval]

Current `user_version` is **6** (3C changed no schema). The migration is additive: one new table
and two nullable columns. No table is rebuilt, no existing value changes, and no row is written.

```sql
-- A payment towards one booking: a deposit, the balance, or the whole price.
CREATE TABLE booking_payments (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  -- No ON DELETE action (= NO ACTION, checked at the end of the statement): deleting the booking
  -- alone is refused while a payment points at it; deleting the whole trip removes both in one
  -- statement (§6).
  trip_item_id TEXT NOT NULL REFERENCES trip_items(id),
  payer_id     TEXT REFERENCES travellers(id) ON DELETE RESTRICT,   -- NULL = not recorded
  amount       INTEGER NOT NULL CHECK (amount > 0),                  -- minor units
  currency     TEXT NOT NULL,
  paid_on      TEXT,                                                 -- YYYY-MM-DD, NULL = unknown
  note         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_booking_payments_trip ON booking_payments(trip_id);
CREATE INDEX idx_booking_payments_item ON booking_payments(trip_item_id);
CREATE INDEX idx_booking_payments_payer ON booking_payments(payer_id);

-- An expense that pays for a booking (L-4). NULL = standalone spending, which is every existing row.
ALTER TABLE expenses ADD COLUMN trip_item_id TEXT REFERENCES trip_items(id);
-- Who paid an expense. NULL = not recorded, which is every existing row. The legacy text
-- column paid_by is never read or written.
ALTER TABLE expenses ADD COLUMN payer_id TEXT REFERENCES travellers(id) ON DELETE RESTRICT;
CREATE INDEX idx_expenses_item ON expenses(trip_item_id);
CREATE INDEX idx_expenses_payer ON expenses(payer_id);
```

| Point | Answer |
|---|---|
| **Why NO ACTION, not RESTRICT or CASCADE** | CASCADE would delete payments with the booking, which L-1 rejects. RESTRICT is enforced *during* the cascade from a trip, so whether a trip deletion succeeds would depend on SQLite's internal cascade order. NO ACTION is checked at the end of the statement: a booking deletion alone fails, but a trip deletion that removes the booking and its records together succeeds. Checked in Node with `better-sqlite3`, and pinned by tests |
| **The app refuses first** | The constraint is the last line of defence. The screens check for records and explain the block before any `DELETE` runs (§6) |
| **Payer `RESTRICT`** | A traveller profile with payments can't be deleted (invariant I). The existing profile deletion already refuses a profile on a trip, so this changes no current flow |
| **Currency matches the booking** | Enforced by the repository and Zod in the same transaction, not by a CHECK, because a CHECK can't read another table. Tests cover a payment, a link and a price edit (§5) |
| **Old `paid_by`, `split`, `payments`** | Untouched, unread and still exported (§15 *7*). Tests include unexpected non-null values in all three |
| **Existing rows** | Nothing is written. Every existing expense becomes standalone (`trip_item_id` NULL) with *Not recorded* as its payer, which is exactly what it means today |
| **Shares, settlements, responsible adult** | **Not in 007.** They get their own migration in 3D-2 or 3E, once designed. The drafted `cost_shares` had the same cascade problem, and no schema ships before it is approved |
| **Rollback** | Forward-only like 002–006. An older build never opens a v7 database, because Android refuses a lower versionCode without an uninstall, which is forbidden. The safety net is the pre-install backup |

## 5. Rules enforced on save

| Action | Rule |
|---|---|
| Add a payment or link an expense | The booking must be confirmed or cancelled, with a price above 0, and the record must be in the booking's currency. Otherwise it is refused and nothing is written: *This booking is in EUR; this payment is in BGN. Payments must be in the booking's currency — currencies are never converted.* *Add the booking's price first.* |
| Change a booking's price currency, or clear its price | Refused while it has records: *This booking has 2 payments in EUR. Remove or move them first.* |
| Lower a price below what is recorded | Allowed, with a warning; the booking then shows *Overpaid EUR 20* |
| Change a booking with records to an idea | Refused, with the reason (an idea is a budget, not money paid). Cancelling is allowed and keeps the records |
| Edit a linked expense's amount or currency | The currency stays locked to the booking while linked. The amount is free |
| Toggle *Paid* | Unchanged, and never touches the records |
| AI import (2C) / *Plan with AI* (2D) | Never write or read payments, links or payers. A test asserts the planning context never contains them |

## 6. Deletion and resolution (L-1, L-2)

| Deleting | With money records | Behaviour |
|---|---|---|
| **A booking** | Payments or linked expenses | **Blocked**, with an explanation: *"Hotel Aurora" has 2 payments and 1 linked expense. To keep the money history, cancel the booking instead, or remove those records first.* Buttons: **Cancel booking** (status → cancelled; records kept) · **Show records** · **Close** |
| **A payment** | — | The person's own record: deleted only from the payment's screen, after a confirmation naming the amount. Never converted into an expense |
| **A linked expense** | — | Its screen offers **Unlink from booking**. After a confirmation (*It will count as spending of its own*) it becomes standalone. Deleting it is the same as deleting any expense |
| **A whole trip** | Any | **Owner's question (§10 Q2).** Recommended: allowed as one explicit removal. The confirmation names the money history (*This also deletes 3 payments and 7 expenses recorded on this trip*). Expenses already go with a trip today; the database removes everything in one statement |
| **Replace from a backup or trip ZIP** | Any | A replace is a whole-trip replacement and works as it does today. The new rows come from the file |
| **Removing a member from a trip** | They paid something on it | **Blocked** in 3D-1: *Ana paid 2 records on this trip. Change the payer on those first.* The full resolution flow is 3D-2 (§15 *9*) |
| **Deleting a traveller profile** | Payer anywhere | Already blocked while the profile is on a trip; the FK also refuses it |

**No archive state is added.** *Cancelled* already is the booking's archive: it keeps its records,
and the totals follow the existing refund rules. The resolution workflow is: cancel the booking
instead, unlink an expense explicitly, or delete a payment explicitly. No record is ever moved or
converted without the person doing it.

## 7. Screens

- **Booking screen:** a *Payments* section under the price, showing *Paid EUR 100 of 250 · To pay
  EUR 150* or the legacy line, the records (payments and linked expenses, by date), and **+ Add a
  payment**. The amount defaults to what is left to pay; the payer to *Not recorded*, with the last
  payer on this trip offered as a one-tap chip, never preselected; the date to today. A solo trip
  hides the payer row.
- **Payment screen:** shows and edits amount, payer, date and note. The currency is fixed to the
  booking's. Delete is here.
- **Expense form:** *Paid by* (*Not recorded* by default; the last payer offered as a chip) and *For
  a booking* (*None*, or a picker of the trip's confirmed or cancelled bookings in the same
  currency, with the price and what is left to pay). A linked expense shows *Pays for "Hotel
  Aurora"* and **Unlink**.
- **Duplicate warning (§15 *10*):** saving a **standalone** expense in the same trip and currency
  whose amount equals a booking's price or what is left to pay shows *This may be a payment for
  "Hotel Aurora" — link it?* with **Link** / **Keep as spending**. It never links anything by
  itself.
- **Expenses tab:** Bookings shows paid/to pay from §3, with an *Overpaid* note where it applies.
  Spending lists standalone expenses only. The trip total follows §3. A linked expense appears in
  its booking's records.
- **Trip travellers:** removing a member with records shows the block in §6.

## 8. Backup, archive and other formats

- **Full backup format 8.** It adds the `booking_payments` table and the two `expenses` columns.
  Format 7 is not reused: 0.13.0 already writes format 7 for 3C, and an app reading format 7 would
  drop the new data without a word. 0.13.0 refuses format 8 under the existing rule, and the test
  from 3C is repeated. Formats 1–7 restore with no payments, and their expenses come back standalone
  with no payer.
- **Trip archive rowFormat 8.** Payments and linked expenses are trip rows. `planTripImport` gives
  them new ids and remaps `trip_item_id`, `expense_id` and every payer through the traveller choices.
  A payer who appears only in money records is included like a participant. `checkTripArchive`
  checks the new references, and the 2B import preview counts the payments.
- **2C activities JSON, 2D Plan with AI, `.ics` (future):** unchanged.
- **PDF costs appendix:** paid and to pay come from §3. It shows no names.

## 9. Tests and verification

**Node, synthetic data only:**
- Migration 007 over v6 databases shaped like the owner's data, including non-null legacy
  `paid_by`, `split` and `payments`, journeys, receipts and a child. Every old row is byte-identical
  after (table hashes), the new table is empty and the new columns are NULL. The migration is
  idempotent, and a failed batch leaves the database at version 6.
- FK behaviour: deleting a booking with a payment or a linked expense fails; deleting the trip
  succeeds and removes everything; a payer profile can't be deleted.
- Aggregation (§3): the EUR 250 example; legacy paid with and without records; overpaid; cancelled
  bookings by refund state; journeys; several currencies; paid never above *P*; property test that
  Σ paid + Σ to pay = Σ cost per currency.
- Rules (§5): wrong currency, no price, idea, price clear, currency change, all refused with nothing
  written.
- Repositories in transactions, with failure injection.
- Backup format 8 round trip and formats 1–7; 0.13.0's reader refuses format 8; archive rowFormat 8
  remap (no id reused, FK closure); 2C writes none of this and 2D reads none of it.

**Emulator E2E (`Pixel_10_Pro`, synthetic data):** every row of §§5–6 through the real UI; 360 dp,
dark mode, fonts 1.3 and 2.0, Back, and a restart. Then the **release rehearsal**: 0.13.0 holding
the synthetic trips, `install -r` 0.14.0 (versionCode 21), every captured screen identical before
and after, the Expenses totals identical, and 0.13.0 refusing a format-8 backup and ZIP. Reading the
migrated database directly needs a debug-signed debuggable build on the emulator (§10 Q4).

**Version:** 0.14.0 / versionCode 21. Nothing is installed on a phone.

## 10. Questions for the owner (recommendation first)

1. **Approve migration 007 as written in §4:** one table `booking_payments` and two nullable
   columns on `expenses`, NO ACTION on the booking references, shares and settlements left to
   later migrations.
2. **Deleting a whole trip with money records** (§18.2 open question 1): **recommended**, allowed
   as one explicit removal whose confirmation names the money history. The alternative is to block
   it until every record is removed by hand.
3. **The legacy *Paid* switch next to records (§3):** **recommended**, *Paid* on means fully paid,
   records describe the known part, and the rest is *not recorded by whom*. The alternative is that
   records always win, which would turn a booking marked *Paid* back into *To pay* when a partial
   record is added.
4. **Database inspection in E2E:** a **debug-signed** debuggable build of 0.14.0 on the emulator
   only, to read the migrated database, as in 2B–2D. The 3C session's safety check blocked the
   `build.gradle` edit this needs, so it needs explicit approval. The alternative is release builds
   only, with migration safety covered by the Node tests.

The resolution workflow (§6) and the definitions (§2) are also approved with this plan, unless the
owner changes them.

### 10.1 The owner's answers (2026-10-21)

| # | Answer |
|---|---|
| 1 | Migration 007 **approved, but only if there is no risk to the real data already in the app**; if there is risk, it waits until after the owner's trip. **How this is applied:** building and testing on the emulator can't touch the phone. Installing on the phone is not risk-free, though: the migration is additive and atomic, so a failure would leave the data as it was, but the app would not open until a fixed build arrived, and an install can't be rolled back without an uninstall. So 3D-1 is built and verified on the branch **`phase-3d1`**, `main` stays at 0.13.0 for any fix during the trip, and **no phone install happens until after the trip**, with the separate approvals in §15 *11* |
| 2 | **Whole-trip deletion allowed**, with an explicit confirmation naming the money history |
| 3 | **The *Paid* switch wins.** Records describe the known part; the rest is *not recorded by whom* |
| 4 | **Debug-signed debuggable build approved, on the emulator only**, to read the migrated database |

## 11. As built (0.14.0, branch `phase-3d1`, 2026-10-21)

Built as planned in §§2–8, with the owner's answers in §10.1. Differences and details found while
building:

- **Shown, not only refused.** Every rule of §5 is explained on screen before a write, and enforced
  again inside the repository's transaction (`MoneyRuleError`); the database's NO ACTION is the last
  word. NO ACTION vs RESTRICT during a trip's cascade was checked in Node before choosing.
- **A cancelled booking** with records: the delete block says to remove the records (not "cancel
  it"), and a refundable or unspecified cancellation reads *Cancelled · … recorded as paid · not
  counted in the totals* instead of *To pay*. Both found in the emulator E2E and fixed.
- **To-dos** never get a *Payments* section and are never offered as a booking to link.
- **The quick expense sheet** (Overview) also asks *Is this a payment for …?*; it does not set a payer.
- **The trip-archive preview** counts *payments on bookings*; the unused name-based table is named
  only when a file has rows in it.
- Payment dates default to today and stay editable; an imported payment without a date reads *Date
  not recorded*.

**Verification.** 1251 Node tests (new: migration 007 on synthetic v6 databases with legacy values,
FK behaviour, aggregation incl. a property test, rules, repositories with refusals leaving the
database unchanged, backup format 8 and 1–7, archive rowFormat 8 remap, 2C/2D carry nothing, PDF).
Emulator E2E: `%USERPROFILE%\Pictures\TravelOrganizer-0.14.0-3D1-e2e\E2E-LOG.md` — migration 6 → 7
on a debug-signed build over a real-shaped synthetic database with every old row identical; 15 UI
checks; release `install -r` over 0.13.0 with identical screens; 0.13.0 refuses format-8 files.
Release APK `%USERPROFILE%\.travel-organizer\travel-organizer-0.14.0.apk` (versionCode 21, release key),
**on no phone**.

### 11.1 Corrective pass after the code review (2026-10-21, branch `phase-3d1`)

No schema, format or behaviour change for valid input; migration 007, backup format 8 and archive
rowFormat 8 are unchanged.

- **The trip form's save is one transaction.** `updateTripWithMembers` used to commit the trip's
  fields, then each removal, in separate transactions, so a failure part-way could keep a partial
  edit. Now the payer check, the fields (and a new zone's instants), the removals and the additions
  run in one `withTransactionAsync`; the inner steps (`writeTrip`, `leaveTrip`, `addTripTraveller`)
  open no transaction of their own, so nothing nests.
- **Editing a payment is checked at the repository.** `updateBookingPayment` wrote straight through;
  now, in one transaction: the payment exists; its booking exists, is on the payment's trip, can
  take payments and is still in the payment's currency (`bookingForRecord`); the input passes
  `bookingPaymentInputSchema` (a whole, positive amount; a date or none); the payer passes
  `checkPayer`. Booking, trip and currency are never written by the update.
- **Invariant P — a payer is on the record's trip.** `checkPayer` (null always passes) on creating
  and editing a payment, and creating and editing an expense. A payer the record already names is
  accepted unchanged, so a record restored as it was is never locked against editing its note.
  `checkTripArchive` refuses an archive whose payment or expense names a payer who is not on its
  trip (the remap keeps members and payers together). A backup restore copies records as they are
  — it is not refused or altered for this.
