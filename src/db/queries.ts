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
  (SELECT COUNT(*) FROM expenses WHERE trip_id = $id) AS expenses,
  (SELECT COUNT(*) FROM booking_payments WHERE trip_id = $id) AS payments,
  (SELECT COUNT(DISTINCT COALESCE(trip_item_id, expense_id)) FROM cost_shares WHERE trip_id = $id)
    AS splits,
  (SELECT COUNT(*) FROM settlements WHERE trip_id = $id) AS settlements
`;

/**
 * Items carry the trip's default zone so an unqualified moment can be resolved on parse, and what
 * is recorded as paid towards their price (3D-1): payments plus linked expenses, in the price's
 * currency only — the app never adds currencies, and a record in another one cannot be saved.
 */
const ITEM_COLUMNS = `i.*, t.default_tz AS trip_default_tz,
  (SELECT COALESCE(SUM(p.amount), 0) FROM booking_payments p
    WHERE p.trip_item_id = i.id AND p.currency = i.price_currency)
  + (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e
    WHERE e.trip_item_id = i.id AND e.currency = i.price_currency) AS recorded_paid`;

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
/** Every dated item of a trip: an imported trip's instants are all rebuilt, not trusted (2B). */
export const SELECT_TRIP_ITEM_MOMENTS = `
SELECT id, start_local, start_precision, start_tz, end_local, end_precision, end_tz
  FROM trip_items WHERE trip_id = $tripId
`;

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

/** The caches only: an imported item keeps the `updated_at` it was exported with (2B). */
export const SET_ITEM_INSTANTS = `
UPDATE trip_items SET start_utc = $startUtc, end_utc = $endUtc WHERE id = $id
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
SELECT ${ITEM_COLUMNS}
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId AND i.status = 'confirmed'
 ORDER BY (i.start_utc IS NULL), i.start_utc, i.title
`;

/** Places: what is only an idea. Unrated sits below maybe rather than among it. */
export const SELECT_PLACES = `
SELECT ${ITEM_COLUMNS}
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
SELECT ${ITEM_COLUMNS}
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
INSERT INTO travellers (id, name, sort_order, classification, created_at, updated_at)
VALUES ($id, $name, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM travellers), COALESCE($classification, 'unspecified'), $now, $now)
`;

export const RENAME_TRAVELLER = `
UPDATE travellers SET name = $name, updated_at = $now WHERE id = $id
`;

export const UPDATE_TRAVELLER_CLASSIFICATION = `
UPDATE travellers SET classification = $classification, updated_at = $now WHERE id = $id
`;

/** Where a profile is used: the trips it goes on, and how many items list it. */
export const SELECT_TRAVELLER_TRIPS = `
SELECT t.name FROM trip_travellers tt JOIN trips t ON t.id = tt.trip_id
 WHERE tt.traveller_id = $id ORDER BY t.start_date
`;

/** Trips a traveller is not on yet, soonest first: what *Add me to trips* offers (2B-0). */
export const SELECT_TRIPS_WITHOUT_TRAVELLER = `
SELECT id, name, start_date, end_date FROM trips
 WHERE id NOT IN (SELECT trip_id FROM trip_travellers WHERE traveller_id = $id)
 ORDER BY start_date
`;

export const COUNT_TRAVELLER_ITEMS = `
SELECT COUNT(*) AS n FROM item_participants WHERE traveller_id = $id
`;

export const SELECT_TRIP_TRAVELLERS = `
SELECT p.id, p.name, tt.sort_order, tt.classification, p.created_at, p.updated_at
  FROM trip_travellers tt JOIN travellers p ON p.id = tt.traveller_id
 WHERE tt.trip_id = $tripId ORDER BY tt.sort_order, p.name
`;

export const INSERT_TRIP_TRAVELLER = `
INSERT INTO trip_travellers (trip_id, traveller_id, sort_order, classification)
VALUES ($tripId, $travellerId,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM trip_travellers WHERE trip_id = $tripId),
        COALESCE($classification, (SELECT classification FROM travellers WHERE id = $travellerId), 'unspecified'))
ON CONFLICT (trip_id, traveller_id) DO NOTHING
`;

export const UPDATE_TRIP_TRAVELLER_CLASSIFICATION = `
UPDATE trip_travellers SET classification = $classification WHERE trip_id = $tripId AND traveller_id = $travellerId
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

/**
 * What someone who just joined a trip could be added to (3B): its plans and saved places they are
 * not on yet — never a to-do or a cancelled plan. `domain/participation.ts` orders them.
 */
export const SELECT_JOIN_CANDIDATES = `
SELECT ${ITEM_COLUMNS}
  FROM trip_items i JOIN trips t ON t.id = i.trip_id
 WHERE i.trip_id = $tripId
   AND i.kind <> 'task'
   AND i.status <> 'cancelled'
   AND NOT EXISTS (SELECT 1 FROM item_participants ip
                    WHERE ip.item_id = i.id AND ip.traveller_id = $travellerId)
`;

/**
 * Adds one person to one item, only when the item is in that trip and can be offered
 * (`SELECT_JOIN_CANDIDATES`); someone already on it is left as they are. Nobody else's
 * participation, and nothing on the item itself, changes.
 */
export const INSERT_JOIN_PARTICIPANT = `
INSERT INTO item_participants (item_id, traveller_id)
SELECT i.id, $travellerId FROM trip_items i
 WHERE i.id = $itemId AND i.trip_id = $tripId AND i.kind <> 'task' AND i.status <> 'cancelled'
ON CONFLICT (item_id, traveller_id) DO NOTHING
`;

/* Lists (C1). A list with no trip is a reusable one; its items are never ticked. */

/** Lists with how many rows they hold and how many are ticked, for one trip or the reusable ones. */
const LIST_WITH_PROGRESS = `
SELECT l.*,
       (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) AS item_count,
       (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.done_at IS NOT NULL)
         AS done_count
  FROM lists l
`;

export const SELECT_TRIP_LISTS = `${LIST_WITH_PROGRESS}
 WHERE l.trip_id = $tripId ORDER BY l.kind, l.sort_order, l.name`;

export const SELECT_REUSABLE_LISTS = `${LIST_WITH_PROGRESS}
 WHERE l.trip_id IS NULL ORDER BY l.kind, l.sort_order, l.name`;

export const SELECT_LIST = `SELECT * FROM lists WHERE id = $id`;

export const INSERT_LIST = `
INSERT INTO lists (id, trip_id, kind, name, source_list_id, sort_order, created_at, updated_at)
VALUES ($id, $tripId, $kind, $name, $sourceListId,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM lists
          WHERE trip_id IS $tripId AND kind = $kind),
        $now, $now)
`;

export const RENAME_LIST = `UPDATE lists SET name = $name, updated_at = $now WHERE id = $id`;

/** How many copies of a reusable list a trip already has, to warn before another. */
export const COUNT_TRIP_COPIES = `
SELECT COUNT(*) AS n FROM lists WHERE trip_id = $tripId AND source_list_id = $sourceListId
`;

export const SELECT_LIST_ITEMS = `
SELECT * FROM list_items WHERE list_id = $listId ORDER BY sort_order, created_at
`;

export const SELECT_LIST_ITEM = `SELECT * FROM list_items WHERE id = $id`;

/** `traveller_id` is legacy since migration 006: a new item leaves it empty (recipients below). */
export const INSERT_LIST_ITEM = `
INSERT INTO list_items (id, list_id, label, quantity, unit, category, note, traveller_id, done_at,
                        sort_order, created_at, updated_at)
VALUES ($id, $listId, $label, $quantity, $unit, $category, $note, NULL, NULL,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM list_items WHERE list_id = $listId),
        $now, $now)
`;

export const UPDATE_LIST_ITEM = `
UPDATE list_items
   SET label = $label, quantity = $quantity, unit = $unit, category = $category, note = $note,
       updated_at = $now
 WHERE id = $id
`;

/** Ticks only on a trip's list: a reusable one is never packed or bought (FB-15). */
export const SET_LIST_ITEM_DONE = `
UPDATE list_items SET done_at = $doneAt, updated_at = $now
 WHERE id = $id AND list_id IN (SELECT id FROM lists WHERE trip_id IS NOT NULL)
`;

export const SET_LIST_ITEM_ORDER = `UPDATE list_items SET sort_order = $sortOrder WHERE id = $id`;

/** A copy's items: new ids, in the same order, every tick cleared. */
export const COPY_LIST_ITEMS = `
INSERT INTO list_items (id, list_id, label, quantity, unit, category, note, traveller_id, done_at,
                        sort_order, created_at, updated_at)
SELECT $newId, $toListId, label, quantity, unit, category, note, NULL, NULL,
       sort_order, $now, $now
  FROM list_items WHERE id = $fromItemId
`;

/** Who a copied item is for goes with it (2B-0). */
export const COPY_LIST_ITEM_RECIPIENTS = `
INSERT OR IGNORE INTO list_item_recipients (list_item_id, traveller_id)
SELECT $newId, traveller_id FROM list_item_recipients WHERE list_item_id = $fromItemId
`;

/** Everyone each item of one list is for, by name, in the order travellers are kept. */
export const SELECT_LIST_RECIPIENTS = `
SELECT r.list_item_id, t.id, t.name, t.sort_order, t.classification, t.created_at, t.updated_at
  FROM list_item_recipients r
  JOIN travellers t ON t.id = r.traveller_id
  JOIN list_items li ON li.id = r.list_item_id
 WHERE li.list_id = $listId
 ORDER BY t.sort_order, t.name
`;

export const SELECT_LIST_ITEM_RECIPIENT_IDS = `
SELECT traveller_id FROM list_item_recipients WHERE list_item_id = $itemId
`;

export const DELETE_LIST_ITEM_RECIPIENTS = `DELETE FROM list_item_recipients WHERE list_item_id = $itemId`;

export const INSERT_LIST_ITEM_RECIPIENT = `
INSERT OR IGNORE INTO list_item_recipients (list_item_id, traveller_id) VALUES ($itemId, $travellerId)
`;

/** Column order for the backup. Append only — a restore binds by name, but order documents it. */
export const EXPORT_COLUMNS = {
  trips: ['id', 'name', 'destination', 'start_date', 'end_date', 'default_tz', 'cover_path',
          'notes', 'traveller_count', 'travellers', 'created_at', 'updated_at', 'converted_travellers',
          // Format 13 (migration 012, Phase 4).
          'report_currency'],
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
             'paid_by', 'split', 'created_at', 'updated_at',
             // Format 8 (migration 007, 3D-1).
             'trip_item_id', 'payer_id',
             // Format 13 (migration 012, Phase 4).
             'charged_amount', 'charged_currency'],
  payments: ['id', 'trip_id', 'from_name', 'to_name', 'amount', 'currency', 'created_at'],
  settings: ['key', 'value'],
  // Format 3 (Fieldbook, migration 003). Format 4 adds classification (migration 004).
  travellers: ['id', 'name', 'sort_order', 'created_at', 'updated_at', 'classification'],
  trip_travellers: ['trip_id', 'traveller_id', 'sort_order', 'classification'],
  item_participants: ['item_id', 'traveller_id'],
  lists: ['id', 'trip_id', 'kind', 'name', 'source_list_id', 'sort_order', 'created_at',
          'updated_at'],
  list_items: ['id', 'list_id', 'label', 'quantity', 'unit', 'category', 'note', 'traveller_id',
               'done_at', 'sort_order', 'created_at', 'updated_at'],
  templates: ['id', 'name', 'content', 'created_at', 'updated_at'],
  template_uses: ['trip_id', 'template_id', 'applied_at'],
  list_item_recipients: ['list_item_id', 'traveller_id'],
  booking_payments: ['id', 'trip_id', 'trip_item_id', 'payer_id', 'amount', 'currency', 'paid_on',
                     'note', 'created_at', 'updated_at',
                     // Format 13 (migration 012, Phase 4).
                     'charged_amount', 'charged_currency'],
  // Format 9 (migration 008, 3D-2).
  cost_shares: ['id', 'trip_id', 'trip_item_id', 'expense_id', 'traveller_id', 'amount',
                'covered_by', 'sort_order', 'created_at', 'updated_at'],
  trip_cover: ['trip_id', 'child_id', 'adult_id', 'sort_order'],
  // Format 10 (migration 009, 3E).
  settlements: ['id', 'trip_id', 'from_id', 'to_id', 'amount', 'currency', 'settled_on', 'note',
                'created_at', 'updated_at'],
  // Format 11 (migration 010, review P1).
  unsplit_confirmations: ['id', 'trip_id', 'trip_item_id', 'expense_id', 'fingerprint', 'confirmed_at'],
  // Format 12 (migration 011, settlement review holds).
  settlement_reviews: ['id', 'trip_id', 'currency', 'reason', 'cost_kind', 'cost_title', 'cost_amount',
                       'to_currency', 'created_at', 'acknowledged_at'],
  // Format 13 (migration 012, Phase 4).
  trip_rates: ['trip_id', 'currency', 'base_currency', 'rate', 'rate_date', 'updated_at'],
  // Format 14 (migration 013, review P1): one rate per pair; trip_rates is carried frozen.
  trip_exchange_rates: ['trip_id', 'currency', 'base_currency', 'rate', 'rate_date', 'updated_at'],
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
/** A link row keyed by both ends: one already here is the same fact, so it is kept, not doubled. */
export const insertLinkRow = (table: ExportTableName) =>
  insertRow(table).replace('INSERT INTO', 'INSERT OR IGNORE INTO');

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
  (id, trip_id, category, label, amount, currency, spent_on, notes, payer_id, trip_item_id,
   charged_amount, charged_currency, created_at, updated_at)
VALUES
  ($id, $tripId, $category, $label, $amount, $currency, $spentOn, $notes, $payerId, $tripItemId,
   $chargedAmount, $chargedCurrency, $now, $now)
`;

/** Leaves the legacy paid_by and split alone: they are never read or written (3D-1). */
export const UPDATE_EXPENSE = `
UPDATE expenses
   SET category = $category, label = $label, amount = $amount, currency = $currency,
       spent_on = $spentOn, notes = $notes, payer_id = $payerId, trip_item_id = $tripItemId,
       charged_amount = $chargedAmount, charged_currency = $chargedCurrency, updated_at = $now
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

/** Plan with AI (2D): how many are going, by classification — names are not selected at all. */
export const SELECT_TRIP_TRAVELLER_CLASSIFICATIONS = `
SELECT tt.classification FROM trip_travellers tt
 WHERE tt.trip_id = $tripId ORDER BY tt.sort_order, tt.traveller_id
`;

// ─── Money records linked to bookings (3D-1) ────────────────────────────────────────────────────

/** A booking's payments, oldest first; an undated one after the dated ones. */
export const SELECT_ITEM_PAYMENTS = `
SELECT * FROM booking_payments WHERE trip_item_id = $itemId
 ORDER BY (paid_on IS NULL), paid_on, created_at
`;

export const SELECT_BOOKING_PAYMENT = `
SELECT * FROM booking_payments WHERE id = $id
`;

export const SELECT_LINKED_EXPENSES = `
SELECT * FROM expenses WHERE trip_item_id = $itemId ORDER BY spent_on, created_at
`;

export const COUNT_ITEM_MONEY_RECORDS = `
SELECT (SELECT COUNT(*) FROM booking_payments WHERE trip_item_id = $itemId) AS payments,
       (SELECT COUNT(*) FROM expenses WHERE trip_item_id = $itemId) AS linkedExpenses
`;

export const INSERT_BOOKING_PAYMENT = `
INSERT INTO booking_payments
  (id, trip_id, trip_item_id, payer_id, amount, currency, paid_on, note, charged_amount,
   charged_currency, created_at, updated_at)
VALUES
  ($id, $tripId, $itemId, $payerId, $amount, $currency, $paidOn, $note, $chargedAmount,
   $chargedCurrency, $now, $now)
`;

/** The booking and the currency never change: a payment stays on the booking it was made for. */
export const UPDATE_BOOKING_PAYMENT = `
UPDATE booking_payments
   SET payer_id = $payerId, amount = $amount, paid_on = $paidOn, note = $note,
       charged_amount = $chargedAmount, charged_currency = $chargedCurrency, updated_at = $now
 WHERE id = $id
`;

export const DELETE_BOOKING_PAYMENT = `
DELETE FROM booking_payments WHERE id = $id
`;

/** Unlinking makes the expense standalone spending again; nothing else about it changes. */
export const UNLINK_EXPENSE = `
UPDATE expenses SET trip_item_id = NULL, updated_at = $now WHERE id = $id
`;

/** The payer last recorded on this trip, offered as a one-tap suggestion — never preselected. */
export const SELECT_LAST_PAYER = `
SELECT payer_id FROM (
  SELECT payer_id, created_at FROM booking_payments WHERE trip_id = $tripId AND payer_id IS NOT NULL
  UNION ALL
  SELECT payer_id, created_at FROM expenses WHERE trip_id = $tripId AND payer_id IS NOT NULL
) ORDER BY created_at DESC LIMIT 1
`;

/** Whether someone is on a trip: a payer must be (invariant P). */
export const SELECT_TRIP_MEMBER = `
SELECT 1 AS yes FROM trip_travellers WHERE trip_id = $tripId AND traveller_id = $travellerId
`;

/** What someone is recorded as having paid on one trip: they cannot leave it while it stands. */
export const COUNT_PAYER_RECORDS = `
SELECT (SELECT COUNT(*) FROM booking_payments WHERE trip_id = $tripId AND payer_id = $travellerId)
     + (SELECT COUNT(*) FROM expenses WHERE trip_id = $tripId AND payer_id = $travellerId) AS n
`;

// ─── Splits and cover (3D-2) ────────────────────────────────────────────────────────────────────

/** A booking's or an expense's split, in its order. Exactly one of the two ids is bound. */
export const SELECT_SHARES = `
SELECT * FROM cost_shares
 WHERE ($itemId IS NOT NULL AND trip_item_id = $itemId) OR ($expenseId IS NOT NULL AND expense_id = $expenseId)
 ORDER BY sort_order
`;

/** Every split on a trip: the Expenses tab marks split costs, and leaving names them. */
export const SELECT_TRIP_SHARES = `
SELECT * FROM cost_shares WHERE trip_id = $tripId ORDER BY sort_order
`;

/** How a cost is split, for the edit rules: how many people, how many with an amount, their sum. */
export const SELECT_SPLIT_FACTS = `
SELECT COUNT(*) AS people,
       COALESCE(SUM(amount IS NOT NULL), 0) AS withAmount,
       COALESCE(SUM(amount), 0) AS allocated
  FROM cost_shares
 WHERE ($itemId IS NOT NULL AND trip_item_id = $itemId) OR ($expenseId IS NOT NULL AND expense_id = $expenseId)
`;

export const DELETE_SHARES = `
DELETE FROM cost_shares
 WHERE ($itemId IS NOT NULL AND trip_item_id = $itemId) OR ($expenseId IS NOT NULL AND expense_id = $expenseId)
`;

export const INSERT_COST_SHARE = `
INSERT INTO cost_shares
  (id, trip_id, trip_item_id, expense_id, traveller_id, amount, covered_by, sort_order, created_at,
   updated_at)
VALUES
  ($id, $tripId, $itemId, $expenseId, $travellerId, $amount, $coveredBy, $sortOrder, $now, $now)
`;

export const SELECT_TRIP_COVER = `
SELECT child_id, adult_id, sort_order FROM trip_cover WHERE trip_id = $tripId ORDER BY sort_order
`;

export const DELETE_CHILD_COVER = `
DELETE FROM trip_cover WHERE trip_id = $tripId AND child_id = $childId
`;

export const INSERT_TRIP_COVER = `
INSERT INTO trip_cover (trip_id, child_id, adult_id, sort_order)
VALUES ($tripId, $childId, $adultId, $sortOrder)
`;

/**
 * What holds someone on a trip (invariant I): paid, in a split, covering a share by override, or
 * a settlement either way (3E).
 */
export const COUNT_HOLDS = `
SELECT (SELECT COUNT(*) FROM booking_payments WHERE trip_id = $tripId AND payer_id = $travellerId)
     + (SELECT COUNT(*) FROM expenses WHERE trip_id = $tripId AND payer_id = $travellerId) AS paid,
       (SELECT COUNT(*) FROM cost_shares WHERE trip_id = $tripId AND traveller_id = $travellerId) AS shares,
       (SELECT COUNT(*) FROM cost_shares WHERE trip_id = $tripId AND covered_by = $travellerId) AS covers,
       (SELECT COUNT(*) FROM settlements
         WHERE trip_id = $tripId AND (from_id = $travellerId OR to_id = $travellerId)) AS settlements
`;

/**
 * Each record that holds someone on a trip, with what to open: a payment or a settlement opens
 * itself, an expense or a split opens its expense or booking. Titles fall back to the expense's
 * category; a settlement's is who paid whom.
 */
export const SELECT_HOLDS = `
SELECT 'paid' AS kind, p.id AS payment_id, NULL AS settlement_id, p.trip_item_id AS item_id,
       NULL AS expense_id, i.title AS title, p.amount AS amount, p.currency AS currency
  FROM booking_payments p JOIN trip_items i ON i.id = p.trip_item_id
 WHERE p.trip_id = $tripId AND p.payer_id = $travellerId
UNION ALL
SELECT 'paid', NULL, NULL, NULL, e.id, COALESCE(e.label, e.category), e.amount, e.currency
  FROM expenses e WHERE e.trip_id = $tripId AND e.payer_id = $travellerId
UNION ALL
SELECT CASE WHEN s.traveller_id = $travellerId THEN 'share' ELSE 'covers' END, NULL, NULL,
       s.trip_item_id, s.expense_id, COALESCE(i.title, e.label, e.category), s.amount,
       COALESCE(i.price_currency, e.currency)
  FROM cost_shares s
  LEFT JOIN trip_items i ON i.id = s.trip_item_id
  LEFT JOIN expenses e ON e.id = s.expense_id
 WHERE s.trip_id = $tripId AND (s.traveller_id = $travellerId OR s.covered_by = $travellerId)
UNION ALL
SELECT 'settled', NULL, st.id, NULL, NULL,
       (SELECT name FROM travellers WHERE id = st.from_id) || ' → ' ||
       (SELECT name FROM travellers WHERE id = st.to_id), st.amount, st.currency
  FROM settlements st
 WHERE st.trip_id = $tripId AND (st.from_id = $travellerId OR st.to_id = $travellerId)
`;

// ─── Settlements (3E) ────────────────────────────────────────────────────────────────────────────

export const SELECT_TRIP_SETTLEMENTS = `
SELECT * FROM settlements WHERE trip_id = $tripId ORDER BY (settled_on IS NULL), settled_on, created_at
`;

export const SELECT_SETTLEMENT = `
SELECT * FROM settlements WHERE id = $id
`;

export const INSERT_SETTLEMENT = `
INSERT INTO settlements
  (id, trip_id, from_id, to_id, amount, currency, settled_on, note, created_at, updated_at)
VALUES
  ($id, $tripId, $fromId, $toId, $amount, $currency, $settledOn, $note, $now, $now)
`;

export const UPDATE_SETTLEMENT = `
UPDATE settlements
   SET from_id = $fromId, to_id = $toId, amount = $amount, currency = $currency,
       settled_on = $settledOn, note = $note, updated_at = $now
 WHERE id = $id
`;

export const DELETE_SETTLEMENT = `
DELETE FROM settlements WHERE id = $id
`;

// ─── Unsplit costs kept outside (review P1, §14.2) ───────────────────────────────────────────────

export const SELECT_TRIP_UNSPLIT_CONFIRMATIONS = `
SELECT * FROM unsplit_confirmations WHERE trip_id = $tripId
`;

/** One cost's confirmation, whichever kind: the other id is NULL and matches nothing. */
export const DELETE_UNSPLIT_CONFIRMATION = `
DELETE FROM unsplit_confirmations WHERE trip_item_id = $itemId OR expense_id = $expenseId
`;

export const INSERT_UNSPLIT_CONFIRMATION = `
INSERT INTO unsplit_confirmations (id, trip_id, trip_item_id, expense_id, fingerprint, confirmed_at)
VALUES ($id, $tripId, $itemId, $expenseId, $fingerprint, $now)
`;

// ─── Settlement review holds (§15) ───────────────────────────────────────────────────────────────

export const COUNT_TRIP_SETTLEMENTS = `
SELECT COUNT(*) AS n FROM settlements WHERE trip_id = $tripId
`;

/** Open reviews only: an acknowledged one holds nothing. Oldest first. */
export const SELECT_OPEN_SETTLEMENT_REVIEWS = `
SELECT * FROM settlement_reviews WHERE trip_id = $tripId AND acknowledged_at IS NULL
 ORDER BY created_at, rowid
`;

export const INSERT_SETTLEMENT_REVIEW = `
INSERT INTO settlement_reviews
  (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount, to_currency, created_at, acknowledged_at)
VALUES
  ($id, $tripId, $currency, $reason, $costKind, $costTitle, $costAmount, $toCurrency, $now, NULL)
`;

export const ACKNOWLEDGE_SETTLEMENT_REVIEWS = `
UPDATE settlement_reviews SET acknowledged_at = $now
 WHERE trip_id = $tripId AND currency = $currency AND acknowledged_at IS NULL
`;

/** Every booking payment on a trip, for its balances. */
export const SELECT_TRIP_BOOKING_PAYMENTS = `
SELECT * FROM booking_payments WHERE trip_id = $tripId ORDER BY (paid_on IS NULL), paid_on, created_at
`;

// ─── Currency conversion (Phase 4) ───────────────────────────────────────────────────────────────

/** Every pair's rate (migration 013); `trip_rates` is frozen and never read. */
export const SELECT_TRIP_RATES = `
SELECT * FROM trip_exchange_rates WHERE trip_id = $tripId ORDER BY base_currency, currency
`;

export const UPDATE_TRIP_REPORT_CURRENCY = `
UPDATE trips SET report_currency = $currency, updated_at = $now WHERE id = $tripId
`;

/** One rate per trip and currency pair; setting it again replaces that pair's only. */
export const UPSERT_TRIP_RATE = `
INSERT INTO trip_exchange_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
VALUES ($tripId, $currency, $base, $rate, $rateDate, $now)
ON CONFLICT (trip_id, currency, base_currency) DO UPDATE
   SET rate = excluded.rate, rate_date = excluded.rate_date, updated_at = excluded.updated_at
`;

export const DELETE_TRIP_RATE = `
DELETE FROM trip_exchange_rates WHERE trip_id = $tripId AND currency = $currency AND base_currency = $base
`;
