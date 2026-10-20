# Phase 3 — Travellers, pricing & shared expenses: architecture and data-safety audit (3A)

Written 2026-10-20 against `0bdca7c` (0.11.0, versionCode 18, `main`, clean, in sync with
`origin/main`; schema `user_version` 6; 1119 tests). **Audit only** — no application code,
migration, version or build was changed to produce it. Nothing is built until the owner approves it
and answers §14.

Every statement is marked **[Confirmed]** (read in the code at that commit, file given),
**[Proposed]**, or **[Verify]** (an assumption to check before building on it).

**Reviewed by the owner 2026-10-20: the five stages are approved with refinements — §15 records
every decision and supersedes §§7–14 where they differ. §16 is the 3B design as built.** Each stage
is implemented and verified on its own, and the next one starts only when the owner approves it.
**§18 is the owner's later answers on 3C scope and 3D-1 linking (2026-10-20), and supersedes §17
where they differ. §19 is the 3C pre-coding schema check.**

---

## 1. Architecture inventory (what Phase 3 touches)

| Layer | Files |
|---|---|
| Schema | `src/db/migrations/001…006`, `index.ts` (`LATEST_VERSION` = 6, each migration + `user_version` in one transaction) |
| Domain | `tripItem.ts` (price fields, `tripItemInputSchema`, `pricingMatches`), `pricing.ts` (rate lines, `suggestPricingLines`), `bookingCosts.ts` (what counts as spent, paid/to pay, refundability), `spending.ts` (expenses, totals by currency/category, `tripTotals`), `journey.ts` (price on the first leg), `traveller.ts` (classification, legacy names), `itineraryHtml.ts` (PDF costs appendix), `export.ts` / `tripArchive.ts` (row schemas), `activityFormat.ts` (2C price import/export), `planningContext.ts` (2D) |
| Repositories | `tripItems.ts`, `travellers.ts` (members, participants, Me, legacy conversion), `expenses.ts`, `backup.ts`, `tripImport.ts`, `activityImport.ts`, `planningContext.ts` |
| Screens / features | `features/items/ItemForm.tsx`, `PriceSection.tsx`; `app/item/new.tsx`, `[itemId]/edit.tsx`, `[itemId]/index.tsx`; `app/trip/[tripId]/travellers.tsx`; `features/expenses/*` (`BookingsView`, `SpendingView`, `ExpenseForm`, `QuickExpenseSheet`, `TripTotal`, `CategoryBreakdown`); `app/trip/[tripId]/(tabs)/expenses.tsx`, Overview, Timeline; `ItemRow`, `PaymentTag` |

## 2. Schema and relationships today [Confirmed]

```
trips ──< trip_items (price_amount INTEGER, price_currency, is_paid 0/1, details JSON)
  │          └──< item_participants (item_id CASCADE, traveller_id RESTRICT)
  ├──< trip_travellers (trip CASCADE, traveller RESTRICT, classification adult|child|unspecified)
  ├──< expenses (category, label, amount > 0, currency, spent_on, notes, paid_by TEXT, split TEXT)
  │          └──< resources (receipts: trip_id + expense_id)
  ├──< payments (from_name TEXT, to_name TEXT, amount > 0, currency)
  └── trips.travellers (legacy JSON names), trips.converted_travellers (005)
travellers (global: name, sort_order, classification)      settings.me_traveller_id → travellers.id
lists ──< list_items ──< list_item_recipients (both CASCADE)
```

- `expenses.paid_by`, `expenses.split` and the whole `payments` table: **no code reads or writes
  them** (`grep` over `src`/`app`: only migration 002, the backup row schemas, `filterTablesForTrip`
  and the trip archive carry them). The expense UPDATE "leaves paid_by and split alone"
  (`queries.ts` ~597). `payments` names people by **free text**, from the N5 spec, written before
  traveller profiles existed (migration 003).
- **Not assumed empty** (owner, §15 *9*): that no code writes them does not mean real data has
  none — a hand-edited or future backup could. Migration 007 must leave any value in them exactly
  as it is, and is designed and tested on **synthetic** databases that include unexpected non-null
  `paid_by`/`split` and `payments` rows. No real backup is requested or inspected at this stage.
- `expenses.amount > 0`: a refund or negative adjustment cannot be stored as an expense today.

## 3. Travellers today

| Question | Today [Confirmed] |
|---|---|
| New activity | `app/item/new.tsx` passes no `defaultParticipants` → **nobody ticked**; none = *not specified* (D33) |
| Edit | `edit.tsx` loads the item's participants; `ItemForm` keeps only those who are still trip members (`defaultParticipants.filter(id ∈ travellers)`), and **every save rewrites** the set (`writeItemParticipants`: delete all, insert) |
| Joining a trip | `addTripTraveller` / `createTripTraveller` add a membership only; no activity changes |
| Same person twice | Not on one trip (PK `(trip_id, traveller_id)`), not twice on one item (PK). **Two profiles with the same name** are allowed (told apart by their trips in 2B's mapping). Legacy typed names are deduplicated for display only (`tripPeopleLine`) |
| Removed from a trip | `removeTripTraveller` deletes the membership **and the person's participation in every item of that trip** in one transaction; the confirmation says *"unlinked from its bookings"*. Trip list recipients stay (*For Mia* though Mia left) |
| Deleting a profile | Refused while any trip or item uses it (RESTRICT + `travellerUses`); Me cannot be deleted |
| Me | `settings.me_traveller_id`; new trips start with Me ticked; never in a trip archive |
| Backups / archives | All of the above round-trip (format 6); 2B maps travellers new-or-linked |

**Historical-data risks found:**
1. Removing someone from a trip **erases** their past participation — by design and stated, but
   Phase 3 makes participation feed money; it must not erase financial records (§7, §11 *H*).
2. An edit rewrites participants; harmless today (same set), but once 3B pre-selects people on
   *new* items, Edit must keep loading the saved set and never apply the new-item default.
3. The C3 price breakdown is keyed to participants only by a *suggestion* (`suggestPricingLines`)
   and an explicit button — nothing changes a price when participants change [Confirmed,
   `PriceSection.tsx` ~130–250: *"Priced for 3; 4 are going"* + **Price for 4**].

## 4. Pricing today [Confirmed]

Flow: `PriceSection` → `tripItemInputSchema` (`priceAmount` int ≥ 0, currency 3 letters, `pricingMatches`)
→ `tripItemWriteValues` → `trip_items.price_amount/price_currency/is_paid` + `details.pricing` →
`bookingCosts` (Expenses *Bookings*, `TripTotal`) / `ItemRow` / `PaymentTag` / PDF `costsHtml` /
backup rows / 2B archive rows / 2C (`activityFormat`: total + currency in, total out; never paid) /
2D (never).

| Question | Answer |
|---|---|
| What the total is | `price_amount`: the item's **whole** price in minor units, one currency. *The* number every cost reads (FB-14) |
| Stored or calculated | **Stored.** With a breakdown (`details.pricing = {mode:'perPerson', lines:[{label?, quantity, unitAmount}]}`) the total is computed in the form and stored; the save is refused if they disagree. A plain total has no breakdown |
| Participants change | Nothing changes; the form only offers **Price for N** |
| Price change vs paid | `is_paid` is one flag; there is **no paid amount**. Editing the price of a paid item keeps *Paid* — the new total is then "paid" too. No history of the old price |
| Into Expenses | **Derived**, never copied: `countsAsSpent` = confirmed with a positive price, or cancelled and explicitly non-refundable; `tripExpenses` sums by currency, paid vs to pay; `tripTotals` = bookings + spending per currency |
| Twice? | **Yes, possible**: nothing links an expense to a booking. Logging the husky safari as an *Activities* expense after booking it counts it twice. Journeys avoid it by pricing the first leg only (U7) |
| Unused fields | `expenses.paid_by`, `expenses.split`, `payments` (all); `trips.traveller_count` (column, unused since profiles); `list_items.traveller_id` (legacy since 006) |
| Rounding | None needed today: integers only, no division |
| Missing / zero | NULL = no price; 0 = free (never *To pay*, FB-1); idea prices are budgets (not spent) |
| Labels | Rate labels are free text (*Adult*, *Child* suggested), **not tied** to classification |

## 5. Expenses, payments, responsibility today [Confirmed]

| Concept | Represented? |
|---|---|
| **Cost** | Yes: `trip_items.price_amount` (bookings), `expenses.amount` (spending) |
| **Participant** | Items only (`item_participants`); expenses have none |
| **Payer** | **No** (`paid_by` unused; `is_paid` says *paid*, not by whom or how much) |
| **Responsible person** | **No** |
| **Settlement** | **No** (`payments` unused, names as text) |

So the €90 family example (A pays, A and B bear, child C's share borne by A or B) **cannot be
represented** today. Deposits and partial payments cannot either (`is_paid` is binary). Currencies
are never added together (per-currency lines everywhere).

## 6. Financial invariants (refined)

| | Invariant | Conflicts today? |
|---|---|---|
| **A** | Nothing recorded as paid changes unless the person edits that payment. A price edit never changes an amount paid. | `is_paid` ties "paid" to the current price: **conflict** → paid amounts become records (§8) and the legacy flag keeps its old meaning |
| **B** | Each money movement counts once. A booking's cost is its price; payments towards it are not expenses; an expense is spending not tied to a booking. | Possible today via a duplicate expense: **warn**, don't merge (§9) |
| **C** | Participation ≠ cost share ≠ payment. | Holds (none of the money parts exist yet) |
| **D** | A child is never a debtor. A child's share is borne by the expense's override, else the trip's responsible adult for that child, else it is **unallocated** and shown so. | — |
| **E** | Shares sum exactly to the amount. Equal splits: floor per person, the leftover minor units go one each in the shares' stated order (largest remainder); weighted splits the same; exact amounts must sum or the save is refused. | — |
| **F** | Never add currencies; balances per currency (Phase 4 converts). | Holds |
| **G** | Unknown stays unknown: no payer, share, responsible adult or paid amount is invented — for old rows **never**, for new ones only as a visible, editable form default. | — |
| **H** | Provenance: every record keeps its trip, item/expense and people through backups, archives (new ids, same relationships) and restores; formats 1–6 still restore meaning "nothing recorded". | — |
| **I** *(new)* | Leaving a trip never erases money: a member with payments, shares or settlements in the trip cannot be removed until those are moved (participation alone still goes, as today). | Removal deletes participation today — fine; money is new |
| **J** *(new)* | Balances are derived, never stored. | — |

## 7. Proposed domain model [Proposed]

Two things that cost money — a **booking** (`trip_items` with a price) and an **expense** — get the
same three money facts, each its own records:

1. **Paid** — `cost_payments`: who paid how much, when, towards which booking or expense.
   A deposit and the balance are two rows. An expense with no row has an **unknown payer**.
2. **Borne by** — `cost_shares`: for whom a cost is (a traveller per row), with an optional exact
   amount or weight, and an optional **responsible override** (*Mia's share is Evelina's*). No rows =
   **not split** (shown as *unallocated*, never as "everyone").
3. **Settled** — `settlements`: money between two travellers, per currency, never linked to a cost.

Per trip, `trip_travellers.responsible_traveller_id` names the adult who bears a child's share by
default (any member; the UI offers adults). Participation (`item_participants`) is **only** a
suggestion source for *Borne by* (one tap: *Split between who's going*), never a share by itself.

Pricing stays where it is: `price_amount` the total; `details.pricing.lines` gain an optional
`for: 'adult' | 'child' | 'any'` (absent = old free label, unchanged meaning). Suggestions from
participants stay suggestions.

**Legacy meaning, kept exactly:** `is_paid = 1` with no payment rows reads *Paid — amount and payer
not recorded*; `is_paid = 0` with no rows reads *To pay* as now. Once a booking has payment rows,
paid/to-pay is computed from them (`sum(payments)` vs `price_amount`: *To pay EUR 60 of EUR 90*,
*Overpaid EUR 10*), and the form keeps `is_paid` in step only when the person says *fully paid*.
**[Decision 6]**

Balances (3E, pure): per currency, per traveller: `paid − borne + settlements received − sent`;
children's borne amounts roll up to their responsible adult (override → trip default → unallocated);
the sum over people + unallocated is zero; *Settle up* suggests the fewest transfers (greedy) and
recording one writes a `settlements` row.

## 8. Proposed migration 007 [Proposed — not written]

Current `user_version` **6**. One additive migration, no table rebuild, no existing value changed:

```sql
-- Who paid how much towards a booking or an expense. Exactly one owner; amount > 0.
CREATE TABLE cost_payments (
  id                TEXT PRIMARY KEY,
  trip_id           TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id      TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
  expense_id        TEXT REFERENCES expenses(id)   ON DELETE CASCADE,
  payer_id          TEXT REFERENCES travellers(id) ON DELETE RESTRICT,  -- NULL = payer unknown
  amount            INTEGER NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL,
  paid_on           TEXT,                                               -- YYYY-MM-DD, NULL = unknown
  note              TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK ((trip_item_id IS NULL) <> (expense_id IS NULL))
);
-- For whom a cost is. amount XOR weight XOR neither (= equal part).
CREATE TABLE cost_shares (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id   TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
  expense_id     TEXT REFERENCES expenses(id)   ON DELETE CASCADE,
  traveller_id   TEXT NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
  amount         INTEGER CHECK (amount IS NULL OR amount >= 0),
  weight         INTEGER CHECK (weight IS NULL OR weight > 0),
  responsible_id TEXT REFERENCES travellers(id) ON DELETE RESTRICT,     -- override for this share
  sort_order     INTEGER NOT NULL DEFAULT 0,
  CHECK ((trip_item_id IS NULL) <> (expense_id IS NULL)),
  CHECK (amount IS NULL OR weight IS NULL)
);
CREATE UNIQUE INDEX ux_cost_shares ON cost_shares(COALESCE(trip_item_id, expense_id), traveller_id);
-- Money between travellers.
CREATE TABLE settlements (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_id      TEXT NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
  to_id        TEXT NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  currency     TEXT NOT NULL,
  settled_on   TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL,
  CHECK (from_id <> to_id)
);
-- The adult who bears a child's share on this trip, unless an expense says otherwise.
ALTER TABLE trip_travellers ADD COLUMN responsible_id TEXT REFERENCES travellers(id) ON DELETE RESTRICT;
-- + indexes on (trip_id), (trip_item_id), (expense_id), (payer_id/traveller_id/from/to)
```

| Point | Answer |
|---|---|
| Why each | Multiple payers and deposits need rows, not a column; shares need one row per person for foreign keys and per-share overrides; settlements need traveller ids (`payments` has names); the default responsible adult is per trip and per child |
| Why not reuse `paid_by` / `split` / `payments` | Text, one payer, no FKs; `payments` keyed by names. They stay **untouched** (unused, still exported) so nothing old changes meaning **[Decision 7]** |
| Why not `details` JSON | No foreign keys: a deleted or remapped traveller would leave dangling ids, and 2B's remap would need JSON surgery |
| Existing rows | **None written**. No payer, share, settlement or responsible adult is created for anything existing (invariant G). `is_paid` untouched |
| Rollback | Forward-only like 002–006; the tables are empty until used. [Confirmed, `client.ts` `migrate`: `if (current >= LATEST_VERSION) return`] an older build would open a v7 database without migrating and simply ignore the new tables — but Android refuses to install a lower versionCode over a higher one without uninstalling, which the data-safety rules forbid, so there is no in-place downgrade. The safety net is the pre-install Drive backup and restoring it into the newer app |
| Full backup | Format 7 adds the three tables and the column; formats 1–6 restore with them empty / NULL (Zod defaults, as before); a format-7 backup is refused by an older app (existing rule) |
| Trip archive (2B) | `rowFormat` 7; the new rows are trip-owned; `planTripImport` remaps their ids and every traveller id through the traveller choices; `checkTripArchive` adds the references; travellers referenced only by money rows are included like participants |
| Tests | Node: migration 007 over synthetic version-6 databases shaped like the phone — **including non-null `paid_by`/`split` and `payments` rows** — every old row byte-identical after; new tables empty; idempotent; a failed batch leaves version 6; FK closure, cascade on item/expense/trip delete, RESTRICT on profile delete |
| Rehearsal | Exact APK chain on the emulator only: 0.11.0 with a synthetic format-6 backup shaped like the owner's (bookings paid/unpaid, journeys, expenses with receipts, odd legacy `paid_by`/`split`/`payments` values, travellers incl. a child and Me) → `install -r` Phase 3 build → every screen captured before/after identical, Expenses totals identical, export summary identical. **No real backup at this stage.** Before any physical-phone install the owner separately approves backup creation, a structure-only inspection where appropriate, and a rehearsal on an isolated copy |

3B and 3C need **no migration** (§12).

## 9. UI / UX [Proposed]

Progressive: a solo traveller or a trip nobody splits sees today's forms.

- **New activity:** *Who's going* starts with **every current trip member ticked** (a line says
  *All 3 — change*); journeys the same for every leg. **Edit** shows the saved set, never re-defaults.
- **Adding someone to a trip:** after adding, a sheet *Also add Mia to existing plans?* — **off**;
  when on, a list of the trip's plans (upcoming first, ideas excluded) with checkboxes, all
  unticked; *Add to 3 plans*. Nothing changes without that confirmation.
- **Pricing (item form, *Price*):** *One price* (today) · *Per person* (today's lines, now with
  *Adult / Child / Anyone* per line and **Price for who's going** filling quantities from
  classifications — unspecified people as *Anyone*, never assumed adult) · free lines allowed
  (*Child — free*, *Extra: sled 1 × 20*). Total always shown with the working. Idea = *Estimate*
  (label only, as today).
- **Paid (booking):** today's *Paid* switch stays for "fully paid, details unknown". **+ Add a
  payment** (amount defaults to what is left, payer, date) for deposits and real records; the item
  then shows *Paid EUR 30 of 90 · Evelina*.
- **Expense form:** *Paid by* (default **Not recorded**; the last payer offered as a one-tap
  suggestion, never recorded unless picked — §15 *8*) and **Split** collapsed by default (*Not split*); open: *Equally between …*
  (ticks; *Who's going* when linked to a booking), *By amounts*, *By shares*; a child's line reads
  *Mia — covered by Evelina (change)*.
- **Trip travellers:** for each child, *Covered by* (an adult of the trip or *Not set*).
- **Balances (Expenses → Settle up):** per currency: *paid · share · balance* per adult, an
  *Unallocated* line when something has no share or a child has no responsible adult, the suggested
  transfers, **Mark as settled** → a settlement row; history below, deletable.

## 10. Cross-feature impact

| Area | Change |
|---|---|
| Item form / new / edit | 3B defaults; 3C line audience; 3D payments + shares on bookings |
| Trip travellers screen | add-to-plans sheet; *Covered by*; removal blocked with money records (I) |
| Expenses tab | Bookings: paid-of-total; Spending: payer + split line; Settle up view; duplicate warning (B) |
| Overview / Timeline / ItemRow / PaymentTag | paid-of-total wording where payments exist; legacy flag unchanged |
| PDF (`costsHtml`) | optional *paid of total*; never names or balances unless a new opt-in |
| Full backup / restore | format 7 (§8) |
| 2B trip archive | rowFormat 7, remap, references (§8) |
| 2C activity import/export | **unchanged**: never writes payments, shares, payers or responsibility; imported plans get no participants (decision 3) |
| 2D Plan with AI | **unchanged**: reads none of the new tables; a test asserts they never appear |
| Lists, reusable lists, templates | unaffected; recipients stay a separate concept |
| Me | a form default for *Paid by* at most; never an owner, payer of record or debtor by itself |
| Reminders, search, share-to-app | unaffected |

## 11. Edge cases (expected behaviour · supported today?)

| Case | Expected | Today |
|---|---|---|
| One adult alone | No split UI; balances hidden | ✓ (no split) |
| Two adults, 50/50 | Equal shares; balance A +45 / B −45 | ✗ |
| Two adults + one child | Child's share → responsible adult | ✗ |
| Several children, different adults | Each child's share to their own adult | ✗ |
| Child, no responsible adult | Share shown **unallocated**; prompt to set | ✗ |
| Responsible adult not in the activity | Still bears the child's share | ✗ |
| Traveller removed from trip | Participation removed as now; blocked if money records | partly (participation removed) |
| Duplicate names | Distinguished by trips (2B pattern) in every picker | partly |
| Me | Default payer suggestion only | n/a |
| Activity with no participants | *Not specified*; *Split between who's going* disabled | ✓ display |
| Free activity | No cost, never *To pay* | ✓ |
| Fixed group price | One total; split however chosen | ✓ total |
| Adult/child pricing | Lines by audience; quantity from who's going on request | partly (free labels) |
| Different currencies | Separate totals and balances | ✓ |
| Estimated (idea) | Budget, not spent, not split | ✓ |
| Confirmed, unpaid | *To pay*; shares possible | ✓ to pay |
| Paid (legacy flag) | *Paid — not recorded by whom* | ✓ |
| Deposit / partial | Payment rows; *Paid 30 of 90* | ✗ |
| Paid by a non-participant | Allowed; payer ≠ share | ✗ |
| Split among others | Shares independent of participants | ✗ |
| Multiple payers | Several payment rows | ✗ |
| Refund / negative | **Out of scope**: a non-refundable cancellation counts as today; refunds as a later decision | ✗ |
| Imported trip (2B) | Money rows remapped with new ids | n/a |
| Imported AI activities (2C) | No money facts | ✓ |
| Legacy backups (1–6) | Restore with no money facts | ✓ |
| Duplicate expense = booking | Warning, never merged | ✗ (counted twice silently) |
| Missing payer | *Not recorded*; excluded from *paid*, cost still in the total | ✗ |
| Rounding, 3+ people | EUR 10.00 / 3 → 3.34 · 3.33 · 3.33 by stated order | ✗ |

## 12. Phases and dependencies [Proposed]

| Step | Scope | Migration | Depends |
|---|---|---|---|
| **3B** Participation | New-item default (all members), edit preserves, *add to existing plans* sheet (off), duplicates shown with trips, Me consistent | **No** | — |
| **3C** Pricing by audience | Line audience (`for`), *Price for who's going*, free/extra lines, clearer working, estimate label; never auto-recalculated | **No** (`details.pricing`) | 3B (defaults feed suggestions) |
| **3D-1** Money records | Migration 007; backup format 7 + archive rowFormat 7; payments on bookings and expenses (deposits, payer); `is_paid` legacy reading; duplicate warning | **007** | rehearsal plan agreed |
| **3D-2** Responsibility & splits | Shares (equal/amount/weight), *Covered by* per child, per-share override, unallocated state, removal guard | 007 | 3D-1 |
| **3E** Balances & settlements | Settle up view, suggested transfers, settlement records and history, PDF/summary opt-in | 007 | 3D-2 |

Each step its own version, tests, emulator E2E and release rehearsal, and **only when asked**.

## 13. Test plan

**Automated (synthetic only).** 3B: default selection, edit preservation, add-to-plans writes exactly
the chosen items and nothing else (table hashes), Me cases. 3C: audience lines, totals, suggestions
never overwriting, free/extra lines, price edit never changes `is_paid`. 3D: migration 007 from a
phone-shaped v6 database (§8), payments/shares/settlements CRUD in transactions with failure
injection, `sharesOf` exactness (property test: Σ shares = amount for random amounts and 1–12
people), child roll-up and unallocated, legacy `is_paid` reading, duplicate warning, removal guard,
backup format 7 round trip + formats 1–6, archive rowFormat 7 remap (no id reused, FK closure),
2C never writes money rows, 2D never reads them. 3E: `balances` sums to zero per currency, settlements
move both sides, greedy transfers minimal for small sets, no double counting (booking + payment +
linked expense).

**Emulator E2E per step** (as 2B–2D): isolated `TO_2B_Test` with a debuggable build of the same code
and DB diffs; synthetic families (2 adults + 1 child; 2 adults + 3 children with two responsible
adults; solo); every case of §11 through the real UI; 360 dp, dark, font 1.3/2.0, Back; restart;
then the release `install -r` rehearsal over the previous version with a format-6 synthetic backup
shaped like the owner's data, every screen captured before/after identical.

## 14. Decisions for the owner (recommendation first)

*As asked in 3A. The owner's answers are §15; where they differ, §15 wins.*

1. **Phase boundaries:** 3B → 3C → 3D-1 → 3D-2 → 3E as in §12 — **recommended** — or the brief's
   3B/3C/3D/3E with money records and splits together.
2. **New activity default:** every current trip member ticked — **recommended** (brief) — or Me only.
3. **AI-imported activities (2C):** no participants (*not specified*), as now — **recommended** —
   or everyone, like the form.
4. **Adding someone to a trip:** the optional sheet lists the trip's plans with all unticked —
   **recommended** — or one switch *add to all upcoming plans*.
5. **Price lines:** optional audience *Adult / Child / Anyone* on each line, labels kept free —
   **recommended** — or audience replaces labels.
6. **Legacy *Paid*:** `is_paid = 1` without payments means *Paid — not recorded by whom*; once
   payments exist they decide — **recommended** — or convert the flag into a payment row on first
   edit (would invent an amount/payer: not recommended).
7. **Old `paid_by` / `split` / `payments`:** left as they are, unused — **recommended** — or reused
   (text names, one payer: not recommended).
8. **Child's share:** a per-trip *Covered by* adult per child, overridable per expense/booking share;
   without it the share is *unallocated* — **recommended**.
9. **Default payer on a new expense:** last payer on this trip, else Me if a member, else *Not
   recorded* — **recommended** — or always *Not recorded*.
10. **Removing someone with money records in the trip:** refused with the reason until moved —
    **recommended** — or allowed, the records kept and shown as *former member*.
11. **Booking also logged as an expense:** a warning on save (same currency and amount within a few
    days), never merged — **recommended** — or link an expense to a booking explicitly.
12. **Rounding:** largest remainder by the shares' order, documented — **recommended**.
13. **Refunds and negative adjustments:** out of Phase 3 (today's non-refundable cancellation rule
    stays) — **recommended** — or a refund as a negative payment in 3D-1.
14. **Settlements:** a new `settlements` table by traveller id; the old name-based `payments` stays
    unused — **recommended**.
15. **PDF:** costs appendix may show *paid of total*; balances and names never in the PDF unless a
    new opt-in — **recommended**.
16. **Migration 007 as specified in §8** (three tables + one column, additive, nothing backfilled) —
    to approve before 3D-1, after a structure-only check of a fresh owner backup (§2 [Verify]).

## 15. The owner's decisions (2026-10-20)

| # | Decision | Stage |
|---|---|---|
| 1 | **Stages approved:** 3B Traveller participation → 3C Adult/child pricing → 3D-1 Money records → 3D-2 Responsibility and splits → 3E Balances and settlements. Each implemented and verified on its own; no later stage without approval | all |
| 2 | **New activity made by hand:** every current trip traveller ticked by default. **Edit** keeps the saved selection exactly. **Adding a traveller to a trip** offers an optional list of the trip's existing activities, **all unticked** | 3B |
| 3 | **AI-imported activities (2C):** keep *no participants* in 3B, so 2C does not change. *Future product decision, recorded:* make participant selection consistent between manual creation and AI import (e.g. a *Who's going* choice in the import preview) — not in Phase 3 unless the owner asks | 3B / later |
| 4 | (= 2) the add-to-existing list, all unticked | 3B |
| 5 | **Price lines:** optional *Adult / Child / Anyone* per line, free-text labels kept. Never silently changes a historical total or an existing paid amount. Pricing work is 3C only — nothing in 3B | 3C |
| 6 | **Legacy paid:** shown *Paid — not recorded by whom* when no payer is known. **Never invent** a payer, a payment amount, a responsibility or a payment history | 3D-1 |
| 7 | Old `paid_by`, `split`, `payments` **untouched**. Per-trip responsible adult per child, per-cost override, *unallocated* when unknown. Largest-remainder rounding, ID-based settlements, refunds outside Phase 3, personal money details in the PDF only by opt-in — all as proposed | 3D/3E |
| 8 | **Payer default (changed):** a new expense's payer is **Not recorded** unless the person picks one. The last payer may be *offered* as a one-tap suggestion, never recorded silently | 3D-1 |
| 9 | **Removing a traveller with money records:** destructive removal is prevented, and a **safe resolution flow** is designed — never deleting money history, never silently moving it to someone else. Designed with 3D-2 | 3D-2 |
| 10 | **Booking costs vs expenses (changed):** a warning alone is not enough. The model must let payments and expense records be **explicitly linked to an existing booking**, so a deposit and the final payment are one cost: a EUR 250 booking with a EUR 100 deposit and a EUR 150 final payment is **one EUR 250 cost with EUR 250 paid**, never EUR 500 of spending. The duplicate warning stays for overlapping **unlinked** records. The exact model and aggregation rules are written and approved **before 3D-1** (§17 is the starting point) | 3D-1 |
| 11 | **Migration and real data:** no real backup requested or inspected now. Migration 007 designed and tested on synthetic legacy databases, including unexpected non-null values in the old unused fields. Before any physical-phone install, the owner separately approves backup creation, structure-only inspection where appropriate, and a rehearsal on an isolated copy. Real data is never assumed empty because current code does not write a field | 3D-1 |

## 16. Phase 3B — traveller participation: the design as built (0.12.0)

**Product questions settled before building (owner, 2026-10-20):** (a) the new-item default covers
**plans and saved places of every kind; a to-do starts with nobody**; (b) items made **outside the
item form** — AI import (2C), an item made from something shared in, a to-do template — **stay
with nobody**, as before; (c) the *Also add … to* list offers **plans and saved places** (never
to-dos or cancelled plans), in two groups.

No migration (schema stays 6), no backup or archive format change, nothing in prices, paid state,
expenses or any money calculation touched.

| Rule | Where |
|---|---|
| **New item in the form** (`app/item/new.tsx`): every current trip member ticked, in the trip's order; a to-do nobody. The form opens only once the trip's travellers are read, so the default is never "nobody" by accident. A trip with nobody on it: no *Who's going* at all, as before. Changing kind inside the form keeps whatever is ticked | `domain/participation.ts` `newItemParticipants` |
| **Edit** (`[itemId]/edit.tsx`): unchanged — the saved set, filtered to current members, never the new-item default. A member who joined later is not added | (as before; tests added) |
| **Joining a trip** — a profile added, a new name, or an old typed name linked: membership only, then the sheet **Also add *Name* to…** lists the trip's plans (upcoming soonest first, then *No date yet*, then past, most recent first) and **Saved places** (by title) that they are not on — **all unticked**. *Add to N items* writes exactly those, in one transaction; *Not now* writes nothing. No sheet when there is nothing to offer | `travellers.tsx`, `features/travellers/AddToItemsSheet.tsx`, `listJoinCandidates`, `addTravellerToItems` |
| **Later**: tapping a member, *Add to existing plans…* opens the same sheet (or says they are on everything) — for someone added from their profile to several trips, or who skipped it | `travellers.tsx` |
| `addTravellerToItems` adds a row to `item_participants` only for an item of **that** trip that can be offered, only for a **member** of the trip (else refused, nothing written); someone already on an item is left alone; nobody else's participation and no `trip_items` column (`updated_at` included) changes | `INSERT_JOIN_PARTICIPANT` |
| **Removing** a member: unchanged — their participation in that trip's items goes, the profile stays; **re-adding** restores nothing; the sheet offers the items again, unticked | (as before; tests added) |
| **Namesakes:** in *Your travellers*, a profile whose name another profile shares shows *Adult · On Lapland, Rome +1* | `domain/traveller.ts` `namesakeHint` |
| **Me**: never changed by any of this; a new item ticks Me only because Me is a member | — |

**Future product decision (recorded, not built):** make participant selection consistent between
manual creation and AI import (2C), e.g. a *Who's going* choice in the import preview; likewise an
item made from something shared in.

## 17. Linking money to a booking — starting point for 3D-1 [Proposed, to be made exact and approved before 3D-1]

Not built in 3B. Recorded now so 3D-1 starts from the owner's requirement (§15 *10*).

- A **payment towards a booking** is a `cost_payments` row with `trip_item_id` set — never an
  expense. A deposit and the balance are two rows on the one booking.
- An **expense linked to a booking** (a new nullable `expenses.trip_item_id` in 007, to be
  confirmed) is a record of paying for that booking — a receipt with a payer and date. It is **not
  spending of its own**: it counts as a payment towards the booking, and the booking's price stays
  the one cost.
- **Aggregation:** cost = the booking's `price_amount` (once); paid = Σ its payments + Σ its linked
  expenses (same currency); to pay = max(cost − paid, 0); overpaid shown when paid > cost. Spending
  = Σ **unlinked** expenses only. Trip total = Σ booking costs + Σ unlinked expenses, per currency.
  The EUR 250 example: cost 250, paid 100 + 150 = 250, to pay 0, spending unchanged.
- **Legacy:** `is_paid = 1` with no payments or linked expenses → *Paid — not recorded by whom*,
  counted as paid in full exactly as today (the amount is not invented as a payment row).
- **Warning:** an unlinked expense in the same trip and currency, same amount as a booking's price
  or remaining balance, within a few days of it → *This may be the booking "…" — link it?* Never
  merged automatically.
- ~~Open for the 3D-1 plan: what deleting a booking does to linked expenses (proposal: they are
  kept and become unlinked spending, with a confirmation), a different currency on a linked
  expense (proposal: refused), and the exact wording.~~ **Decided by the owner, §18:** the
  "become unlinked spending" proposal is **rejected** (deletion is blocked instead); a different
  currency is refused, as proposed.

## 18. The owner's answers on 3C scope and 3D-1 linking (2026-10-20)

Given in answer to `MASTER_ROADMAP.md` §21. Supersedes §§9, 12 and 17 where they differ. Rationale:
decision-log D38.

### 18.1 Phase 3C — confirmed scope (not yet approved to implement)

| # | Decision |
|---|---|
| C-1 | **"Partial quantities" are not fractional.** Quantities stay whole numbers ≥ 1 (`rateLineSchema` as today). A partly attending or partly priced group is separate lines with whole quantities. No fractional quantities, no database change for this |
| C-2 | **In scope:** a user-invoked *Price for who's going* calculation/suggestion; *Adult / Child / Anyone* on pricing lines; free lines (including free child admission); optional extras as separate lines; an *Estimate* label for prices on ideas |
| C-3 | **Constraints:** existing totals stay authoritative until explicitly changed · suggestions never silently overwrite prices · editing participants never recalculates the total · historical and paid booking values are preserved · an estimate is never confused with a confirmed booking or payment · fixed group totals stay supported · no fractional quantities · new pricing metadata is never silently discarded by backup, restore, ZIP import/export or PDF export |
| C-4 | **Before coding**, verify the existing schema represents this without lossy workarounds; if a migration is necessary, stop and ask. Done in §19: no migration; four design questions |

### 18.2 Phase 3D-1 — linking rules (to be turned into an exact proposal before 3D-1)

| # | Decision |
|---|---|
| L-1 | **Deleting a booking with linked financial records:** never cascade-delete payments, expenses or settlements. If any linked financial record exists, **ordinary deletion is blocked**, with an explanation |
| L-2 | A **future explicit resolution workflow** preserves financial history — e.g. unlinking a standalone expense, or archiving/cancelling the booking while keeping its financial relationships. A booking payment is **never silently converted** into an independent expense, and a payment is **never orphaned**. The exact archive/unlink UI and the source-of-truth rules are proposed and approved before 3D-1 is implemented |
| L-3 | **Different currencies:** no automatic conversion and no adding of different currencies. In 3D-1 a linked booking payment **must use the booking's currency**; if they differ, the link is blocked with a clear explanation and the records stay separate. No invented exchange rate; neither amount changes. Multi-currency reconciliation is Phase 4 or a separately approved extension |
| L-4 | **Define before implementation** the distinction between a **standalone expense**, a **payment against a booking** and a **linked expense**. A booking and its payment records are never counted as separate costs |

**Consequences for the drafts above, to be resolved in the 3D-1 proposal** (recorded, not decided):
- §8's DDL has `cost_payments.trip_item_id` / `expense_id` and `cost_shares.trip_item_id` /
  `expense_id` as `ON DELETE CASCADE`. That contradicts L-1 for payments. The 3D-1 proposal must
  change them (for example to `RESTRICT`, with the app refusing first and explaining) before
  migration 007 is written.
- **Deleting a whole trip** cascades to its bookings today. L-1 speaks of ordinary booking deletion;
  what deleting a trip that holds financial records does (blocked, or allowed as one explicit
  whole-trip removal) is an owner question for the 3D-1 proposal. With `RESTRICT` on the item
  reference, SQLite would refuse the trip's cascade, so this has to be decided, not left to the
  schema.
- A **cancelled** booking keeps its financial relationships (L-2); today cancelling changes only
  `status`, which already fits.
- L-4 replaces the bullets of §17 as the source of truth once written; §17's aggregation (cost =
  the booking's price once; paid = its payments + linked expenses in the same currency; spending =
  unlinked expenses only) is the starting point.

## 19. Phase 3C — pre-coding schema check (2026-10-20, at `2b8a648`)

Asked by the owner (§18 C-4) before any 3C code. Read in the code; nothing changed.

### 19.1 Where pricing lives and travels [Confirmed]

| Path | How `details.pricing` is handled | Keeps a new key on a line? |
|---|---|---|
| SQLite | `trip_items.details` TEXT, JSON; `parseDetails` returns the whole object (`tripItem.ts`) | **Yes** — no column involved |
| Item save | `tripItemInputSchema`: `details` is `z.record(...)`, stored as given; `pricingSchema` only **validates** (`superRefine`, `pricingMatches`) | **Yes** |
| Full backup / restore | `export.ts` row schema: `details: nullableString` — the JSON text is copied, never parsed | **Yes** |
| Trip archive (2B ZIP) | rows copied as text; `remapDetails` parses only to rewrite `journeyId` and spreads every other key back | **Yes** |
| Journey (U7) | `journeyItemValues` copies the whole `pricing` object to the first leg | **Yes** |
| Change of kind | `detailsForKind` drops only transport route keys | **Yes** |
| Reading for display | `pricingOf` → `pricingSchema.safeParse` — Zod **strips** unknown keys | No — must be extended in 3C |
| Form | `PriceSection` rebuilds lines from `label`/`quantity`/`unitAmount` and writes them back | **No — an edit would drop it.** Must be extended in 3C |
| PDF | `pricingText` (confirmed items only): quantity × unit + label | Shows only what `pricingText` prints — must be extended |
| AI activities JSON (2C) | total and currency only; per-person lines are neither imported nor exported (documented in the v1 format: *"Per-person prices are not imported yet"*) | n/a — unchanged limitation |
| Plan with AI (2D) | reads no price lines | n/a |

**Conclusion:** an optional per-line field inside `details.pricing.lines` (§7: `for: 'adult' |
'child' | 'any'`, absent = today's free label) is stored, backed up, restored, archived and
journey-copied **losslessly with no SQLite migration**. Nothing needs label parsing: a legacy line
labelled *Adult* stays untagged until the person tags it. The read and edit paths (`pricingOf`,
`rateLineSchema`, `PriceSection`, `pricingText`) are in-scope 3C code and are extended, with tests
that a tagged line survives load → edit → save, backup → restore and archive → import unchanged.

### 19.2 Questions to settle in the 3C plan (recommendation first)

None needs a migration. Each changes what the 3C plan says, so each needs an answer first.

1. **An older app reading 3C metadata.** Backups and archives carry `details` as text, so 0.12.0
   would *accept* a format-6 backup or trip ZIP from a 3C build. It would show tagged lines by label
   only, count extras as people (*"Priced for 5; 4 are going"*), and **drop the tags and extra marks
   the first time the price is edited** there, because its form rebuilds every line. That is silent
   loss, which C-3 forbids. Realistic case: a friend on 0.12.0 imports a trip ZIP from a 3C build.
   **Recommended:** bump `EXPORT_FORMAT_VERSION` 6 → 7 in 3C (no SQLite change; `user_version`
   stays 6). Older apps then refuse 3C backups and archives with their existing *"from a newer
   version"* message, and formats 1–6 restore as untagged lines. Migration 007's backup format
   becomes **8** in 3D-1. Alternative: no bump, and the downgrade loss is documented.
2. **How an extra is marked.** An extra (*sled hire 2 × EUR 20*) counts units, not people. It must
   not count towards *priced for N*, and *Price for who's going* must never change its quantity.
   **Recommended:** a separate optional flag on the line, `extra: true` (audience stays about
   people; an extra has none). Alternative: a fourth audience value `for: 'extra'`.
3. **A fixed group total with extras.** Today a price is *either* one total *or* per-person lines
   (`mode: 'perPerson'`). *Family ticket EUR 120 + 2 sleds* fits neither cleanly.
   **Recommended:** keep the plain total as it is, and allow a group line in the breakdown as a
   line of quantity 1 marked like an extra (not people), so the existing `mode` and the
   lines-sum-to-total rule are unchanged. Alternative: a new pricing mode, which an older app
   cannot read (`pricingOf` returns null, and its save refuses the item).
4. **Applying *Price for who's going* to a booking marked Paid.** Today *Price for N* sets the first
   line's quantity in one tap and the item stays *Paid* (§6 invariant A conflict, unresolved until
   3D-1). **Recommended:** on any item the suggestion shows the old and new total and changes
   nothing until confirmed; on a booking marked Paid the confirmation also says the booking stays
   marked Paid and the paid amount is not recorded. Alternative: refuse the suggestion on paid
   bookings.

**Not blockers, recorded:**
- **Currency minor units:** amount entry and display assume two decimals for every currency
  (`format.ts`: × 100), so a zero-decimal currency such as JPY is shown and typed as if it had
  cents. This predates 3C. 3C adds no division and no rounding, so it does not make this worse;
  the fix belongs to Phase 4 (master §10).
- **Today's *Price for N*** sets only the first line's quantity to everyone going, which is wrong
  for a mixed Adult + Child breakdown. 3C replaces it with *Price for who's going*.
- **Estimate on ideas** is display only: `paymentStatus` already ignores ideas, and their price is
  already a budget, not spent (`bookingCosts.ts`). No stored change.
- **2C activities JSON** still carries totals only. Carrying lines would be a v2 format change,
  outside 3C unless the owner asks.
