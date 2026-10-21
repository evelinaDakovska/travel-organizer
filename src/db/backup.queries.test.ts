import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import { EXPORT_COLUMNS } from './queries';
import { asyncDatabase } from './testing/asyncDatabase';
import {
  buildExportDocument,
  EXPORT_FORMAT_VERSION,
  filterTablesForTrip,
  parseExportDocument,
  planImport,
  type ExportTables,
  type ImportMode,
  type ImportPlan,
} from '../domain/export';
import { applyImport as applyImportAsync, readTables } from '../repositories/backup';

/**
 * The backup's SQL and the repository that writes it, run for real over better-sqlite3: the same
 * `applyImport` the phone runs, not a copy of it.
 */

const now = '2026-09-11T00:00:00.000Z';

function fresh() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);
  return db;
}

const readAll = (db: Database.Database): Promise<ExportTables> => readTables(asyncDatabase(db));
const applyImport = (db: Database.Database, plan: ImportPlan) =>
  applyImportAsync(asyncDatabase(db), plan);

const run = (db: Database.Database, sql: string, ...params: unknown[]) =>
  db.prepare(sql).run(...params);

/** A trip using every column that carries meaning, so the round trip has something to lose. */
function seed(db: Database.Database) {
  run(
    db,
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, notes,
                        traveller_count, travellers, created_at, updated_at)
     VALUES ('t1', 'Milan', 'Italy', '2026-09-19', '2026-09-22', 'Europe/Rome', 'Autumn trip',
             2, '["Evelina","A"]', ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t2', 'Lapland', '2026-12-18', '2026-12-23', 'Europe/Helsinki', ?, ?)`,
    now,
    now,
  );
  run(
    db,
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
             '{"room":"402","pricing":{"mode":"perPerson","lines":[{"label":"Adult","quantity":2,"unitAmount":12000}]}}',
             24000, 'EUR', 1, ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO trip_items (id, trip_id, kind, status, priority, title, created_at, updated_at)
     VALUES ('i2', 't1', 'food', 'idea', 'must', 'Pave', ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO trip_items (id, trip_id, kind, status, title, completed_at, created_at, updated_at)
     VALUES ('i3', 't2', 'task', 'confirmed', 'Online check-in', ?, ?, ?)`,
    now,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO trip_notes (id, trip_id, title, body, pinned, sort_order, created_at, updated_at)
     VALUES ('n1', 't1', 'Door codes', 'Front door 4417', 1, 0, ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, file_name,
                            mime_type, size_bytes, sort_order, created_at)
     VALUES ('r1', 'i1', 'file', 'confirmation', 'Booking', 'media/r1.pdf', 'booking.pdf',
             'application/pdf', 8192, 0, ?)`,
    now,
  );
  run(
    db,
    `INSERT INTO resources (id, trip_id, kind, subtype, label, url, sort_order, created_at)
     VALUES ('r2', 't1', 'link', 'maps', 'Maps', 'https://maps.example', 0, ?)`,
    now,
  );
  run(
    db,
    `INSERT INTO expenses (id, trip_id, category, label, amount, currency, spent_on, notes,
                           paid_by, split, created_at, updated_at)
     VALUES ('e1', 't1', 'groceries', 'Esselunga', 2345, 'EUR', '2026-09-20', 'Water, fruit',
             'Evelina', '{"mode":"equal","people":["Evelina","A"]}', ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO resources (id, trip_id, expense_id, kind, subtype, label, stored_path,
                            sort_order, created_at)
     VALUES ('r4', 't1', 'e1', 'file', 'generic', 'Receipt', 'media/r4.jpg', 1, ?)`,
    now,
  );
  run(
    db,
    `INSERT INTO payments (id, trip_id, from_name, to_name, amount, currency, created_at)
     VALUES ('p1', 't1', 'A', 'Evelina', 1172, 'EUR', ?)`,
    now,
  );
  run(db, `INSERT INTO settings (key, value) VALUES ('defaultTravellers', '["Evelina"]')`);
}

/** Format 3: travellers, membership, participants, lists of both kinds, a template and its use. */
function seedFieldbook(db: Database.Database) {
  run(
    db,
    `INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
     VALUES ('ev', 'Evelina', 0, ?, ?), ('mia', 'Мия', 1, ?, ?)`,
    now,
    now,
    now,
    now,
  );
  run(db, `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order) VALUES ('t1', 'ev', 0)`);
  run(db, `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order) VALUES ('t1', 'mia', 1)`);
  run(db, `INSERT INTO item_participants (item_id, traveller_id) VALUES ('i1', 'mia')`);
  run(
    db,
    `INSERT INTO lists (id, trip_id, kind, name, source_list_id, sort_order, created_at, updated_at)
     VALUES ('winter', NULL, 'packing', 'Winter layers', NULL, 0, ?, ?),
            ('milan-pack', 't1', 'packing', 'Winter layers', 'winter', 0, ?, ?)`,
    now,
    now,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO list_items (id, list_id, label, quantity, unit, category, note, traveller_id,
                             done_at, sort_order, created_at, updated_at)
     VALUES ('w1', 'winter', 'Wool socks', 3, 'pairs', 'Clothing', NULL, NULL, NULL, 0, ?, ?),
            ('m1', 'milan-pack', 'Wool socks', 2, 'pairs', 'Clothing', 'thick', 'mia', ?, 0, ?, ?)`,
    now,
    now,
    now,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO templates (id, name, content, created_at, updated_at)
     VALUES ('city', 'City break', '{"version":1,"tasks":[],"notes":[],"lists":[]}', ?, ?)`,
    now,
    now,
  );
  run(db, `INSERT INTO template_uses (trip_id, template_id, applied_at) VALUES ('t1', 'city', ?)`, now);
}

const documentFrom = async (db: Database.Database) =>
  buildExportDocument(await readAll(db), { exportedAt: now, sizeOf: () => 8192 });

const sharedIds = (db: Database.Database) => {
  const ids = (sql: string) => (db.prepare(sql).all() as { id: string }[]).map((row) => row.id);
  return {
    travellers: ids(`SELECT id FROM travellers`),
    lists: ids(`SELECT id FROM lists WHERE trip_id IS NULL`),
    templates: ids(`SELECT id FROM templates`),
  };
};

/** Export, serialise, parse, restore — the path a real backup actually takes. */
async function restoreInto(target: Database.Database, source: Database.Database, mode: ImportMode) {
  const onWire: unknown = JSON.parse(JSON.stringify(await documentFrom(source)));
  const parsed = parseExportDocument(onWire);
  if (!parsed.ok) throw new Error(parsed.reason);

  const existing = (target.prepare(`SELECT id FROM trips`).all() as { id: string }[]).map(
    (r) => r.id,
  );
  const files = ['media/r1.pdf', 'media/r4.jpg'];
  const plan = planImport(parsed.document, existing, mode, files, sharedIds(target));
  await applyImport(target, plan);
  return plan;
}

describe('the backup round trip', () => {
  it('restores every table into an empty app, byte for byte', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(await readAll(target)).toEqual(await readAll(source));
  });

  it('loses nothing on a column that is easy to drop', async () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    await restoreInto(target, source, 'merge');

    const [item] = target.prepare(`SELECT * FROM trip_items WHERE id = 'i1'`).all() as Record<
      string,
      unknown
    >[];
    expect(item.details).toContain('"pricing"');
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

  it('backs up every table the schema has, so a new one cannot be forgotten', () => {
    const tables = (
      fresh()
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .all() as { name: string }[]
    ).map((t) => t.name);
    expect(Object.keys(EXPORT_COLUMNS).sort()).toEqual(tables.sort());
  });

  it('restores expenses with their receipts and payments', async () => {
    const source = fresh();
    seed(source);
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(target.prepare(`SELECT id, label, amount FROM expenses`).all()).toEqual([
      { id: 'e1', label: 'Esselunga', amount: 2345 },
    ]);
    expect(target.prepare(`SELECT id, expense_id FROM resources WHERE id = 'r4'`).get()).toEqual({
      id: 'r4',
      expense_id: 'e1',
    });
    expect(target.prepare(`SELECT COUNT(*) AS n FROM payments`).get()).toEqual({ n: 1 });
  });

  it('still imports a backup made before expenses existed (format 1, app 0.2.0)', async () => {
    const source = fresh();
    seed(source);
    for (const table of ['payments', 'resources WHERE expense_id IS NOT NULL', 'expenses']) {
      source.prepare(`DELETE FROM ${table}`).run();
    }
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));
    const {
      expenses: _expenses,
      payments: _payments,
      travellers: _travellers,
      tripTravellers: _tripTravellers,
      itemParticipants: _itemParticipants,
      lists: _lists,
      listItems: _listItems,
      templates: _templates,
      templateUses: _templateUses,
      ...oldTables
    } = current.tables;
    const formatOne = {
      ...current,
      formatVersion: 1,
      tables: {
        ...oldTables,
        resources: oldTables.resources.map(
          ({ expense_id: _expenseId, ...rest }: Record<string, unknown>) => rest,
        ),
      },
    };

    const parsed = parseExportDocument(formatOne);
    if (!parsed.ok) throw new Error(parsed.reason);
    const target = fresh();
    await applyImport(target, planImport(parsed.document, [], 'merge', ['media/r1.pdf']));

    expect(await readAll(target)).toEqual(await readAll(source));
  });

  it('still imports a format-2 backup (app 0.5.1, on the phone today)', async () => {
    const source = fresh();
    seed(source);
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));
    const {
      travellers: _travellers,
      tripTravellers: _tripTravellers,
      itemParticipants: _itemParticipants,
      lists: _lists,
      listItems: _listItems,
      templates: _templates,
      templateUses: _templateUses,
      ...formatTwoTables
    } = current.tables;

    const parsed = parseExportDocument({ ...current, formatVersion: 2, tables: formatTwoTables });
    if (!parsed.ok) throw new Error(parsed.reason);
    const target = fresh();
    await applyImport(target, planImport(parsed.document, [], 'merge', ['media/r1.pdf']));

    expect(await readAll(target)).toEqual(await readAll(source));
  });

  it('still imports a format-3 backup, defaulting missing classification to unspecified', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));

    // Strip classification from travellers and tripTravellers as in format 3
    const formatThreeTables = {
      ...current.tables,
      travellers: current.tables.travellers.map(
        ({ classification: _c, ...rest }: Record<string, unknown>) => rest,
      ),
      tripTravellers: current.tables.tripTravellers.map(
        ({ classification: _c, ...rest }: Record<string, unknown>) => rest,
      ),
    };

    const parsed = parseExportDocument({ ...current, formatVersion: 3, tables: formatThreeTables });
    if (!parsed.ok) throw new Error(parsed.reason);
    const target = fresh();
    await applyImport(target, planImport(parsed.document, [], 'merge', ['media/r1.pdf']));

    const targetTables = await readAll(target);
    expect(targetTables.travellers.every((t: any) => t.classification === 'unspecified')).toBe(true);
    expect(targetTables.tripTravellers.every((tt: any) => tt.classification === 'unspecified')).toBe(true);
  });

  it('preserves classification and trip overrides in a format-4 backup round trip', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);

    // Set specific classifications: ev is adult, mia is child
    run(source, `UPDATE travellers SET classification = 'adult' WHERE id = 'ev'`);
    run(source, `UPDATE travellers SET classification = 'child' WHERE id = 'mia'`);
    // And on trip t1, mia has an override to adult (e.g. booked as adult ticket)
    run(source, `UPDATE trip_travellers SET classification = 'adult' WHERE trip_id = 't1' AND traveller_id = 'mia'`);

    const target = fresh();
    await restoreInto(target, source, 'merge');

    const targetTables = await readAll(target);
    expect(targetTables.travellers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ev', classification: 'adult' }),
        expect.objectContaining({ id: 'mia', classification: 'child' }),
      ]),
    );
    expect(targetTables.tripTravellers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trip_id: 't1', traveller_id: 'ev', classification: 'unspecified' }),
        expect.objectContaining({ trip_id: 't1', traveller_id: 'mia', classification: 'adult' }),
      ]),
    );
  });

  it('restores price lines with who they are for, group prices and extras byte for byte (3C)', async () => {
    const source = fresh();
    seed(source);
    const details =
      '{"room":"402","pricing":{"mode":"perPerson","lines":[' +
      '{"label":"Adult","quantity":2,"unitAmount":9000,"for":"adult"},' +
      '{"quantity":1,"unitAmount":0,"for":"child"},' +
      '{"label":"Family ticket","quantity":1,"unitAmount":12000,"group":true},' +
      '{"label":"Sled","quantity":2,"unitAmount":2000,"extra":true}]}}';
    source.prepare(`UPDATE trip_items SET details = ?, price_amount = 34000 WHERE id = 'i1'`).run(details);
    const target = fresh();
    await restoreInto(target, source, 'merge');

    const item = target.prepare(`SELECT details, price_amount, is_paid FROM trip_items WHERE id = 'i1'`).get();
    expect(item).toEqual({ details, price_amount: 34000, is_paid: 1 });
  });

  it('writes format 8, and still restores a format-7 backup from 0.13.0', async () => {
    const source = fresh();
    seed(source);
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));
    expect(current.formatVersion).toBe(8);
    const fromOlder = parseExportDocument({ ...current, formatVersion: 7 });
    expect(fromOlder.ok).toBe(true);
    // 0.13.0 refuses anything above its own 7 — this app's backups included.
    expect(current.formatVersion).toBeGreaterThan(7);
  });

  it('rejects a backup from a future format with a clear message', async () => {
    const source = fresh();
    seed(source);
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));
    const futureDoc = { ...current, formatVersion: EXPORT_FORMAT_VERSION + 1 };

    const parsed = parseExportDocument(futureDoc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toContain('newer version');
    }
  });

  it('survives being restored twice, leaving one copy rather than two', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();

    await restoreInto(target, source, 'merge');
    const plan = await restoreInto(target, source, 'merge');

    expect(plan.skippedTripIds.sort()).toEqual(['t1', 't2']);
    expect(plan.write.travellers).toEqual([]);
    expect(plan.write.lists).toEqual([]);
    expect(plan.write.templates).toEqual([]);
    expect(await readAll(target)).toEqual(await readAll(source));
  });

  it('keeps a local trip the backup does not know about', async () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    run(
      target,
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('local', 'Mine', '2027-01-01', '2027-01-05', 'Europe/Sofia', ?, ?)`,
      now,
      now,
    );

    await restoreInto(target, source, 'merge');

    expect(((await readAll(target)).trips.map((t) => t.id) as string[]).sort()).toEqual([
      'local',
      't1',
      't2',
    ]);
  });

  it('replace overwrites a diverged trip without stranding its old children', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();
    seed(target);
    seedFieldbook(target);
    run(target, `UPDATE trips SET name = 'Edited' WHERE id = 't1'`);
    run(
      target,
      `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
       VALUES ('extra', 't1', 'other', 'idea', 'Added later', ?, ?)`,
      now,
      now,
    );
    run(
      target,
      `INSERT INTO list_items (id, list_id, label, sort_order, created_at, updated_at)
       VALUES ('m2', 'milan-pack', 'Added later', 1, ?, ?)`,
      now,
      now,
    );

    await restoreInto(target, source, 'replace');

    expect(await readAll(target)).toEqual(await readAll(source));
    expect(target.prepare(`SELECT COUNT(*) AS n FROM trip_items WHERE id = 'extra'`).get()).toEqual({
      n: 0,
    });
  });

  it('reports a file the archive is missing rather than restoring a dead reference silently', async () => {
    const source = fresh();
    seed(source);
    run(
      source,
      `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, sort_order,
                              created_at)
       VALUES ('r3', 'i2', 'file', 'ticket', 'Lost', 'media/r3.pdf', 0, ?)`,
      now,
    );

    const plan = await restoreInto(fresh(), source, 'merge');

    expect(plan.missingFiles).toEqual(['media/r3.pdf']);
  });

  it('writes nothing at all when one row in the batch is bad', async () => {
    const source = fresh();
    seed(source);
    const target = fresh();
    const parsed = parseExportDocument(JSON.parse(JSON.stringify(await documentFrom(source))));
    if (!parsed.ok) throw new Error(parsed.reason);

    const plan = planImport(parsed.document, [], 'merge');
    plan.write.tripItems[1] = { ...plan.write.tripItems[1], kind: 'not-a-kind' };

    await expect(applyImport(target, plan)).rejects.toThrow(/CHECK constraint failed/);
    expect((await readAll(target)).trips).toEqual([]);
  });
});

describe('rows that belong to no trip (format 3)', () => {
  it('keep mine adds a reusable list or template the phone lacks, and leaves its own alone', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();
    seed(target);
    run(
      target,
      `INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
       VALUES ('ev', 'Evelina (mine)', 0, ?, ?)`,
      now,
      now,
    );

    const plan = await restoreInto(target, source, 'merge');

    // Both trips were here: nothing of theirs is written, but what was missing is.
    expect(plan.write.trips).toEqual([]);
    expect(plan.write.lists.map((list) => list.id)).toEqual(['winter']);
    expect(plan.write.templates.map((template) => template.id)).toEqual(['city']);
    expect(target.prepare(`SELECT name FROM travellers ORDER BY id`).all()).toEqual([
      { name: 'Evelina (mine)' },
      { name: 'Мия' },
    ]);
    expect(target.prepare(`SELECT label FROM list_items WHERE list_id = 'winter'`).all()).toEqual([
      { label: 'Wool socks' },
    ]);
  });

  it("use the backup's updates a profile in place, even one a trip still uses", async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();
    seed(target);
    seedFieldbook(target);
    run(target, `UPDATE travellers SET name = 'Renamed' WHERE id = 'ev'`);
    run(
      target,
      `INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
       VALUES ('only-here', 'Local', 9, ?, ?)`,
      now,
      now,
    );

    await restoreInto(target, source, 'replace');

    expect(target.prepare(`SELECT id, name FROM travellers ORDER BY id`).all()).toEqual([
      { id: 'ev', name: 'Evelina' },
      { id: 'mia', name: 'Мия' },
      // Never deleted: the backup not knowing it is no reason to lose it.
      { id: 'only-here', name: 'Local' },
    ]);
  });

  it('restores a trip copy of a list even when its reusable source is not in the backup', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    run(source, `DELETE FROM lists WHERE id = 'winter'`);
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(target.prepare(`SELECT id, source_list_id FROM lists`).all()).toEqual([
      { id: 'milan-pack', source_list_id: 'winter' },
    ]);
  });
});

describe('settings follow the import mode', () => {
  const withSetting = (value: string) => {
    const db = fresh();
    run(db, `INSERT INTO settings (key, value) VALUES ('defaultTravellers', ?)`, value);
    return db;
  };

  const valueIn = (db: Database.Database) =>
    (db.prepare(`SELECT value FROM settings WHERE key = 'defaultTravellers'`).get() as {
      value: string;
    }).value;

  it('merge keeps the value already on this device', async () => {
    const source = fresh();
    seed(source);
    const target = withSetting('["LOCAL"]');

    await restoreInto(target, source, 'merge');

    expect(valueIn(target)).toBe('["LOCAL"]');
  });

  it('replace takes the value from the backup, which is what restoring means', async () => {
    const source = fresh();
    seed(source);
    const target = withSetting('["LOCAL"]');

    await restoreInto(target, source, 'replace');

    expect(valueIn(target)).toBe('["Evelina"]');
  });

  it('merge still brings across a setting this device has never had', async () => {
    const source = fresh();
    seed(source);
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(valueIn(target)).toBe('["Evelina"]');
  });
});

describe('who a list item is for (format 6)', () => {
  const recipientsIn = (db: Database.Database) =>
    db
      .prepare(`SELECT list_item_id, traveller_id FROM list_item_recipients ORDER BY 1, 2`)
      .all();
  const forItem = (db: Database.Database, item: string, ...people: string[]) => {
    for (const person of people) {
      run(
        db,
        `INSERT INTO list_item_recipients (list_item_id, traveller_id) VALUES (?, ?)`,
        item,
        person,
      );
    }
  };

  it('restores an item for several people with every one of them', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    forItem(source, 'm1', 'ev', 'mia');
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(recipientsIn(target)).toEqual([
      { list_item_id: 'm1', traveller_id: 'ev' },
      { list_item_id: 'm1', traveller_id: 'mia' },
    ]);
  });

  it("turns a format-5 backup's one person per item into that one recipient", async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source); // m1 is for 'mia' through the old column only
    const onWire = JSON.parse(JSON.stringify(await documentFrom(source)));
    onWire.formatVersion = 5;
    delete onWire.tables.listItemRecipients;
    const parsed = parseExportDocument(onWire);
    if (!parsed.ok) throw new Error(parsed.reason);
    const target = fresh();

    await applyImport(target, planImport(parsed.document, [], 'merge', ['media/r1.pdf']));

    expect(recipientsIn(target)).toEqual([{ list_item_id: 'm1', traveller_id: 'mia' }]);
    expect(target.prepare(`SELECT traveller_id FROM list_items WHERE id = 'm1'`).get()).toEqual({
      traveller_id: 'mia',
    });
  });

  it('keep mine leaves the people on an item already here exactly as they are', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    forItem(source, 'm1', 'ev', 'mia');
    const target = fresh();
    seed(target);
    seedFieldbook(target);
    forItem(target, 'm1', 'ev');

    await restoreInto(target, source, 'merge');

    expect(recipientsIn(target)).toEqual([{ list_item_id: 'm1', traveller_id: 'ev' }]);
  });

  it('a one-trip selection carries its items’ recipients and the profiles they name', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    run(
      source,
      `INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
       VALUES ('aunt', 'Aunt Vera', 9, ?, ?)`,
      now,
      now,
    );
    forItem(source, 'm1', 'ev', 'aunt'); // 'aunt' is on no trip

    const one = filterTablesForTrip(await readAll(source), 't1');

    expect([...one.listItemRecipients].sort((x, y) => x.traveller_id.localeCompare(y.traveller_id))).toEqual([
      { list_item_id: 'm1', traveller_id: 'aunt' },
      { list_item_id: 'm1', traveller_id: 'ev' },
    ]);
    expect(one.travellers.map((t) => t.id).sort()).toEqual(['aunt', 'ev', 'mia']);
  });
});

describe('money records linked to bookings (format 8, 3D-1)', () => {
  function seedMoney(db: Database.Database) {
    run(
      db,
      `INSERT INTO booking_payments (id, trip_id, trip_item_id, payer_id, amount, currency, paid_on,
                                     note, created_at, updated_at)
       VALUES ('bp1', 't1', 'i1', 'ev', 10000, 'EUR', '2026-08-01', 'Deposit', ?, ?),
              ('bp2', 't1', 'i1', NULL, 4000, 'EUR', NULL, NULL, ?, ?)`,
      now,
      now,
      now,
      now,
    );
    run(db, `UPDATE expenses SET trip_item_id = 'i1', payer_id = 'mia' WHERE id = 'e1'`);
  }

  it('restores payments, links and payers into an empty app, byte for byte', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    seedMoney(source);
    const target = fresh();

    await restoreInto(target, source, 'merge');

    expect(await readAll(target)).toEqual(await readAll(source));
    expect((await readAll(target)).bookingPayments).toHaveLength(2);
  });

  it('restores a format-7 backup with every expense standalone and no payer recorded', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const current = JSON.parse(JSON.stringify(await documentFrom(source)));
    // A backup written by 0.13.0: no booking payments, no link or payer on an expense.
    const { bookingPayments: _gone, ...olderTables } = current.tables;
    const older = {
      ...current,
      formatVersion: 7,
      tables: {
        ...olderTables,
        expenses: current.tables.expenses.map(
          ({ trip_item_id: _item, payer_id: _payer, ...row }: Record<string, unknown>) => row,
        ),
      },
    };
    const parsed = parseExportDocument(older);
    if (!parsed.ok) throw new Error(parsed.reason);
    const target = fresh();
    await applyImport(target, planImport(parsed.document, [], 'merge', [], sharedIds(target)));

    expect(target.prepare(`SELECT id, trip_item_id, payer_id, paid_by FROM expenses`).all()).toEqual([
      { id: 'e1', trip_item_id: null, payer_id: null, paid_by: 'Evelina' },
    ]);
    expect(target.prepare(`SELECT COUNT(*) AS n FROM booking_payments`).get()).toEqual({ n: 0 });
  });

  it('replace overwrites a trip whose bookings have payments on this phone', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();
    seed(target);
    seedFieldbook(target);
    seedMoney(target);

    await restoreInto(target, source, 'replace');

    expect(await readAll(target)).toEqual(await readAll(source));
    expect(target.prepare(`SELECT COUNT(*) AS n FROM booking_payments`).get()).toEqual({ n: 0 });
  });

  it('merge leaves a trip already here, payments and all, exactly as it is', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    const target = fresh();
    seed(target);
    seedFieldbook(target);
    seedMoney(target);
    const before = await readAll(target);

    await restoreInto(target, source, 'merge');

    expect(await readAll(target)).toEqual(before);
  });

  it('a one-trip selection carries its payments and the payers they name', async () => {
    const source = fresh();
    seed(source);
    seedFieldbook(source);
    run(
      source,
      `INSERT INTO travellers (id, name, sort_order, created_at, updated_at)
       VALUES ('friend', 'Friend', 9, ?, ?)`,
      now,
      now,
    );
    seedMoney(source);
    run(source, `UPDATE booking_payments SET payer_id = 'friend' WHERE id = 'bp2'`);

    const one = filterTablesForTrip(await readAll(source), 't1');

    expect(one.bookingPayments.map((row) => row.id).sort()).toEqual(['bp1', 'bp2']);
    expect(one.travellers.map((t) => t.id).sort()).toEqual(['ev', 'friend', 'mia']);
    expect(filterTablesForTrip(await readAll(source), 't2').bookingPayments).toEqual([]);
  });
});
