export const sql = /* sql */ `
CREATE TABLE trips (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  default_tz  TEXT NOT NULL,
  cover_path  TEXT,
  notes       TEXT,

  traveller_count INTEGER,
  travellers      TEXT,

  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,

  CHECK (end_date >= start_date)
);

CREATE TABLE trip_items (
  id      TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,

  kind     TEXT NOT NULL
             CHECK (kind IN ('transport','stay','activity','food','task','other')),
  subkind  TEXT,
  status   TEXT NOT NULL DEFAULT 'idea'
             CHECK (status IN ('idea','confirmed','cancelled')),
  priority TEXT CHECK (priority IN ('must','want','maybe')),

  title TEXT NOT NULL,

  start_local     TEXT,
  start_tz        TEXT,
  start_precision TEXT CHECK (start_precision IN ('date','time')),
  start_utc       TEXT,

  end_local       TEXT,
  end_tz          TEXT,
  end_precision   TEXT CHECK (end_precision IN ('date','time')),
  end_utc         TEXT,

  completed_at TEXT,

  location_name TEXT,
  address       TEXT,
  latitude      REAL,
  longitude     REAL,

  confirmation_code TEXT,
  notes             TEXT,
  details           TEXT,

  price_amount   INTEGER,
  price_currency TEXT,
  is_paid        INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0,1)),

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (start_local IS NULL OR start_precision IS NOT NULL),
  CHECK (end_local   IS NULL OR end_precision   IS NOT NULL),
  CHECK (end_utc IS NULL OR start_utc IS NULL OR end_utc >= start_utc),
  CHECK (price_amount IS NULL OR price_currency IS NOT NULL),
  CHECK (completed_at IS NULL OR kind = 'task')
);

CREATE INDEX idx_items_trip_start  ON trip_items(trip_id, start_utc);
CREATE INDEX idx_items_trip_kind   ON trip_items(trip_id, kind);
CREATE INDEX idx_items_trip_status ON trip_items(trip_id, status);

CREATE TABLE trip_notes (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_notes_trip ON trip_notes(trip_id, pinned DESC, sort_order);

CREATE TABLE resources (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT REFERENCES trips(id)      ON DELETE CASCADE,
  trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,

  kind    TEXT NOT NULL CHECK (kind IN ('file','link')),
  subtype TEXT NOT NULL DEFAULT 'generic'
            CHECK (subtype IN ('generic','ticket','confirmation','wallet','maps','website')),
  label   TEXT NOT NULL,

  url         TEXT,
  stored_path TEXT,
  file_name   TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,

  CHECK ((trip_id IS NULL) <> (trip_item_id IS NULL)),
  CHECK ((kind = 'link' AND url IS NOT NULL)
      OR (kind = 'file' AND stored_path IS NOT NULL))
);

CREATE INDEX idx_resources_item ON resources(trip_item_id, sort_order);
CREATE INDEX idx_resources_trip ON resources(trip_id, sort_order);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
