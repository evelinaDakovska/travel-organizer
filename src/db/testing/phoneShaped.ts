import type Database from 'better-sqlite3';

/**
 * Synthetic data shaped like the owner's phone, for the migration tests (009, 010): never real data.
 * Values the app never writes sit in the unused legacy fields, because real data is never assumed
 * to be empty.
 */

const now = '2026-10-22T09:00:00.000Z';

/** A trip like the owner's at schema 6: a family, paid and unpaid bookings, legacy money values. */
export function fillLikeAPhone(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Лапландия', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
  ).run(now, now);
  const traveller = db.prepare(
    `INSERT INTO travellers (id, name, sort_order, created_at, updated_at, classification)
     VALUES (?, ?, 0, ?, ?, ?)`,
  );
  traveller.run('ev', 'Evelina', now, now, 'adult');
  traveller.run('ana', 'Ana', now, now, 'adult');
  traveller.run('mia', 'Mia', now, now, 'child');
  db.prepare(
    `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order, classification)
     VALUES ('t1', 'ev', 0, 'adult'), ('t1', 'ana', 1, 'adult'), ('t1', 'mia', 2, 'child')`,
  ).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('me_traveller_id', 'ev')`).run();
  const item = db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, details, price_amount, price_currency,
                             is_paid, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  item.run('hotel', 'stay', 'confirmed', 'Hotel Aurora', null, 25000, 'EUR', 1, now, now);
  item.run('husky', 'activity', 'confirmed', 'Husky safari', null, 22500, 'EUR', 0, now, now);
  db.prepare(
    `INSERT INTO expenses (id, trip_id, category, label, amount, currency, spent_on, paid_by, split,
                           created_at, updated_at)
     VALUES ('e1', 't1', 'food', 'Soup', 2400, 'EUR', '2026-11-21', NULL, NULL, ?, ?),
            ('e2', 't1', 'transport', 'Taxi', 3500, 'EUR', '2026-11-20', 'Ana', '{"mode":"equal"}', ?, ?)`,
  ).run(now, now, now, now);
  // The N5 name-based table, never written by the app: real data is not assumed empty.
  db.prepare(
    `INSERT INTO payments (id, trip_id, from_name, to_name, amount, currency, created_at)
     VALUES ('legacy', 't1', 'Ana', 'Evelina', 1750, 'EUR', ?)`,
  ).run(now);
}

/** What 3D-1 and 3D-2 add on 0.15.0: a deposit, a linked expense, a payer, a split, a cover. */
export function addMoneyRecords(db: Database.Database) {
  db.prepare(
    `INSERT INTO booking_payments (id, trip_id, trip_item_id, payer_id, amount, currency, paid_on,
                                   note, created_at, updated_at)
     VALUES ('bp1', 't1', 'hotel', 'ev', 10000, 'EUR', '2026-10-01', 'Deposit', ?, ?)`,
  ).run(now, now);
  db.prepare(`UPDATE expenses SET trip_item_id = 'husky', payer_id = 'ana' WHERE id = 'e1'`).run();
  db.prepare(
    `INSERT INTO cost_shares (id, trip_id, trip_item_id, expense_id, traveller_id, amount, covered_by,
                              sort_order, created_at, updated_at)
     VALUES ('s1', 't1', 'husky', NULL, 'ev', NULL, NULL, 0, ?, ?),
            ('s2', 't1', 'husky', NULL, 'mia', NULL, 'ana', 1, ?, ?)`,
  ).run(now, now, now, now);
  db.prepare(`INSERT INTO trip_cover (trip_id, child_id, adult_id) VALUES ('t1', 'mia', 'ev')`).run();
}

