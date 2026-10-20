import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { FILES, now, snapshot } from '../db/testing/tripFixture';
import { buildActivityExport, parseActivityFile, type ActivityTrip } from '../domain/activityFormat';
import { buildImportPreview, selectedRows } from '../domain/activityImport';
import { buildExportDocument, planImport } from '../domain/export';
import { importActivities, listItemLinks, type ActivityEntry } from './activityImport';
import { applyImport } from './backup';
import { listTripItems } from './tripItems';
import { getTrip } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Activities written into a real database (better-sqlite3, every migration) holding the fixture's
 * two trips: exactly the ticked entries added to the one trip, in one transaction, nothing that was
 * there touched — and the export of a trip never carrying what is private.
 */

async function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const db = asyncDatabase(raw);
  await applyImport(db, planImport(buildExportDocument(snapshot(), { exportedAt: now }), [], 'merge', Object.keys(FILES)));
  // Item links on the café idea: a web page, a map, and a wallet pass that must never leave.
  const link = (id: string, subtype: string, url: string) =>
    raw
      .prepare(
        `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, url, sort_order, created_at)
         VALUES (?, NULL, 'cafe', 'link', ?, ?, ?, 0, ?)`,
      )
      .run(id, subtype, `${subtype} link`, url, now);
  link('l-web', 'website', 'https://cafe.example.com');
  link('l-map', 'maps', 'https://maps.google.com/?q=cafe');
  link('l-pass', 'wallet', 'https://pay.google.com/gp/v/save/SECRET-PASS');
  return { raw, db };
}

const TABLES = [
  'trips', 'trip_items', 'trip_notes', 'resources', 'expenses', 'payments', 'travellers',
  'trip_travellers', 'item_participants', 'lists', 'list_items', 'list_item_recipients',
  'templates', 'template_uses', 'settings',
];
const dump = (raw: Database.Database) =>
  Object.fromEntries(TABLES.map((t) => [t, raw.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
/** Every table as it was, minus rows the import added. */
const without = (tables: Record<string, unknown[]>, ids: Set<string>) =>
  Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [
      name,
      (rows as Record<string, unknown>[]).filter(
        (row) => !ids.has(row.id as string) && !ids.has(row.trip_item_id as string),
      ),
    ]),
  );

async function tripOf(db: ReturnType<typeof asyncDatabase>, id: string): Promise<ActivityTrip> {
  const trip = await getTrip(db, id);
  if (!trip) throw new Error('no trip');
  return trip;
}

function entriesFrom(text: string, trip: ActivityTrip, pick?: (index: number) => boolean): ActivityEntry[] {
  const parsed = parseActivityFile(text, trip);
  if (!parsed.ok) throw new Error(parsed.reason);
  const preview = buildImportPreview(parsed.activities, parsed.ignored, []);
  const selected = new Set(preview.rows.map((r) => r.index).filter((i) => !pick || pick(i)));
  return selectedRows(preview.rows, selected).map((row) => ({ input: row.input!, links: row.links }));
}

const FILE = JSON.stringify({
  format: 'travel-organizer-activities',
  version: 1,
  activities: [
    { title: 'Arktikum', priority: 'must', location: { name: 'Arktikum', latitude: 66.5115, longitude: 25.7311 } },
    { title: 'Snowmobile', status: 'planned', date: '2026-11-22', startTime: '10:00', endTime: '12:00', price: { amount: '120.50', currency: 'EUR' }, links: [{ label: 'Site', url: 'https://snow.example.com' }, { url: 'https://maps.google.com/?q=snow' }] },
    { title: 'Santa Village', kind: 'other', type: 'viewpoint' },
    { title: 'Ranua zoo', status: 'planned', date: '2026-11-23' },
    { title: 'Flight home', kind: 'transport', type: 'flight', status: 'planned', date: '2026-11-24', startTime: '18:00', endTime: '21:30', timeZone: 'Europe/Helsinki', endTimeZone: 'Europe/Sofia', transport: { from: 'RVN', to: 'SOF', carrier: 'Finnair', number: 'AY99' } },
  ],
});

describe('importActivities', () => {
  it('adds exactly the ticked entries to the one trip, and nothing else changes', async () => {
    const { raw, db } = await setup();
    const before = dump(raw);
    const trip = await tripOf(db, 'lap');
    const entries = entriesFrom(FILE, trip, (i) => i !== 2 && i !== 3);

    const ids = await importActivities(db, 'lap', entries);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    const after = dump(raw);
    expect(without(after, new Set(ids))).toEqual(before);

    const rows = raw.prepare(`SELECT * FROM trip_items WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Record<string, unknown>[];
    expect(rows.map((r) => r.title).sort()).toEqual(['Arktikum', 'Flight home', 'Snowmobile']);
    for (const row of rows) {
      expect(row.trip_id).toBe('lap');
      expect(row.is_paid).toBe(0);
      expect(row.confirmation_code).toBeNull();
      expect(row.completed_at).toBeNull();
    }
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM item_participants WHERE item_id IN (${ids.map(() => '?').join(',')})`).get(...ids)).toEqual({ n: 0 });
    // The deselected ones are absent.
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_items WHERE title IN ('Santa Village', 'Ranua zoo')`).get()).toEqual({ n: 0 });

    const snow = rows.find((r) => r.title === 'Snowmobile')!;
    expect(snow).toMatchObject({ status: 'confirmed', start_local: '2026-11-22T10:00', start_tz: null, end_local: '2026-11-22T12:00', price_amount: 12050, price_currency: 'EUR' });
    expect(snow.start_utc).toBe('2026-11-22T08:00:00.000Z');
    const links = raw.prepare(`SELECT kind, subtype, label, url, trip_id, stored_path FROM resources WHERE trip_item_id = ? ORDER BY sort_order`).all(snow.id);
    expect(links).toEqual([
      { kind: 'link', subtype: 'website', label: 'Site', url: 'https://snow.example.com', trip_id: null, stored_path: null },
      { kind: 'link', subtype: 'maps', label: 'maps.google.com', url: 'https://maps.google.com/?q=snow', trip_id: null, stored_path: null },
    ]);
    const flight = rows.find((r) => r.title === 'Flight home')!;
    expect(flight).toMatchObject({ start_tz: 'Europe/Helsinki', end_tz: 'Europe/Sofia', details: '{"from":"RVN","to":"SOF","carrier":"Finnair","number":"AY99"}' });
    expect(raw.pragma('foreign_key_check')).toEqual([]);
  });

  it('writes nothing when any insert fails — item or link, first or last', async () => {
    const trip = await tripOf((await setup()).db, 'lap');
    const entries = entriesFrom(FILE, trip);
    // 5 items + 2 links = 7 inserts; fail at each in turn.
    for (let failAt = 1; failAt <= 7; failAt++) {
      const { raw, db } = await setup();
      const before = dump(raw);
      const runAsync = db.runAsync.bind(db);
      let inserts = 0;
      (db as { runAsync: unknown }).runAsync = async (sql: string, ...params: unknown[]) => {
        if (/^\s*INSERT/i.test(sql) && ++inserts === failAt) throw new Error(`injected at ${failAt}`);
        return (runAsync as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params);
      };
      await expect(importActivities(db, 'lap', entries)).rejects.toThrow(`injected at ${failAt}`);
      expect(dump(raw)).toEqual(before);
    }
  });

  it('refuses a trip that does not exist, writing nothing', async () => {
    const { raw, db } = await setup();
    const before = dump(raw);
    const entries = entriesFrom(FILE, await tripOf(db, 'lap'));
    await expect(importActivities(db, 'gone', entries)).rejects.toThrow('No trip gone');
    expect(dump(raw)).toEqual(before);
  });

  it('importing the same file twice makes independent rows, never touching the first', async () => {
    const { raw, db } = await setup();
    const entries = entriesFrom(FILE, await tripOf(db, 'lap'));
    const first = await importActivities(db, 'lap', entries);
    const afterFirst = dump(raw);
    const second = await importActivities(db, 'lap', entries);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(without(dump(raw), new Set(second))).toEqual(afterFirst);
  });
});

describe('export → import into another trip', () => {
  it('keeps every supported field, mints new ids, and leaves the source unchanged', async () => {
    const { raw, db } = await setup();
    const lap = await tripOf(db, 'lap');
    // Something of every shape on Lapland first, from a file.
    await importActivities(db, 'lap', entriesFrom(FILE, lap));
    const before = dump(raw);

    const items = await listTripItems(db, 'lap');
    const built = buildActivityExport(items, await listItemLinks(db, 'lap'), lap);
    const text = JSON.stringify(built.document);
    const rome = await tripOf(db, 'rome');
    const ids = await importActivities(db, 'rome', entriesFrom(text, rome));
    expect(without(dump(raw), new Set(ids))).toEqual(before);

    const sourceIds = new Set(items.map((i) => i.id));
    expect(ids.some((id) => sourceIds.has(id))).toBe(false);

    const comparable = (tripId: string, keep: (id: string) => boolean) =>
      (raw.prepare(
        `SELECT id, kind, subkind, status, priority, title, start_local, start_tz, start_precision,
                end_local, end_tz, end_precision, location_name, address, latitude, longitude, notes,
                details, price_amount, price_currency
           FROM trip_items WHERE trip_id = ? ORDER BY title`,
      ).all(tripId) as Record<string, unknown>[])
        .filter((row) => keep(row.id as string))
        .map(({ id: _id, details, ...row }) => ({
          ...row,
          // The route survives; journey ids, seats, reminders and refund flags do not travel.
          details: details ? JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(details as string)).filter(([k]) => ['from', 'to', 'carrier', 'number'].includes(k)))) : null,
        }));
    const exported = new Set(items.filter((i) => i.kind !== 'task' && i.status !== 'cancelled').map((i) => i.id));
    const original = comparable('lap', (id) => exported.has(id));
    const copy = comparable('rome', (id) => ids.includes(id));
    expect(copy).toEqual(original.map((row) => ({ ...row, details: row.details === '{}' ? null : row.details })));

    // Links: web and map pages only.
    const urls = (raw.prepare(`SELECT url FROM resources WHERE trip_item_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { url: string }[]).map((r) => r.url).sort();
    expect(urls).toEqual(['https://cafe.example.com', 'https://maps.google.com/?q=cafe', 'https://maps.google.com/?q=snow', 'https://snow.example.com']);
    // What was booked and paid on Lapland arrives as planned and unpaid, with no reference.
    const copied = raw.prepare(`SELECT is_paid, confirmation_code FROM trip_items WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { is_paid: number; confirmation_code: string | null }[];
    expect(copied.every((r) => r.is_paid === 0 && r.confirmation_code === null)).toBe(true);
    expect(raw.pragma('foreign_key_check')).toEqual([]);
  });

  it('never writes anything private into the file', async () => {
    const { db } = await setup();
    const lap = await tripOf(db, 'lap');
    const items = await listTripItems(db, 'lap');
    const built = buildActivityExport(items, await listItemLinks(db, 'lap'), lap);
    const text = JSON.stringify(built.document);
    expect(built.document.activities.length).toBe(4); // leg1, leg2, safari, cafe
    for (const secret of [
      'ABC123', // booking references
      'Evelina', 'Misho', 'Mitko', 'Rome only', // travellers
      'Door code', '4417', 'Rome secret', 'K-Market', // notes, expenses
      'media/', 'ticket.pdf', 'receipt', // files
      'SECRET-PASS', 'pay.google', // a wallet pass
      'j-1', // journey ids
      '"lap"', '"trip_id"', // ids (the fixture's titles are its ids, so keys are checked below)
      'colosseum', // another trip
      'isPaid', 'is_paid', 'paid', 'participants', 'me_traveller',
    ]) {
      expect(text).not.toContain(secret);
    }
    const keys = new Set(built.document.activities.flatMap((a) => Object.keys(a)));
    for (const key of keys) expect(['title', 'kind', 'type', 'status', 'priority', 'date', 'startTime', 'endDate', 'endTime', 'timeZone', 'endTimeZone', 'location', 'notes', 'price', 'links', 'transport']).toContain(key);
  });
});
