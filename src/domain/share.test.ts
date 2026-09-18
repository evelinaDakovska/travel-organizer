import {
  destinationLabel,
  destinationsFor,
  newItemFor,
  extractUrl,
  MAX_SHARED_FILES,
  noteTitleFor,
  parseSharedContent,
  suggestTrip,
  titleAround,
  type SharedContent,
} from './share';
import type { Trip } from './trip';

describe('parseSharedContent — files', () => {
  it('takes a shared PDF as a file, with what the sending app said about it', () => {
    expect(
      parseSharedContent({
        type: 'file',
        files: [
          {
            path: 'file:///data/user/0/app/cache/boarding-pass.pdf',
            fileName: 'boarding-pass.pdf',
            mimeType: 'application/pdf',
            size: 664,
            width: null,
          },
        ],
        text: null,
      }),
    ).toEqual({
      kind: 'files',
      files: [
        {
          uri: 'file:///data/user/0/app/cache/boarding-pass.pdf',
          fileName: 'boarding-pass.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 664,
        },
      ],
    });
  });

  it('prefers the files when an app sends a caption with them', () => {
    const content = parseSharedContent({
      files: [{ path: 'file:///a.jpg', mimeType: 'image/jpeg' }],
      text: 'Look https://example.com',
    });
    expect(content?.kind).toBe('files');
  });

  it(`takes at most ${MAX_SHARED_FILES} files`, () => {
    const files = Array.from({ length: MAX_SHARED_FILES + 3 }, (_, i) => ({
      path: `file:///${i}.jpg`,
    }));
    const content = parseSharedContent({ files });
    expect(content?.kind === 'files' && content.files).toHaveLength(MAX_SHARED_FILES);
  });
});

describe('parseSharedContent — links', () => {
  it('takes a Google Maps share as a link titled with the place', () => {
    expect(
      parseSharedContent({ text: 'Duomo di Milano\nhttps://maps.app.goo.gl/xYz123', type: 'text' }),
    ).toEqual({ kind: 'link', url: 'https://maps.app.goo.gl/xYz123', title: 'Duomo di Milano' });
  });

  it('takes a bare link from Chrome with no title of its own', () => {
    expect(
      parseSharedContent({ text: 'https://www.booking.com/hotel/it/brera.html', type: 'weburl' }),
    ).toEqual({
      kind: 'link',
      url: 'https://www.booking.com/hotel/it/brera.html',
      title: null,
    });
  });

  it('uses the page title when the share carries one', () => {
    const content = parseSharedContent({
      webUrl: 'https://example.com/tour',
      text: 'https://example.com/tour',
      meta: { title: 'Last Supper tour' },
    });
    expect(content).toEqual({
      kind: 'link',
      url: 'https://example.com/tour',
      title: 'Last Supper tour',
    });
  });

  it('ignores a webUrl that is not safe to open and falls back to the text', () => {
    expect(parseSharedContent({ webUrl: 'javascript:alert(1)', text: 'Door code 4321' })).toEqual({
      kind: 'text',
      text: 'Door code 4321',
    });
  });
});

describe('parseSharedContent — text and nothing', () => {
  it('keeps text with no link as text', () => {
    expect(parseSharedContent({ text: '  Door code 4321\nSecond floor  ' })).toEqual({
      kind: 'text',
      text: 'Door code 4321\nSecond floor',
    });
  });

  it('returns null for an empty share or a malformed payload', () => {
    expect(parseSharedContent({ text: '   ', files: [] })).toBeNull();
    expect(parseSharedContent(null)).toBeNull();
    expect(parseSharedContent({ files: [{ path: 42 }] })).toBeNull();
  });
});

describe('extractUrl and titleAround', () => {
  it('drops the punctuation a sentence leaves after a link', () => {
    expect(extractUrl('Booked it (https://example.com/b).')).toBe('https://example.com/b');
  });

  it('finds nothing in text without a web link', () => {
    expect(extractUrl('mailto:someone@example.com')).toBeNull();
  });

  it('takes the first non-empty line around the link as the title', () => {
    expect(
      titleAround(
        '\n  Pasticceria Marchesi \nhttps://maps.app.goo.gl/a',
        'https://maps.app.goo.gl/a',
      ),
    ).toBe('Pasticceria Marchesi');
    expect(titleAround('https://x.com/a', 'https://x.com/a')).toBeNull();
  });
});

describe('suggestTrip', () => {
  const trip = (id: string, startDate: string, endDate: string) =>
    ({ id, name: id, startDate, endDate }) as Trip;
  const NOW = new Date(2026, 8, 18, 12); // 18 Sep 2026, device-local

  it('suggests the trip under way', () => {
    const trips = [
      trip('next', '2026-10-01', '2026-10-05'),
      trip('now', '2026-09-17', '2026-09-20'),
    ];
    expect(suggestTrip(trips, NOW)?.id).toBe('now');
  });

  it('otherwise the next one to start', () => {
    const trips = [
      trip('later', '2026-12-01', '2026-12-05'),
      trip('sooner', '2026-10-01', '2026-10-05'),
      trip('past', '2026-08-01', '2026-08-05'),
    ];
    expect(suggestTrip(trips, NOW)?.id).toBe('sooner');
  });

  it('otherwise the one that ended last, and nothing when there are no trips', () => {
    const trips = [
      trip('older', '2026-06-01', '2026-06-05'),
      trip('recent', '2026-08-01', '2026-08-05'),
    ];
    expect(suggestTrip(trips, NOW)?.id).toBe('recent');
    expect(suggestTrip([], NOW)).toBeNull();
  });
});

describe('destinations and new items', () => {
  const link: SharedContent = {
    kind: 'link',
    url: 'https://maps.app.goo.gl/a',
    title: 'Duomo di Milano',
  };
  const bare: SharedContent = { kind: 'link', url: 'https://www.booking.com/x', title: null };
  const pdf: SharedContent = {
    kind: 'files',
    files: [
      {
        uri: 'file:///c/hotel_confirmation.pdf',
        fileName: 'hotel_confirmation.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
      },
    ],
  };
  const text: SharedContent = { kind: 'text', text: 'Door code 4321' };

  it('offers a link as a new place first, and a file to an existing item first', () => {
    expect(destinationsFor(link)[0]).toBe('new-item');
    expect(destinationLabel('new-item', link)).toBe('New place');
    expect(destinationsFor(pdf)[0]).toBe('item');
    expect(destinationLabel('new-item', pdf)).toBe('New item');
    expect(destinationsFor(text)).toEqual(['note']);
  });

  it('starts a place from a link as an idea titled after it', () => {
    expect(newItemFor(link)).toEqual({ title: 'Duomo di Milano', status: 'idea' });
    expect(newItemFor(bare)).toEqual({ title: 'booking.com', status: 'idea' });
  });

  it('starts an item from a file as confirmed, titled after the file', () => {
    expect(newItemFor(pdf)).toEqual({ title: 'hotel confirmation', status: 'confirmed' });
  });
});

describe('noteTitleFor', () => {
  it('uses the first line, shortened', () => {
    expect(noteTitleFor('\nDoor code 4321\nSecond floor')).toBe('Door code 4321');
    expect(noteTitleFor('x'.repeat(80))).toHaveLength(58);
  });
});
