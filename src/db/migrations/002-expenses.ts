/**
 * Expenses (N5). Purely additive: two new tables and one new nullable column — no existing row is
 * rewritten or moved, so a phone's data comes through the upgrade exactly as it was.
 *
 * The whole of N5 is here, splitting included, so the phone needs this one migration only.
 * `paid_by`, `split` and `payments` stay unused until the split is built.
 */
export const sql = /* sql */ `
CREATE TABLE expenses (
  id       TEXT PRIMARY KEY,
  trip_id  TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  category TEXT NOT NULL CHECK (category IN ('food','groceries','transport','activities',
                                             'shopping','accommodation','other')),
  label    TEXT,
  amount   INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  spent_on TEXT NOT NULL,
  notes    TEXT,

  paid_by  TEXT,
  split    TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_expenses_trip ON expenses(trip_id, spent_on);

CREATE TABLE payments (
  id        TEXT PRIMARY KEY,
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  to_name   TEXT NOT NULL,
  amount    INTEGER NOT NULL CHECK (amount > 0),
  currency  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_payments_trip ON payments(trip_id);

-- A receipt is a trip resource that also names its expense, so the existing CHECK (exactly one of
-- trip_id / trip_item_id) still holds and the resources table is not rebuilt.
ALTER TABLE resources ADD COLUMN expense_id TEXT REFERENCES expenses(id) ON DELETE CASCADE;

CREATE INDEX idx_resources_expense ON resources(expense_id);
`;
