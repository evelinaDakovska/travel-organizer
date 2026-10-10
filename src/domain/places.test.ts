import { bookedPlaces, mapsUrl, suggestPlaces } from './places';
import type { TripItem } from './tripItem';

const nowhere = { locationName: null, address: null, latitude: null, longitude: null };

describe('mapsUrl', () => {
  it('searches for the name and address together', () => {
    expect(mapsUrl({ ...nowhere, locationName: 'Duomo', address: 'Piazza del Duomo, Milano' })).toBe(
      'geo:0,0?q=Duomo%2C%20Piazza%20del%20Duomo%2C%20Milano',
    );
  });

  it('uses whichever of the two there is', () => {
    expect(mapsUrl({ ...nowhere, address: 'Via Roma 1' })).toBe('geo:0,0?q=Via%20Roma%201');
    expect(mapsUrl({ ...nowhere, locationName: '  Brera ' })).toBe('geo:0,0?q=Brera');
  });

  it('pins coordinates when it has them, labelled with the name', () => {
    expect(mapsUrl({ ...nowhere, locationName: 'Hotel', latitude: 45.46, longitude: 9.19 })).toBe(
      'geo:45.46,9.19?q=45.46,9.19(Hotel)',
    );
  });

  it('is null with nothing to look for', () => {
    expect(mapsUrl(nowhere)).toBeNull();
    expect(mapsUrl({ ...nowhere, locationName: '  ' })).toBeNull();
  });
});

describe('suggestPlaces', () => {
  const known = [
    { name: 'Milano Centrale', address: 'Piazza Duca d’Aosta' },
    { name: 'Hotel Brera', address: 'Via Brera 5' },
    { name: 'Brera Gallery', address: null },
    { name: 'hotel brera', address: null },
  ];

  it('matches anywhere, names starting with the query first', () => {
    expect(suggestPlaces(known, 'bre').map((p) => p.name)).toEqual(['Brera Gallery', 'Hotel Brera']);
  });

  it('offers each name once, ignoring case', () => {
    expect(suggestPlaces(known, 'hotel')).toHaveLength(1);
  });

  it('offers nothing for an empty query or the exact name already typed', () => {
    expect(suggestPlaces(known, ' ')).toEqual([]);
    expect(suggestPlaces(known, 'milano centrale')).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(suggestPlaces(known, 'e', 2)).toHaveLength(2);
  });
});

describe('bookedPlaces', () => {
  const base: TripItem = {
    id: '',
    tripId: 't',
    kind: 'activity',
    subkind: null,
    status: 'confirmed',
    priority: null,
    title: '',
    start: null,
    end: null,
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    ...nowhere,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false,
    createdAt: '',
    updatedAt: '',
  };
  const at = (local: string) => ({ local, tz: 'Europe/Rome', precision: 'time' as const });
  const item = (over: Partial<TripItem>) => ({ ...base, ...over });

  it('lists booked items with a place or address, in timeline order then undated', () => {
    const items = [
      item({ id: 'dinner', title: 'Dinner', locationName: 'Trattoria', start: at('2026-10-20T20:00') }),
      item({ id: 'museum', title: 'Museum', address: 'Via 1', start: at('2026-10-20T10:00') }),
      item({ id: 'spa', title: 'Spa', locationName: 'QC Terme' }),
      item({ id: 'nowhere', title: 'Call bank', start: at('2026-10-20T09:00') }),
      item({ id: 'idea', title: 'Bar', status: 'idea', locationName: 'Bar Basso' }),
      item({ id: 'gone', title: 'Tour', status: 'cancelled', locationName: 'Somewhere' }),
    ];
    expect(bookedPlaces(items).map((i) => i.id)).toEqual(['museum', 'dinner', 'spa']);
  });

  it('lists a multi-day stay once', () => {
    const hotel = item({
      id: 'hotel',
      kind: 'stay',
      locationName: 'Hotel',
      start: at('2026-10-19T15:00'),
      end: at('2026-10-22T11:00'),
    });
    expect(bookedPlaces([hotel]).map((i) => i.id)).toEqual(['hotel']);
  });
});
