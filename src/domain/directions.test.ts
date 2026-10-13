import {
  areEndpointsEqual,
  buildGoogleMapsUrl,
  findTimelineConnectors,
  findTripSavedPlaces,
  findTripStays,
  formatEndpointQuery,
  resolveItemEndpoint,
  validateCoordinates,
  type DirectionEndpoint,
  type DirectionsRequest,
} from './directions';
import type { TimelineEntry } from './timeline';
import type { TripItem } from './tripItem';

describe('validateCoordinates', () => {
  it('accepts valid latitude and longitude pairs', () => {
    expect(validateCoordinates(66.5434, 25.8472)).toBe(true);
    expect(validateCoordinates(-33.8688, 151.2093)).toBe(true);
  });

  it('accepts zero coordinates (0, 0 / Null Island)', () => {
    expect(validateCoordinates(0, 0)).toBe(true);
  });

  it('accepts boundary coordinate values', () => {
    expect(validateCoordinates(90, 180)).toBe(true);
    expect(validateCoordinates(-90, -180)).toBe(true);
  });

  it('rejects out of bounds coordinates', () => {
    expect(validateCoordinates(90.1, 0)).toBe(false);
    expect(validateCoordinates(-90.1, 0)).toBe(false);
    expect(validateCoordinates(0, 180.1)).toBe(false);
    expect(validateCoordinates(0, -180.1)).toBe(false);
  });

  it('rejects null, undefined, NaN, and non-finite numbers', () => {
    expect(validateCoordinates(null, 25.0)).toBe(false);
    expect(validateCoordinates(66.0, null)).toBe(false);
    expect(validateCoordinates(undefined, undefined)).toBe(false);
    expect(validateCoordinates(NaN, 25.0)).toBe(false);
    expect(validateCoordinates(Infinity, 25.0)).toBe(false);
  });
});

describe('formatEndpointQuery', () => {
  it('prefers coordinates over text when valid', () => {
    const ep: DirectionEndpoint = {
      title: 'SantaPark',
      address: 'Tarvantie 1, Rovaniemi',
      latitude: 66.5434,
      longitude: 25.8472,
    };
    expect(formatEndpointQuery(ep)).toBe('66.5434,25.8472');
  });

  it('formats coordinates 0,0 correctly', () => {
    const ep: DirectionEndpoint = {
      title: 'Null Island',
      latitude: 0,
      longitude: 0,
    };
    expect(formatEndpointQuery(ep)).toBe('0,0');
  });

  it('combines title and address when both are present without duplication', () => {
    const ep: DirectionEndpoint = {
      title: 'Bearhill Husky',
      address: 'Sinettä, Finland',
    };
    expect(formatEndpointQuery(ep)).toBe('Bearhill Husky, Sinettä, Finland');
  });

  it('does not duplicate title if address already contains it', () => {
    const ep: DirectionEndpoint = {
      title: 'SantaPark',
      address: 'SantaPark, Tarvantie 1, Rovaniemi',
    };
    expect(formatEndpointQuery(ep)).toBe('SantaPark, Tarvantie 1, Rovaniemi');
  });

  it('uses title only when address is missing', () => {
    expect(formatEndpointQuery({ title: 'Rovaniemi Railway Station' })).toBe(
      'Rovaniemi Railway Station',
    );
  });

  it('uses address only when title is missing', () => {
    expect(formatEndpointQuery({ title: '', address: 'Tarvantie 1' })).toBe('Tarvantie 1');
  });

  it('returns null when neither coordinates nor text are present', () => {
    expect(formatEndpointQuery({ title: '', address: null })).toBeNull();
  });
});

describe('areEndpointsEqual', () => {
  it('returns true when coordinates match', () => {
    const a: DirectionEndpoint = { title: 'Spot A', latitude: 60.1, longitude: 24.9 };
    const b: DirectionEndpoint = { title: 'Spot B', latitude: 60.1, longitude: 24.9 };
    expect(areEndpointsEqual(a, b)).toBe(true);
  });

  it('returns true when query text matches case-insensitively', () => {
    const a: DirectionEndpoint = { title: 'SantaPark', address: 'Tarvantie 1' };
    const b: DirectionEndpoint = { title: 'santapark', address: 'tarvantie 1' };
    expect(areEndpointsEqual(a, b)).toBe(true);
  });

  it('returns false when locations differ', () => {
    const a: DirectionEndpoint = { title: 'SantaPark' };
    const b: DirectionEndpoint = { title: 'Hotel Sky Ounasvaara' };
    expect(areEndpointsEqual(a, b)).toBe(false);
  });

  it('returns false when either endpoint is null', () => {
    expect(areEndpointsEqual(null, { title: 'SantaPark' })).toBe(false);
    expect(areEndpointsEqual({ title: 'SantaPark' }, null)).toBe(false);
  });
});

describe('buildGoogleMapsUrl', () => {
  it('builds URL with coordinates destination and current location origin', () => {
    const req: DirectionsRequest = {
      origin: { type: 'current_location' },
      destination: { title: 'SantaPark', latitude: 66.5434, longitude: 25.8472 },
    };
    const url = buildGoogleMapsUrl(req);
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=66.5434%2C25.8472');
  });

  it('builds URL with explicit origin endpoint', () => {
    const req: DirectionsRequest = {
      origin: {
        type: 'endpoint',
        endpoint: { title: 'Hotel Sky Ounasvaara', address: 'Juhannuskalliontie' },
      },
      destination: { title: 'SantaPark', address: 'Tarvantie 1' },
    };
    const url = buildGoogleMapsUrl(req);
    expect(url).toContain('api=1');
    expect(url).toContain('origin=Hotel+Sky+Ounasvaara%2C+Juhannuskalliontie');
    expect(url).toContain('destination=SantaPark%2C+Tarvantie+1');
  });

  it('handles Cyrillic characters properly', () => {
    const req: DirectionsRequest = {
      origin: { type: 'current_location' },
      destination: {
        title: 'Храм-паметник „Свети Александър Невски“',
        address: 'София, България',
      },
    };
    const url = buildGoogleMapsUrl(req);
    expect(url).toBeDefined();
    // Verify it decodes back accurately
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('destination')).toBe(
      'Храм-паметник „Свети Александър Невски“, София, България',
    );
  });

  it('handles Finnish characters and ampersands properly', () => {
    const req: DirectionsRequest = {
      origin: {
        type: 'endpoint',
        endpoint: { title: 'K-Market Sinettä & Kahvila' },
      },
      destination: { title: 'SantaPark' },
    };
    const url = buildGoogleMapsUrl(req);
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('origin')).toBe('K-Market Sinettä & Kahvila');
    expect(parsed.searchParams.get('destination')).toBe('SantaPark');
  });

  it('applies travel modes correctly', () => {
    const base: DirectionsRequest = {
      origin: { type: 'current_location' },
      destination: { title: 'SantaPark', latitude: 66.54, longitude: 25.84 },
    };

    const walkingUrl = buildGoogleMapsUrl({ ...base, travelMode: 'walking' });
    expect(new URL(walkingUrl!).searchParams.get('travelmode')).toBe('walking');

    const drivingUrl = buildGoogleMapsUrl({ ...base, travelMode: 'driving' });
    expect(new URL(drivingUrl!).searchParams.get('travelmode')).toBe('driving');

    const transitUrl = buildGoogleMapsUrl({ ...base, travelMode: 'transit' });
    expect(new URL(transitUrl!).searchParams.get('travelmode')).toBe('transit');

    const noModeUrl = buildGoogleMapsUrl({ ...base, travelMode: null });
    expect(new URL(noModeUrl!).searchParams.get('travelmode')).toBeNull();
  });

  it('returns null when destination has no valid query', () => {
    const req: DirectionsRequest = {
      origin: { type: 'current_location' },
      destination: { title: '', address: null },
    };
    expect(buildGoogleMapsUrl(req)).toBeNull();
  });
});

describe('resolveItemEndpoint', () => {
  const dummyItem: TripItem = {
    id: 'item-1',
    tripId: 'trip-1',
    kind: 'activity',
    subkind: 'museum',
    status: 'confirmed',
    priority: null,
    title: 'Arktikum',
    start: { local: '2026-11-21T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-21T12:00', precision: 'time', tz: 'Europe/Helsinki' },
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    locationName: 'Arktikum Science Museum',
    address: 'Pohjoisranta 4, 96200 Rovaniemi',
    latitude: 66.5052,
    longitude: 25.7259,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false,
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  };

  it('resolves activity location from locationName, address and coords', () => {
    const ep = resolveItemEndpoint(dummyItem, 'destination');
    expect(ep).toEqual({
      title: 'Arktikum Science Museum',
      address: 'Pohjoisranta 4, 96200 Rovaniemi',
      latitude: 66.5052,
      longitude: 25.7259,
    });
  });

  it('resolves transport departure as destination (incoming)', () => {
    const flight: TripItem = {
      ...dummyItem,
      id: 'flight-1',
      kind: 'transport',
      subkind: 'flight',
      title: 'Sofia to Munich',
      details: { from: 'Sofia Airport', to: 'Munich Airport' },
    };
    const incoming = resolveItemEndpoint(flight, 'destination');
    expect(incoming?.title).toBe('Sofia Airport');
  });

  it('resolves transport arrival as origin (outgoing)', () => {
    const flight: TripItem = {
      ...dummyItem,
      id: 'flight-1',
      kind: 'transport',
      subkind: 'flight',
      title: 'Sofia to Munich',
      details: { from: 'Sofia Airport', to: 'Munich Airport' },
    };
    const outgoing = resolveItemEndpoint(flight, 'origin');
    expect(outgoing?.title).toBe('Munich Airport');
  });

  it('returns null when item has no location at all', () => {
    const itemWithoutLoc: TripItem = {
      ...dummyItem,
      locationName: null,
      address: null,
      latitude: null,
      longitude: null,
    };
    expect(resolveItemEndpoint(itemWithoutLoc, 'destination')).toBeNull();
  });
});

describe('findTimelineConnectors', () => {
  const baseItem: TripItem = {
    id: '1',
    tripId: 't1',
    kind: 'activity',
    subkind: 'attraction',
    status: 'confirmed',
    priority: null,
    title: 'SantaPark',
    start: { local: '2026-11-22T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-22T12:00', precision: 'time', tz: 'Europe/Helsinki' },
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    locationName: 'SantaPark',
    address: 'Tarvantie 1, Rovaniemi',
    latitude: 66.54,
    longitude: 25.84,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false,
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  };

  const makeEntry = (item: TripItem, time: string): TimelineEntry<TripItem> => ({
    key: item.id,
    item,
    role: 'full',
    moment: item.start!,
    instant: `2026-11-22T${time}:00Z`,
    time,
  });

  it('connects two consecutive located commitments', () => {
    const itemA: TripItem = {
      ...baseItem,
      id: 'item-a',
      title: 'Husky Safari',
      locationName: 'Bearhill Husky',
      latitude: 66.6,
      longitude: 25.9,
      start: { local: '2026-11-22T09:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const itemB: TripItem = {
      ...baseItem,
      id: 'item-b',
      title: 'SantaPark',
      locationName: 'SantaPark',
      latitude: 66.54,
      longitude: 25.84,
      start: { local: '2026-11-22T13:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [makeEntry(itemA, '09:00'), makeEntry(itemB, '13:00')];
    const connectors = findTimelineConnectors(entries);

    expect(connectors).toHaveLength(1);
    expect(connectors[0].fromItem.id).toBe('item-a');
    expect(connectors[0].toItem.id).toBe('item-b');
    expect(connectors[0].origin.title).toBe('Bearhill Husky');
    expect(connectors[0].destination.title).toBe('SantaPark');
  });

  it('suppresses connector when origin and destination are the same location', () => {
    const itemA: TripItem = {
      ...baseItem,
      id: 'item-a',
      title: 'Morning Sauna',
      locationName: 'Hotel Sky Ounasvaara',
      latitude: 66.5,
      longitude: 25.7,
      start: { local: '2026-11-22T08:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T09:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const itemB: TripItem = {
      ...baseItem,
      id: 'item-b',
      title: 'Hotel Breakfast',
      locationName: 'Hotel Sky Ounasvaara',
      latitude: 66.5,
      longitude: 25.7,
      start: { local: '2026-11-22T09:15', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [makeEntry(itemA, '08:00'), makeEntry(itemB, '09:15')];
    expect(findTimelineConnectors(entries)).toHaveLength(0);
  });

  it('suppresses connector when items overlap in time', () => {
    const itemA: TripItem = {
      ...baseItem,
      id: 'item-a',
      title: 'Husky Safari',
      locationName: 'Bearhill',
      start: { local: '2026-11-22T09:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T11:30', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const itemB: TripItem = {
      ...baseItem,
      id: 'item-b',
      title: 'Early Lunch',
      locationName: 'SantaPark Cafe',
      start: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T12:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [makeEntry(itemA, '09:00'), makeEntry(itemB, '11:00')];
    expect(findTimelineConnectors(entries)).toHaveLength(0);
  });

  it('does NOT silently skip a middle item with missing location', () => {
    const itemA: TripItem = {
      ...baseItem,
      id: 'item-a',
      locationName: 'Hotel Sky',
      start: { local: '2026-11-22T08:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T09:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const itemB: TripItem = {
      ...baseItem,
      id: 'item-b',
      title: 'Mystery Stop without location',
      locationName: null,
      address: null,
      latitude: null,
      longitude: null,
      start: { local: '2026-11-22T10:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const itemC: TripItem = {
      ...baseItem,
      id: 'item-c',
      locationName: 'SantaPark',
      start: { local: '2026-11-22T12:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T14:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [
      makeEntry(itemA, '08:00'),
      makeEntry(itemB, '10:00'),
      makeEntry(itemC, '12:00'),
    ];
    // item B has no location, so neither A->B nor B->C can be connected,
    // and A must NOT be connected directly to C!
    expect(findTimelineConnectors(entries)).toHaveLength(0);
  });

  it('excludes tasks, ideas, and date-only entries', () => {
    const taskItem: TripItem = {
      ...baseItem,
      id: 'task-1',
      kind: 'task',
      title: 'Pack snow boots',
    };
    const ideaItem: TripItem = {
      ...baseItem,
      id: 'idea-1',
      status: 'idea',
      title: 'Maybe visit ice bar',
    };
    const dateOnlyItem: TripItem = {
      ...baseItem,
      id: 'date-only-1',
      start: { local: '2026-11-22', precision: 'date', tz: 'Europe/Helsinki' },
      end: null,
    };
    const validItem: TripItem = {
      ...baseItem,
      id: 'valid-1',
      locationName: 'SantaPark',
    };

    const entries = [
      makeEntry(taskItem, '09:00'),
      makeEntry(ideaItem, '10:00'),
      {
        key: 'date-only-1',
        item: dateOnlyItem,
        role: 'full' as const,
        moment: dateOnlyItem.start!,
        instant: '2026-11-22T00:00:00Z',
        time: null,
      },
      makeEntry(validItem, '12:00'),
    ];

    expect(findTimelineConnectors(entries)).toHaveLength(0);
  });
});

describe('findTripStays and findTripSavedPlaces', () => {
  const stayItem: TripItem = {
    id: 'stay-1',
    tripId: 't1',
    kind: 'stay',
    subkind: 'hotel',
    status: 'confirmed',
    priority: null,
    title: 'Hotel Sky Ounasvaara',
    start: null,
    end: null,
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    locationName: 'Hotel Sky Ounasvaara',
    address: 'Juhannuskalliontie',
    latitude: 66.5,
    longitude: 25.7,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false,
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  };

  const activityItem: TripItem = {
    ...stayItem,
    id: 'act-1',
    kind: 'activity',
    title: 'SantaPark',
    locationName: 'SantaPark',
    address: 'Tarvantie 1',
    latitude: 66.54,
    longitude: 25.84,
  };

  it('finds confirmed stays with locations', () => {
    const stays = findTripStays([stayItem, activityItem]);
    expect(stays).toHaveLength(1);
    expect(stays[0].id).toBe('stay-1');
  });

  it('finds unique saved places across trip', () => {
    const places = findTripSavedPlaces([stayItem, activityItem]);
    expect(places).toHaveLength(2);
    expect(places.map((p) => p.title)).toContain('Hotel Sky Ounasvaara');
    expect(places.map((p) => p.title)).toContain('SantaPark');
  });
});
