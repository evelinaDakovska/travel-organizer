import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import {
  DELETE_TRIP_FOR_REPLACE,
  EXPORT_COLUMNS,
  insertRow,
  MERGE_SETTING,
  REPLACE_SETTING,
  selectAll,
} from './queries';
import {
  buildExportDocument,
  parseExportDocument,
  planImport,
  type ExportTables,
  type ImportMode,
  type ImportPlan,
} from '../domain/export';

const now = '2026-09-11T00:00:00.000Z';

function fresh() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

/** Mirrors repositories/backup.ts, which cannot run here because it imports expo-sqlite. */
function applyImport(db: Database.Database, plan: ImportPlan) {
  const run = (sql: string, row: Record<string, unknown>) =>
    db.prepare(sql).run(Object.fromEntries(Object.entries(row)));

  db.transaction(() => {
    if (plan.mode === 'replace') {
      for (const trip of plan.write.trips) {
        db.prepare(DELETE_TRIP_FOR_REPLACE).run({ id: trip.id });
      }
    }
    for (const trip of plan.write.trips) run(insertRow('trips'), trip);
    for (const item of plan.write.tripItems) run(insertRow('trip_items'), item);
    for (const note of plan.write.tripNotes) run(insertRow('trip_notes'), note);
    for (const resource of plan.write.resources) run(insertRow('resources'), resource);
    const settingSql = plan.mode === 'replace' ? REPLACE_SETTING : MERGE_SETTING;
    for (const setting of plan.write.settings) run(settingSql, setting);
  })();
}

function readAll(db: Database.Database): ExportTables {
  return {
    trips: db.prepare(selectAll('trips')).all() as ExportTables['trips'],
    tripItems: db.prepare(selectAll('trip_items')).all() as ExportTables['tripItems'],
    tripNotes: db.prepare(selectAll('trip_notes')).all() as ExportTables['tripNotes'],
    resources: db.prepare(selectAll('resources')).all() as ExportTables['resources'],
    settings: db.prepare(selectAll('settings')).all() as ExportTables['settings'],
  };
}

/** A trip using every column that carries meaning, so the round trip has something to lose. */
function seed(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, notes,
                        traveller_count, travellers, created_at, updated_at)
     VALUES ('t1', 'Milan', 'Italy', '2026-09-19', '2026-09-22', 'Europe/Rome', 'Autumn trip',
             2, '["Evelina","A"]', ?, ?)`,
  ).run(now, now);

  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t2', 'Lapland', '2026-12-18', '2026-12-23', 'Europe/Helsinki', ?, ?)`,
  ).run(now, now);

  db.prepare(
    `INSERT INTO trip_items
       (id, trip_id, kind, subkind, status, priority, title,
        start_local, start_tz, start_precision, start_utc,
        end_local, end_tz, end_precision, end_utc,
        location_name, address, latitude, longitude, confirmation_code, notes, details,
        price_amount, price_currency, is_paid, created_at, updated_at)
     VALUES ('i1', 't1', 'stay', 'hotel', 'confirmed', NULL, 'Hotel Milano',
             '2026-09-19T15:00', 'Europe/Rome', 'time', '2026-09-19T13:00:00.000Z',
             '2026-09-22T11:00', NULL, 'time', '2026-09-22T09:00:00.000Z',
             'Via Roma 1', '20121 Milano', 45.4642, 9.19, 'ABC123', 'Ask for a high floor',
             '{"room":"402"}', 24000, 'EUR', 1, ?, ?)`,
  ).run(now, now);

  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, priority, title, created_at, updated_at)
     VALUES ('i2', 't1', 'food', 'idea', 'must', 'Pave', ?, ?)`,
  ).run(now, now);

  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, completed_at, created_at, updated_at)
     VALUES ('i3', 't2', 'task', 'confirmed', 'Online check-in', ?, ?, ?)`,
  ).run(now, now, now);

  db.prepare(
    `INSERT INTO trip_notes (id, trip_id, title, body, pinned, sort_order, created_at, updated_at)
     VALUES ('n1', 't1', 'Door codes', 'Front door 4417', 1, 0, ?, ?)`,
  ).run(now, now);

  db.prepare(
    `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, file_name,
                            mime_type, size_bytes, sort_order, created_at)
     VALUES ('r1', 'i1', 'file', 'confirmation', 'Booking', 'media/r1.pdf', 'booking.pdf',
             'application/pdf', 8192, 0, ?)`,
  ).run(now);

  db.prepare(
    `INSERT INTO resources (id, trip_id, kind, subtype, label, url, sort_order, created_at)
     VALUES ('r2', 't1', 'link', 'maps', 'Maps', 'https://maps.example', 0, ?)`,
  ).run(now);

  db.prepare(`INSERT INTO settings (key, value) VALUES ('defaultTravellers', '["Evelina"]')`).run();
}

const documentFrom = (db: Database.Database) =>
  buildExportDocument(readAll(db), { exportedAt: now, sizeOf: () => 8192 });

/** Export, serialise, parse, restore — the path a real backup actually takes. */
function restoreInto(target: Database.Database, source: Database.Database, mode: ImportMode) {
  const onWire: unknown = JSON.parse(JSON.stringify(documentFrom(source)));
  const parsed = parseExportDocument(onWire);
  if (!parsed.ok) throw new Error(parsed.reason);

  const existing = (target.prepare(`SELECT id FROM trips`).all() as { id: string }[]).map(
    (r) => r.id,
  );
  const plan = planImport(parsed.document, existing, mode, ['media/r1.pdf']);
  applyImport(target, plan);
  return plan;
}

describe('the backup round trip', () => {
  it('restores every table into an empty app, byte for byte', () => {
    const source = fresh();
    seed(source);
    const target = fresh();

    restoreInto(target, source, 'merge');

    expect(readAll(target)).toEqual(readAll(source));
  });

  it('loses nothing on a column that is easy to drop', () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    restoreInto(target, source, 'merge');

    const [item] = target.prepare(`SELECT * FROM trip_items WHERE id = 'i1'`).all() as Record<
      string,
      unknown
    >[];
    expect(item.details).toBe('{"room":"402"}');
    expect(item.latitude).toBe(45.4642);
    expect(item.price_amount).toBe(24000);
    expect(item.is_paid).toBe(1);
    expect(item.start_tz).toBe('Europe/Rome');
    expect(item.end_precision).toBe('time');
  });

  it('covers every column the schema has, so nothing can be silently left behind', () => {
    const db = fresh();
    for (const [table, columns] of Object.entries(EXPORT_COLUMNS)) {
      const actual = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (c) => c.name,
      );
      expect([...columns].sort()).toEqual(actual.sort());
    }
  });

  it('survives being restored twice, leaving one copy rather than two', () => {
    const source = fresh();
    seed(source);
    const target = fresh();

    restoreInto(target, source, 'merge');
    const plan = restoreInto(target, source, 'merge');

    expect(plan.skippedTripIds.sort()).toEqual(['t1', 't2']);
    expect(readAll(target)).toEqual(readAll(source));
  });

  it('keeps a local trip the backup does not know about', () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    target
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES ('local', 'Mine', '2027-01-01', '2027-01-05', 'Europe/Sofia', ?, ?)`,
      )
      .run(now, now);

    restoreInto(target, source, 'merge');

    expect((readAll(target).trips.map((t) => t.id) as string[]).sort()).toEqual([
      'local',
      't1',
      't2',
    ]);
  });

  it('replace overwrites a diverged trip without stranding its old children', () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    seed(target);
    target.prepare(`UPDATE trips SET name = 'Edited' WHERE id = 't1'`).run();
    target
      .prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
         VALUES ('extra', 't1', 'other', 'idea', 'Added later', ?, ?)`,
      )
      .run(now, now);

    restoreInto(target, source, 'replace');

    expect(readAll(target)).toEqual(readAll(source));
    expect(target.prepare(`SELECT COUNT(*) AS n FROM trip_items WHERE id = 'extra'`).get()).toEqual({
      n: 0,
    });
  });

  it('reports a file the archive is missing rather than restoring a dead reference silently', () => {
    const source = fresh();
    seed(source);
    source
      .prepare(
        `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, sort_order,
                                created_at)
         VALUES ('r3', 'i2', 'file', 'ticket', 'Lost', 'media/r3.pdf', 0, ?)`,
      )
      .run(now);

    const plan = restoreInto(fresh(), source, 'merge');

    expect(plan.missingFiles).toEqual(['media/r3.pdf']);
  });

  it('writes nothing at all when one row in the batch is bad', () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    const parsed = parseExportDocument(JSON.parse(JSON.stringify(documentFrom(source))));
    if (!parsed.ok) throw new Error(parsed.reason);

    const plan = planImport(parsed.document, [], 'merge');
    plan.write.tripItems[1] = { ...plan.write.tripItems[1], kind: 'not-a-kind' };

    expect(() => applyImport(target, plan)).toThrow(/CHECK constraint failed/);
    expect(readAll(target).trips).toEqual([]);
  });
});

describe('settings follow the import mode', () => {
  const withSetting = (value: string) => {
    const db = fresh();
    db.prepare(`INSERT INTO settings (key, value) VALUES ('defaultTravellers', ?)`).run(value);
    return db;
  };

  const valueIn = (db: Database.Database) =>
    (db.prepare(`SELECT value FROM settings WHERE key = 'defaultTravellers'`).get() as {
      value: string;
    }).value;

  it('merge keeps the value already on this device', () => {
    const source = fresh();
    seed(source);
    const target = withSetting('["LOCAL"]');

    restoreInto(target, source, 'merge');

    expect(valueIn(target)).toBe('["LOCAL"]');
  });

  it('replace takes the value from the backup, which is what restoring means', () => {
    const source = fresh();
    seed(source);
    const target = withSetting('["LOCAL"]');

    restoreInto(target, source, 'replace');

    expect(valueIn(target)).toBe('["Evelina"]');
  });

  it('merge still brings across a setting this device has never had', () => {
    const source = fresh();
    seed(source);
    const target = fresh();

    restoreInto(target, source, 'merge');

    expect(valueIn(target)).toBe('["Evelina"]');
  });
});
