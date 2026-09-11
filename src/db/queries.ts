/**
 * Notable SQL kept free of native imports so it can be tested in node
 * against better-sqlite3. See docs/technical-reference.md §10.
 */

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
