import {
  buildExportDocument,
  buildFileManifest,
  EXPORT_FORMAT_VERSION,
  exportFileName,
  filterTablesForTrip,
  parseExportDocument,
  planImport,
  type ExportTables,
  type ResourceExportRow,
} from './export';

const now = '2026-09-11T08:30:00.000Z';

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
  created_at: now,
  updated_at: now,
});

const item = (id: string, tripId: string) => ({
  id,
  trip_id: tripId,
  kind: 'activity',
  subkind: null,
  status: 'idea',
  priority: null,
  title: id,
  start_local: null,
  start_tz: null,
  start_precision: null,
  start_utc: null,
  end_local: null,
  end_tz: null,
  end_precision: null,
  end_utc: null,
  completed_at: null,
  location_name: null,
  address: null,
  latitude: null,
  longitude: null,
  confirmation_code: null,
  notes: null,
  details: null,
  price_amount: null,
  price_currency: null,
  is_paid: 0,
  created_at: now,
  updated_at: now,
});

const note = (id: string, tripId: string) => ({
  id,
  trip_id: tripId,
  title: id,
  body: '',
  pinned: 0,
  sort_order: 0,
  created_at: now,
  updated_at: now,
});

const resource = (
  id: string,
  owner: { trip_id?: string; trip_item_id?: string },
  extra: Partial<ResourceExportRow> = {},
): ResourceExportRow => ({
  id,
  trip_id: owner.trip_id ?? null,
  trip_item_id: owner.trip_item_id ?? null,
  kind: 'file',
  subtype: 'ticket',
  label: id,
  url: null,
  stored_path: `media/${id}.pdf`,
  file_name: null,
  mime_type: 'application/pdf',
  size_bytes: null,
  sort_order: 0,
  created_at: now,
  ...extra,
});

const tables = (): ExportTables => ({
  trips: [trip('t1'), trip('t2')],
  tripItems: [item('i1', 't1'), item('i2', 't2')],
  tripNotes: [note('n1', 't1')],
  resources: [
    resource('r1', { trip_item_id: 'i1' }),
    resource('r2', { trip_id: 't1' }),
    resource('r3', { trip_item_id: 'i2' }),
    resource('link', { trip_id: 't1' }, {
      kind: 'link',
      stored_path: null,
      url: 'https://example.com',
    }),
  ],
  settings: [{ key: 'defaultTravellers', value: '["Evelina"]' }],
});

describe('buildFileManifest', () => {
  it('lists each file once, naming every resource that points at it', () => {
    const shared = [
      resource('a', { trip_id: 't1' }, { stored_path: 'media/shared.pdf' }),
      resource('b', { trip_id: 't1' }, { stored_path: 'media/shared.pdf' }),
    ];

    expect(buildFileManifest(shared)).toEqual([
      { storedPath: 'media/shared.pdf', sizeBytes: null, resourceIds: ['a', 'b'] },
    ]);
  });

  it('leaves links out, since there is nothing to pack', () => {
    expect(buildFileManifest(tables().resources).map((f) => f.storedPath)).toEqual([
      'media/r1.pdf',
      'media/r2.pdf',
      'media/r3.pdf',
    ]);
  });

  it('records the size when the caller can measure it', () => {
    const manifest = buildFileManifest(tables().resources, () => 2048);
    expect(manifest.every((entry) => entry.sizeBytes === 2048)).toBe(true);
  });
});

describe('parseExportDocument', () => {
  const document = () => buildExportDocument(tables(), { exportedAt: now });

  it('accepts a document it just wrote, through JSON', () => {
    const result = parseExportDocument(JSON.parse(JSON.stringify(document())));
    expect(result.ok).toBe(true);
  });

  it('refuses a backup from a newer version rather than dropping what it cannot read', () => {
    const future = { ...document(), formatVersion: EXPORT_FORMAT_VERSION + 1 };
    const result = parseExportDocument(future);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/newer version/);
  });

  it('accepts an older format, which is what backwards compatibility means', () => {
    expect(parseExportDocument({ ...document(), formatVersion: 1 }).ok).toBe(true);
  });

  it('refuses something that is not one of our backups', () => {
    expect(parseExportDocument({ hello: 'world' }).ok).toBe(false);
    expect(parseExportDocument(null).ok).toBe(false);
    expect(parseExportDocument({ ...document(), app: 'something-else' }).ok).toBe(false);
  });

  it('refuses a manifest path that would escape the media directory', () => {
    const tampered = {
      ...document(),
      files: [{ storedPath: '../../etc/passwd', sizeBytes: null, resourceIds: [] }],
    };
    expect(parseExportDocument(tampered).ok).toBe(false);
  });
});

describe('filterTablesForTrip', () => {
  it('keeps one trip and everything hanging off it', () => {
    const scoped = filterTablesForTrip(tables(), 't1');

    expect(scoped.trips.map((t) => t.id)).toEqual(['t1']);
    expect(scoped.tripItems.map((i) => i.id)).toEqual(['i1']);
    expect(scoped.tripNotes.map((n) => n.id)).toEqual(['n1']);
    expect(scoped.resources.map((r) => r.id).sort()).toEqual(['link', 'r1', 'r2']);
  });

  it('leaves settings out, which belong to the app rather than a trip', () => {
    expect(filterTablesForTrip(tables(), 't1').settings).toEqual([]);
  });

  it('produces the same format, so one writer serves both exports', () => {
    const scoped = buildExportDocument(filterTablesForTrip(tables(), 't1'), { exportedAt: now });
    expect(parseExportDocument(scoped).ok).toBe(true);
  });
});

describe('planImport', () => {
  const document = () => buildExportDocument(tables(), { exportedAt: now });
  const allFiles = ['media/r1.pdf', 'media/r2.pdf', 'media/r3.pdf'];

  it('writes everything into an empty app', () => {
    const plan = planImport(document(), [], 'merge', allFiles);

    expect(plan.write.trips).toHaveLength(2);
    expect(plan.write.tripItems).toHaveLength(2);
    expect(plan.write.resources).toHaveLength(4);
    expect(plan.skippedTripIds).toEqual([]);
  });

  it('merge leaves a trip that is already here alone, so importing twice is harmless', () => {
    const plan = planImport(document(), ['t1'], 'merge', allFiles);

    expect(plan.skippedTripIds).toEqual(['t1']);
    expect(plan.write.trips.map((t) => t.id)).toEqual(['t2']);
  });

  it('merge drops the children of a skipped trip too, or they would orphan', () => {
    const plan = planImport(document(), ['t1'], 'merge', allFiles);

    expect(plan.write.tripItems.map((i) => i.id)).toEqual(['i2']);
    expect(plan.write.tripNotes).toEqual([]);
    expect(plan.write.resources.map((r) => r.id)).toEqual(['r3']);
  });

  it('replace overwrites what is here, which is what restoring means', () => {
    const plan = planImport(document(), ['t1', 't2'], 'replace', allFiles);

    expect(plan.skippedTripIds).toEqual([]);
    expect(plan.write.trips).toHaveLength(2);
  });

  it('reports files the archive is missing instead of writing a row that opens to nothing', () => {
    const plan = planImport(document(), [], 'merge', ['media/r1.pdf']);

    expect(plan.missingFiles).toEqual(['media/r2.pdf', 'media/r3.pdf']);
  });

  it('does not count a skipped trip files as missing', () => {
    const plan = planImport(document(), ['t1'], 'merge', ['media/r3.pdf']);

    expect(plan.missingFiles).toEqual([]);
  });

  it('always carries settings, which are not owned by any trip', () => {
    expect(planImport(document(), ['t1', 't2'], 'merge').write.settings).toHaveLength(1);
  });
});

describe('exportFileName', () => {
  it('names the archive by the day it was taken', () => {
    expect(exportFileName(now)).toBe('travel-organizer-backup-2026-09-11.zip');
  });
});
