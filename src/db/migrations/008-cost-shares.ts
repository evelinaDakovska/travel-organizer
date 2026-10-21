/**
 * Who a cost is for, and who covers a child's share (3D-2, `docs/phase3d2-plan.md` §5). Purely
 * additive: two new tables. No row is written and no existing value changes, so every booking and
 * expense stays *Not split* and nobody covers anyone — what it means today.
 *
 * Every person is referenced through `trip_travellers(trip_id, traveller_id)`, its primary key, so
 * the database itself refuses a share or a cover for someone not on that trip. The share keys have
 * no ON DELETE action (NO ACTION, checked at the end of the statement): someone who holds a share,
 * or covers one by override, cannot leave the trip alone, while deleting the whole trip removes the
 * members and the shares together. A split is part of its cost and goes with the booking or the
 * expense (CASCADE). A default cover is a setting, not a record: it goes with either person.
 */
export const sql = /* sql */ `
CREATE TABLE cost_shares (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
  expense_id   TEXT REFERENCES expenses(id) ON DELETE CASCADE,
  traveller_id TEXT NOT NULL,
  amount       INTEGER CHECK (amount IS NULL OR amount >= 0),
  covered_by   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK ((trip_item_id IS NULL) <> (expense_id IS NULL)),
  CHECK (covered_by IS NULL OR covered_by <> traveller_id),
  FOREIGN KEY (trip_id, traveller_id) REFERENCES trip_travellers(trip_id, traveller_id),
  FOREIGN KEY (trip_id, covered_by) REFERENCES trip_travellers(trip_id, traveller_id)
);

CREATE UNIQUE INDEX ux_cost_shares_item ON cost_shares(trip_item_id, traveller_id)
  WHERE trip_item_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cost_shares_expense ON cost_shares(expense_id, traveller_id)
  WHERE expense_id IS NOT NULL;
CREATE INDEX idx_cost_shares_member ON cost_shares(trip_id, traveller_id);
CREATE INDEX idx_cost_shares_cover ON cost_shares(trip_id, covered_by);

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
`;
