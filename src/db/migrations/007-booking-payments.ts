/**
 * Money records linked to bookings (3D-1, `docs/phase3d1-plan.md` §4). Purely additive: one new
 * table and two nullable columns. No row is written and no existing value changes, so every
 * existing expense stays standalone spending with its payer not recorded — what it means today.
 * The old text columns `paid_by`, `split` and the name-based `payments` table stay untouched.
 *
 * The references to a booking have no ON DELETE action (NO ACTION, checked at the end of the
 * statement): deleting a booking that has a payment or a linked expense is refused, so money
 * history is never cascaded away with it (L-1), while deleting the whole trip removes the booking
 * and its records together in one statement. RESTRICT would be checked mid-cascade, and whether a
 * trip deletion succeeded would depend on SQLite's cascade order.
 */
export const sql = /* sql */ `
CREATE TABLE booking_payments (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id TEXT NOT NULL REFERENCES trip_items(id),
  payer_id     TEXT REFERENCES travellers(id) ON DELETE RESTRICT,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  currency     TEXT NOT NULL,
  paid_on      TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_booking_payments_trip ON booking_payments(trip_id);
CREATE INDEX idx_booking_payments_item ON booking_payments(trip_item_id);
CREATE INDEX idx_booking_payments_payer ON booking_payments(payer_id);

ALTER TABLE expenses ADD COLUMN trip_item_id TEXT REFERENCES trip_items(id);
ALTER TABLE expenses ADD COLUMN payer_id TEXT REFERENCES travellers(id) ON DELETE RESTRICT;

CREATE INDEX idx_expenses_item ON expenses(trip_item_id);
CREATE INDEX idx_expenses_payer ON expenses(payer_id);
`;
