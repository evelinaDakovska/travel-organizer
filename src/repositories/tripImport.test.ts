import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { FILES, now, SCHEMA, sha, shaAsync, snapshot } from '../db/testing/tripFixture';
import { unpackBackup } from '../domain/archive';
import { costFingerprint, tripBalances } from '../domain/balances';
import { buildExportDocument, planImport } from '../domain/export';
import {
  buildTripArchive,
  checkTripArchive,
  earlierImport,
  openTripArchive,
  packTripArchive,
  planTripImport,
  type TravellerChoice,
  type TripImportPlan,
} from '../domain/tripArchive';
import { applyImport, readTables } from './backup';
import { updateBookingPayment } from './payments';
import { balanceInput, keepOutside } from './settlements';
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
  'templates', 'template_uses', 'booking_payments', 'cost_shares', 'settlements', 'unsplit_confirmations', 'settlement_reviews',
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
    expect(archive.manifest.rowFormat).toBe(13);
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

  it('carries splits and covers with new ids, on the copied costs and people (3D-2)', async () => {
    const { raw, db } = await setup();
    const { archive } = await archiveFrom(db);
    // The Rome trip's split stays out of a Lapland export.
    expect(archive.tables.costShares.map((row) => row.id).sort()).toEqual(['cs1', 'cs2', 'cs3']);
    const plan = await importInto(db, archive, new Map([['ev', { kind: 'existing', id: 'ev' }]]));
    const one = (sql: string) => raw.prepare(sql).all(plan.tripId);

    expect(
      one(`SELECT COALESCE(i.title, e.label) AS cost, t.name AS who, c.name AS covered_by, s.amount, s.sort_order
             FROM cost_shares s
             LEFT JOIN trip_items i ON i.id = s.trip_item_id
             LEFT JOIN expenses e ON e.id = s.expense_id
             JOIN travellers t ON t.id = s.traveller_id
             LEFT JOIN travellers c ON c.id = s.covered_by
            WHERE s.trip_id = ? ORDER BY cost, s.sort_order`),
    ).toEqual([
      { cost: 'K-Market', who: 'Misho', covered_by: null, amount: 1250, sort_order: 0 },
      { cost: 'safari', who: 'Evelina', covered_by: null, amount: null, sort_order: 0 },
      { cost: 'safari', who: 'Mitko', covered_by: 'Misho', amount: null, sort_order: 1 },
    ]);
    const shares = one(`SELECT id, trip_item_id, traveller_id FROM cost_shares WHERE trip_id = ?`) as {
      id: string;
      trip_item_id: string | null;
      traveller_id: string;
    }[];
    expect(shares.some((row) => ['cs1', 'cs2', 'cs3'].includes(row.id) || row.trip_item_id === 'safari')).toBe(false);
    // Evelina linked by choice keeps the profile here; the others are new profiles.
    expect(shares.map((row) => row.traveller_id)).toContain('ev');
    expect(
      one(`SELECT c.name AS child, a.name AS adult FROM trip_cover tc
             JOIN travellers c ON c.id = tc.child_id JOIN travellers a ON a.id = tc.adult_id
            WHERE tc.trip_id = ?`),
    ).toEqual([{ child: 'Mitko', adult: 'Evelina' }]);
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

describe('unsplit costs kept outside, through a trip archive (review P1)', () => {
  it('16–17: the confirmation goes to the copied cost and still matches it under new traveller ids', async () => {
    const { raw, db } = await setup();
    // Lapland has a settlement; leg1 is unsplit, paid by Evelina and by someone not recorded.
    const leg1 = (await balanceInput(db, 'lap')).costs.find((cost) => cost.id === 'leg1')!;
    await keepOutside(db, 'lap', { kind: 'booking', id: 'leg1' }, costFingerprint(leg1));
    const original = tripBalances(await balanceInput(db, 'lap')).find((entry) => entry.currency === 'EUR')!;
    expect(original.keptOutside.map((cost) => cost.id)).toEqual(['leg1']);
    expect(original.toReview.map((cost) => cost.id)).toEqual(['leg2']);

    const { archive } = await archiveFrom(db);
    expect(archive.tables.unsplitConfirmations).toHaveLength(1);
    // Every traveller comes in as a new profile: Evelina, the payer in the fingerprint, gets a new id.
    const plan = await importInto(db, archive);
    expect(await verifyTripImport(db, plan)).toEqual({ ok: true });
    const titled = (title: string) =>
      (raw.prepare(`SELECT id FROM trip_items WHERE trip_id = ? AND title = ?`).get(plan.tripId, title) as { id: string }).id;
    const copy = tripBalances(await balanceInput(db, plan.tripId)).find((entry) => entry.currency === 'EUR')!;
    expect(copy.keptOutside.map((cost) => cost.id)).toEqual([titled('leg1')]);
    expect(copy.toReview.map((cost) => cost.id)).toEqual([titled('leg2')]);
    const [row] = plan.tables.unsplitConfirmations;
    expect(row.fingerprint).not.toContain('"ev"');

    // The original is untouched, on its own cost.
    expect(raw.prepare(`SELECT trip_id, trip_item_id FROM unsplit_confirmations ORDER BY rowid`).all()).toEqual([
      { trip_id: 'lap', trip_item_id: 'leg1' },
      { trip_id: plan.tripId, trip_item_id: titled('leg1') },
    ]);
  });

  it('8: restored from a backup or copied by an archive, it still ends for good on an edit undone', async () => {
    const { db } = await setup();
    const leg1 = (await balanceInput(db, 'lap')).costs.find((cost) => cost.id === 'leg1')!;
    await keepOutside(db, 'lap', { kind: 'booking', id: 'leg1' }, costFingerprint(leg1));
    const eur = async (target: typeof db, tripId: string) =>
      tripBalances(await balanceInput(target, tripId)).find((entry) => entry.currency === 'EUR')!;
    const undone = { amount: 5000, payerId: null, paidOn: null, note: undefined };

    // A full backup, restored into an empty phone.
    const restoredRaw = new Database(':memory:');
    restoredRaw.pragma('foreign_keys = ON');
    for (const m of MIGRATIONS) restoredRaw.exec(m.sql);
    const restored = asyncDatabase(restoredRaw);
    const document = buildExportDocument(await readTables(db), { exportedAt: now });
    await applyImport(restored, planImport(document, [], 'merge', Object.keys(FILES)));
    expect((await eur(restored, 'lap')).keptOutside.map((cost) => cost.id)).toEqual(['leg1']);
    await updateBookingPayment(restored, 'bp2', { ...undone, amount: 6000 });
    await updateBookingPayment(restored, 'bp2', undone);
    expect(restoredRaw.prepare(`SELECT COUNT(*) AS n FROM unsplit_confirmations`).get()).toEqual({ n: 0 });
    expect((await eur(restored, 'lap')).toReview.map((cost) => cost.id)).toEqual(['leg1', 'leg2']);

    // A trip archive, imported under new ids: the copy's own payment, changed and changed back.
    const { archive } = await archiveFrom(db);
    const plan = await importInto(db, archive);
    const copyOfLeg1 = plan.tables.tripItems.find((row) => row.title === leg1.title)!.id;
    const copyOfBp2 = plan.tables.bookingPayments.find((row) => row.trip_item_id === copyOfLeg1 && row.payer_id === null)!.id;
    expect((await eur(db, plan.tripId)).keptOutside.map((cost) => cost.id)).toEqual([copyOfLeg1]);
    await updateBookingPayment(db, copyOfBp2, { ...undone, amount: 6000 });
    await updateBookingPayment(db, copyOfBp2, undone);
    expect((await eur(db, plan.tripId)).keptOutside).toEqual([]);
    // The original trip's confirmation is another trip's: untouched.
    expect((await eur(db, 'lap')).keptOutside.map((cost) => cost.id)).toEqual(['leg1']);
  });

  it('refuses an archive whose confirmation names no cost of the trip, or one cost twice', async () => {
    const { db } = await setup();
    const leg1 = (await balanceInput(db, 'lap')).costs.find((cost) => cost.id === 'leg1')!;
    await keepOutside(db, 'lap', { kind: 'booking', id: 'leg1' }, costFingerprint(leg1));
    const { archive } = await archiveFrom(db);
    const [row] = archive.tables.unsplitConfirmations;
    const check = (rows: (typeof row)[]) =>
      checkTripArchive(archive.manifest, { ...archive.tables, unsplitConfirmations: rows });
    expect(check([row])).toBeNull();
    expect(check([{ ...row, trip_item_id: 'colosseum' }])).toBe('a cost kept outside is a missing plan');
    expect(check([{ ...row, trip_item_id: null, expense_id: 'nowhere' }])).toBe('a cost kept outside is a missing expense');
    expect(check([{ ...row, expense_id: 'e1' }])).toBe('a cost kept outside has no single cost');
    expect(check([row, { ...row, id: 'other' }])).toBe('a cost is kept outside twice');
    expect(check([{ ...row, trip_id: 'rome' }])).toBe('an unsplit cost kept outside belongs to another trip');
  });
});

describe('settlement reviews, through a trip archive (§15.3)', () => {
  const addReviews = (raw: Database.Database) => {
    const insert = raw.prepare(
      `INSERT INTO settlement_reviews (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount, to_currency,
                                       created_at, acknowledged_at)
       VALUES (?, 'lap', 'EUR', ?, 'expense', ?, ?, ?, ?, ?)`,
    );
    insert.run('rv-old', 'deleted', 'Taxi', 3000, null, now, now);
    insert.run('rv-open', 'moved', 'Ferry', 9000, 'NOK', now, null);
  };

  it('21: copied to the new trip under new ids, open still open, acknowledged still acknowledged', async () => {
    const { raw, db } = await setup();
    addReviews(raw);
    const original = raw.prepare(`SELECT * FROM settlement_reviews ORDER BY rowid`).all();
    const { archive } = await archiveFrom(db);
    expect(archive.tables.settlementReviews).toHaveLength(2);
    const plan = await importInto(db, archive);
    expect(await verifyTripImport(db, plan)).toEqual({ ok: true });

    const copied = raw
      .prepare(`SELECT * FROM settlement_reviews WHERE trip_id = ? ORDER BY rowid`)
      .all(plan.tripId) as Record<string, unknown>[];
    expect(copied).toHaveLength(2);
    expect(copied.map((row) => row.id)).not.toContain('rv-old');
    expect(copied.map(({ id: _id, trip_id: _trip, ...rest }) => rest)).toEqual(
      (original as Record<string, unknown>[]).map(({ id: _id, trip_id: _trip, ...rest }) => rest),
    );
    const eur = tripBalances(await balanceInput(db, plan.tripId)).find((entry) => entry.currency === 'EUR')!;
    expect(eur.settlementReviews.map((review) => review.costTitle)).toEqual(['Ferry']);
    // The original trip's reviews are untouched.
    expect(raw.prepare(`SELECT * FROM settlement_reviews WHERE trip_id = 'lap' ORDER BY rowid`).all()).toEqual(original);
  });

  it('refuses an archive whose review belongs to another trip, repeats an id, or misstates a move', async () => {
    const { raw, db } = await setup();
    addReviews(raw);
    const { archive } = await archiveFrom(db);
    const [row] = archive.tables.settlementReviews;
    const check = (rows: (typeof row)[]) => checkTripArchive(archive.manifest, { ...archive.tables, settlementReviews: rows });
    expect(check([row])).toBeNull();
    expect(check([row, row])).toMatch(/settlement reviews/);
    expect(check([{ ...row, trip_id: 'rome' }])).toBe('a settlement review belongs to another trip');
    expect(check([{ ...row, reason: 'moved', to_currency: null }])).toBe('a settlement review does not say where a cost moved');
    expect(check([{ ...row, reason: 'deleted', to_currency: 'NOK' }])).toBe('a settlement review does not say where a cost moved');
  });

  it('a refused import writes no review: the trip and its reviews come in together or not at all', async () => {
    const { raw, db } = await setup();
    addReviews(raw);
    const { archive } = await archiveFrom(db);
    const before = dump(raw);
    raw.exec(`CREATE TEMP TRIGGER fail_review BEFORE INSERT ON settlement_reviews BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    await expect(importInto(db, archive)).rejects.toThrow('disk full');
    expect(dump(raw)).toEqual(before);
  });

  it('carries the reporting currency, the rates and the charged amounts onto the new trip (Phase 4)', async () => {
    const { raw, db } = await setup();
    raw.prepare(`UPDATE trips SET report_currency = 'EUR' WHERE id = 'lap'`).run();
    raw
      .prepare(
        `INSERT INTO trip_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
         VALUES ('lap', 'USD', 'EUR', '0.92', '2026-10-20', ?), ('lap', 'NOK', 'GBP', '0.07', '2026-10-01', ?),
                ('rome', 'USD', 'EUR', '0.5', '2026-10-20', ?)`,
      )
      .run(now, now, now);
    raw.prepare(`UPDATE booking_payments SET charged_amount = 18000, charged_currency = 'USD' WHERE id = 'bp1'`).run();
    raw.prepare(`UPDATE expenses SET charged_amount = 1300, charged_currency = 'USD' WHERE id = 'e1'`).run();
    const { archive } = await archiveFrom(db);
    const plan = await importInto(db, archive);

    const trip = raw.prepare(`SELECT report_currency FROM trips WHERE id = ?`).get(plan.tripId);
    expect(trip).toEqual({ report_currency: 'EUR' });
    expect(raw.prepare(`SELECT currency, base_currency, rate, rate_date FROM trip_rates WHERE trip_id = ? ORDER BY currency`).all(plan.tripId)).toEqual([
      { currency: 'NOK', base_currency: 'GBP', rate: '0.07', rate_date: '2026-10-01' },
      { currency: 'USD', base_currency: 'EUR', rate: '0.92', rate_date: '2026-10-20' },
    ]);
    expect(raw.prepare(`SELECT amount, charged_amount, charged_currency FROM booking_payments WHERE trip_id = ? AND charged_amount IS NOT NULL`).all(plan.tripId)).toEqual([
      { amount: 20000, charged_amount: 18000, charged_currency: 'USD' },
    ]);
    expect(raw.prepare(`SELECT amount, charged_amount, charged_currency FROM expenses WHERE trip_id = ? AND charged_amount IS NOT NULL`).all(plan.tripId)).toEqual([
      { amount: 1250, charged_amount: 1300, charged_currency: 'USD' },
    ]);
    // The other trip's rate stayed out of the archive.
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_rates WHERE rate = '0.5'`).get()).toEqual({ n: 1 });
  });
});
