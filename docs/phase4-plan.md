# Phase 4 — multi-currency integrity and conversion: plan

Written 2026-10-23 on the branch `phase-3d1` at `1df90c6` (0.16.3, schema 11), after Phase 3 was
closed. It turns `MASTER_ROADMAP.md` §10 into an exact proposal.

**How this phase is run (owner, 2026-10-23):** "start p4 with plan and directly start
implementation. stop when all p4 is done and tested by you". So the plan is written down, but
implementation does not wait for approval. Every decision that would normally go to the owner is
listed in §11, with the option chosen and why, for review afterwards. The data-safety rules still
bind in full:
- branch `phase-3d1` only;
- synthetic data on emulators only;
- no release APK, no phone, no merge;
- no online service.

## 1. What the app does today

- Money is stored as **INTEGER hundredths** of the currency's unit, for every currency
  (`parseAmount` × 100, `formatMoney` ÷ 100). A yen amount of 1500 is stored as 150000 and shown as
  *JPY 1500.00*.
- Every total is a **list per currency**: the Expenses tab's *Expected trip cost*, *Bookings*,
  *Spending*, the PDF's bookings table. Nothing is converted or summed across currencies (U6, D25).
- 3E's balances and settlements are **per currency**. A settlement is a transfer in one currency.
- D32 (2026-10-19) reverses *never convert* for Phase 4: convert to a trip's reporting currency,
  keeping the original amount, currency and the rate used.

## 2. Scope

**In Phase 4:**
1. **A reporting currency per trip.** It is optional; without one, the trip behaves exactly as today.
2. **Exchange rates per trip, entered by the person.** One rate per currency, read as
   *1 USD = 0.92 EUR*, with the date it was set. These rates make **estimates**.
3. **What it really cost, on a record.** An expense or a booking payment can carry the amount it was
   actually charged in the reporting currency (from a card statement or receipt). That amount is
   **locked**: it is used as it is, never re-estimated.
4. **One converted total**, shown beside the per-currency totals and never instead of them:
   - on the Expenses tab, *Expected trip cost*, split into bookings and spending;
   - on the PDF, a line under the bookings table.

   It is marked as an estimate whenever any part of it came from a rate. A currency without a
   rate is **left out by name** ("GBP 40.00 not included: no rate"), never guessed.
5. **Zero-decimal currencies** (JPY, KRW, VND, …) are shown without *.00*, and a converted total
   in one of them is rounded to whole units.

**Not in Phase 4 (deliberate):**
- **No rates from the internet.** Master §10: "No silent online requests or paid service", and
  CLAUDE.md §7: no backend. Rates are typed in. A rate service is *Discovery*.
- **Balances and settlements stay per currency.** A debt in USD is settled in USD, and converting
  it would change who owes what as rates move. Settle up is unchanged, and so is its share text.
- **The Bookings and Spending lists stay in original currencies.** Only the trip total gets a
  converted line.
- **No conversion in the AI formats (2C/2D).** They carry no rates or charged amounts, as with
  every other money record.
- **Three-decimal currencies** (BHD, KWD, OMR, JOD, TND, IQD, LYD) keep today's limit: amounts
  are hundredths, and a third decimal is refused on input. They are documented, not changed.
- **Refunds and negative amounts** are still out (master §9.2).

## 3. The model

### 3.1 Rates

`trip_rates`: one row per trip and currency.
- **`rate`** is TEXT: a positive decimal as typed (up to 12 significant digits, up to 10 decimals),
  meaning *1 unit of `currency` = `rate` units of `base_currency`*. TEXT keeps it exact: `0.0061`
  stays `0.0061`, which a float or a scaled integer would round.
- **`base_currency`** is stored on the rate. If the trip's reporting currency later changes, a rate
  set against the old one is **not used**: it is shown as *set for GBP*, never applied to EUR.
  Changing the reporting currency therefore never silently reinterprets a rate.
- **`rate_date`** is the day the rate was set (today, editable). It shows as *as of 23 Oct*.

### 3.2 Charged amounts (locked)

`expenses` and `booking_payments` each gain `charged_amount` (INTEGER hundredths) and
`charged_currency`. Both are NULL, or both are set, with `charged_currency` ≠ the record's currency.
A charged amount is used only when `charged_currency` is the trip's reporting currency. Otherwise
it is shown on the record but does not count.

### 3.3 Converting (pure, `src/domain/conversion.ts`)

For a trip with reporting currency **B**:
- **An amount already in B** counts as it is: exact.
- **A standalone expense in X:**
  - with a charged amount in B, that amount (locked);
  - otherwise the amount × rate(X), rounded (estimate);
  - otherwise, with no rate, it is *not included*.
- **A booking counted in the trip cost, price P in X:**
  - *locked part*: the booking's payments and linked expenses with a charged amount in B. They
    cover the original amount `Lo` and cost `Lb` in B.
  - If `Lo` ≥ P, the booking costs `Lb × P / Lo`, rounded: the locked records cover the whole
    price, scaled down if overpaid.
  - Otherwise it costs `Lb + (P − Lo) × rate(X)`: the locked part plus an estimate of the rest.
    With no rate, it is *not included*, and it is named as such. A partly locked booking is never
    half-counted.
- **Rounding:** half away from zero, to hundredths. For a zero-decimal B, to whole units.
- **Arithmetic:** the rate is parsed into an exact integer numerator and a power-of-ten denominator,
  and multiplication uses BigInt (Hermes supports it). No float ever touches money.
- **The result** is per part (bookings, spending), and states:
  - the total in B;
  - whether any estimate was used;
  - the currencies converted, with their rates;
  - the amounts not included, per currency.

## 4. Migration 012 (additive)

```sql
ALTER TABLE trips ADD COLUMN report_currency TEXT
  CHECK (report_currency IS NULL OR (length(report_currency) = 3 AND report_currency = upper(report_currency)));

CREATE TABLE trip_rates (
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  currency      TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  base_currency TEXT NOT NULL CHECK (length(base_currency) = 3 AND base_currency = upper(base_currency)),
  rate          TEXT NOT NULL,
  rate_date     TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (trip_id, currency),
  CHECK (currency <> base_currency)
);

ALTER TABLE expenses ADD COLUMN charged_amount INTEGER CHECK (charged_amount IS NULL OR charged_amount > 0);
ALTER TABLE expenses ADD COLUMN charged_currency TEXT;
ALTER TABLE booking_payments ADD COLUMN charged_amount INTEGER CHECK (charged_amount IS NULL OR charged_amount > 0);
ALTER TABLE booking_payments ADD COLUMN charged_currency TEXT;
```

- **What the upgrade does to existing data:** it adds NULL columns and one empty table. No row is
  written and no existing value changes. Every trip starts with no reporting currency, so every
  screen reads exactly as before until the person sets one.
- **Validation:** the pairing (both or neither, not the record's own currency) and the rate's shape
  are checked by Zod in the repository, as P2 established. SQLite cannot add a table CHECK to an
  existing table without rebuilding it, and a rebuild is the riskiest migration there is (D25).
- **Tests:**
  - 11 → 12 and 6 → 12 over phone-shaped synthetic data, with every old row identical;
  - a failed batch stays at 11;
  - the migration is idempotent;
  - the constraints hold.
- **Formats:** backup format **13**, archive rowFormat **13**.
  - Older files read as *no reporting currency, no rates, nothing charged*.
  - A 0.16.3 app refuses format 13, as every earlier bump did.
  - Archive import copies the rates with the new trip id, and the charged amounts with their
    records.

## 5. Writes

- **`setReportCurrency(tripId, code | null)`** and **`saveRates(tripId, base, rates[])`** run in one
  transaction from the rates screen. A blank rate deletes that currency's row.
- **`createExpense` / `updateExpense` / `createPayment` / `updatePayment`** take an optional
  `charged: { amount, currency } | null`. Each is validated by its input schema. They already go
  through `afterMoneyWrite`.
- **Charged amounts are not in the 3E fingerprint and do not change any balance**, so editing one
  ends no unsplit confirmation and triggers no settlement review. A test pins this.
- **Trip delete and *Replace* restore:** rates go with the trip, by CASCADE.

## 6. Screens

- **Currencies and rates** (`app/trip/[tripId]/rates.tsx`), opened from the trip total.
  - *Reporting currency*: *Don't convert*, or a currency. The trip's currencies are offered first.
  - One row per other currency used on the trip, with the rate field *1 USD = [ ] EUR*, the date
    it was set and the amount it covers.
  - A rate set for an earlier reporting currency is shown as such and is not used.
  - Save.
- **Expected trip cost** (`TripTotal`), with a reporting currency set:
  - *≈ EUR 1,950.00* (no ≈ when nothing was estimated);
  - *Bookings … · Spending …*;
  - then the per-currency lines as today, under *In original currencies*;
  - then any *not included* amounts, and *Currencies and rates*.

  Without one, it is unchanged, plus a quiet *Convert to one currency* link when the trip has two or
  more currencies.
- **Expense form and payment form:** with a reporting currency set and the record in another
  currency, an optional *Charged in EUR* amount. It is shown on the expense and payment screens.
- **PDF:** *≈ EUR 1,950.00 in total (estimated at the trip's rates)* under the bookings table, for
  bookings only, like the table itself.

## 7. Zero-decimal currencies

`currencyDecimals(code)` returns 0 for ISO 4217 zero-decimal codes and 2 otherwise. `formatMoney`
drops *.00* for a zero-decimal currency when the hundredths are 0. If a stored amount has
hundredths (typed before this change), it is still shown in full: stored data is never hidden.
Input is unchanged.

## 8. Order of work

1. Migration 012, its tests and the testing fixtures.
2. `conversion.ts`, `currencyDecimals`, `formatMoney`, with unit and property tests (Σ of parts =
   total; a locked amount is never re-estimated; no rate means not included, never zero).
3. Repositories: trips, rates, charged amounts in expenses and payments; backup and archive format
   13; import remap.
4. Screens: rates, trip total, forms, detail screens, PDF.
5. Verification:
   - Node tests and the typecheck;
   - on the emulator: migration 11 → 12 with the database compared table by table on a debuggable
     debug build; the screens at 360 dp, font 2.0 and dark mode; restart; backup round trip.
6. Docs: the technical reference, status, product status, roadmap and decision log (D45).

## 9. Version

**0.17.0**, versionCode 27, schema 12, backup format 13. It stays on `phase-3d1`, on no phone. Under
the owner's physical-testing split (master §3.1), it is a risky change (a migration). It goes to the
husband's phone first, and to the primary phone only after the trip.

## 10. Risks

- **The meaning of old rows:** nothing is reinterpreted. Without a reporting currency, every screen
  and total is unchanged, and tests compare them.
- **Rate direction mistakes:** the field always reads *1 USD = … EUR*, with the amount it covers,
  so a rate typed upside down shows a plainly wrong converted figure.
- **Float error:** none. Rates are exact decimals, and the arithmetic uses BigInt.

## 11. Decisions taken without the owner (for review)

| # | Question | Chosen | Why | Alternatives |
|---|---|---|---|---|
| P4-1 | Where rates come from | Typed in by the person, per trip | Offline-first, no backend, no silent requests (master §10) | An online rate API (Discovery: needs a backend decision); built-in fixed rates (stale, misleading) |
| P4-2 | One rate per currency, or per date | One per currency per trip, with its date; per-record *charged* amounts for exact history | Covers payments at different dates and rates without a rate table per day | Daily rate tables (heavy to enter) |
| P4-3 | Balances and settle-up converted? | No: they stay per currency | A converted debt moves with the rate; settlements happen in a currency | A converted *for information* net per person (possible later) |
| P4-4 | Where the converted figure appears | The trip total and the PDF only | It is the question people ask ("what did the trip cost?"); lists stay as recorded | Converting every list (noise, more estimates on screen) |
| P4-5 | A rate set for a former reporting currency | Kept and shown, not used | Never reinterpret a recorded value | Deleting the rates on change (loses work); cross-rates (more estimating) |
| P4-6 | Rate storage | Exact decimal TEXT plus BigInt arithmetic | Exactness: money is never a float (CLAUDE.md §8) | REAL (float error); scaled INTEGER (rounds small rates) |
| P4-7 | Zero-decimal currencies | Display without *.00*; storage unchanged | No data change and no migration of meaning | Real minor units (rewrites every stored yen amount) |
| P4-8 | Pairing checks | Zod in the repository, not table CHECKs | Adding table CHECKs needs a table rebuild | A rebuild migration (risk to real data) |

## 12. As built

*(Filled in when Phase 4 is done.)*
