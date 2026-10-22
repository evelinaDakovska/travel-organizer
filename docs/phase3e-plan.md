# Phase 3E — balances and settlements: plan

Written 2026-10-22 on the branch `phase-3d1` at `8de82e4` (0.15.0, schema 8), after the two 3D-2
corrective passes. It turns `MASTER_ROADMAP.md` §9 and `phase3-plan.md` §§6–7, §15 *7* into an exact
proposal. **Nothing here is built.** It needs migration 009, which the data-safety rules say is
explained and agreed before it is written, so implementation starts only after the owner approves
this plan (§11 lists the questions).

Where this plan and `phase3-plan.md` §7 (*Balances*) or `expenses-spec.md` (*Settle up*) differ,
this plan is the proposal and those are history.

**Status (2026-10-22, revision 2).** The owner reviewed revision 1 and approved the direction, but
did **not** authorise migration 009 or any implementation. Their answers are in §11.1. Refinements
A–F are worked into §§3–8, and §12 lists the contradictions that are still open. Two gates come
before any code:

1. **The independent review of `a44dd6d`** (the final 3D-2 corrective) is finished and has passed.
   Any confirmed findings are fixed in their own commit **before migration 009 is written** (F).
2. **The owner explicitly authorises the implementation** of this revision, including the answer
   to §12.1.

**Real data (owner, 2026-10-22).** The phone holds real data. A schema migration is a risk to it by
definition, so everything in 3E stays on `phase-3d1`, separate from `main`. `main` stays at 0.13.0,
schema 6. Nothing is merged and nothing is installed on the phone until the owner's trip has passed.
Then it happens only with the separate approvals of `phase3-plan.md` §15 *11*. All testing is
synthetic and on emulators only.

## 1. Scope

**In 3E:**
- **Balances**, per trip, per currency, per person: what they paid, what they bear, what they
  settled, and the net — *is owed* / *owes* / *settled*. Derived on demand, never stored (invariant J).
- **Who owes whom**: suggested transfers that bring every balance to zero.
- **Settlements**: a transfer between two travellers on the trip, recorded by the person, in full or
  in part. They can be edited or deleted.
- **Not in the balances yet**: every cost left out, with the reason and a way to open it. Nothing is
  guessed to get it in.
- **A per-person explanation**: each cost and settlement behind a person's balance.
- **Share as text**: the suggested transfers, through the share sheet, only when the person taps it.
- Removing someone from the trip is also blocked by their settlements, which are listed with the
  other records that hold them (3D-2 §7).
- Migration 009, backup format 10, trip archive rowFormat 10, and the release rehearsal.

**Not in 3E:** currency conversion (Phase 4) and the refunds and negative adjustments that stay out of
Phase 3. Balances and names stay out of the PDF (Q6). Settlements are recorded by hand and never
imported from a bank or payment app. There is no reminder to pay.

## 2. Words, kept apart on every screen

The four words from 3D-2 (*Going*, *Paid by*, *Split between*, *Covered by*) stay as they are. 3E adds:

| On screen | Means | Stored |
|---|---|---|
| **Paid** (in a balance) | What someone handed to vendors for costs in the balances | derived from `booking_payments`, `expenses` |
| **Share** | What someone bears: their own shares, and the children's shares they cover | derived from `cost_shares`, `trip_cover` |
| **Settled** | Money one traveller gave another to square up | `settlements` (new) |
| **Is owed / owes** | The net: paid − share + settled sent − settled received | **never stored** |

A settlement is **not** a cost and not spending. It never changes the trip total, the Bookings or
Spending views, a booking's paid state or the PDF (exit criterion: *settlements don't alter trip
cost*).

## 3. What enters the balances

A balance only counts costs whose whole money story is known. Counting a cost halfway would mean
inventing who paid the rest or who bears it, which invariant G forbids. A cost that is not complete
waits, named, in *Not in the balances yet* (§5).

A cost **enters the balances** when every one of these is true:

| # | Condition | Booking | Standalone expense |
|---|---|---|---|
| 1 | It counts as money spent | `countsAsSpent`: confirmed, or cancelled and non-refundable | always |
| 2 | It is split | has `cost_shares` rows | has `cost_shares` rows |
| 3 | The split adds up | `shareAmounts(...).unallocated === 0` | same |
| 4 | Every child's share is covered | `coverOf` ≠ `notCovered` for each share | same |
| 5 | Everything paid has a payer | every payment and linked expense has `payer_id` | `payer_id` set |
| 6 | Paid exactly the cost | Σ payments + Σ linked expenses = price | (the amount is the cost) |

**Legacy *Paid*:** a booking with `is_paid = 1` whose records do not reach the price fails condition
6. It waits as *Paid — EUR 150 not recorded by whom*, matching how the booking itself reads (3D-1 §3).
No payer and no amount is ever made up to fill the gap.

**For a cost that enters**, in its currency:
- each payer's **paid** goes up by what they paid on it (a deposit and a final payment by two people
  count for both);
- each share is **borne** by its traveller, or by whoever covers it. A child's share follows
  `coverOf`: the override, otherwise the trip's *Covered by* adults, who split it equally with the
  leftover cents going in their order (`splitEqually`). A child never bears anything.

**Settlements** in a currency: the sender's **settled sent** and the receiver's **settled received**
each go up by the amount.

```
net(person, currency) = paid − borne + sent − received
Σ net over the trip's people, per currency = 0        -- always; property-tested
```

Positive means *is owed*. Negative means *owes*. Zero means *settled*. Currencies are never added
together, each gets its own section. Everyone a balance names is on the trip, because payers, shares,
covers and settlements all require trip membership (3D-1 invariant P, 3D-2 §5, §6 here).

**Recorded payments never disappear (A).** Eligibility decides only what goes into the *net*. It
never decides what is shown. A EUR 250 booking with a EUR 100 deposit by Ana still reads *Paid EUR
100 of 250 · To pay EUR 150* on its screen, in the Bookings view and in the trip total, exactly as
in 3D-1. On *Settle up* it is listed under *Not in the balances yet* with its recorded payments
(*Hotel Aurora · EUR 250 · paid EUR 100 (Ana) · EUR 150 to pay*). Ana's explanation screen has a
separate part, *Paid on costs not in the balances yet*, which shows that EUR 100 and is not added
to her net. Nothing outside *Settle up* reads eligibility.

**A partial picture is never shown as a final one (A, D).** In each currency, the nets are labelled
by what they cover:

| The currency has | Heading over the nets | Suggested transfers |
|---|---|---|
| Only complete costs (plus any not split, Q2) | *Balances* | shown |
| Complete costs **and** costs waiting for another reason | *Balances so far — 2 costs not included yet* | per §12.1 |
| Settlements but no complete costs | *Settlements only — no costs in the balances* (B, §6) | **none** |

## 4. Who owes whom (suggested transfers)

Per currency, from the nets: the largest debtor pays the largest creditor
`min(owes, is owed)`, and this repeats until every net is zero. Ties go by the trip's member order,
so the result is deterministic. It produces at most *people with a non-zero net − 1* transfers.
This is the usual greedy method from `expenses-spec.md`. It is **few** transfers, not always the
fewest, since finding the fewest is a much harder problem. The screen says *suggested*.

No suggestions are made in a currency that has settlements but no complete costs (B, §6), or in
one where a child's net is below zero (E, §7). §12.1 covers a currency that has waiting costs.

A suggestion is only a reading and nothing writes it. **Record** opens the settlement form already
filled in with *from*, *to*, the amount and the currency, and the person can edit any of them. A
smaller amount is a **partial** settlement. After saving, the balances and suggestions are worked
out again from the records.

## 5. Not in the balances yet

Every cost that counts as spent but fails §3 is listed under its currency, with the first reason
that applies and what to open:

| Reason (first that applies) | Reads | Opens |
|---|---|---|
| Not split | *Not split* | the split screen |
| Split doesn't add up | *Split adds to EUR 90 · price EUR 100* | the split screen |
| A child not covered | *Mia's share — not covered* | the trip's Travellers (*Covered by*) |
| A payment with no payer | *EUR 100 paid — payer not recorded* | the payment or the expense |
| Paid — not recorded by whom | *Paid — EUR 150 not recorded by whom* | the booking |
| Still to pay | *EUR 150 to pay* | the booking |
| Overpaid | *EUR 10 more recorded than the price* | the booking |

- **Not split** costs get **one collapsed line**, for example *12 costs, EUR 3,400, not split — not
  part of who owes whom*. On a trip that never splits anything, such as the owner's family trip, this
  is the normal state and should not look like a problem. The line opens to show the list. Every
  other reason is shown open, because it is unfinished work.
- **To pay** is normal before the trip, since nobody has paid yet. It is listed in the muted style,
  not as a warning.
- Every waiting line shows **what is recorded on it** — *paid EUR 100 (Ana)*, *paid EUR 60, payer
  not recorded* — so a deposit stays visible while the cost waits (A).
- A cancelled booking that is *refundable* or has *refund not set* is not spent (`countsAsSpent`).
  If it has recorded payments, it is still listed, with the reason *Cancelled — refund expected* or
  *Cancelled — refund not set*, and its payments are shown. It never goes into a net, because
  refunds stay out of Phase 3. Without payments it is not listed here, and the existing *Not
  counted* line (R10) stays as it is.

**Status wording (D).** The screen never says *All settled up* on its own. Per currency:

| Nets | Waiting (other than not split) | Not split | Reads |
|---|---|---|---|
| all zero | none | none | *All settled up in EUR* |
| all zero | none | some | *Settled up for the shared costs · 12 costs not split, not part of this* |
| all zero | some | any | *Settled for the 4 complete costs · 2 costs not included yet* |
| not zero | — | — | the balances and §4 |
| no complete costs, no settlements | — | — | *Nothing to settle yet in EUR* plus the waiting list |

## 6. Migration 009 — exact DDL [for approval]

Schema 8 → 9. Additive: one new table. **No existing table is altered and no row is written.**

```sql
-- Money one traveller gave another on a trip, to square up. Never a cost; never linked to one.
CREATE TABLE settlements (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL,                                   -- who paid
  to_id      TEXT NOT NULL,                                   -- who received
  amount     INTEGER NOT NULL CHECK (amount > 0),             -- minor units
  currency   TEXT NOT NULL,
  settled_on TEXT,                                            -- YYYY-MM-DD, NULL = unknown
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (from_id <> to_id),
  -- Members of this trip, checked by the database (NO ACTION: at the end of the statement).
  FOREIGN KEY (trip_id, from_id) REFERENCES trip_travellers(trip_id, traveller_id),
  FOREIGN KEY (trip_id, to_id)   REFERENCES trip_travellers(trip_id, traveller_id)
);
CREATE INDEX idx_settlements_trip ON settlements(trip_id);
CREATE INDEX idx_settlements_from ON settlements(trip_id, from_id);
CREATE INDEX idx_settlements_to   ON settlements(trip_id, to_id);
```

| Point | Answer |
|---|---|
| **The same pattern as `cost_shares`** | Composite keys to `trip_travellers`' primary key. The database refuses a settlement involving anyone not on the trip. NO ACTION means someone with a settlement cannot leave the trip alone, while deleting the whole trip removes both rows in one statement. This was already verified for 008, and the same probe is repeated here as tests |
| **Leaving the trip** | `leaveTripRefusal` / `moneyHolds` / `listHolds` count settlements as a fourth hold: *Settled · Ana → Ben · EUR 30.00 → open*. The person edits or deletes the settlement. Nothing is moved by itself |
| **Deleting a profile** | Already refused while the profile is on any trip, so a settlement never points at a deleted profile |
| **Currency (B)** | Free, like an expense, and filled from the suggestion. Nothing is converted. A settlement in a currency **with no complete costs** on the trip is a fact, but it is not an ordinary debt. Its effect on that currency's nets is plain arithmetic (sender +, receiver −). Its section reads *Settlements only — no costs in the balances. Check the currency, or complete the costs it pays back*, and **no transfer is suggested** in that currency, so nobody is told to pay a settlement back. Before saving such a settlement, the form warns: *There are no NOK costs in the balances. Save anyway?* Other currencies are never affected |
| **Deleting the whole trip (C)** | An explicitly confirmed destructive operation. The trip-delete confirmation already names the money records (3D-1 Q2), and 3E adds settlements: *This also deletes 3 payments, 7 expenses, 4 splits and 2 settlements — the trip's money history.* The same naming is added to a backup restore with *Replace* and a trip-archive import that replaces a trip, because both delete the old trip's settlements |
| **Nothing else deletes a settlement (C)** | A settlement is never linked to a booking or an expense, so deleting either cannot touch one. Removing someone from the trip is refused while they have one, and deleting a profile is refused while it is on a trip. The only ways a settlement goes are its own **Delete** (confirmed) and the whole trip (confirmed) |
| **Why no link to a cost** | A settlement squares a balance and does not pay for a booking. Paying a vendor is a payment (3D-1). A link would let one transfer be counted as both |
| **Old `payments` table** | The name-based N5 `payments` table stays untouched, unread and still exported (§15 *7*). Tests include unexpected non-null rows in it |
| **Existing rows** | None written. Every trip starts with no settlements |
| **Rollback** | Forward-only, like 002–008. The phone install waits (§10) |

## 7. Rules enforced on save (domain + repository, inside the write's transaction)

`MoneyRuleError` with the explanation, as in 3D-1/3D-2. Each one is a pure function in
`src/domain/balances.ts` first.

| Write | Refused when |
|---|---|
| Save a settlement | *from* = *to*; either person is not on the trip; the amount is not above 0; the date is not a date |
| Save a settlement that leaves a **child** owing | A child's net in that currency would fall below zero: *Mia would owe money. A child never owes — record it with the adult who covers her.* (invariant D). A child can be a creditor, because 3D-1 allows a child as payer (a known limitation) |
| Save a settlement for **more** than the suggestion | **Allowed, with a warning first** (Q4). The warning shows the resulting balances in that currency, not only the difference: *That is EUR 20.00 more than Ben owes Ana. Afterwards: Ana owes EUR 20.00 · Ben is owed EUR 20.00 · Cara settled. Save anyway?* The same preview of the resulting balances is shown before any settlement that is not exactly a suggestion |
| Save a settlement in a currency with no complete costs | Allowed, with the warning in §6 (B) |
| Edit a settlement | The same rules, worked out without the settlement's own old values |
| Delete a settlement | Always allowed after a confirmation that names it. It is the person's own record |
| Remove someone from the trip | Refused while they have settlements (§6), listed with the other holds |
| AI import (2C) / *Plan with AI* (2D) | Never write or read settlements. A test asserts it |

**A child below zero after a later edit (E).** The save rule covers only the moment a settlement is
saved. Later edits elsewhere can still push a child's net below zero, with nothing in the
settlement changing:
- a payment by the child is deleted, its amount lowered, or its payer changed;
- a cost the child paid for stops being complete (a price edit, a removed split), so it leaves the
  balances;
- someone who was an adult when they settled is reclassified as a child on the trip.

What happens then, in every case:
- **Nothing is modified.** No settlement, payment, share or cover is changed, moved or deleted by
  the app.
- The child is **never shown as owing**. Their row reads *Mia — received EUR 10.00 more than she
  paid · check her settlements*, in the attention style, with the settlements listed and each one
  openable. The arithmetic stays the same, because Σ net = 0 still holds, but the child's line is
  never worded or styled as a debt.
- That currency shows **no suggested transfers** until the person resolves it, because any
  suggestion would make the child a debtor. The other currencies are unaffected.
- The person resolves it by their own edit: change or delete the settlement, or restore what
  changed.

Tests cover each of the three causes. The settlement rows are byte-identical before and after, the
child's line is the flagged reading, and no suggestion appears in that currency.

## 8. Screens

- **Expenses tab: a third view, *Settle up*** (after *Bookings · Spending*, as `expenses-spec.md`
  planned). It is shown only on a trip with **two or more** people (Q5). For each currency:
  - **Balances**: one row per person in member order, for example *Ana · paid 240.00 · share 160.00 ·
    is owed 80.00*, and *Ben · owes 80.00*. Settlements appear on the row only when there are some.
    Tapping a row opens the explanation.
  - **Who owes whom**: *Ben pays Ana EUR 80.00 · Record*.
  - **Settlements**: each recorded one, *Ben → Ana · EUR 50.00 · 22 Oct*. Tapping opens it.
  - **Not in the balances yet** (§5).
  - **Share** in the header: plain text through the share sheet (§9).
- **Explanation** (`app/trip/[tripId]/balance.tsx?travellerId=…&currency=…`): *What Ana paid*
  (each cost and amount), *Ana's share* (each cost: her own share, then *Mia's share, covered by
  Ana*), *Settled* (sent and received), and the sum. Each line opens its record. It is plain
  arithmetic that the person can check (exit criterion).
- **Settlement form** (`app/settlement/new.tsx`, `app/settlement/[settlementId].tsx`): *From* and
  *To* as chips of the trip's members, the amount, the currency (`CurrencyInput`), the date (today by
  default) and a note. On an existing settlement it also offers **Delete**.
- **Holds** (`app/trip/[tripId]/holds.tsx`): settlements listed, each opens its form.
- **Trip deletion and import preview:** settlements are named in the count, as payments and splits
  are (*…and 2 settlements*).
- **Unchanged:** the Bookings and Spending views, the trip total, the booking and expense screens,
  Now, Overview, the PDF, 2C and 2D. Tests check that none of them reads `settlements`.

## 9. Share as text

Only from the *Share* button, and only the currency sections shown:

```
Lapland — settle up (suggested)

EUR
Ben pays Ana 80.00
Cara pays Ana 15.00

Not included: 2 costs still to pay, 12 not split.
```

The text holds names and amounts, and it leaves the phone only when the person picks where to send
it in the share sheet. The PDF stays without names or balances (Q6, §15 *7*).

## 10. Formats, branch, version, tests, verification

| | Change |
|---|---|
| Full backup | **Format 10**: `settlements`. Formats 1–9 restore with it empty (Zod default). A format-10 file is refused by 0.15.0 and older (existing rule) |
| Trip archive (2B) | **rowFormat 10**: settlements are trip-owned. `planTripImport` gives them new ids and maps `from_id`/`to_id` through the traveller choices. `checkTripArchive` refuses a settlement naming someone not on the archived trip, or one that maps *from* and *to* onto one profile. The preview already refuses that mapping choice, and says why |
| Restore *replace* / whole-trip delete | Settlements go with the trip, in one statement |
| 2C / 2D / PDF / share-text of the itinerary | Unchanged |

- **Branch:** `phase-3d1` (Q3), after 3D-2. `main` stays at 0.13.0. **No phone install until after
  the owner's trip**, and then only with the separate approvals for the backup, the structure-only
  check and the rehearsal. The phone's eventual install runs **007, 008 and 009 together**, so the
  6 → 9 path is tested directly. **0.16.0**, versionCode 23.
- **Node (synthetic only):**
  - migration 009 over synthetic schema-8 databases with 3D-1/3D-2 records and odd legacy
    `payments` / `split` / `paid_by` values. Every old row stays identical, no new row appears, the
    run is idempotent, and a failed batch leaves 8. The 6 → 9 path is also run;
  - the composite keys, as tests;
  - `balances`: Σ net = 0 per currency (property test with random costs, 1–12 people, children,
    several covering adults, settlements); each §3 condition excludes the cost and gives its §5
    reason; legacy *Paid* waits; a booking + payments + linked expense counts once; no person appears
    with a non-zero net who has no record in that currency (*no false debtor*);
  - `settleUp`: applying the transfers leaves every net at zero; at most n − 1 transfers; deterministic
    order; a currency with a child below zero gets no suggestions;
  - settlements never change `tripExpenses`, `spendingTotals`, `tripTotals`, `paymentSummary` or the
    PDF HTML (snapshot of the totals before/after);
  - every §7 refusal leaves every table byte-identical; the holds list and `leaveTripRefusal` include
    settlements;
  - backup 10 round trip, and formats 1–9; archive rowFormat 10 remap, the refusals, FK closure;
    2C/2D carry nothing;
  - revision 2:
    - (A) a cost that waits still reports its recorded payments, and the 3D-1 readings (`paymentSummary`,
      the Bookings view, the trip total) are identical with and without 3E;
    - (B) a settlement-only currency gets the flagged heading and no suggestion;
    - (C) the trip-delete, *Replace* restore and archive-replace confirmations count settlements, and
      deleting a booking or an expense, or a refused leave, leaves `settlements` byte-identical;
    - (D) each row of the status-wording table;
    - (E) the three causes of a child below zero;
    - §12.1 the pre-settlement case, with no false debtor suggested.
- **Emulator E2E** (as for 3D-1/3D-2): a debug-signed, debuggable build on `TO_2B_Test` for the 8 → 9
  database diff (Q7). Synthetic families: solo (no view); 3 adults; 2 adults + 1 child covered by
  both; 2 adults + 3 children with two different covering adults; two currencies. Every worked
  example (§10.1) and every §7 case goes through the UI, including a partial settlement, an
  over-settlement warning, and leaving the trip blocked by a settlement. Also checked: 360 dp, font
  2.0, dark mode, Back, and a restart. Then release `install -r` **0.13.0 → 0.16.0** (the phone's
  path) and 0.15.0 → 0.16.0, with every captured screen identical before and after, and 0.15.0
  refusing format 10. The release APK is rebuilt from the final commit, signed with the release key
  and checked against SHA-256 `638dc686…`.

### 10.1 Worked examples

| Case | Records | Balances (EUR) | Suggested |
|---|---|---|---|
| Taxi 30.00, three adults, equally, paid by Ana | expense, payer Ana | Ana +20 · Evelina −10 · Ben −10 | Evelina → Ana 10 · Ben → Ana 10 |
| Safari 90, Evelina pays all; Evelina + Ana + Mia (child, covered by Evelina and Ana) equally | payment 90 by Evelina | Mia's 30 → 15 + 15; Evelina +45 · Ana −45 · Mia 0 | Ana → Evelina 45 |
| Hotel 250, deposit 100 by Ana, split Ana + Ben equally | 150 still to pay | — (waits: *EUR 150 to pay*) | — |
| …then Ben pays the 150 | payments 100 Ana, 150 Ben | Ana −25 · Ben +25 | Ana → Ben 25 |
| Booking 120 marked *Paid*, no records, split | legacy | — (waits: *Paid — EUR 120 not recorded by whom*) | — |
| Ben owes Ana 80; Ben settles 50 | settlement 50 | Ana +30 · Ben −30 | Ben → Ana 30 (partial) |
| …Ben settles 100 instead | warning, then saved | Ana −20 · Ben +20 | Ana → Ben 20 |
| A EUR and a NOK cost | — | two sections, never added | per currency |
| A family trip, nothing split | — | no balances; *12 costs not split* (collapsed) | — |
| Hotel 250, deposit 100 by Ana, split Ana + Ben; Ben gives Ana 50 now | hotel waits; settlement 50 | *Balances so far*: Ben +50 · Ana −50; hotel listed with *paid EUR 100 (Ana)* | none (§12.1 a) |
| Ben gives Ana NOK 500, no NOK costs | settlement only | *Settlements only — no costs in the balances* | none (B) |

## 11. Questions for the owner (recommendation first)

0. **Before 3E starts:** has the independent review of `a44dd6d` (the final 3D-2 corrective pass) been
   done, and did it pass? 3E builds on that code. If the review has findings, they are fixed first, in
   their own commit.
1. **What enters the balances:** only a cost whose money story is complete (§3: split, adds up,
   children covered, everything paid has a payer, paid exactly the price). Everything else waits,
   named — **recommended**. The alternative counts paid parts as they come in, which means guessing
   how a part payment divides between the people who share the cost.
2. **Not-split costs:** outside the balances, shown as one collapsed line so that a trip which never
   splits doesn't look broken — **recommended**. The alternative treats a not-split cost as the
   payer's own, which would quietly turn *unknown* into a decision.
3. **Migration 009 as in §6** (one table, additive), built on **`phase-3d1`** with 3D-1/3D-2 and
   waiting for the trip, emulators only — to approve.
4. **Settling more than the suggestion:** allowed after a warning, because the record is a fact —
   **recommended** — or refused. Either way, a settlement that would leave a child owing is refused.
5. **Where:** a third view, *Settle up*, on the Expenses tab, shown on trips with two or more people
   — **recommended** — or a separate screen opened from the trip total.
6. **Privacy:** the PDF unchanged (no names, no balances). Names leave the phone only in the share
   text, and only when the person taps *Share* — **recommended**. An opt-in for the PDF can come later
   if wanted.
7. **Test build:** the same debug-signed, debuggable build on the emulator `TO_2B_Test` only, for the
   database diff, as approved for 3D-1 and 3D-2 — to approve.

### 11.1 The owner's answers (2026-10-22, on revision 1)

0. **The 3D-2 review has not fully passed.** The corrective commit was inspected, but its domain and
   repository behaviour still needs independent verification. That is a gate (F), not a formality.
1. **Complete costs only — approved for v1.** Recorded deposits and partial payments must stay
   clearly visible elsewhere. Exclusion from settle-up must not hide them (A).
2. **Not-split costs outside the balances — approved**, collapsed, with an explanation and access to
   the costs. Never assume the payer bears the whole cost.
3. **Migration 009 — acceptable in principle, not approved for implementation.** First the review
   findings and this update. Additive, history preserved, both 8 → 9 and 6 → 9 tested.
4. **Over-settlement — approved: warn and allow.** Show the resulting balances before confirming;
   never silently create a child debtor. A settlement in a currency with no eligible costs is clearly
   flagged (B).
5. **Settle up as the third view under Expenses**, on trips with two or more people — approved.
6. **Privacy — approved.** No balances or names in the PDF; sharing needs an explicit action.
7. **Emulator — approved:** the debug-signed, debuggable build on `TO_2B_Test`, synthetic data only.
   No physical phone, no real data, no personal backup.

Refinements A–F were required. In this revision, A is in §3 and §5, B in §3, §4, §6 and §7, C in
§6, D in §3 and §5, E in §7, and F is the status note at the top. On real data, the owner says: if a
change is a risk to the phone's data, it waits for the trip, separate from `main`. This is applied
in the status note.

## 12. Remaining contradictions (for the owner)

### 12.1 Settlements made before a cost is complete — **needs an answer**

*Complete costs only* (Q1) and *settlements are facts* (Q4) clash in one ordinary case. Ana pays a
EUR 250 hotel deposit of EUR 100, and Ben gives Ana EUR 50 straight away for his half of it. The
hotel waits (EUR 150 to pay), so it is not in the nets, but Ben's settlement is. The nets read
**Ben +50 · Ana −50**, and the suggestion would be *Ana pays Ben EUR 50*. That is a false debtor,
which the exit criteria forbid. A cost that was complete when someone settled and later stops being
complete (a price edit, a removed split) does the same.

Neither fix bends a rule:
- **(a) Recommended: no suggestions while costs wait.** In a currency where any cost waits for a
  reason other than *not split*, the nets are shown under *Balances so far — 2 costs not included
  yet*, with the waiting list directly under them. No transfers are suggested, only *Suggestions
  appear once these are complete*. Settlements can still be recorded by hand. This holds back
  suggestions only in that currency. At the end of a trip, once everything is paid and split, they
  appear. Before the trip, *To pay* bookings keep them hidden, which is fair, because nothing is
  owed between people for a booking nobody has paid yet.
- **(b) Suggestions always, labelled provisional.** More convenient during the trip, but it can
  suggest the false transfer above, with only a label to say it is not final. The owner's rule *do
  not present partial balances as complete financial obligations* argues against it.

### 12.2 Points checked and found consistent — no answer needed

- **Live equal splits and *Covered by* vs recorded settlements.** A price change or a new *Covered
  by* changes the nets after a settlement. This is by design: 3D-2 Q2 made equal splits and covers
  live, settlements stay as recorded, and the nets are worked out again. It can produce an
  over-settlement (§7) or a child below zero (§7, E), and both are handled without changing a
  record.
- **Children as payers** (3D-1 known limitation) are kept. A child can be owed but is never shown as
  owing (E).
- **`main` and real data.** Migration 009 is additive, but any migration runs on the phone's real
  database at install, so it waits on `phase-3d1` with 007 and 008. No 3E change needs anything on
  `main`.
- **Review independence (F).** The review of `a44dd6d` should not be done by the session that wrote
  it. It can be done in a separate conversation (as before) or by a fresh review agent in this one
  if the owner asks. Either way, findings are fixed in their own commit before 009 is written.
