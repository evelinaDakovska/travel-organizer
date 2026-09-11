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
