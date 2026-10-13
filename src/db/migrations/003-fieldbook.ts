/**
 * Travellers, lists and templates (Fieldbook, Part C). Purely additive: seven new tables and
 * their indexes. No existing table is altered and no existing row is read or written, so a
 * phone's data comes through the upgrade exactly as it was. The design is in
 * `docs/fieldbook-plan.md` §4.1.
 */
export const sql = /* sql */ `
CREATE TABLE travellers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A profile cannot be deleted while a trip or an item uses it (RESTRICT): removing someone
-- from a trip is a deliberate step, never a side effect.
CREATE TABLE trip_travellers (
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  traveller_id TEXT NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, traveller_id)
);

CREATE INDEX idx_trip_travellers_traveller ON trip_travellers(traveller_id);

CREATE TABLE item_participants (
  item_id      TEXT NOT NULL REFERENCES trip_items(id) ON DELETE CASCADE,
  traveller_id TEXT NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, traveller_id)
);

CREATE INDEX idx_item_participants_traveller ON item_participants(traveller_id);

-- trip_id NULL: a reusable list. source_list_id says which reusable list a trip copy came from;
-- provenance only, deliberately not a foreign key (a per-trip backup leaves the source out).
CREATE TABLE lists (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT REFERENCES trips(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('packing','shopping')),
  name           TEXT NOT NULL,
  source_list_id TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_lists_trip ON lists(trip_id, kind, sort_order);

CREATE TABLE list_items (
  id           TEXT PRIMARY KEY,
  list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  quantity     INTEGER CHECK (quantity IS NULL OR quantity > 0),
  unit         TEXT,
  category     TEXT,
  note         TEXT,
  traveller_id TEXT REFERENCES travellers(id) ON DELETE SET NULL,
  done_at      TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_list_items_list ON list_items(list_id, sort_order);

-- One validated JSON document per template (tasks, notes, lists); applied whole, never queried.
CREATE TABLE templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Which template was applied to which trip, to warn before applying it again. template_id is
-- provenance, not a foreign key: deleting a template leaves the trips and this record alone.
CREATE TABLE template_uses (
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  applied_at  TEXT NOT NULL,
  PRIMARY KEY (trip_id, template_id, applied_at)
);
`;
