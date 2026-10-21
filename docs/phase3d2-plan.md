# Phase 3D-2 — who a cost is for, and who covers a child: plan

Written 2026-10-21 on the branch `phase-3d1` at `57535ff` (0.14.0, schema 7), after the 3D-1
corrective pass. It turns `MASTER_ROADMAP.md` §8 and `phase3-plan.md` §§6–7, 9, 11 and §15 *7*, *9*
into an exact proposal. **Nothing here is built.** It needs migration 008, which the data-safety
rules say is explained and agreed before it is written, so implementation starts only after the
owner approves this plan (§11 lists the questions).

Where this plan and `phase3-plan.md` §§7–9 or 12 differ, this plan is the proposal and those are
history. The drafted `cost_shares` there (CASCADE to travellers' rows not checked against the trip,
weights, one table for payments and shares) is replaced by §5.

## 1. Scope

**In 3D-2:**
- **Split** a cost: who a booking or a standalone expense is *for*, equally or by exact amounts.
  *Not split* stays the default for everything, old and new.
- **Covered by:** for each child on a trip, the adult or adults who cover the child's share by
  default; a per-cost override on the child's share.
- The **unallocated** state, shown wherever it applies: a cost nobody split, a child nobody covers.
- The **removal flow** for a traveller who has money on the trip (§15 *9*): what blocks it, listed,
  with one explicit way to resolve each record. Nothing moved or deleted by itself.
- *Paid by* on the **quick expense sheet** (carried over from the 2026-10-19 roadmap; 3D-1 put it
  on the full form only): *Not recorded* unless picked, the last payer offered.
- Migration 008, backup format 9, trip archive rowFormat 9, the release rehearsal.

**Not in 3D-2:** balances, *who owes whom*, settlements (3E); weighted/proportional splits (Q1);
refunds; currency conversion; splitting a payment or a linked expense (§3); names or shares in the
PDF.

## 2. Words, kept apart on every screen

| On screen | Means | Stored |
|---|---|---|
| **Going** | Takes part in a booking (3B) | `item_participants` |
| **Paid by** | Handed the money to the vendor (3D-1) | `booking_payments.payer_id`, `expenses.payer_id` |
| **Split between** / **For** | Whose cost it is: their share | `cost_shares` (new) |
| **Covered by** | The adult who bears a child's share | `trip_cover` (new) default, `cost_shares.covered_by` override |

None is derived from another. *Split between who's going* is a one-tap **fill** of the split from
*Going*, shown before saving; it never happens by itself and never follows later changes to *Going*.

## 3. What can be split

| Record | Split? | Why |
|---|---|---|
| A **booking** with a price, confirmed or cancelled-and-counted | **Yes** | Its price is the cost |
| A **standalone expense** | **Yes** | It is a cost of its own |
| A **saved place** (idea) | No | A budget, not a cost (`phase3-plan.md` §11) |
| A **payment against a booking** / a **linked expense** | No | Not a cost: the booking's split covers it (3D-1, L-4) |
| A booking **without a price** | No | Nothing to split |

A cancelled booking that does not count (refundable, or refund not set) keeps its split, shown as
*not counted*, like its payments in 3D-1.

## 4. The split, exactly

**Two modes** (Q1), told apart by the rows themselves:
- **Equally** — every share row has `amount NULL`. The amount is computed from the *current* cost:
  `floor(total / n)` each, then the leftover minor units one each to the first shares in the split's
  order (`sort_order`, the trip's member order when the split was made). EUR 10.00 / 3 →
  3.34 · 3.33 · 3.33. Σ shares = total, always (property-tested).
- **By amounts** — every row has an `amount`. They must add up to the total **when saved**, or the
  save is refused with the difference: *EUR 2.00 left to split* / *EUR 2.00 more than the price*.
  A share of 0 is allowed (someone who came along free).
- **Mixed rows are refused** by the repository.
- **From prices (fill):** on a booking whose 3C price lines carry *Adult / Child / Anyone*, *Fill
  from prices* proposes amounts: each person line's unit amount to one person of that audience on
  the trip (adults to adults, children to children, *Anyone* to the rest, in member order); a group
  price or an extra divided equally among those ticked. The person sees and can edit every amount
  before saving; what is saved is a split **by amounts**. When the lines and the people do not
  match (two child lines, one child ticked), nothing is filled and it says why.

**When the cost changes later** (Q2):
- **Equally** follows the new price: nothing stored changes, the shares are recomputed.
- **By amounts** stays as saved and is shown as not matching: *Split adds to EUR 90.00 · price
  EUR 100.00 · EUR 10.00 not allocated*. Editing the price asks first (*The split no longer adds
  up — save anyway?*), like 3D-1's overpaid warning. Nothing is rescaled by itself.
- **Currency:** shares are in the cost's currency. A price or expense currency change is refused
  while a split *by amounts* exists (the amounts would silently mean another currency); an equal
  split simply follows it.

**A child's share**, per share row, resolved in this order (invariant D):
1. the share's own **override** (`covered_by`), if set;
2. otherwise the trip's **Covered by** for that child (one or more adults; several share it equally,
   leftover cents by their order) — read *live*, so setting it later applies to every share without
   an override (Q2);
3. otherwise **unallocated**: *Mia EUR 30.00 — not covered · Set who covers Mia*.

A child is never shown as owing anything. *Covered by* is offered only for members whose **trip**
classification is *child*; a member reclassified as adult on the trip has their shares as their own
again, and a saved *Covered by* row stays dormant until they are a child again. *Not specified*
people are never assumed to be children or adults: their shares are their own, and no *Covered by*
is offered (Q3).

**Unallocated** is a reading, never stored: a cost with no split (*Not split*), the part of a split
by amounts that does not add up, a child's share with nobody covering it. 3E will list it; 3D-2
shows it on the cost itself.

## 5. Migration 008 — exact DDL [for approval]

Schema 7 → 8. Additive: two new tables, **no existing table altered, no row written**.

```sql
-- Whose cost a booking or a standalone expense is. One row per person; no rows = not split.
CREATE TABLE cost_shares (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
  expense_id   TEXT REFERENCES expenses(id)   ON DELETE CASCADE,
  traveller_id TEXT NOT NULL,
  amount       INTEGER CHECK (amount IS NULL OR amount >= 0),  -- NULL: an equal part
  covered_by   TEXT,                                           -- NULL: the trip's Covered by
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK ((trip_item_id IS NULL) <> (expense_id IS NULL)),
  CHECK (covered_by IS NULL OR covered_by <> traveller_id),
  -- Members of this trip, checked by the database (NO ACTION: at the end of the statement).
  FOREIGN KEY (trip_id, traveller_id) REFERENCES trip_travellers(trip_id, traveller_id),
  FOREIGN KEY (trip_id, covered_by)   REFERENCES trip_travellers(trip_id, traveller_id)
);
CREATE UNIQUE INDEX ux_cost_shares_item    ON cost_shares(trip_item_id, traveller_id) WHERE trip_item_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cost_shares_expense ON cost_shares(expense_id, traveller_id)   WHERE expense_id IS NOT NULL;
CREATE INDEX idx_cost_shares_member ON cost_shares(trip_id, traveller_id);
CREATE INDEX idx_cost_shares_cover  ON cost_shares(trip_id, covered_by);

-- Who covers a child's share on a trip by default. Several rows: they share it equally.
CREATE TABLE trip_cover (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL,
  adult_id   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, child_id, adult_id),
  CHECK (child_id <> adult_id),
  FOREIGN KEY (trip_id, child_id) REFERENCES trip_travellers(trip_id, traveller_id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id, adult_id) REFERENCES trip_travellers(trip_id, traveller_id) ON DELETE CASCADE
);
CREATE INDEX idx_trip_cover_adult ON trip_cover(trip_id, adult_id);
```

| Point | Answer |
|---|---|
| **Membership in the database** | 3D-1 checks a payer's membership in the repository (invariant P). Here the composite keys to `trip_travellers(trip_id, traveller_id)` — its primary key — make the database refuse a share or a *Covered by* for anyone not on that trip. Verified on a scratch database over migrations 001–007 (2026-10-21) |
| **Removing a member** | NO ACTION on the share keys: someone who has a share, or covers one by override, cannot leave the trip alone — the repository refuses first with the reason (§7), the database is the last word. A *Covered by* default is a setting, not a record: it goes with the adult or the child (CASCADE), and the removal's confirmation says so (*Mia's share will be not covered*) |
| **Deleting a booking or an expense** | Its split goes with it (CASCADE) — a split is part of the cost, not money that moved (Q4). The confirmation names it. A booking with payments is still refused by 3D-1's NO ACTION |
| **Deleting a whole trip** | Everything goes; verified: no orphans, `foreign_key_check` empty. The confirmation adds the splits to 3D-1's count |
| **Deleting a profile** | Already refused while it is on any trip (`trip_travellers` RESTRICT), so a share can never point at a deleted profile |
| **Why not a column on `trip_travellers`** | A `covered_by` column could only reference `travellers(id)` (ALTER cannot add a composite key), so membership would be the repository's job, and "both parents" would need a second column. A new table needs no rebuild of a table that holds real data |
| **Why no `mode` column** | Equal and by-amounts are told apart by `amount IS NULL`; a stored mode could disagree with the rows |
| **Old columns** | `expenses.split`, `paid_by` and the name-based `payments` stay untouched and unread (§15 *7*) |
| **Existing rows** | None written. Every booking and expense reads *Not split*; nobody is *Covered by* anyone (invariant G) |
| **Rollback** | Forward-only, like 002–007. The phone install waits (§10) |

## 6. Rules enforced on save (domain + repository, inside the write's transaction)

`MoneyRuleError` with the explanation, as in 3D-1. Each is a pure function in `src/domain/` first.

| Write | Refused when |
|---|---|
| Save a split | The cost cannot be split (§3); a person is not on the trip; the same person twice; rows mixed equal/amounts; amounts do not add up to the total. Shares take the cost's currency; there is no currency input |
| Override *Covered by* on a share | The share is not a child's; the adult is not on the trip, or is the child |
| Set a trip's *Covered by* | The child is not a child on this trip; an adult is not on it |
| Link an expense to a booking (3D-1) | The expense has a split: *This expense is split between 3 people. A payment for a booking is split with the booking — remove this split first* |
| Make a split booking an idea, clear its price | Refused, like with payments (*A split booking stays a booking*) |
| Change the currency of a cost split by amounts | Refused (§4) |
| Change a split cost's amount | Allowed; by amounts asks first (§4) |
| Remove someone from the trip | §7 |

## 7. Removing someone with money on the trip (§15 *9*)

*Remove from trip* first asks the repository what holds them (one query per kind):

> **Ana can't leave Lapland yet**
> She is on money records of this trip. Nothing is deleted or moved for you — open each one:
> - Paid by Ana · Hotel Aurora · EUR 100.00 → *Change who paid*
> - Share · Husky safari · EUR 75.00 → *Take Ana out of this split*
> - Covers Mia's share · Taxi · EUR 3.00 → *Change who covers*

- Every line opens that record's own screen; no bulk *move everything to Evelina*.
- *Take Ana out of this split*: an equal split re-divides among the rest, the new amounts shown
  before saving; a split by amounts is opened for editing, since the amounts must add up again.
- *Change who paid* may set *Not recorded* — the person's explicit edit, as in 3D-1.
- When nothing holds them, the removal goes ahead as today (participation removed, profile kept).
  If they are someone's default *Covered by*, the confirmation names who becomes not covered.
- The trip form's untick (`updateTripWithMembers`) gets the same refusal, listing the same records.

## 8. Screens

- **Booking detail:** a **Split** section under *Payments* — *Not split · Split it* when none; else
  one line per person: *Evelina EUR 33.34 · Ana EUR 33.33 · Mia EUR 33.33 — covered by Evelina*,
  and *not counted* / *does not add up* where §4 says. Hidden on ideas and unpriced bookings.
- **Split screen** (`app/split/…`, for a booking or an expense): *Equally* / *By amounts*; the trip's
  members as ticks with live amounts; *Split between who's going* (bookings with participants);
  *Fill from prices* (§4); per child share *Covered by: Evelina (trip) · change*. *Remove split*.
- **Expense form:** a **Split** row (*Not split* / *Equally between 3* …) opening the same screen;
  disabled with the reason while *For a booking* is set.
- **Quick expense sheet:** *Paid by* chips (*Not recorded* selected, last payer offered); no split
  (that stays on the full form).
- **Trip travellers:** for each child, **Covered by**: adults of the trip as chips, several allowed
  (Q3), *Not set* by default.
- **Expenses tab:** a split expense row shows *Split 3 ways*; nothing else changes — per-person
  totals are 3E.
- **PDF / share text / 2C / 2D:** unchanged; no names, no shares (tests assert it).

## 9. Backup, archive and other formats

| | Change |
|---|---|
| Full backup | **Format 9**: `costShares`, `tripCover`. Formats 1–8 restore with both empty (Zod defaults). A format-9 file is refused by 0.14.0 and older (existing rule) |
| Trip archive (2B) | **rowFormat 9**: both tables trip-owned; `planTripImport` gives shares new ids and maps `traveller_id` / `covered_by` / `child_id` / `adult_id` through the traveller choices; `checkTripArchive` refuses a share or cover naming someone not on the archived trip. Two archive travellers linked to one profile here: their shares on one cost would collide — the preview refuses that choice with the reason rather than merging amounts |
| Restore *replace* / whole-trip delete | Shares and covers go with the trip, in one statement |
| 2C / 2D | Unchanged: never write or read shares or covers |

## 10. Branch, version, tests, verification

- **Branch `phase-3d2`, from `phase-3d1`.** 3D-1 stays reviewable on its own; `main` stays at
  0.13.0; **no phone install until after the owner's trip** (owner, 2026-10-21) and then only with
  the separate approvals for the backup, the structure-only check and the rehearsal. **0.15.0**,
  versionCode 22.
- **Node (synthetic only):** migration 008 over synthetic schema-7 databases carrying 3D-1 money
  records and legacy `split`/`paid_by`/`payments` values — every old row identical, no new row,
  idempotent, a failed batch leaves 7; the composite keys (§5 probe, as tests); `sharesOf`
  exactness (property test: Σ = total for random totals and 1–12 people), the fill from prices,
  child resolution (override → default, several adults, dormant when reclassified → unallocated);
  every §6 refusal leaving every table byte-identical; the §7 listing; a failure injected mid-save
  rolls back the whole split; backup 9 round trip and 1–8; archive rowFormat 9 remap and the
  collision refusal; 2C/2D carry nothing; PDF unchanged.
- **Emulator E2E** (as 3D-1): debug-signed debuggable build on `TO_2B_Test` for the 7 → 8 database
  diff (approved for 3D-1, asked again here — Q5); synthetic families (solo; 2 adults + 1 child;
  2 adults + 3 children with two different covering adults; a child covered by both); every §6/§7
  case through the UI; 360 dp, font 2.0, dark; then release `install -r` 0.14.0 → 0.15.0 on
  `Pixel_10_Pro` with every screen captured before/after identical, and 0.14.0 refusing format 9.

### 10.1 Worked examples

| Case | Split | Reads |
|---|---|---|
| Safari EUR 90, Evelina + Ana + Mia (child, covered by Evelina), equally | 30 · 30 · 30 | *Evelina 30 · Ana 30 · Mia 30 — covered by Evelina* (3E: Evelina bears 60) |
| Same, Mia covered by Evelina **and** Ana | 30 · 30 · 30 | *Mia 30 — covered by Evelina and Ana* (3E: 15 each) |
| Same, nobody covers Mia | 30 · 30 · 30 | *Mia 30 — not covered · Set who covers Mia* |
| Taxi EUR 10.00, three adults, equally | 3.34 · 3.33 · 3.33 | the first in member order gets the extra cent |
| Museum EUR 100: lines *Adult 2 × 40*, *Child 1 × 20*, filled from prices | 40 · 40 · 20 (by amounts) | price later changed to 110 → *does not add up · EUR 10.00 not allocated* |
| Booking with a EUR 100 deposit by Ana, split equally | unchanged by the payment | *Paid by* and *Split* shown separately; who owes whom is 3E |

## 11. Questions for the owner (recommendation first)

1. **Split modes:** *Equally* and *By amounts*, with *Fill from prices* writing amounts you can edit
   — **recommended** — or also *By shares/weights* (2 : 1) now.
2. **When things change later:** an equal split follows the current price and the trip's current
   *Covered by*; a split by amounts and a per-share override stay exactly as saved and show when
   they no longer add up — **recommended** — or snapshot everything when saved.
3. **Covered by:** one **or more** adults per child for the trip (several share it equally), and a
   one-adult override per cost; *Not specified* people are never treated as children —
   **recommended** — or exactly one adult per child.
4. **Deleting a split booking or expense:** the split goes with it, named in the confirmation —
   **recommended** (a split is part of the cost, not money that moved) — or blocked like payments.
5. **Migration 008 as in §5**, built on `phase-3d2` from `phase-3d1`, emulator only (debug-signed
   test build on `TO_2B_Test` as for 3D-1), no phone install until after the trip — to approve.
