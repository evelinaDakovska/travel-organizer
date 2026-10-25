import {
  availabilityLabel,
  availabilityOf,
  defaultFileLabel,
  defaultLinkLabel,
  extensionFor,
  guessLinkSubtype,
  isSafeExternalUrl,
  isStaleExport,
  isStoredPath,
  linkFormSchema,
  linkResourceInput,
  missingFiles,
  normaliseUrl,
  openGroups,
  openLabel,
  orphanedStoredPaths,
  parseOwnerParams,
  parseResourceRow,
  resourceBadge,
  resourceInputSchema,
  resourceMeta,
  storedPathFor,
  subtypesFor,
  toAbsoluteUri,
  toStoredPath,
  tripDocuments,
  viewerFileName,
  type FileResource,
  type LinkResource,
  type ResourceOwner,
  type ResourceRow,
} from './resource';

const DOCUMENTS = 'file:///data/user/0/com.evelinadakovska.travelorganizer/files';

const file = (over: Partial<FileResource> = {}): FileResource => ({
  id: 'r1',
  owner: { scope: 'item', id: 'i1' },
  subtype: 'generic',
  label: 'Boarding pass',
  sortOrder: 0,
  createdAt: '2026-09-13T00:00:00.000Z',
  kind: 'file',
  storedPath: 'media/r1.pdf',
  fileName: 'boarding.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 664,
  ...over,
});

const link = (url: string, over: Partial<LinkResource> = {}): LinkResource => ({
  id: 'r2',
  owner: { scope: 'trip', id: 't1' },
  subtype: 'website',
  label: 'Booking',
  sortOrder: 1,
  createdAt: '2026-09-13T00:00:00.000Z',
  kind: 'link',
  url,
  ...over,
});

describe('stored paths', () => {
  it('accepts a media path and rejects anything that escapes it', () => {
    expect(isStoredPath('media/abc-123.pdf')).toBe(true);
    expect(isStoredPath('media/../../etc/passwd')).toBe(false);
    expect(isStoredPath('/data/user/0/files/media/a.pdf')).toBe(false);
    expect(isStoredPath('file:///media/a.pdf')).toBe(false);
    expect(isStoredPath('other/a.pdf')).toBe(false);
    expect(isStoredPath('media/')).toBe(false);
  });

  it('accepts a dot inside a filename, which is not traversal', () => {
    expect(isStoredPath('media/a..b.pdf')).toBe(true);
    expect(isStoredPath('media/a.b.pdf')).toBe(true);
  });

  it('refuses to build a path from an id that would escape the directory', () => {
    // importFile writes before any schema sees the path, so this has to throw here.
    expect(() => storedPathFor('../../databases/travel-organizer')).toThrow(/Unsafe resource id/);
    expect(() => storedPathFor('')).toThrow(/Unsafe resource id/);
  });

  it('names a file by id so two tickets called the same thing cannot collide', () => {
    expect(storedPathFor('abc', { fileName: 'ticket.pdf' })).toBe('media/abc.pdf');
    expect(storedPathFor('def', { fileName: 'ticket.pdf' })).toBe('media/def.pdf');
  });

  it('prefers the reported mime type over the extension the name claims', () => {
    expect(extensionFor('boarding-pass.txt', 'application/pdf')).toBe('pdf');
    expect(extensionFor('scan', 'image/jpeg')).toBe('jpg');
    expect(extensionFor(null, 'application/pdf; charset=binary')).toBe('pdf');
  });

  it('falls back to the name, then to bin, when the mime type says nothing useful', () => {
    expect(extensionFor('ticket.PDF', 'application/octet-stream')).toBe('pdf');
    expect(extensionFor(null, null)).toBe('bin');
    expect(extensionFor('no-extension', null)).toBe('bin');
  });
});

describe('relative and absolute', () => {
  it('joins onto the documents directory, with or without a trailing slash', () => {
    expect(toAbsoluteUri(DOCUMENTS, 'media/a.pdf')).toBe(`${DOCUMENTS}/media/a.pdf`);
    expect(toAbsoluteUri(`${DOCUMENTS}/`, 'media/a.pdf')).toBe(`${DOCUMENTS}/media/a.pdf`);
  });

  it('round-trips back to the relative path the database stores', () => {
    expect(toStoredPath(DOCUMENTS, `${DOCUMENTS}/media/a.pdf`)).toBe('media/a.pdf');
    expect(toStoredPath(`${DOCUMENTS}/`, `${DOCUMENTS}/media/a.pdf`)).toBe('media/a.pdf');
  });

  it('refuses a path outside the documents directory, which is not ours to touch', () => {
    expect(toStoredPath(DOCUMENTS, 'file:///sdcard/Download/a.pdf')).toBeNull();
    expect(toStoredPath(DOCUMENTS, `${DOCUMENTS}-other/media/a.pdf`)).toBeNull();
  });

  it('refuses anything inside the directory that is not media', () => {
    expect(toStoredPath(DOCUMENTS, `${DOCUMENTS}/SQLite/travel-organizer.db`)).toBeNull();
    expect(toStoredPath(DOCUMENTS, `${DOCUMENTS}/media/sub/a.pdf`)).toBeNull();
  });

  it('survives a reinstall, which is the whole reason paths are relative', () => {
    const reinstalled = 'file:///data/user/0/com.evelinadakovska.travelorganizer/files2';
    const stored = toStoredPath(DOCUMENTS, `${DOCUMENTS}/media/a.pdf`)!;

    expect(toAbsoluteUri(reinstalled, stored)).toBe(`${reinstalled}/media/a.pdf`);
  });
});

describe('the sweep decision', () => {
  it('deletes only what no row points at', () => {
    const onDisk = ['media/a.pdf', 'media/b.pdf', 'media/orphan.pdf'];

    expect(orphanedStoredPaths(onDisk, ['media/a.pdf', 'media/b.pdf'])).toEqual([
      'media/orphan.pdf',
    ]);
  });

  it('deletes nothing when every file is referenced', () => {
    expect(orphanedStoredPaths(['media/a.pdf'], ['media/a.pdf'])).toEqual([]);
  });

  it('deletes everything when nothing is referenced, so the caller must not pass a failed read', () => {
    expect(orphanedStoredPaths(['media/a.pdf'], [])).toEqual(['media/a.pdf']);
  });

  it('never invents a deletion from a reference with no file', () => {
    expect(orphanedStoredPaths([], ['media/gone.pdf'])).toEqual([]);
    expect(missingFiles([], ['media/gone.pdf'])).toEqual(['media/gone.pdf']);
  });

  it('reports a missing file once even when several rows point at it', () => {
    expect(missingFiles(['media/a.pdf'], ['media/a.pdf', 'media/gone.pdf', 'media/gone.pdf']))
      .toEqual(['media/gone.pdf']);
  });

  it('sorts what is missing, so two runs report it the same way', () => {
    expect(missingFiles([], ['media/c.pdf', 'media/a.pdf', 'media/b.pdf'])).toEqual([
      'media/a.pdf',
      'media/b.pdf',
      'media/c.pdf',
    ]);
  });
});

describe('link safety', () => {
  it('allows the schemes Android should open', () => {
    for (const url of [
      'https://maps.app.goo.gl/x',
      'http://example.com',
      'geo:45.4642,9.1900',
      'mailto:hotel@example.com',
      'tel:+3902123456',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(true);
    }
  });

  it('refuses schemes that could reach inside the device', () => {
    for (const url of [
      'file:///data/user/0/com.app/files/media/a.pdf',
      'javascript:alert(1)',
      'intent://scan/#Intent;scheme=zxing;end',
      'content://media/external/file/1',
      'not a url',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});

describe('resourceInputSchema', () => {
  const parse = (input: unknown) => resourceInputSchema.safeParse(input);

  it('accepts a link and defaults its subtype', () => {
    const result = parse({ kind: 'link', label: 'Booking', url: 'https://example.com' });
    expect(result.success && result.data.subtype).toBe('website');
  });

  it('accepts a file and defaults its subtype', () => {
    const result = parse({ kind: 'file', label: 'Ticket', storedPath: 'media/a.pdf' });
    expect(result.success && result.data.subtype).toBe('generic');
  });

  it('refuses a file path that is not under media', () => {
    const result = parse({ kind: 'file', label: 'Ticket', storedPath: '/sdcard/a.pdf' });
    expect(result.success).toBe(false);
  });

  it('refuses a link we would not open', () => {
    expect(parse({ kind: 'link', label: 'x', url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('requires a label, since the list has nothing else to show', () => {
    expect(parse({ kind: 'file', label: '  ', storedPath: 'media/a.pdf' }).success).toBe(false);
  });
});

describe('parseResourceRow', () => {
  const row: ResourceRow = {
    id: 'r1',
    trip_id: null,
    trip_item_id: 'i1',
    kind: 'file',
    subtype: 'ticket',
    label: 'Boarding pass',
    url: null,
    stored_path: 'media/r1.pdf',
    file_name: 'boarding.pdf',
    mime_type: 'application/pdf',
    size_bytes: 12345,
    sort_order: 0,
    created_at: '2026-09-11T00:00:00.000Z',
    expense_id: null,
  };

  it('reads the owner off whichever id is set', () => {
    expect(parseResourceRow(row).owner).toEqual({ scope: 'item', id: 'i1' });
    expect(parseResourceRow({ ...row, trip_id: 't1', trip_item_id: null }).owner).toEqual({
      scope: 'trip',
      id: 't1',
    });
  });

  it('reads a receipt as belonging to its expense, not to the trip it is also filed under', () => {
    expect(
      parseResourceRow({ ...row, trip_id: 't1', trip_item_id: null, expense_id: 'e1' }).owner,
    ).toEqual({ scope: 'expense', id: 'e1' });
  });

  it('narrows a file row to its file fields', () => {
    const resource = parseResourceRow(row);
    expect(resource.kind === 'file' && resource.storedPath).toBe('media/r1.pdf');
    expect(resource.kind === 'file' && resource.sizeBytes).toBe(12345);
  });

  it('narrows a link row to its url', () => {
    const parsed = parseResourceRow({
      ...row,
      kind: 'link',
      stored_path: null,
      url: 'https://example.com',
    });
    expect(parsed.kind === 'link' && parsed.url).toBe('https://example.com');
  });
});

describe('owner route params', () => {
  it('rebuilds an owner from params it can trust', () => {
    expect(parseOwnerParams('item', 'i1')).toEqual({ scope: 'item', id: 'i1' });
    expect(parseOwnerParams('trip', 't1')).toEqual({ scope: 'trip', id: 't1' });
    expect(parseOwnerParams('expense', 'e1')).toEqual({ scope: 'expense', id: 'e1' });
  });

  it('refuses anything else, since a route param can come from any link', () => {
    expect(parseOwnerParams('place', 'x')).toBeNull();
    expect(parseOwnerParams('item', '')).toBeNull();
    expect(parseOwnerParams(undefined, 'i1')).toBeNull();
    expect(parseOwnerParams('item', ['a', 'b'])).toBeNull();
  });
});

describe('labels for a new attachment', () => {
  it('names a picked file after itself, without the extension', () => {
    expect(defaultFileLabel('boarding-pass-SOF-BGY.pdf', 'Document')).toBe('boarding-pass-SOF-BGY');
    expect(defaultFileLabel('Screenshot_20260913_boarding.png', 'Photo')).toBe(
      'Screenshot 20260913 boarding',
    );
  });

  it('falls back when Android reports no useful name', () => {
    expect(defaultFileLabel(null, 'Photo')).toBe('Photo');
    expect(defaultFileLabel('  .pdf', 'Document')).toBe('Document');
    expect(defaultFileLabel('37.png', 'Photo')).toBe('Photo');
    // The camera's capture, as seen on the emulator.
    expect(defaultFileLabel('30450f8b-0772-4a29-be64-1602357dcbb0.jpg', 'Photo')).toBe('Photo');
  });

  it('keeps a real name that merely contains an id', () => {
    expect(defaultFileLabel('ticket-30450f8b-0772-4a29-be64-1602357dcbb0.pdf', 'Document')).toBe(
      'ticket-30450f8b-0772-4a29-be64-1602357dcbb0',
    );
  });

  it('stays within what the schema accepts', () => {
    expect(defaultFileLabel(`${'a'.repeat(200)}.pdf`, 'Document')).toHaveLength(120);
  });
});

describe('pasted links', () => {
  it('adds https to a bare address, which is how people paste them', () => {
    expect(normaliseUrl('booking.com/mybooking?id=1')).toBe('https://booking.com/mybooking?id=1');
    expect(normaliseUrl('  www.hotelbrera.it ')).toBe('https://www.hotelbrera.it');
  });

  it('leaves anything with a scheme for the safety check to judge', () => {
    expect(normaliseUrl('https://example.com')).toBe('https://example.com');
    expect(normaliseUrl('geo:45.46,9.19')).toBe('geo:45.46,9.19');
    expect(normaliseUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('does not turn a sentence into a link', () => {
    expect(normaliseUrl('not a url')).toBe('not a url');
    expect(normaliseUrl('e.g. the hotel')).toBe('e.g. the hotel');
  });

  it('normalises in the form schema, then refuses what still cannot be opened', () => {
    const ok = linkFormSchema.safeParse({ url: 'booking.com/x', label: '' });
    expect(ok.success && ok.data.url).toBe('https://booking.com/x');

    expect(linkFormSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(linkFormSchema.safeParse({ url: 'not a url' }).success).toBe(false);
    expect(linkFormSchema.safeParse({ url: '   ' }).success).toBe(false);
  });

  it('names a link after its site unless told otherwise', () => {
    expect(defaultLinkLabel('https://www.booking.com/manage')).toBe('booking.com');
    expect(defaultLinkLabel('geo:45.46,9.19')).toBe('Location');
    expect(defaultLinkLabel('mailto:reception@hotelbrera.it')).toBe('reception@hotelbrera.it');

    expect(linkResourceInput({ url: 'https://ryanair.com/x', label: '' }).label).toBe('ryanair.com');
    expect(linkResourceInput({ url: 'https://ryanair.com/x', label: 'Manage booking' }).label).toBe(
      'Manage booking',
    );
  });

  it('recognises Maps and Wallet links so they get the right badge', () => {
    expect(guessLinkSubtype('https://maps.app.goo.gl/abc')).toBe('maps');
    expect(guessLinkSubtype('https://www.google.com/maps/place/Duomo')).toBe('maps');
    expect(guessLinkSubtype('https://maps.google.it/?q=Brera')).toBe('maps');
    expect(guessLinkSubtype('geo:45.46,9.19')).toBe('maps');
    expect(guessLinkSubtype('https://pay.google.com/gp/v/save/abc')).toBe('wallet');
    expect(guessLinkSubtype('https://www.google.com/search?q=maps')).toBe('website');
    expect(guessLinkSubtype('https://booking.com')).toBe('website');
  });

  it('builds an input the resource schema accepts', () => {
    const input = linkResourceInput({ url: 'https://maps.app.goo.gl/abc', label: undefined });
    expect(resourceInputSchema.safeParse(input).success).toBe(true);
    expect(input.subtype).toBe('maps');
  });
});

describe('showing an attachment', () => {
  it('badges a file by what it is, not by the name it came with', () => {
    expect(resourceBadge(file())).toBe('PDF');
    expect(resourceBadge(file({ mimeType: 'image/png', storedPath: 'media/r1.png' }))).toBe('IMG');
    expect(resourceBadge(file({ mimeType: null, storedPath: 'media/r1.jpg' }))).toBe('IMG');
    expect(
      resourceBadge(file({ mimeType: 'application/vnd.apple.pkpass', storedPath: 'media/r1.pkpass' })),
    ).toBe('FILE');
  });

  it('badges a link by its subtype', () => {
    expect(resourceBadge(link('https://booking.com'))).toBe('LINK');
    expect(resourceBadge(link('geo:1,2', { subtype: 'maps' }))).toBe('MAP');
    expect(resourceBadge(link('https://pay.google.com/x', { subtype: 'wallet' }))).toBe('PASS');
  });

  it('describes a file by kind and size, and a link by where it goes', () => {
    expect(resourceMeta(file())).toBe('PDF · 664 B');
    expect(resourceMeta(file({ subtype: 'ticket', sizeBytes: 2_500_000 }))).toBe('Ticket · 2.4 MB');
    expect(
      resourceMeta(file({ mimeType: 'image/png', storedPath: 'media/r1.png', sizeBytes: null })),
    ).toBe('Image');
    expect(resourceMeta(link('https://www.booking.com/x'))).toBe('Website · booking.com');
    expect(resourceMeta(link('geo:1,2', { subtype: 'maps' }))).toBe('Map');
  });

  it('labels the open button for one attachment or several', () => {
    expect(openLabel([file()])).toBe('Open Boarding pass');
    expect(
      openLabel([file({ label: 'Confirmation for the Hotel Brera, Milan, three nights' })]),
    ).toBe('Open Confirmation for the Hotel…');
    expect(openLabel([file(), link('https://booking.com')])).toBe('Open attachments (2)');
  });

  it('offers only subtypes that make sense for the kind', () => {
    expect(subtypesFor('file')).not.toContain('maps');
    expect(subtypesFor('file')).not.toContain('website');
    expect(subtypesFor('link')).toContain('wallet');
  });
});

describe('viewerFileName', () => {
  it('names the copy after the label, keeping the stored extension', () => {
    expect(viewerFileName('Boarding pass SOF-BGY', 'media/1b2c.pdf')).toBe('Boarding pass SOF-BGY.pdf');
  });

  it('drops characters a file name cannot hold', () => {
    expect(viewerFileName('Hotel: Brera / 2 nights?', 'media/a.pdf')).toBe('Hotel Brera 2 nights.pdf');
    expect(viewerFileName('a\\b"c', 'media/a.jpg')).toBe('a b c.jpg');
  });

  it('never makes a hidden or empty name', () => {
    expect(viewerFileName('...env', 'media/a.pdf')).toBe('env.pdf');
    expect(viewerFileName('  //  ', 'media/a.pdf')).toBe('Document.pdf');
  });

  it('keeps long labels to a sensible length', () => {
    expect(viewerFileName('x'.repeat(200), 'media/a.pdf')).toBe(`${'x'.repeat(80)}.pdf`);
  });
});

describe('openGroups', () => {
  const ticket = (id: string, label: string) => file({ id, label, subtype: 'ticket' });
  const shape = (resources: Parameters<typeof openGroups>[0]) =>
    openGroups(resources).map((group) => [group.label, group.resources.map((r) => r.id)]);

  it('has nothing to open with no attachments', () => {
    expect(openGroups([])).toEqual([]);
  });

  it('keeps one button for everything when nothing is marked ticket', () => {
    expect(shape([file({ id: 'a' }), link('https://booking.com', { id: 'b' })])).toEqual([
      ['Open attachments (2)', ['a', 'b']],
    ]);
  });

  it('opens the one ticket directly, the rest behind a second button', () => {
    const groups = openGroups([
      file({ id: 'conf', label: 'Booking confirmation' }),
      ticket('bp', 'Boarding pass SOF-HEL'),
      link('https://www.finnair.com', { id: 'web' }),
      link('https://maps.app.goo.gl/x', { id: 'map', subtype: 'maps' }),
    ]);
    expect(groups.map((g) => [g.label, g.sheetTitle, g.resources.map((r) => r.id)])).toEqual([
      ['Open Boarding pass SOF-HEL', 'Tickets', ['bp']],
      ['Other documents (3)', 'Other documents', ['conf', 'web', 'map']],
    ]);
  });

  it('offers a sheet of only the tickets when there are several — a boarding pass each', () => {
    expect(
      shape([ticket('a', 'Pass 1'), ticket('b', 'Pass 2'), ticket('c', 'Pass 3')]),
    ).toEqual([['Open tickets (3)', ['a', 'b', 'c']]]);
  });

  it('names a single other attachment rather than counting it', () => {
    expect(shape([ticket('t', 'Sleeper tickets'), file({ id: 'c', label: 'Cabin details' })])).toEqual(
      [
        ['Open Sleeper tickets', ['t']],
        ['Open Cabin details', ['c']],
      ],
    );
  });
});

describe('availabilityOf (B11)', () => {
  it('calls a file on the phone only when its bytes are there', () => {
    expect(availabilityOf(file(), true)).toBe('onPhone');
    expect(availabilityOf(file(), false)).toBe('missing');
  });

  it('says a link needs the internet, and a map link opens the maps app', () => {
    expect(availabilityOf(link('https://booking.com'), true)).toBe('link');
    expect(availabilityOf(link('geo:1,2', { subtype: 'maps' }), true)).toBe('mapLink');
    expect(availabilityLabel('missing')).toMatch(/attach it again/);
  });
});

describe('tripDocuments (B11)', () => {
  const items = [{ id: 'flight' }, { id: 'hotel' }];
  const at = (id: string, owner: ResourceOwner, over: Partial<FileResource> = {}) =>
    file({ id, owner, ...over });

  it('puts tickets first, the trip’s own before the items’', () => {
    const trip = { scope: 'trip', id: 't' } as const;
    const { tickets } = tripDocuments(
      [at('insurance', trip), at('rail', trip, { subtype: 'ticket' })],
      [at('pass', { scope: 'item', id: 'flight' }, { subtype: 'ticket' })],
      items,
    );
    expect(tickets.map(({ resource, item }) => [resource.id, item?.id ?? null])).toEqual([
      ['rail', null],
      ['pass', 'flight'],
    ]);
  });

  it('groups the rest by item, in the order the items come, and keeps the trip’s own apart', () => {
    const documents = tripDocuments(
      [at('insurance', { scope: 'trip', id: 't' })],
      [
        at('voucher', { scope: 'item', id: 'hotel' }),
        at('booking', { scope: 'item', id: 'flight' }, { subtype: 'confirmation' }),
      ],
      items,
    );
    expect(documents.forTrip.map((resource) => resource.id)).toEqual(['insurance']);
    const grouped = documents.byItem.map(({ item, resources }) => [
      item.id,
      resources.map((resource) => resource.id),
    ]);
    expect(grouped).toEqual([
      ['flight', ['booking']],
      ['hotel', ['voucher']],
    ]);
  });

  it('never loses a document whose item is not in the list', () => {
    const documents = tripDocuments([], [at('lost', { scope: 'item', id: 'gone' })], items);
    expect(documents.forTrip.map((resource) => resource.id)).toEqual(['lost']);
  });
});

describe('isStaleExport', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const hours = (h: number) => now - h * 60 * 60 * 1000;

  it('is an export older than a day', () => {
    expect(isStaleExport('travel-organizer-backup-2026-10-24-0900.zip', hours(25), now)).toBe(true);
    expect(isStaleExport('Lapland-itinerary.PDF', hours(48), now)).toBe(true);
    expect(isStaleExport('trip.ics', hours(30), now)).toBe(true);
    expect(isStaleExport('activities.json', hours(30), now)).toBe(true);
  });

  it('keeps a recent export, whatever it is', () => {
    expect(isStaleExport('backup.zip', hours(23), now)).toBe(false);
  });

  it('leaves files that are not exports, or of unknown age', () => {
    expect(isStaleExport('photo.jpg', hours(100), now)).toBe(false);
    expect(isStaleExport('backup.zip', undefined, now)).toBe(false);
  });
});
