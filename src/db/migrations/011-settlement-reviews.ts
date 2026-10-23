/**
 * Settlement review holds (`docs/phase3e-plan.md` §15). Purely additive: one new table, no row
 * written, no existing value changed, so nothing is held after the upgrade.
 *
 * One row per change that took a shared cost out of a currency that already had settlements: the
 * cost deleted, moved to another currency, or no longer counted. The currency is held while it has
 * an open row (`acknowledged_at IS NULL`) and a settlement. The cost is kept as text — its title and
 * amount as they were — never as a reference: a deleted cost must not have to exist, and a review is
 * never linked to a cost or a settlement. Acknowledged rows stay, as the record of what was reviewed.
 */
export const sql = /* sql */ `
CREATE TABLE settlement_reviews (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  currency        TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('deleted', 'moved', 'left')),
  cost_kind       TEXT NOT NULL CHECK (cost_kind IN ('booking', 'expense')),
  cost_title      TEXT NOT NULL,
  cost_amount     INTEGER NOT NULL,
  to_currency     TEXT,
  created_at      TEXT NOT NULL,
  acknowledged_at TEXT,
  CHECK ((reason = 'moved') = (to_currency IS NOT NULL))
);

CREATE INDEX idx_settlement_reviews_trip ON settlement_reviews(trip_id, currency);
`;
