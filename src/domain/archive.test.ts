import { strToU8, zipSync } from 'fflate';

import { packBackup, summariseExport, summariseImportPlan, unpackBackup } from './archive';
import { buildExportDocument, planImport, type ExportTables } from './export';

const trip = (id: string) => ({
  id,
  name: id,
  destination: null,
  start_date: '2026-09-19',
  end_date: '2026-09-22',
  default_tz: 'Europe/Rome',
  cover_path: null,
  notes: null,
  traveller_count: null,
  travellers: null,
  created_at: '2026-09-15T00:00:00.000Z',
  updated_at: '2026-09-15T00:00:00.000Z',
});

const fileResource = (id: string, tripId: string) => ({
  id,
  trip_id: tripId,
  trip_item_id: null,
  kind: 'file',
  subtype: 'confirmation',
  label: id,
  url: null,
  stored_path: `media/${id}.pdf`,
  file_name: `${id}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 4,
  sort_order: 0,
  created_at: '2026-09-15T00:00:00.000Z',
  expense_id: null,
});

const tables: ExportTables = {
  trips: [trip('milan'), trip('lapland')],
  tripItems: [],
  tripNotes: [],
  expenses: [],
  payments: [],
  resources: [fileResource('hotel', 'milan'), fileResource('train', 'lapland')],
  settings: [{ key: 'default_currency', value: 'EUR' }],
};

const document = buildExportDocument(tables, { exportedAt: '2026-09-15T10:00:00.000Z' });
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);

describe('packBackup and unpackBackup', () => {
  it('round-trips the document and every file, byte for byte', () => {
    const files = new Map([
      ['media/hotel.pdf', pdf],
      ['media/train.pdf', pdf.slice().reverse()],
    ]);
    const result = unpackBackup(packBackup(document, files));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.document).toEqual(document);
    expect([...result.backup.files.keys()].sort()).toEqual(['media/hotel.pdf', 'media/train.pdf']);
    expect(Array.from(result.backup.files.get('media/train.pdf') ?? [])).toEqual(
      Array.from(pdf.slice().reverse()),
    );
  });

  it('refuses to pack a path outside the media directory', () => {
    expect(() => packBackup(document, new Map([['../databases/app.db', pdf]]))).toThrow(
      /Refusing to pack/,
    );
  });

  it('explains a file that is not a zip', () => {
    expect(unpackBackup(strToU8('definitely not a zip'))).toEqual({
      ok: false,
      reason: expect.stringMatching(/not a zip/),
    });
  });

  it('explains a zip that is not one of our backups', () => {
    expect(unpackBackup(zipSync({ 'notes.txt': strToU8('hello') }))).toEqual({
      ok: false,
      reason: expect.stringMatching(/no backup\.json/),
    });
  });

  it('explains damaged JSON', () => {
    expect(unpackBackup(zipSync({ 'backup.json': strToU8('{ not json') }))).toEqual({
      ok: false,
      reason: expect.stringMatching(/damaged/),
    });
  });

  it('passes on why a backup from a newer version is refused', () => {
    const newer = zipSync({ 'backup.json': strToU8(JSON.stringify({ ...document, formatVersion: 99 })) });
    expect(unpackBackup(newer)).toEqual({ ok: false, reason: expect.stringMatching(/newer version/) });
  });

  it('keeps only media entries, so a crafted archive cannot write anywhere else', () => {
    const crafted = zipSync({
      'backup.json': strToU8(JSON.stringify(document)),
      'media/hotel.pdf': pdf,
      '../../evil.sh': strToU8('rm -rf'),
      'SQLite/travel-organizer.db': pdf,
      'media/nested/deeper.pdf': pdf,
    });
    const result = unpackBackup(crafted);
    expect(result.ok && [...result.backup.files.keys()]).toEqual(['media/hotel.pdf']);
  });
});

describe('summariseExport', () => {
  it('counts trips and the files that were packed', () => {
    expect(summariseExport(document, 2)).toBe('Backed up 2 trips and 2 saved files.');
  });

  it('warns about files that were already missing on the phone', () => {
    expect(summariseExport(document, 1)).toBe(
      'Backed up 2 trips and 1 saved file. 1 file was already missing on this phone.',
    );
  });
});

describe('summariseImportPlan', () => {
  const available = ['media/hotel.pdf', 'media/train.pdf'];

  it('describes everything a fresh phone gains', () => {
    expect(summariseImportPlan(planImport(document, [], 'merge', available))).toBe(
      'Adds 2 trips, 0 items, 0 notes and 2 saved files.',
    );
  });

  it('says which trips a merge leaves alone', () => {
    expect(summariseImportPlan(planImport(document, ['milan'], 'merge', available))).toBe(
      'Adds 1 trip, 0 items, 0 notes and 1 saved file. 1 trip already here is left as it is.',
    );
  });

  it('says that nothing changes when every trip is already here', () => {
    expect(summariseImportPlan(planImport(document, ['milan', 'lapland'], 'merge', available))).toBe(
      'Everything in this backup is already on this phone, so nothing will change.',
    );
  });

  it('warns that replace overwrites trips already on the phone', () => {
    expect(summariseImportPlan(planImport(document, ['milan'], 'replace', available))).toMatch(
      /replaced by the backup's copy/,
    );
  });

  it('warns about files the archive does not contain', () => {
    expect(summariseImportPlan(planImport(document, [], 'merge', ['media/hotel.pdf']))).toBe(
      'Adds 2 trips, 0 items, 0 notes and 1 saved file. 1 file is missing from the backup and will show as missing.',
    );
  });
});
