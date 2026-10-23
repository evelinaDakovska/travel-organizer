/**
 * One rate per currency pair (Phase 4 review P1, `docs/phase4-plan.md` §13.1). Migration 012 keyed
 * `trip_rates` by (trip, currency), so a rate to a new reporting currency replaced the rate to the
 * old one. SQLite cannot change a primary key in place and 012 is never edited, so the rates move to
 * a new table keyed by (trip, currency, base) — every row copied as it is. `trip_rates` stays,
 * frozen: the app no longer reads or writes it, as with the legacy `payments` table.
 */
export const sql = /* sql */ `
CREATE TABLE trip_exchange_rates (
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  currency      TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  base_currency TEXT NOT NULL CHECK (length(base_currency) = 3 AND base_currency = upper(base_currency)),
  rate          TEXT NOT NULL,
  rate_date     TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (trip_id, currency, base_currency),
  CHECK (currency <> base_currency)
);

INSERT INTO trip_exchange_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
SELECT trip_id, currency, base_currency, rate, rate_date, updated_at FROM trip_rates;
`;
