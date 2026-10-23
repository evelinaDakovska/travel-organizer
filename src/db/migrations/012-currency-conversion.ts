/**
 * Currency conversion (Phase 4, `docs/phase4-plan.md` §4). Purely additive: one new table and five
 * NULL columns. No row is written and no existing value changes, so every trip starts without a
 * reporting currency and reads exactly as before.
 *
 * - `trips.report_currency`: the one currency a trip's total is converted to, or NULL (not converted).
 * - `trip_rates`: a rate typed in by the person, 1 `currency` = `rate` `base_currency`, kept as the
 *   exact decimal text. The base is stored on the rate, so a rate set for an earlier reporting
 *   currency is never applied to a later one.
 * - `charged_amount` / `charged_currency` on expenses and booking payments: what a record actually
 *   cost in another currency (a card statement), used as it is, never re-estimated. Their pairing
 *   is checked in the repository; a table CHECK across columns would need a table rebuild.
 */
export const sql = /* sql */ `
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
`;
