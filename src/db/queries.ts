/**
 * Notable SQL kept free of native imports so it can be tested in node
 * against better-sqlite3. See docs/technical-reference.md §10.
 */

import { LIKE_ESCAPE_CLAUSE } from '../domain/search';

/** Counts what deleting a trip would destroy, for the confirmation dialog. */
export const COUNT_TRIP_CONTENTS = `
SELECT
  (SELECT COUNT(*) FROM trip_items WHERE trip_id = $id) AS items,
  -- Distinct: one file attached to the trip and to an item is still one file.
  (SELECT COUNT(DISTINCT r.stored_path) FROM resources r
     WHERE r.kind = 'file'
       AND (r.trip_id = $id
            OR r.trip_item_id IN (SELECT id FROM trip_items WHERE trip_id = $id))) AS files,
  (SELECT COUNT(*) FROM expenses WHERE trip_id = $id) AS expenses
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

/**
 * Everything that could still remind: booked, dated, and not yet started, across every trip. A
 * reminder never fires after its item starts, so a start in the past rules it out.
 */
export const SELECT_REMINDER_CANDIDATES = `
SELECT ${ITEM_COLUMNS}
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.status = 'confirmed'
   AND i.start_utc IS NOT NULL
   AND i.start_utc > $now
 ORDER BY i.start_utc
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

/** Trip documents. A receipt is filed under its trip too, but belongs to its expense. */
export const SELECT_RESOURCES_FOR_TRIP = `
SELECT * FROM resources WHERE trip_id = $id AND expense_id IS NULL ORDER BY sort_order, created_at
`;

export const SELECT_RESOURCES_FOR_EXPENSE = `
SELECT * FROM resources WHERE expense_id = $id ORDER BY sort_order, created_at
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

/**
 * A receipt: filed under the expense's trip, which the table's one-owner CHECK requires, and
 * naming the expense. Inserts nothing when the expense does not exist — the caller checks.
 */
export const INSERT_RECEIPT = `
INSERT INTO resources
  (id, trip_id, expense_id, kind, subtype, label,
   url, stored_path, file_name, mime_type, size_bytes, sort_order, created_at)
SELECT $id, e.trip_id, e.id, $kind, $subtype, $label,
       $url, $storedPath, $fileName, $mimeType, $sizeBytes,
       COALESCE((SELECT MAX(sort_order) + 1 FROM resources WHERE expense_id = e.id), 0),
       $now
  FROM expenses e
 WHERE e.id = $expenseId
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

/**
 * Attaches an existing attachment to an item as well (U4): a second row pointing at the SAME
 * stored file or link. Nothing is copied, and the file stays while either row exists — the sweep
 * collects only files no row references.
 */
export const COPY_RESOURCE_TO_ITEM = `
INSERT INTO resources
  (id, trip_id, trip_item_id, kind, subtype, label,
   url, stored_path, file_name, mime_type, size_bytes, sort_order, created_at)
SELECT $id, NULL, $itemId, kind, subtype, label,
       url, stored_path, file_name, mime_type, size_bytes,
       COALESCE((SELECT MAX(sort_order) + 1 FROM resources WHERE trip_item_id = $itemId), 0),
       $now
  FROM resources WHERE id = $sourceId
`;

/** The trip an attachment belongs to, whether it hangs off the trip or one of its items. */
export const SELECT_RESOURCE_TRIP_ID = `
SELECT COALESCE(r.trip_id, i.trip_id) AS trip_id
  FROM resources r LEFT JOIN trip_items i ON i.id = r.trip_item_id
 WHERE r.id = $id
`;

/** Items already holding this same file or link, so they are not offered twice. */
export const SELECT_ITEMS_SHARING_RESOURCE = `
SELECT DISTINCT o.trip_item_id AS item_id
  FROM resources r JOIN resources o
    ON o.kind = r.kind
   AND ((r.kind = 'file' AND o.stored_path = r.stored_path)
     OR (r.kind = 'link' AND o.url = r.url))
 WHERE r.id = $id AND o.trip_item_id IS NOT NULL
`;

/** Other rows pointing at this attachment's file: removing this one then keeps the file. */
export const COUNT_OTHER_FILE_REFERENCES = `
SELECT COUNT(*) AS n
  FROM resources r JOIN resources o ON o.stored_path = r.stored_path AND o.id <> r.id
 WHERE r.id = $id AND r.kind = 'file'
`;

/** Files that deleting this item would really remove: those no other row also points at. */
export const COUNT_ITEM_OWN_FILES = `
SELECT COUNT(DISTINCT r.stored_path) AS n
  FROM resources r
 WHERE r.trip_item_id = $id AND r.kind = 'file'
   AND NOT EXISTS (SELECT 1 FROM resources o
                    WHERE o.stored_path = r.stored_path AND o.trip_item_id IS NOT $id)
`;

/**
 * Every place name already written, in any trip, offered while typing one (U5). This trip's
 * first, then the most recently edited; `suggestPlaces` filters and de-duplicates.
 */
export const SELECT_KNOWN_PLACES = `
SELECT location_name AS name, address
  FROM trip_items
 WHERE location_name IS NOT NULL AND TRIM(location_name) <> '' AND status <> 'cancelled'
 ORDER BY (trip_id = $tripId) DESC, updated_at DESC
 LIMIT 500
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

/* Travellers (C2). Profiles in the order they were added; a trip's in the order it chose them. */

export const SELECT_TRAVELLERS = `
SELECT * FROM travellers ORDER BY sort_order, name
`;

export const INSERT_TRAVELLER = `
INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
VALUES ($id, $name, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM travellers), $now, $now)
`;

export const RENAME_TRAVELLER = `
UPDATE travellers SET name = $name, updated_at = $now WHERE id = $id
`;

/** Where a profile is used: the trips it goes on, and how many items list it. */
export const SELECT_TRAVELLER_TRIPS = `
SELECT t.name FROM trip_travellers tt JOIN trips t ON t.id = tt.trip_id
 WHERE tt.traveller_id = $id ORDER BY t.start_date
`;

export const COUNT_TRAVELLER_ITEMS = `
SELECT COUNT(*) AS n FROM item_participants WHERE traveller_id = $id
`;

export const SELECT_TRIP_TRAVELLERS = `
SELECT p.* FROM trip_travellers tt JOIN travellers p ON p.id = tt.traveller_id
 WHERE tt.trip_id = $tripId ORDER BY tt.sort_order, p.name
`;

export const INSERT_TRIP_TRAVELLER = `
INSERT INTO trip_travellers (trip_id, traveller_id, sort_order)
VALUES ($tripId, $travellerId,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM trip_travellers WHERE trip_id = $tripId))
ON CONFLICT (trip_id, traveller_id) DO NOTHING
`;

/** Leaving a trip takes them off its items too: otherwise the profile could never be deleted. */
export const DELETE_TRIP_TRAVELLER_PARTICIPATION = `
DELETE FROM item_participants
 WHERE traveller_id = $travellerId
   AND item_id IN (SELECT id FROM trip_items WHERE trip_id = $tripId)
`;

export const DELETE_TRIP_TRAVELLER = `
DELETE FROM trip_travellers WHERE trip_id = $tripId AND traveller_id = $travellerId
`;

export const SELECT_ITEM_PARTICIPANTS = `
SELECT p.* FROM item_participants ip
  JOIN travellers p ON p.id = ip.traveller_id
  LEFT JOIN trip_items i ON i.id = ip.item_id
  LEFT JOIN trip_travellers tt ON tt.trip_id = i.trip_id AND tt.traveller_id = p.id
 WHERE ip.item_id = $itemId
 ORDER BY tt.sort_order, p.name
`;

export const DELETE_ITEM_PARTICIPANTS = `DELETE FROM item_participants WHERE item_id = $itemId`;

export const INSERT_ITEM_PARTICIPANT = `
INSERT INTO item_participants (item_id, traveller_id) VALUES ($itemId, $travellerId)
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
              'stored_path', 'file_name', 'mime_type', 'size_bytes', 'sort_order', 'created_at',
              'expense_id'],
  expenses: ['id', 'trip_id', 'category', 'label', 'amount', 'currency', 'spent_on', 'notes',
             'paid_by', 'split', 'created_at', 'updated_at'],
  payments: ['id', 'trip_id', 'from_name', 'to_name', 'amount', 'currency', 'created_at'],
  settings: ['key', 'value'],
  // Format 3 (Fieldbook, migration 003).
  travellers: ['id', 'name', 'sort_order', 'created_at', 'updated_at'],
  trip_travellers: ['trip_id', 'traveller_id', 'sort_order'],
  item_participants: ['item_id', 'traveller_id'],
  lists: ['id', 'trip_id', 'kind', 'name', 'source_list_id', 'sort_order', 'created_at',
          'updated_at'],
  list_items: ['id', 'list_id', 'label', 'quantity', 'unit', 'category', 'note', 'traveller_id',
               'done_at', 'sort_order', 'created_at', 'updated_at'],
  templates: ['id', 'name', 'content', 'created_at', 'updated_at'],
  template_uses: ['trip_id', 'template_id', 'applied_at'],
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
 * A row that belongs to no trip — a traveller, a reusable list or its item, a template — in an
 * import. *Keep mine* adds it only when the phone lacks it; *Use the backup's* also updates the
 * phone's row with the same id. Never a delete: a profile still in use cannot be removed.
 */
export const upsertSharedRow = (table: ExportTableName, mode: 'merge' | 'replace') => {
  const columns = EXPORT_COLUMNS[table].filter((column) => column !== 'id');
  const onConflict =
    mode === 'merge'
      ? 'DO NOTHING'
      : `DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')}`;
  return `${insertRow(table)} ON CONFLICT(id) ${onConflict}`;
};

/**
 * Replace mode deletes the trip first and lets the cascade clear its children. Using
 * INSERT OR REPLACE instead would cascade the children away *after* they were written.
 */
export const DELETE_TRIP_FOR_REPLACE = `DELETE FROM trips WHERE id = $id`;

/** Spending (N5). Newest day first, then the latest entered — the order the list shows. */
export const SELECT_EXPENSES_FOR_TRIP = `
SELECT * FROM expenses WHERE trip_id = $tripId ORDER BY spent_on DESC, created_at DESC
`;

export const SELECT_EXPENSE = `
SELECT * FROM expenses WHERE id = $id
`;

export const INSERT_EXPENSE = `
INSERT INTO expenses
  (id, trip_id, category, label, amount, currency, spent_on, notes, created_at, updated_at)
VALUES
  ($id, $tripId, $category, $label, $amount, $currency, $spentOn, $notes, $now, $now)
`;

/** Leaves paid_by and split alone: nothing on the form sets them yet. */
export const UPDATE_EXPENSE = `
UPDATE expenses
   SET category = $category, label = $label, amount = $amount, currency = $currency,
       spent_on = $spentOn, notes = $notes, updated_at = $now
 WHERE id = $id
`;

/** Its receipt rows cascade; their files go in the next sweep. */
export const DELETE_EXPENSE = `
DELETE FROM expenses WHERE id = $id
`;

/** How many receipts each of a trip's expenses has, for the paperclip on its row. */
export const COUNT_RECEIPTS_FOR_TRIP = `
SELECT r.expense_id, COUNT(*) AS n
  FROM resources r JOIN expenses e ON e.id = r.expense_id
 WHERE e.trip_id = $tripId
 GROUP BY r.expense_id
`;
