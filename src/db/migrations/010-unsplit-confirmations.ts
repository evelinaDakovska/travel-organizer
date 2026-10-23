/**
 * Unsplit costs someone reviewed and chose to keep outside the shared balances (review P1,
 * `docs/phase3e-plan.md` §14.2). Purely additive: one new table and three triggers. No row is
 * written and no existing value changes, so every unsplit cost starts unconfirmed — which matters
 * only in a currency that has settlements.
 *
 * One row per cost, the booking's or the standalone expense's, deleted with it (CASCADE): a
 * confirmation never moves to another cost. `fingerprint` is the cost's financial facts when it was
 * confirmed (`costFingerprint`); the confirmation applies only while they are unchanged.
 *
 * A split ends a confirmation for good: any write to the cost's split deletes it, in the same
 * statement, whichever path wrote it. Without this a cost split, settled and then unsplit again
 * would match its old fingerprint and bring the confirmation back.
 */
export const sql = /* sql */ `
CREATE TABLE unsplit_confirmations (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
  expense_id   TEXT REFERENCES expenses(id) ON DELETE CASCADE,
  fingerprint  TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  CHECK ((trip_item_id IS NULL) <> (expense_id IS NULL))
);

CREATE UNIQUE INDEX ux_unsplit_confirmations_item ON unsplit_confirmations(trip_item_id)
  WHERE trip_item_id IS NOT NULL;
CREATE UNIQUE INDEX ux_unsplit_confirmations_expense ON unsplit_confirmations(expense_id)
  WHERE expense_id IS NOT NULL;
CREATE INDEX idx_unsplit_confirmations_trip ON unsplit_confirmations(trip_id);

CREATE TRIGGER trg_cost_shares_insert_unconfirms AFTER INSERT ON cost_shares BEGIN
  DELETE FROM unsplit_confirmations
   WHERE trip_item_id = NEW.trip_item_id OR expense_id = NEW.expense_id;
END;

CREATE TRIGGER trg_cost_shares_update_unconfirms AFTER UPDATE ON cost_shares BEGIN
  DELETE FROM unsplit_confirmations
   WHERE trip_item_id IN (OLD.trip_item_id, NEW.trip_item_id)
      OR expense_id IN (OLD.expense_id, NEW.expense_id);
END;

CREATE TRIGGER trg_cost_shares_delete_unconfirms AFTER DELETE ON cost_shares BEGIN
  DELETE FROM unsplit_confirmations
   WHERE trip_item_id = OLD.trip_item_id OR expense_id = OLD.expense_id;
END;
`;
