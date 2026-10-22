/**
 * Money one traveller gave another on a trip, to square up (3E, `docs/phase3e-plan.md` §6). Purely
 * additive: one new table. No row is written and no existing value changes, so every trip starts
 * with no settlements — what it means today.
 *
 * A settlement is never a cost and never linked to one. Both people are referenced through
 * `trip_travellers(trip_id, traveller_id)`, its primary key, so the database itself refuses a
 * settlement with someone not on that trip. No ON DELETE action on those keys (NO ACTION, checked at
 * the end of the statement): someone with a settlement cannot leave the trip alone, while deleting
 * the whole trip removes the members and the settlements together.
 */
export const sql = /* sql */ `
CREATE TABLE settlements (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  currency   TEXT NOT NULL,
  settled_on TEXT,
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (from_id <> to_id),
  FOREIGN KEY (trip_id, from_id) REFERENCES trip_travellers(trip_id, traveller_id),
  FOREIGN KEY (trip_id, to_id) REFERENCES trip_travellers(trip_id, traveller_id)
);

CREATE INDEX idx_settlements_trip ON settlements(trip_id);
CREATE INDEX idx_settlements_from ON settlements(trip_id, from_id);
CREATE INDEX idx_settlements_to ON settlements(trip_id, to_id);
`;
