# N5 — Expenses and splitting (draft spec)

**Status: agreed in outline, a few questions open (end of this file). Build after the owner's trip** —
it needs the app's first schema migration, and the owner asked for that to wait.

## Why

During a trip, money is spent in small amounts that never become bookings: a taxi, groceries,
souvenirs. On a trip with friends, people take turns paying for shared things. The goal is to write
each expense down in seconds, and at the end see **who owes whom**, settled in as few payments as
possible — like Splitwise, Tricount or Splid, but local and offline like the rest of the app.

**One honest difference from those apps:** there is no backend (CLAUDE.md §7), so the friends do not
have the app. The owner records everything; the settle-up result can be **shared as text** (e.g. to
a WhatsApp group) so everyone sees the same numbers.

## What other apps do (researched 2026-10-11)

- **Splitwise:** pick who took part in an expense; split equally or unequally by exact amounts,
  percentages, shares, or "adjustment" (one person pays a set amount more). Simplifies debts into
  fewer payments.
- **Tricount:** *paid by* and *for whom* on every expense, a receipt photo, a **Balances** view, and
  suggested reimbursements that can be **marked as paid**. Works offline. Statistics per category in
  the paid tier.
- **Splid:** offline-first; entry is *what and how much → who paid → who shares*. Converts currencies
  (we deliberately do not).
- **Settling:** the usual method is greedy — the largest debtor pays the largest creditor, repeat —
  at most *people − 1* payments. Simple, testable, and what most apps do.

## Decided with the owner

- **Expenses becomes a tab** in the bottom bar: Now · Timeline · Places · **Expenses** · Notes. The
  Expenses card leaves Now (the page built in U9 becomes the *Bookings* view).
- Inside it, **three views at the top: Spending · Bookings · Settle up.**
- **Bookings take part in the split** — the same *Paid by* and *Split between* as an expense.
- **Unequal splits are in from the start**, behind a toggle.
- **Currencies are settled separately** — never converted.
- Renaming a traveller does not need to follow through to old expenses.
- Built with clear, plain code; **every rule has tests**.

## The screens

### Spending
- Totals per currency at the top, and a **breakdown by category** (a simple bar per category).
- Expenses grouped by day, newest day first. Each row: category icon, label (or the category when
  empty), amount, and a small line such as *Ana paid · split 3 ways*. Tapping opens it; a receipt
  shows as a paperclip.
- An **Add expense** button.

### Add / edit an expense — built for one hand at a till
1. **Amount** first, with the number keypad already open. Comma or point both work (`parseAmount`).
2. **Currency**: the last one used on this trip, else EUR.
3. **Category** as chips: Food & drink · Groceries · Transport · Activities · Shopping & souvenirs ·
   Accommodation · Other.
4. **Label** (optional), **Date** (today by default), **Description** (optional).
5. **Receipt**: take a photo with the camera, or pick an image or a file. Several are allowed.
6. **Paid by** — one of the trip's travellers; defaults to the last payer used on this trip.
   Empty = not part of the split.
7. **Split between** — everyone on the trip, ticked by default; untick anyone not in it. Ticking only
   the payer makes it personal.
   - **Toggle "Split unequally"** → an amount field per ticked person, with a live
     *"EUR 4.00 left to assign"* line. Saving is refused until it adds up.

On a trip with **one traveller or none**, *Paid by* and *Split between* are hidden entirely — a solo
or family trip that does not split sees a plain expense form.

### Bookings
The U9 list: *To pay*, then *Paid*, each opening its item. A booking's own form gains *Paid by* and
*Split between*.

### Settle up
- **Balances** per person, per currency: *paid 240 · share 160 · is owed 80*.
- **Suggested payments**: *Ivan pays Ana EUR 80.00*, each with **Mark as paid**, which records a
  payment and updates the balances. Recorded payments are listed and can be undone.
- **Share summary** — the suggested payments as plain text to the share sheet.
- When everything balances: *All settled up.*

## Data — one additive migration (`002`)

Nothing existing is rewritten or moved. Old backups still import; new backups carry the new rows.

```sql
CREATE TABLE expenses (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('food','groceries','transport','activities',
                                               'shopping','accommodation','other')),
  label      TEXT,
  amount     INTEGER NOT NULL CHECK (amount > 0),   -- minor units, like every price
  currency   TEXT NOT NULL,
  spent_on   TEXT NOT NULL,                          -- local date, YYYY-MM-DD
  notes      TEXT,
  paid_by    TEXT,                                   -- a traveller's name; NULL = not split
  split      TEXT,                                   -- JSON, Zod-validated; NULL = everyone, equally
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments (                              -- "Mark as paid" in Settle up
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_name  TEXT NOT NULL,
  to_name    TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  currency   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A receipt is an ordinary file resource on the trip that also names its expense, so the existing
-- CHECK (exactly one of trip_id / trip_item_id) still holds and no table is rebuilt.
ALTER TABLE resources ADD COLUMN expense_id TEXT REFERENCES expenses(id) ON DELETE CASCADE;
```

- *Trip documents* must exclude rows with an `expense_id`.
- Bookings keep their split in `details` (`paidBy`, `split`) — no column needed.
- Receipt files are collected by the existing GC sweep, since they are ordinary `resources` rows.
- The backup format gains `expenses` and `payments`; the "covers every column" test enforces it.

**The split, as stored** (one Zod schema, used by expenses and bookings alike):

```ts
type Split =
  | { mode: 'equal'; people: string[] }                 // NULL in the column = everyone
  | { mode: 'amounts'; amounts: Record<string, number> } // minor units, must sum to the amount
```

## The logic — pure functions in `src/domain/split.ts`, each tested

| Function | Does | Key tests |
|---|---|---|
| `sharesOf(amount, split, travellers)` | Who carries how much of one expense | 10.00 three ways is 3.34 / 3.33 / 3.33 — cents never lost; amounts that do not add up are rejected |
| `balances(expenses, bookings, payments)` | Per currency, per person: paid − share | Always sums to zero; a personal expense changes nothing; a payment moves both sides |
| `settleUp(balances)` | Suggested payments, largest debtor to largest creditor | At most *people − 1*; applying them leaves every balance at zero |
| `byCategory(expenses)` | Totals per category, per currency | Largest first; currencies never mixed |

Screens stay thin and call these. No class hierarchy, no strategy objects — a two-case union and a
`switch`.

## Build order (each step committed with tests)

1. Migration `002` + its tests on a database shaped like real data; backup round trip.
2. Domain: `split.ts`, `spending.ts` additions — fully tested before any screen.
   (`expenses.ts`, the booking costs from U6, is now `bookingCosts.ts`.)
3. Repositories: expenses and payments CRUD (SQL tests in Node).
4. Expenses tab with the three views; the card leaves Now.
5. Add / edit form, receipts (camera needs the `CAMERA` permission — a native rebuild).
6. Bookings: *Paid by* / *Split between* on the item form.
7. Settle up, Mark as paid, Share summary.
8. Release: the rehearsal over the phone's version with `adb install -r`, a fresh Drive backup first.

## Open questions

1. **Unequal modes:** exact amounts only (recommended — matches "whose expense is what"), or also
   **shares** (a couple counts as 2, a child as 1)?
2. **Top views:** a tap-to-switch control (recommended — no new dependency) or swipeable tabs?
3. **Categories:** is the list above right?
4. **Later ideas, not in N5 unless wanted:** *Same again* (repeat yesterday's coffee), expenses in
   trip search, an export to a spreadsheet.
