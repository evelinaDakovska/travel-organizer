/**
 * Trips without fixed dates (Phase 6, `docs/phase6-plan.md` §3). SQLite cannot drop NOT NULL in
 * place, so `trips` is rebuilt the documented way: a new table with the same columns in the same
 * order, every row copied, the old one dropped and the new one renamed. Both dates are set or both
 * are NULL, never one — no date is ever invented for an undated trip.
 *
 * Runs with foreign keys OFF (`rebuildsTables` in the index): with them on, dropping `trips` would
 * cascade-delete every row of every child table. The children's `REFERENCES trips(id)` name the
 * table, so after the rename they point at the new one.
 */
export const sql = /* sql */ `
CREATE TABLE trips_new (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT,
  start_date  TEXT,
  end_date    TEXT,
  default_tz  TEXT NOT NULL,
  cover_path  TEXT,
  notes       TEXT,

  traveller_count INTEGER,
  travellers      TEXT,

  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  converted_travellers TEXT NOT NULL DEFAULT '[]',
  report_currency TEXT
    CHECK (report_currency IS NULL OR (length(report_currency) = 3 AND report_currency = upper(report_currency))),

  CHECK ((start_date IS NULL) = (end_date IS NULL)),
  CHECK (start_date IS NULL OR end_date >= start_date)
);

INSERT INTO trips_new (id, name, destination, start_date, end_date, default_tz, cover_path, notes,
                       traveller_count, travellers, created_at, updated_at, converted_travellers,
                       report_currency)
SELECT id, name, destination, start_date, end_date, default_tz, cover_path, notes,
       traveller_count, travellers, created_at, updated_at, converted_travellers, report_currency
  FROM trips;

DROP TABLE trips;
ALTER TABLE trips_new RENAME TO trips;
`;
