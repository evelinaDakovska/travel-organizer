import { strToU8, zipSync } from 'fflate';

import {
  importChangesNothing,
  packBackup,
  readInChunks,
  summariseExport,
  summariseImportPlan,
  unpackBackup,
} from './archive';
import { buildExportDocument, emptyExportTables, planImport, type ExportTables } from './export';

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
  ...emptyExportTables(),
  trips: [trip('milan'), trip('lapland')],
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
    expect(summariseExport(document, 2)).toBe(
      'Archive created with 2 trips and 2 saved files. It is only a backup once it is saved ' +
        'somewhere off this phone — Drive, or email it to yourself.',
    );
  });

  it('never claims the data is backed up: the share sheet may have been dismissed (A4)', () => {
    expect(summariseExport(document, 2)).not.toMatch(/backed up/i);
  });

  it('warns about files that were already missing on the phone', () => {
    expect(summariseExport(document, 1)).toContain(
      'Archive created with 2 trips and 1 saved file. 1 file was already missing on this phone.',
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

  it('names expenses when the backup has some, receipts counted as saved files', () => {
    const expense = (id: string, tripId: string) => ({
      id,
      trip_id: tripId,
      category: 'food',
      label: null,
      amount: 1250,
      currency: 'EUR',
      spent_on: '2026-09-20',
      notes: null,
      paid_by: null,
      split: null,
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
    });
    const withExpenses = buildExportDocument(
      {
        ...tables,
        expenses: [expense('e1', 'milan'), expense('e2', 'milan'), expense('e3', 'lapland')],
        resources: [...tables.resources, { ...fileResource('receipt', 'milan'), expense_id: 'e1' }],
      },
      { exportedAt: '2026-09-15T10:00:00.000Z' },
    );
    expect(
      summariseImportPlan(
        planImport(withExpenses, [], 'merge', [...available, 'media/receipt.pdf']),
      ),
    ).toBe('Adds 2 trips, 0 items, 0 notes, 3 expenses and 3 saved files.');
    expect(
      summariseImportPlan(
        planImport(withExpenses, ['lapland'], 'merge', [...available, 'media/receipt.pdf']),
      ),
    ).toBe(
      'Adds 1 trip, 0 items, 0 notes, 2 expenses and 2 saved files. 1 trip already here is left as it is.',
    );
  });

  it('warns about files the archive does not contain', () => {
    expect(summariseImportPlan(planImport(document, [], 'merge', ['media/hotel.pdf']))).toBe(
      'Adds 2 trips, 0 items, 0 notes and 1 saved file. 1 file is missing from the backup and will show as missing.',
    );
  });
});

describe('importChangesNothing and the shared rows (format 3)', () => {
  const at = '2026-10-13T00:00:00.000Z';
  const withTemplate = buildExportDocument(
    {
      ...tables,
      templates: [{ id: 'tpl', name: 'City break', content: '{}', created_at: at, updated_at: at }],
    },
    { exportedAt: at },
  );

  it('is not nothing when the trips are here but a template is missing', () => {
    const plan = planImport(withTemplate, ['milan', 'lapland'], 'merge', [], {
      travellers: [],
      lists: [],
      templates: [],
    });
    expect(importChangesNothing(plan)).toBe(false);
    expect(summariseImportPlan(plan)).toBe(
      'Adds 1 template. The trips in it are already here and are left as they are.',
    );
  });

  it('is nothing once the template is here too', () => {
    const plan = planImport(withTemplate, ['milan', 'lapland'], 'merge', [], {
      travellers: [],
      lists: [],
      templates: ['tpl'],
    });
    expect(importChangesNothing(plan)).toBe(true);
  });

  it('mentions shared rows after the trips', () => {
    const plan = planImport(withTemplate, [], 'merge', ['media/hotel.pdf', 'media/train.pdf']);
    expect(summariseImportPlan(plan)).toBe(
      'Adds 2 trips, 0 items, 0 notes and 2 saved files. Also adds 1 template.',
    );
  });
});

describe('readInChunks', () => {
  /** A file of `size` bytes whose reader records how much each call asked for. */
  const source = (size: number) => {
    const data = Uint8Array.from({ length: size }, (_, i) => i % 251);
    const asked: number[] = [];
    let offset = 0;
    const read = (length: number) => {
      asked.push(length);
      const part = data.slice(offset, offset + length);
      offset += part.length;
      return part;
    };
    return { data, asked, read };
  };

  it('reads the whole file in bounded pieces, in order', () => {
    const file = source(10);
    expect(readInChunks(10, file.read, 4)).toEqual(file.data);
    expect(file.asked).toEqual([4, 4, 2]);
  });

  it('never asks for more than one chunk, however large the file', () => {
    const file = source(1000);
    readInChunks(1000, file.read, 64);
    expect(Math.max(...file.asked)).toBe(64);
  });

  it('returns what there was when the file ends early, and nothing for an empty one', () => {
    const file = source(6);
    expect(readInChunks(10, file.read, 4)).toEqual(file.data);
    expect(readInChunks(0, source(0).read)).toEqual(new Uint8Array(0));
  });
});
