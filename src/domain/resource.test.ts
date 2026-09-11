import {
  extensionFor,
  isSafeExternalUrl,
  isStoredPath,
  missingFiles,
  orphanedStoredPaths,
  parseResourceRow,
  resourceInputSchema,
  storedPathFor,
  toAbsoluteUri,
  toStoredPath,
  type ResourceRow,
} from './resource';

const DOCUMENTS = 'file:///data/user/0/com.evelinadakovska.travelorganizer/files';

describe('stored paths', () => {
  it('accepts a media path and rejects anything that escapes it', () => {
    expect(isStoredPath('media/abc-123.pdf')).toBe(true);
    expect(isStoredPath('media/../../etc/passwd')).toBe(false);
    expect(isStoredPath('/data/user/0/files/media/a.pdf')).toBe(false);
    expect(isStoredPath('file:///media/a.pdf')).toBe(false);
    expect(isStoredPath('other/a.pdf')).toBe(false);
    expect(isStoredPath('media/')).toBe(false);
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
  };

  it('reads the owner off whichever id is set', () => {
    expect(parseResourceRow(row).owner).toEqual({ scope: 'item', id: 'i1' });
    expect(parseResourceRow({ ...row, trip_id: 't1', trip_item_id: null }).owner).toEqual({
      scope: 'trip',
      id: 't1',
    });
  });

  it('narrows a file row to its file fields', () => {
    const resource = parseResourceRow(row);
    expect(resource.kind === 'file' && resource.storedPath).toBe('media/r1.pdf');
    expect(resource.kind === 'file' && resource.sizeBytes).toBe(12345);
  });

  it('narrows a link row to its url', () => {
    const link = parseResourceRow({
      ...row,
      kind: 'link',
      stored_path: null,
      url: 'https://example.com',
    });
    expect(link.kind === 'link' && link.url).toBe('https://example.com');
  });
});
