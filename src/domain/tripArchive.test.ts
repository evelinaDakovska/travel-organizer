import { strToU8, unzipSync, zipSync } from 'fflate';

import { FILES, now, SCHEMA, sha, shaAsync, snapshot } from '../db/testing/tripFixture';
import {
  buildTripArchive,
  checkTripArchive,
  damagedLabels,
  DATA_NAME,
  earlierImport,
  isArchiveFileName,
  MANIFEST_NAME,
  openTripArchive,
  packTripArchive,
  parseImportHistory,
  planTripImport,
  possibleMatches,
  summariseTripArchive,
  TRIP_ARCHIVE_LIMITS,
  tripArchiveFileName,
  uniqueTripName,
  withImport,
  type OpenedTripArchive,
  type TripArchiveLimits,
  type TripArchiveManifest,
} from './tripArchive';

/**
 * The single-trip archive (2B), all of it in node: built from a two-trip snapshot, packed,
 * opened as untrusted input, and planned as a new trip.
 */

function facts(paths: string[]) {
  return new Map(
    paths.map((path) => [path, { sizeBytes: FILES[path].length, sha256: sha(FILES[path]) }] as const),
  );
}

function build(includeFiles = true, available = ['media/ticket.pdf', 'media/receipt.jpg']) {
  return buildTripArchive(snapshot(), 'lap', {
    exportId: 'export-0001',
    exportedAt: now,
    appVersion: '0.9.0',
    schemaVersion: SCHEMA,
    includeFiles,
    files: facts(available),
    sha256Of: sha,
  });
}

function zipOf(built: ReturnType<typeof build>) {
  const files = new Map([...built.filesToPack].map(([name, path]) => [name, FILES[path]] as const));
  return packTripArchive(built.manifest, built.dataBytes, files);
}

async function open(bytes: Uint8Array, limits: TripArchiveLimits = TRIP_ARCHIVE_LIMITS) {
  return openTripArchive(bytes, shaAsync, { supportedSchemaVersion: SCHEMA, limits });
}

async function opened(bytes: Uint8Array): Promise<OpenedTripArchive> {
  const result = await open(bytes);
  if (!result.ok) throw new Error(result.reason);
  return result.archive;
}

/** A zip written by hand, so names and repeats a well-behaved writer refuses can be tested. */
function rawZip(entries: readonly (readonly [string, Uint8Array])[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, data] of entries) {
    const n = strToU8(name);
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0),
    ]);
    parts.push(local, n, data);
    central.push(
      Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]),
      n,
    );
    offset += local.length + n.length + data.length;
  }
  const cdSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The entries of a good archive, to tamper with one at a time. */
function goodEntries(): [string, Uint8Array][] {
  return Object.entries(unzipSync(zipOf(build())));
}

const replace = (entries: [string, Uint8Array][], name: string, bytes: Uint8Array) =>
  entries.map(([n, b]) => [n, n === name ? bytes : b] as [string, Uint8Array]);

const json = (value: unknown) => strToU8(JSON.stringify(value));
const manifestOf = (entries: [string, Uint8Array][]): TripArchiveManifest =>
  JSON.parse(new TextDecoder().decode(entries.find(([n]) => n === MANIFEST_NAME)![1]));

describe('building a trip archive', () => {
  it('holds the one trip and only what it uses — never Me, templates, reusable lists or another trip', () => {
    const { manifest, dataBytes } = build();
    const { tables } = JSON.parse(new TextDecoder().decode(dataBytes));
    expect(tables.trips.map((row: { id: string }) => row.id)).toEqual(['lap']);
    expect(tables.tripItems).toHaveLength(4);
    expect(tables.tripNotes.map((row: { id: string }) => row.id)).toEqual(['n1']);
    expect(tables.travellers.map((row: { id: string }) => row.id).sort()).toEqual(['ev', 'kid', 'mi']);
    expect(tables.lists.map((row: { id: string }) => row.id)).toEqual(['shop']);
    expect(tables.listItems.map((row: { id: string }) => row.id)).toEqual(['warmers']);
    expect(tables.listItemRecipients).toHaveLength(2);
    expect(tables.settings).toBeUndefined();
    expect(tables.templates).toBeUndefined();
    const text = new TextDecoder().decode(dataBytes);
    expect(text).not.toContain('Rome secret');
    expect(text).not.toContain('other-trip');
    expect(text).not.toContain('me_traveller_id');
    expect(manifest.sourceTripId).toBe('lap');
    expect(manifest.partial).toBe(false);
  });

  it('names each distinct file once, and points every row that shares it at that one name', () => {
    const { manifest, dataBytes, filesToPack } = build();
    expect(manifest.files.map((entry) => [entry.name, entry.status])).toEqual([
      ['files/001.jpg', 'included'],
      ['files/002.pdf', 'included'],
    ]);
    expect([...filesToPack.values()].sort()).toEqual(['media/receipt.jpg', 'media/ticket.pdf']);
    const { tables } = JSON.parse(new TextDecoder().decode(dataBytes));
    const paths = Object.fromEntries(
      tables.resources.map((row: { id: string; stored_path: string | null }) => [row.id, row.stored_path]),
    );
    expect(paths['r-ticket']).toBe('files/002.pdf');
    expect(paths['r-ticket-copy']).toBe('files/002.pdf');
    expect(paths['r-receipt']).toBe('files/001.jpg');
    expect(new TextDecoder().decode(dataBytes)).not.toContain('media/');
  });

  it('records each file’s size and SHA-256, and the data’s own', () => {
    const { manifest, dataBytes } = build();
    const ticket = manifest.files.find((entry) => entry.name === 'files/002.pdf')!;
    expect(ticket.sha256).toBe(sha(FILES['media/ticket.pdf']));
    expect(ticket.sizeBytes).toBe(FILES['media/ticket.pdf'].length);
    expect(manifest.data.sha256).toBe(sha(dataBytes));
  });

  it('without attachments: no file goes in, each is marked excluded, the archive is partial', () => {
    const built = build(false);
    expect(built.filesToPack.size).toBe(0);
    expect(built.manifest.files.every((entry) => entry.status === 'excluded')).toBe(true);
    expect(built.manifest.attachments).toBe('excluded');
    expect(built.manifest.partial).toBe(true);
    expect(Object.keys(unzipSync(zipOf(built))).sort()).toEqual([MANIFEST_NAME, DATA_NAME]);
  });

  it('a file already missing on the phone is marked missing and named, never claimed complete', () => {
    const built = build(true, ['media/receipt.jpg']);
    expect(built.manifest.files.find((entry) => entry.name === 'files/002.pdf')?.status).toBe('missing');
    expect(built.manifest.partial).toBe(true);
    expect(built.missingLabels.sort()).toEqual(['r-ticket', 'r-ticket-copy']);
  });

  it('names the file after the trip and the time', () => {
    expect(tripArchiveFileName('Лапландия & Rovaniemi!', new Date(2026, 9, 19, 15, 30))).toBe(
      'Rovaniemi-trip-2026-10-19-1530.zip',
    );
    expect(tripArchiveFileName('???', new Date(2026, 9, 19, 9, 5))).toBe('Trip-trip-2026-10-19-0905.zip');
  });
});

describe('opening a trip archive', () => {
  it('reads back what was packed, every file checked', async () => {
    const archive = await opened(zipOf(build()));
    expect(archive.manifest.sourceTripId).toBe('lap');
    expect(archive.damaged).toEqual([]);
    expect([...archive.files.keys()].sort()).toEqual(['files/001.jpg', 'files/002.pdf']);
    expect(archive.files.get('files/002.pdf')).toEqual(FILES['media/ticket.pdf']);
    expect(summariseTripArchive(archive)).toMatchObject({
      plans: 4,
      bookings: 3,
      places: 1,
      travellers: 3,
      notes: 1,
      lists: 1,
      listItems: 1,
      documents: 2,
      links: 1,
      receipts: 1,
      expenses: 2,
      payments: 1,
      bookingPayments: 2,
      splitCosts: 2,
      settlements: 1,
      filesIncluded: 2,
      unavailable: [],
    });
  });

  it('refuses what is not a zip, and a zip that is not ours', async () => {
    expect(await open(strToU8('hello'))).toEqual({ ok: false, reason: 'This file is not a zip archive.' });
    expect((await open(zipSync({ 'readme.txt': strToU8('x') }))).ok).toBe(false);
  });

  it('refuses a full backup, pointing at the right importer', async () => {
    const result = await open(zipSync({ 'backup.json': strToU8('{}') }));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('full backup') });
  });

  it.each([
    ['../escape.pdf'],
    ['files/../../escape.pdf'],
    ['/data/escape.pdf'],
    ['files\\escape.pdf'],
    ['files/sub/escape.pdf'],
    ['media/escape.pdf'],
    ['files/'],
  ])('refuses an unsafe entry name: %s', async (name) => {
    const entries = [...goodEntries(), [name, strToU8('x')] as [string, Uint8Array]];
    const result = await open(rawZip(entries));
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/unexpected entry/) });
  });

  it('refuses an archive holding the same entry twice', async () => {
    const entries = goodEntries();
    const file = entries.find(([name]) => name.startsWith('files/'))!;
    const result = await open(rawZip([...entries, [file[0], strToU8('evil twin')]]));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('same entry twice') });
  });

  it('refuses before inflating: too big, too many entries, an entry or the whole too large', async () => {
    const bytes = zipOf(build());
    const small: TripArchiveLimits = { ...TRIP_ARCHIVE_LIMITS };
    expect((await open(bytes, { ...small, archiveBytes: 100 })).ok).toBe(false);
    expect((await open(bytes, { ...small, entries: 2 })).ok).toBe(false);
    expect((await open(bytes, { ...small, entryBytes: 5 })).ok).toBe(false);
    expect((await open(bytes, { ...small, totalBytes: 50 })).ok).toBe(false);
    expect((await open(bytes, { ...small, jsonBytes: 50 })).ok).toBe(false);
  });

  it('refuses a zip bomb from its declared size, without expanding it', async () => {
    const bomb = zipSync({ 'files/001.pdf': [new Uint8Array(30 * 1024 * 1024), { level: 9 }] });
    expect(bomb.length).toBeLessThan(100 * 1024);
    const result = await open(bomb, { ...TRIP_ARCHIVE_LIMITS, entryBytes: 1024 * 1024 });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('too large') });
  });

  it('refuses a damaged manifest, someone else’s, and a newer one', async () => {
    const entries = goodEntries();
    const manifest = manifestOf(entries);
    const withManifest = (value: unknown) => open(rawZip(replace(entries, MANIFEST_NAME, json(value))));
    expect((await open(rawZip(replace(entries, MANIFEST_NAME, strToU8('{nope'))))).ok).toBe(false);
    expect((await withManifest({ ...manifest, kind: 'something-else' })).ok).toBe(false);
    for (const newer of [
      { formatVersion: 2 },
      { rowFormat: 99 },
      { schemaVersion: SCHEMA + 1 },
    ]) {
      expect(await withManifest({ ...manifest, ...newer })).toEqual({
        ok: false,
        reason: expect.stringContaining('newer version'),
      });
    }
  });

  it('writes row format 13, and still opens trips exported by 0.16.2 (12), 0.16.1 (11), 0.16.0 (10), 0.15.0 (9), 0.14.0 (8) and 0.13.0 (7)', async () => {
    const entries = goodEntries();
    const manifest = manifestOf(entries);
    expect(manifest.rowFormat).toBe(13);
    for (const rowFormat of [12, 11, 10, 9, 8, 7]) {
      const older = await open(rawZip(replace(entries, MANIFEST_NAME, json({ ...manifest, rowFormat }))));
      expect(older.ok).toBe(true);
    }
    // What 0.16.x does with this app's archives: its own check, with its own number.
    expect(manifest.rowFormat).toBeGreaterThan(12);
  });

  it('refuses trip data that does not match its checksum', async () => {
    const entries = goodEntries();
    const data = entries.find(([name]) => name === DATA_NAME)![1];
    const tampered = new TextDecoder().decode(data).replace('Door code', 'Door cod3');
    const result = await open(rawZip(replace(entries, DATA_NAME, strToU8(tampered))));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('checksum') });
  });

  it('reports a file whose bytes do not match as damaged, and keeps the rest', async () => {
    const entries = goodEntries();
    const archive = await opened(rawZip(replace(entries, 'files/002.pdf', strToU8('%PDF-1.4 tampered!!!'))));
    expect(archive.damaged).toEqual(['files/002.pdf']);
    expect([...archive.files.keys()]).toEqual(['files/001.jpg']);
    expect(summariseTripArchive(archive).unavailable).toEqual([{ name: 'files/002.pdf', reason: 'damaged' }]);
    expect(damagedLabels(archive).sort()).toEqual(['r-ticket', 'r-ticket-copy']);
  });

  it('reports an included file absent from the zip as damaged', async () => {
    const entries = goodEntries().filter(([name]) => name !== 'files/001.jpg');
    const archive = await opened(rawZip(entries));
    expect(archive.damaged).toEqual(['files/001.jpg']);
  });

  it('refuses a file the manifest does not list as included', async () => {
    const entries = unzipSync(zipOf(build(false)));
    const result = await open(rawZip([...Object.entries(entries), ['files/001.jpg', strToU8('sneaky')]]));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('does not list') });
  });
});

describe('checkTripArchive — every reference resolves inside the archive', () => {
  const parts = () => {
    const { manifest, dataBytes } = build();
    return { manifest, tables: JSON.parse(new TextDecoder().decode(dataBytes)).tables };
  };

  it('passes a well-formed archive', () => {
    const { manifest, tables } = parts();
    expect(checkTripArchive(manifest, tables)).toBeNull();
  });

  it.each([
    ['a plan on another trip', (t: any) => (t.tripItems[0].trip_id = 'rome')],
    ['a participant who is not in it', (t: any) => (t.itemParticipants[0].traveller_id = 'ghost')],
    ['a recipient on a missing item', (t: any) => (t.listItemRecipients[0].list_item_id = 'ghost')],
    ['a receipt for a missing expense', (t: any) => (t.resources[2].expense_id = 'ghost')],
    ['a document on a missing plan', (t: any) => (t.resources[0].trip_item_id = 'ghost')],
    ['a file the manifest does not list', (t: any) => (t.resources[0].stored_path = 'files/999.pdf')],
    ['two plans with one id', (t: any) => (t.tripItems[1].id = t.tripItems[0].id)],
    ['the same person twice on the trip', (t: any) => t.tripTravellers.push({ ...t.tripTravellers[0] })],
    ['a second trip', (t: any) => t.trips.push({ ...t.trips[0], id: 'other' })],
  ])('refuses %s', (_what, tamper) => {
    const { manifest, tables } = parts();
    tamper(tables);
    expect(checkTripArchive(manifest, tables)).not.toBeNull();
  });

  // Invariant P: a payer is on the trip, not merely somewhere in the archive.
  const guest = (t: any) => t.travellers.push({ ...t.travellers[0], id: 'guest', name: 'Guest' });
  it.each([
    ['a payment by someone not in it', (t: any) => (t.bookingPayments[0].payer_id = 'ghost'), 'a payment names a payer who is not in the archive'],
    ['a payment by someone not on the trip', (t: any) => (guest(t), (t.bookingPayments[0].payer_id = 'guest')), 'a payment names a payer who is not on the trip'],
    ['an expense by someone not on the trip', (t: any) => (guest(t), (t.expenses.find((e: any) => e.payer_id).payer_id = 'guest')), 'an expense names a payer who is not on the trip'],
    // 3D-2: shares and covers name members of the trip, for one cost each.
    ['a share for someone not on the trip', (t: any) => (guest(t), (t.costShares[0].traveller_id = 'guest')), 'a share names someone who is not on the trip'],
    ['a share covered by someone not on the trip', (t: any) => (guest(t), (t.costShares[1].covered_by = 'guest')), 'a share is covered by someone who is not on the trip'],
    ['a share of a missing plan', (t: any) => (t.costShares[0].trip_item_id = 'ghost'), 'a share is for a missing plan'],
    ['a share of a missing expense', (t: any) => (t.costShares[2].expense_id = 'ghost'), 'a share is for a missing expense'],
    ['a share of two costs', (t: any) => (t.costShares[0].expense_id = 'e1'), 'a share has no single cost'],
    ['two shares of one cost for one person', (t: any) => t.costShares.push({ ...t.costShares[0], id: 'cs9' }), 'someone has two shares of one cost'],
    ['a cover by someone not on the trip', (t: any) => (guest(t), (t.tripCover[0].adult_id = 'guest')), 'who covers a child names someone who is not on the trip'],
    // 3E: a settlement is between two different members of the trip.
    ['a settlement from someone not on the trip', (t: any) => (guest(t), (t.settlements[0].from_id = 'guest')), 'a settlement names someone who is not on the trip'],
    ['a settlement to someone not in it', (t: any) => (t.settlements[0].to_id = 'ghost'), 'a settlement names someone who is not on the trip'],
    ['a settlement to oneself', (t: any) => (t.settlements[0].to_id = t.settlements[0].from_id), 'a settlement is from someone to themselves'],
    ['a settlement of nothing', (t: any) => (t.settlements[0].amount = 0), 'a settlement has no amount'],
    ['a settlement of another trip', (t: any) => (t.settlements[0].trip_id = 'rome'), 'a settlement belongs to another trip'],
    ['two settlements with one id', (t: any) => t.settlements.push({ ...t.settlements[0] }), 'two settlements share an id'],
  ])('refuses %s', (_what, tamper, reason) => {
    const { manifest, tables } = parts();
    tamper(tables);
    expect(checkTripArchive(manifest, tables)).toBe(reason);
  });
});

describe('planning an import: a new trip, new ids for everything', () => {
  let counter = 0;
  const newId = () => `new-${++counter}`;
  const plan = async (choices = new Map(), bytes = zipOf(build())) =>
    planTripImport(await opened(bytes), { newId, now, tripName: 'Lapland (2)', choices });

  const oldIds = new Set([
    'lap', 'leg1', 'leg2', 'safari', 'cafe', 'n1', 'e1', 'p1', 'r-ticket', 'r-ticket-copy',
    'r-receipt', 'r-link', 'ev', 'mi', 'kid', 'shop', 'warmers',
  ]);

  it('reuses no id from the archive, for any row', async () => {
    const p = await plan();
    const ids = [
      p.tripId,
      ...p.tables.tripItems.map((row) => row.id),
      ...p.tables.tripNotes.map((row) => row.id),
      ...p.tables.resources.map((row) => row.id),
      ...p.tables.expenses.map((row) => row.id),
      ...p.tables.payments.map((row) => row.id),
      ...p.tables.travellers.map((row) => row.id),
      ...p.tables.lists.map((row) => row.id),
      ...p.tables.listItems.map((row) => row.id),
    ];
    expect(ids.filter((id) => oldIds.has(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(p.tables.trips[0]).toMatchObject({ id: p.tripId, name: 'Lapland (2)', start_date: '2026-11-20' });
  });

  it('points every reference at the new ids', async () => {
    const p = await plan();
    const items = new Set(p.tables.tripItems.map((row) => row.id));
    const travellers = new Set(p.tables.travellers.map((row) => row.id));
    const expenses = new Set(p.tables.expenses.map((row) => row.id));
    const listItems = new Set(p.tables.listItems.map((row) => row.id));
    expect(p.tables.tripItems.every((row) => row.trip_id === p.tripId)).toBe(true);
    expect(p.tables.itemParticipants.every((row) => items.has(row.item_id) && travellers.has(row.traveller_id))).toBe(true);
    expect(p.tables.tripTravellers.every((row) => row.trip_id === p.tripId && travellers.has(row.traveller_id))).toBe(true);
    expect(p.tables.listItemRecipients.every((row) => listItems.has(row.list_item_id) && travellers.has(row.traveller_id))).toBe(true);
    const receipt = p.tables.resources.find((row) => row.expense_id !== null)!;
    expect(expenses.has(receipt.expense_id!)).toBe(true);
    expect(receipt.trip_id).toBe(p.tripId);
    expect(p.tables.itemParticipants).toHaveLength(2);
    expect(p.tables.listItemRecipients).toHaveLength(2);
  });

  it('keeps prices, references, dates, payment status, classifications and order exactly', async () => {
    const p = await plan();
    const leg = p.tables.tripItems.find((row) => row.title === 'leg1')!;
    expect(leg).toMatchObject({
      price_amount: 18000,
      price_currency: 'EUR',
      is_paid: 1,
      confirmation_code: 'ABC123',
      start_local: '2026-11-20T09:20',
      start_tz: 'Europe/Sofia',
    });
    expect(p.tables.tripTravellers.map((row) => [row.sort_order, row.classification])).toEqual([
      [0, 'adult'],
      [1, 'adult'],
      [2, 'adult'],
    ]);
    expect(p.tables.travellers.find((row) => row.name === 'Mitko')?.classification).toBe('child');
    expect(p.tables.expenses[0]).toMatchObject({ amount: 1250, paid_by: 'Evelina' });
    expect(p.tables.payments[0]).toMatchObject({ from_name: 'Misho', to_name: 'Evelina', amount: 500 });
  });

  it('gives one journey one new id, shared by its legs', async () => {
    const p = await plan();
    const journeys = p.tables.tripItems
      .filter((row) => row.details?.includes('journeyId'))
      .map((row) => JSON.parse(row.details!).journeyId);
    expect(journeys).toHaveLength(2);
    expect(journeys[0]).toBe(journeys[1]);
    expect(journeys[0]).not.toBe('j-1');
  });

  it('writes a shared file once, under a new name both rows point at', async () => {
    const p = await plan();
    expect(p.files).toHaveLength(2);
    const ticketRows = p.tables.resources.filter((row) => row.subtype === 'ticket' || row.label === 'r-ticket-copy');
    expect(new Set(ticketRows.map((row) => row.stored_path)).size).toBe(1);
    expect(p.files.every((file) => /^media\/new-\d+\.(pdf|jpg)$/.test(file.storedPath))).toBe(true);
  });

  it('makes new profiles by default, and links one only when chosen — never by name', async () => {
    const p = await plan(new Map([['ev', { kind: 'existing', id: 'here-evelina' }]]));
    expect(p.tables.travellers.map((row) => row.name).sort()).toEqual(['Misho', 'Mitko']);
    expect(p.tables.tripTravellers.map((row) => row.traveller_id)).toContain('here-evelina');
    expect(p.tables.listItemRecipients.map((row) => row.traveller_id)).toContain('here-evelina');
  });

  it('two archive travellers linked to one profile become one member, one recipient', async () => {
    const p = await plan(
      new Map([
        ['ev', { kind: 'existing', id: 'here' }],
        ['mi', { kind: 'existing', id: 'here' }],
      ]),
    );
    expect(p.tables.tripTravellers.filter((row) => row.traveller_id === 'here')).toHaveLength(1);
    expect(p.tables.listItemRecipients.filter((row) => row.traveller_id === 'here')).toHaveLength(1);
  });

  it('never merges two people’s shares of one cost into one profile (3D-2)', async () => {
    // Evelina and Mitko both have a share of the safari; Misho covers Mitko's.
    const both = (a: string, b: string) =>
      new Map([
        [a, { kind: 'existing' as const, id: 'here' }],
        [b, { kind: 'existing' as const, id: 'here' }],
      ]);
    await expect(plan(both('ev', 'kid'))).rejects.toThrow(/a split names both/);
    await expect(plan(both('kid', 'mi'))).rejects.toThrow(/a split names both/);
  });

  it('remaps splits and covers through the same choices, with new ids', async () => {
    const p = await plan(new Map([['ev', { kind: 'existing', id: 'here-evelina' }]]));
    expect(p.tables.costShares).toHaveLength(3);
    expect(p.tables.costShares.every((row) => row.trip_id === p.tripId && !row.id.startsWith('cs'))).toBe(true);
    expect(p.tables.costShares.map((row) => row.traveller_id)).toContain('here-evelina');
    expect(p.tables.tripCover).toEqual([
      { trip_id: p.tripId, child_id: expect.stringMatching(/^new-/), adult_id: 'here-evelina', sort_order: 0 },
    ]);
  });

  it('remaps settlements through the same choices, with new ids (3E)', async () => {
    const p = await plan(new Map([['ev', { kind: 'existing', id: 'here-evelina' }]]));
    expect(p.tables.settlements).toEqual([
      expect.objectContaining({ trip_id: p.tripId, from_id: expect.stringMatching(/^new-/), to_id: 'here-evelina', amount: 500 }),
    ]);
    expect(p.tables.settlements[0].id).not.toBe('st1');
  });

  it('never turns a settlement into one from someone to themselves (3E)', async () => {
    const both = new Map([
      ['ev', { kind: 'existing' as const, id: 'here' }],
      ['kid', { kind: 'existing' as const, id: 'here' }],
    ]);
    // Without the splits, so the settlement is what refuses.
    const archive = await opened(zipOf(build()));
    archive.tables.costShares = [];
    expect(() => planTripImport(archive, { newId, now, tripName: 'Lapland (2)', choices: both })).toThrow(
      /a settlement names both/,
    );
  });

  it('clears what names the other phone: the legacy list column and a list’s source; keeps template provenance', async () => {
    const p = await plan();
    expect(p.tables.listItems.every((row) => row.traveller_id === null)).toBe(true);
    expect(p.tables.lists.every((row) => row.source_list_id === null)).toBe(true);
    expect(p.tables.templateUses).toEqual([{ trip_id: p.tripId, template_id: 'tpl', applied_at: now }]);
  });

  it('keeps the rows of documents whose file did not come, and says which and why', async () => {
    const p = await plan(new Map(), zipOf(build(false)));
    expect(p.files).toEqual([]);
    expect(p.tables.resources.filter((row) => row.kind === 'file')).toHaveLength(3);
    expect(p.unavailable.map((entry) => [entry.label, entry.reason]).sort()).toEqual([
      ['r-receipt', 'excluded'],
      ['r-ticket', 'excluded'],
      ['r-ticket-copy', 'excluded'],
    ]);
  });
});

describe('names, matches and provenance', () => {
  it('suffixes a name already in use', () => {
    expect(uniqueTripName('Lapland', ['Rome'])).toBe('Lapland');
    expect(uniqueTripName('Lapland', ['lapland', 'Lapland (2)'])).toBe('Lapland (3)');
  });

  it('offers profiles of the same name, ignoring case — as suggestions only', () => {
    const here = [{ id: 'a', name: 'Evelina' }, { id: 'b', name: 'evelina ' }, { id: 'c', name: 'Eva' }];
    expect(possibleMatches('EVELINA', here).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('recognises the same export, another export of the same trip, and the original — not names', () => {
    const history = parseImportHistory(
      withImport([], { exportId: 'x1', sourceTripId: 'lap', tripId: 'copy1', importedAt: now }),
    );
    expect(earlierImport({ exportId: 'x1', sourceTripId: 'lap' }, history, ['copy1'])).toEqual({
      kind: 'sameFile', tripId: 'copy1', importedAt: now,
    });
    expect(earlierImport({ exportId: 'x2', sourceTripId: 'lap' }, history, ['copy1'])).toMatchObject({
      kind: 'sameTrip',
    });
    expect(earlierImport({ exportId: 'x3', sourceTripId: 'orig' }, history, ['orig'])).toEqual({
      kind: 'original', tripId: 'orig',
    });
    // An earlier copy since deleted no longer counts.
    expect(earlierImport({ exportId: 'x1', sourceTripId: 'lap' }, history, [])).toBeNull();
  });

  it('reads a damaged history as empty rather than failing', () => {
    expect(parseImportHistory('{broken')).toEqual([]);
    expect(parseImportHistory(null)).toEqual([]);
  });

  it('accepts only plain names under files/', () => {
    expect(isArchiveFileName('files/001.pdf')).toBe(true);
    expect(isArchiveFileName('files/..pdf')).toBe(false);
    expect(isArchiveFileName('files/a/b.pdf')).toBe(false);
  });
});
