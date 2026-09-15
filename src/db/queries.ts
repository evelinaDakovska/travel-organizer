/**
 * Notable SQL kept free of native imports so it can be tested in node
 * against better-sqlite3. See docs/technical-reference.md §10.
 */

import { LIKE_ESCAPE_CLAUSE } from '../domain/search';

/** Counts what deleting a trip would destroy, for the confirmation dialog. */
export const COUNT_TRIP_CONTENTS = `
SELECT
  (SELECT COUNT(*) FROM trip_items WHERE trip_id = $id) AS items,
  (SELECT COUNT(*) FROM resources r
     WHERE r.kind = 'file'
       AND (r.trip_id = $id
            OR r.trip_item_id IN (SELECT id FROM trip_items WHERE trip_id = $id))) AS files
`;

/** Items carry the trip's default zone so an unqualified moment can be resolved on parse. */
const ITEM_COLUMNS = `i.*, t.default_tz AS trip_default_tz`;

export const SELECT_TRIP_ITEMS = `
SELECT ${ITEM_COLUMNS}
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId
 ORDER BY (i.start_utc IS NULL), i.start_utc, i.title
`;

export const SELECT_TRIP_ITEM = `
SELECT ${ITEM_COLUMNS}
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.id = $id
`;

export const INSERT_TRIP_ITEM = `
INSERT INTO trip_items
  (id, trip_id, kind, subkind, status, priority, title,
   start_local, start_tz, start_precision, start_utc,
   end_local, end_tz, end_precision, end_utc,
   location_name, address, latitude, longitude,
   confirmation_code, notes, details, price_amount, price_currency, is_paid,
   created_at, updated_at)
VALUES
  ($id, $tripId, $kind, $subkind, $status, $priority, $title,
   $startLocal, $startTz, $startPrecision, $startUtc,
   $endLocal, $endTz, $endPrecision, $endUtc,
   $locationName, $address, $latitude, $longitude,
   $confirmationCode, $notes, $details, $priceAmount, $priceCurrency, $isPaid,
   $now, $now)
`;

export const UPDATE_TRIP_ITEM = `
UPDATE trip_items SET
  kind = $kind, subkind = $subkind, status = $status, priority = $priority, title = $title,
  start_local = $startLocal, start_tz = $startTz,
  start_precision = $startPrecision, start_utc = $startUtc,
  end_local = $endLocal, end_tz = $endTz,
  end_precision = $endPrecision, end_utc = $endUtc,
  location_name = $locationName, address = $address,
  latitude = $latitude, longitude = $longitude,
  confirmation_code = $confirmationCode, notes = $notes, details = $details,
  price_amount = $priceAmount, price_currency = $priceCurrency, is_paid = $isPaid,
  updated_at = $now
WHERE id = $id
`;

/** Clearing completion is only meaningful for a task; the schema enforces that. */
export const SET_TASK_COMPLETED = `
UPDATE trip_items SET completed_at = $completedAt, updated_at = $now
 WHERE id = $id AND kind = 'task'
`;

/**
 * Only rows that lean on the trip's default zone need new instants when it changes.
 * A row with its own `*_tz` is unaffected.
 */
export const SELECT_ITEMS_WITH_DEFAULT_TZ = `
SELECT i.id, i.start_local, i.start_precision, i.start_tz,
       i.end_local, i.end_precision, i.end_tz
  FROM trip_items i
 WHERE i.trip_id = $tripId
   AND ((i.start_local IS NOT NULL AND i.start_tz IS NULL)
     OR (i.end_local   IS NOT NULL AND i.end_tz   IS NULL))
`;

export const UPDATE_ITEM_INSTANTS = `
UPDATE trip_items SET start_utc = $startUtc, end_utc = $endUtc, updated_at = $now
 WHERE id = $id
`;

/** Trip-level and item-level resources are the same table, distinguished by which id is set. */
export const SELECT_RESOURCES_FOR_ITEM = `
SELECT * FROM resources WHERE trip_item_id = $id ORDER BY sort_order, created_at
`;

export const SELECT_RESOURCES_FOR_TRIP = `
SELECT * FROM resources WHERE trip_id = $id ORDER BY sort_order, created_at
`;

export const SELECT_RESOURCE = `
SELECT * FROM resources WHERE id = $id
`;

/** Every item attachment in a trip, for the Now and Timeline cards. Trip documents are not included. */
export const SELECT_ITEM_RESOURCES_FOR_TRIP = `
SELECT r.* FROM resources r
  JOIN trip_items i ON i.id = r.trip_item_id
 WHERE i.trip_id = $tripId
 ORDER BY r.sort_order, r.created_at
`;

export const INSERT_RESOURCE = `
INSERT INTO resources
  (id, trip_id, trip_item_id, kind, subtype, label,
   url, stored_path, file_name, mime_type, size_bytes, sort_order, created_at)
VALUES
  ($id, $tripId, $tripItemId, $kind, $subtype, $label,
   $url, $storedPath, $fileName, $mimeType, $sizeBytes,
   COALESCE((SELECT MAX(sort_order) + 1 FROM resources
              WHERE trip_id IS $tripId AND trip_item_id IS $tripItemId), 0),
   $now)
`;

export const UPDATE_RESOURCE_LABEL = `
UPDATE resources SET label = $label, subtype = $subtype WHERE id = $id
`;

/** Every file the database still points at, across both owner kinds. The sweep keeps these. */
export const SELECT_ALL_STORED_PATHS = `
SELECT stored_path FROM resources WHERE kind = 'file' AND stored_path IS NOT NULL
`;

/** Files belonging to one trip, for the confirmation dialog and for export. */
export const SELECT_TRIP_STORED_PATHS = `
SELECT stored_path FROM resources
 WHERE kind = 'file' AND stored_path IS NOT NULL
   AND (trip_id = $tripId
        OR trip_item_id IN (SELECT id FROM trip_items WHERE trip_id = $tripId))
`;

/** Bookings: what is settled. Grouped by kind in the UI, so kind leads the ordering. */
export const SELECT_BOOKINGS = `
SELECT i.*, t.default_tz AS trip_default_tz
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId AND i.status = 'confirmed'
 ORDER BY (i.start_utc IS NULL), i.start_utc, i.title
`;

/** Places: what is only an idea. Unrated sits below maybe rather than among it. */
export const SELECT_PLACES = `
SELECT i.*, t.default_tz AS trip_default_tz
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId AND i.status = 'idea'
 ORDER BY CASE i.priority
            WHEN 'must' THEN 0 WHEN 'want' THEN 1 WHEN 'maybe' THEN 2 ELSE 3 END,
          i.title
`;

/** Promoting a place to a plan is one UPDATE — the row never moves table or identity. */
export const SCHEDULE_TRIP_ITEM = `
UPDATE trip_items SET
  start_local = $startLocal, start_tz = $startTz,
  start_precision = $startPrecision, start_utc = $startUtc,
  status = $status, updated_at = $now
WHERE id = $id
`;

/** Cancel or restore. Dates, notes and attachments are left exactly as they were. */
export const UPDATE_TRIP_ITEM_STATUS = `
UPDATE trip_items SET status = $status, updated_at = $now WHERE id = $id
`;

/** Cancelled rows stay searchable: finding the cancellation document is the point of keeping them. */
export const SEARCH_TRIP_ITEMS = `
SELECT i.*, t.default_tz AS trip_default_tz
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId
   AND (i.title             LIKE $q ${LIKE_ESCAPE_CLAUSE}
     OR i.notes             LIKE $q ${LIKE_ESCAPE_CLAUSE}
     OR i.location_name     LIKE $q ${LIKE_ESCAPE_CLAUSE}
     OR i.address           LIKE $q ${LIKE_ESCAPE_CLAUSE}
     OR i.confirmation_code LIKE $q ${LIKE_ESCAPE_CLAUSE})
 ORDER BY (i.start_utc IS NULL), i.start_utc, i.title
`;

export const SEARCH_TRIP_NOTES = `
SELECT * FROM trip_notes
 WHERE trip_id = $tripId
   AND (title LIKE $q ${LIKE_ESCAPE_CLAUSE} OR body LIKE $q ${LIKE_ESCAPE_CLAUSE})
 ORDER BY pinned DESC, sort_order, title
`;

export const SELECT_NOTES = `
SELECT * FROM trip_notes WHERE trip_id = $tripId ORDER BY pinned DESC, sort_order, created_at
`;

export const INSERT_NOTE = `
INSERT INTO trip_notes (id, trip_id, title, body, pinned, sort_order, created_at, updated_at)
VALUES ($id, $tripId, $title, $body, $pinned,
        COALESCE((SELECT MAX(sort_order) + 1 FROM trip_notes WHERE trip_id = $tripId), 0),
        $now, $now)
`;

export const UPDATE_NOTE = `
UPDATE trip_notes SET title = $title, body = $body, pinned = $pinned, updated_at = $now
 WHERE id = $id
`;

export const SET_NOTE_PINNED = `
UPDATE trip_notes SET pinned = $pinned, updated_at = $now WHERE id = $id
`;

/** Column order for the backup. Append only — a restore binds by name, but order documents it. */
export const EXPORT_COLUMNS = {
  trips: ['id', 'name', 'destination', 'start_date', 'end_date', 'default_tz', 'cover_path',
          'notes', 'traveller_count', 'travellers', 'created_at', 'updated_at'],
  trip_items: ['id', 'trip_id', 'kind', 'subkind', 'status', 'priority', 'title',
               'start_local', 'start_tz', 'start_precision', 'start_utc',
               'end_local', 'end_tz', 'end_precision', 'end_utc', 'completed_at',
               'location_name', 'address', 'latitude', 'longitude', 'confirmation_code',
               'notes', 'details', 'price_amount', 'price_currency', 'is_paid',
               'created_at', 'updated_at'],
  trip_notes: ['id', 'trip_id', 'title', 'body', 'pinned', 'sort_order',
               'created_at', 'updated_at'],
  resources: ['id', 'trip_id', 'trip_item_id', 'kind', 'subtype', 'label', 'url',
              'stored_path', 'file_name', 'mime_type', 'size_bytes', 'sort_order', 'created_at'],
  settings: ['key', 'value'],
} as const satisfies Record<string, readonly string[]>;

export type ExportTableName = keyof typeof EXPORT_COLUMNS;

export const selectAll = (table: ExportTableName) =>
  `SELECT ${EXPORT_COLUMNS[table].join(', ')} FROM ${table}`;

/** Parameters are named after the columns, so a raw row binds without being reshaped. */
export const insertRow = (table: ExportTableName) => {
  const columns = EXPORT_COLUMNS[table];
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
    .map((column) => `$${column}`)
    .join(', ')})`;
};

/**
 * Settings are global rather than owned by a trip, so the import mode decides their fate:
 * merge leaves what is already here, replace overwrites it — same rule as trips.
 */
export const MERGE_SETTING = `
INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO NOTHING
`;

export const REPLACE_SETTING = `
INSERT INTO settings (key, value) VALUES ($key, $value)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`;

/**
 * Replace mode deletes the trip first and lets the cascade clear its children. Using
 * INSERT OR REPLACE instead would cascade the children away *after* they were written.
 */
export const DELETE_TRIP_FOR_REPLACE = `DELETE FROM trips WHERE id = $id`;
