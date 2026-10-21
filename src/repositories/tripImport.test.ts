import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { FILES, now, SCHEMA, sha, shaAsync, snapshot } from '../db/testing/tripFixture';
import { unpackBackup } from '../domain/archive';
import { buildExportDocument, planImport } from '../domain/export';
import {
  buildTripArchive,
  earlierImport,
  openTripArchive,
  packTripArchive,
  planTripImport,
  type TravellerChoice,
  type TripImportPlan,
} from '../domain/tripArchive';
import { applyImport, readTables } from './backup';
import { applyTripImport, importHistory, verifyTripImport } from './tripImport';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * A trip archive written into a real database (better-sqlite3, every migration): the phone's
 * existing rows untouched, the new trip whole, every foreign key holding — or nothing at all.
 */

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

async function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const db = asyncDatabase(raw);
  // The phone as it is: the fixture's two trips, its travellers, Me and the rest, via the backup.
  const document = buildExportDocument(snapshot(), { exportedAt: now });
  await applyImport(db, planImport(document, [], 'merge', Object.keys(FILES)));
  return { raw, db };
}

const TABLES = [
  'trips', 'trip_items', 'trip_notes', 'resources', 'expenses', 'payments', 'travellers',
  'trip_travellers', 'item_participants', 'lists', 'list_items', 'list_item_recipients',
  'templates', 'template_uses', 'booking_payments',
];
const dump = (raw: Database.Database) =>
  Object.fromEntries(TABLES.map((t) => [t, raw.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
const settings = (raw: Database.Database) =>
  Object.fromEntries(
    (raw.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[]).map(
      (row) => [row.key, row.value],
    ),
  );

async function archiveFrom(db: ReturnType<typeof asyncDatabase>, tripId = 'lap', includeFiles = true) {
  const built = buildTripArchive(await readTables(db), tripId, {
    exportId: newId(),
    exportedAt: now,
    appVersion: '0.9.0',
    schemaVersion: SCHEMA,
    includeFiles,
    files: new Map(
      Object.entries(FILES).map(([path, bytes]) => [path, { sizeBytes: bytes.length, sha256: sha(bytes) }]),
    ),
    sha256Of: sha,
  });
  const bytes = packTripArchive(
    built.manifest,
    built.dataBytes,
    new Map([...built.filesToPack].map(([name, path]) => [name, FILES[path]])),
  );
  const opened = await openTripArchive(bytes, shaAsync, { supportedSchemaVersion: SCHEMA });
  if (!opened.ok) throw new Error(opened.reason);
  return { bytes, archive: opened.archive };
}

async function importInto(
  db: ReturnType<typeof asyncDatabase>,
  archive: Awaited<ReturnType<typeof archiveFrom>>['archive'],
  choices = new Map<string, TravellerChoice>(),
): Promise<TripImportPlan> {
  const plan = planTripImport(archive, { newId, now, tripName: 'Lapland (2)', choices });
  await applyTripImport(db, plan, {
    exportId: archive.manifest.exportId,
    sourceTripId: archive.manifest.sourceTripId,
    importedAt: now,
  });
  return plan;
}

describe('importing a trip archive into a database', () => {
  it('adds a whole new trip and leaves every existing row exactly as it was', async () => {
    const { raw, db } = await setup();
    const before = dump(raw);
    const { archive } = await archiveFrom(db);

    const plan = await importInto(db, archive);

    const after = dump(raw);
    for (const table of TABLES) {
      // Every row that was there is still there, unchanged, in the same place.
      expect(after[table].slice(0, before[table].length)).toEqual(before[table]);
    }
    expect(raw.pragma('foreign_key_check')).toEqual([]);
    expect(await verifyTripImport(db, plan)).toEqual({ ok: true });
    const copy = raw.prepare(`SELECT name, destination, start_date FROM trips WHERE id = ?`).get(plan.tripId);
    expect(copy).toEqual({ name: 'Lapland (2)', destination: 'Finland', start_date: '2026-11-20' });
  });

  it('carries every relationship: participants, recipients, receipts, journeys, members', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    const plan = await importInto(db, archive);
    const one = (sql: string) => raw.prepare(sql).all(plan.tripId);

    expect(
      one(`SELECT t.name FROM item_participants ip JOIN trip_items i ON i.id = ip.item_id
            JOIN travellers t ON t.id = ip.traveller_id WHERE i.trip_id = ? ORDER BY t.name`),
    ).toEqual([{ name: 'Misho' }, { name: 'Mitko' }]);
    expect(
      one(`SELECT t.name FROM list_item_recipients r JOIN list_items li ON li.id = r.list_item_id
            JOIN lists l ON l.id = li.list_id JOIN travellers t ON t.id = r.traveller_id
           WHERE l.trip_id = ? ORDER BY t.name`),
    ).toEqual([{ name: 'Evelina' }, { name: 'Misho' }]);
    expect(
      one(`SELECT e.label FROM resources r JOIN expenses e ON e.id = r.expense_id WHERE r.trip_id = ?`),
    ).toEqual([{ label: 'K-Market' }]);
    const journeys = one(`SELECT json_extract(details, '$.journeyId') AS j FROM trip_items
                           WHERE trip_id = ? AND details LIKE '%journeyId%'`) as { j: string }[];
    expect(new Set(journeys.map((row) => row.j)).size).toBe(1);
    expect(journeys[0].j).not.toBe('j-1');
    expect(
      one(`SELECT classification FROM trip_travellers WHERE trip_id = ? ORDER BY sort_order`),
    ).toEqual([{ classification: 'adult' }, { classification: 'adult' }, { classification: 'adult' }]);
  });

  it('carries price lines with who they are for, group prices and extras unchanged (3C)', async () => {
    const { raw, db } = await setup();
    const pricing = {
      mode: 'perPerson',
      lines: [
        { label: 'Adult', quantity: 2, unitAmount: 9000, for: 'adult' },
        { quantity: 1, unitAmount: 0, for: 'child' },
        { label: 'Family ticket', quantity: 1, unitAmount: 12000, group: true },
        { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true },
      ],
    };
    const { id } = raw
      .prepare(`SELECT id FROM trip_items WHERE trip_id = 'lap' AND kind <> 'transport' LIMIT 1`)
      .get() as { id: string };
    raw
      .prepare(
        `UPDATE trip_items SET details = json_set(COALESCE(details, '{}'), '$.pricing', json(?)),
                price_amount = 34000, price_currency = 'EUR' WHERE id = ?`,
      )
      .run(JSON.stringify(pricing), id);
    const { archive } = await archiveFrom(db);
    expect(archive.manifest.rowFormat).toBeGreaterThanOrEqual(7);

    const plan = await importInto(db, archive);
    const copies = raw
      .prepare(
        `SELECT json_extract(details, '$.pricing') AS pricing, price_amount FROM trip_items
          WHERE trip_id = ? AND price_amount = 34000`,
      )
      .all(plan.tripId) as { pricing: string; price_amount: number }[];
    expect(copies).toHaveLength(1);
    expect(JSON.parse(copies[0].pricing)).toEqual(pricing);
  });

  it('carries payments and linked expenses with new ids, on the copied bookings and payers (3D-1)', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    expect(archive.manifest.rowFormat).toBe(8);
    // Evelina is linked to the profile here; Misho comes in as a new one.
    const plan = await importInto(db, archive, new Map([['ev', { kind: 'existing', id: 'ev' }]]));
    const one = (sql: string) => raw.prepare(sql).all(plan.tripId);

    expect(
      one(`SELECT i.title, t.name AS payer, p.amount, p.note FROM booking_payments p
             JOIN trip_items i ON i.id = p.trip_item_id
             LEFT JOIN travellers t ON t.id = p.payer_id
            WHERE p.trip_id = ? ORDER BY p.amount DESC`),
    ).toEqual([
      { title: 'leg1', payer: 'Evelina', amount: 20000, note: 'Deposit' },
      { title: 'leg1', payer: null, amount: 5000, note: null },
    ]);
    const payments = one(`SELECT id, trip_item_id, payer_id FROM booking_payments WHERE trip_id = ?`) as {
      id: string;
      trip_item_id: string;
      payer_id: string | null;
    }[];
    // New ids throughout; the payer linked by choice keeps the existing profile.
    expect(payments.some((row) => ['bp1', 'bp2'].includes(row.id) || row.trip_item_id === 'leg1')).toBe(false);
    expect(payments.map((row) => row.payer_id)).toContain('ev');
    // The Rome trip's payment stays out of a Lapland export.
    expect(archive.tables.bookingPayments.map((row) => row.id).sort()).toEqual(['bp1', 'bp2']);

    expect(
      one(`SELECT e.label, i.title, t.name AS payer, t.id = 'mi' AS same_profile FROM expenses e
             LEFT JOIN trip_items i ON i.id = e.trip_item_id
             LEFT JOIN travellers t ON t.id = e.payer_id
            WHERE e.trip_id = ? ORDER BY e.label`),
    ).toEqual([
      { label: 'K-Market', title: null, payer: null, same_profile: null },
      { label: 'Safari balance', title: 'safari', payer: 'Misho', same_profile: 0 },
    ]);
    // Invariant P holds after the remap: every payer is on the new trip.
    expect(
      one(`SELECT payer_id FROM (SELECT trip_id, payer_id FROM booking_payments
                                 UNION ALL SELECT trip_id, payer_id FROM expenses) r
            WHERE r.trip_id = ? AND r.payer_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM trip_travellers m
                               WHERE m.trip_id = r.trip_id AND m.traveller_id = r.payer_id)`),
    ).toEqual([]);
    expect(raw.pragma('foreign_key_check')).toEqual([]);
    expect(await verifyTripImport(db, plan)).toEqual({ ok: true });
  });

  it('rebuilds the derived instants from the trip’s zone rather than trusting the file', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    archive.tables.tripItems[0] = { ...archive.tables.tripItems[0], start_utc: '1999-01-01T00:00:00.000Z' };
    const plan = await importInto(db, archive);
    const leg = raw
      .prepare(`SELECT start_utc, updated_at FROM trip_items WHERE trip_id = ? AND title = 'leg1'`)
      .get(plan.tripId);
    // Rebuilding a cache is not an edit: updated_at stays as exported.
    expect(leg).toEqual({ start_utc: '2026-11-20T07:20:00.000Z', updated_at: now });
  });

  it('never changes Me, and links a traveller to an existing profile only when chosen', async () => {
    const { raw, db } = await setup();
    const me = settings(raw).me_traveller_id;
    const { archive } = await archiveFrom(db);
    const plan = await importInto(db, archive, new Map([['ev', { kind: 'existing', id: 'ev' }]]));

    expect(settings(raw).me_traveller_id).toBe(me);
    const members = raw
      .prepare(`SELECT traveller_id FROM trip_travellers WHERE trip_id = ? ORDER BY sort_order`)
      .all(plan.tripId) as { traveller_id: string }[];
    expect(members[0].traveller_id).toBe('ev');
    expect(members.slice(1).every((row) => !['mi', 'kid'].includes(row.traveller_id))).toBe(true);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM travellers WHERE name = 'Evelina'`).get()).toEqual({ n: 1 });
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM travellers WHERE name = 'Misho'`).get()).toEqual({ n: 2 });
  });

  it('imports twice as two independent copies, and remembers both', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    const first = await importInto(db, archive);
    const second = await importInto(db, archive);

    expect(first.tripId).not.toBe(second.tripId);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trips`).get()).toEqual({ n: 4 });
    const history = await importHistory(db);
    expect(history.map((record) => record.tripId)).toEqual([first.tripId, second.tripId]);
    const ids = (await readTables(db)).trips.map((trip) => trip.id);
    expect(earlierImport(archive.manifest, history, ids)).toMatchObject({ kind: 'sameFile' });
  });

  it('writes nothing at all when one row fails, history included', async () => {
    const { raw, db } = await setup();
    const before = dump(raw);
    const beforeSettings = settings(raw);
    const { archive } = await archiveFrom(db);
    const plan = planTripImport(archive, { newId, now, tripName: 'Broken', choices: new Map() });
    // The last plan item violates a CHECK the archive's own checks do not cover.
    const last = plan.tables.tripItems.length - 1;
    plan.tables.tripItems[last] = { ...plan.tables.tripItems[last], completed_at: now };

    await expect(
      applyTripImport(db, plan, { exportId: 'x', sourceTripId: 'lap', importedAt: now }),
    ).rejects.toThrow(/CHECK/);

    expect(dump(raw)).toEqual(before);
    expect(settings(raw)).toEqual(beforeSettings);
  });

  it('reports what is short after a commit, without deleting anything', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    const plan = await importInto(db, archive);
    raw.prepare(`DELETE FROM trip_notes WHERE trip_id = ?`).run(plan.tripId);
    expect(await verifyTripImport(db, plan)).toEqual({ ok: false, problems: ['notes: 0 of 1'] });
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trips WHERE id = ?`).get(plan.tripId)).toEqual({ n: 1 });
  });

  it('an archive without attachments keeps its documents’ rows, pointing at nothing yet', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db, 'lap', false);
    const plan = await importInto(db, archive);
    expect(plan.files).toEqual([]);
    const rows = raw
      .prepare(`SELECT stored_path FROM resources WHERE kind = 'file' AND (trip_id = ? OR trip_item_id IN
                  (SELECT id FROM trip_items WHERE trip_id = ?))`)
      .all(plan.tripId, plan.tripId) as { stored_path: string }[];
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !Object.keys(FILES).includes(row.stored_path))).toBe(true);
  });
});

describe('the two importers refuse each other’s files', () => {
  it('the full-backup importer sends a trip archive to Import a trip', async () => {
    const { db } = await setup();
    const { bytes } = await archiveFrom(db);
    expect(unpackBackup(bytes)).toEqual({ ok: false, reason: expect.stringContaining('Import a trip') });
  });
});
