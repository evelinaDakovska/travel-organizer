import {
  coordinatesText,
  parseCoordinates,
  areEndpointsEqual,
  buildGoogleMapsUrl,
  computeDirectionsRequestKey,
  findStayForDay,
  findTimelineConnectors,
  findTripSavedPlaces,
  findTripStays,
  formatEndpointQuery,
  resolveItemDirectionsDay,
  resolveItemEndpoint,
  validateCoordinates,
  type DirectionEndpoint,
  type DirectionsRequest,
} from './directions';
import { timelineEntries, type TimelineEntry } from './timeline';
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

  it('rejects invalid explicit origins instead of silently converting them to current location (D5)', () => {
    // Blank title and address in endpoint
    const blankOriginReq: DirectionsRequest = {
      origin: { type: 'endpoint', endpoint: { title: '', address: null } },
      destination: { title: 'SantaPark' },
    };
    expect(buildGoogleMapsUrl(blankOriginReq)).toBeNull();

    // Whitespace only
    const whitespaceReq: DirectionsRequest = {
      origin: { type: 'endpoint', endpoint: { title: '   ' } },
      destination: { title: 'SantaPark' },
    };
    expect(buildGoogleMapsUrl(whitespaceReq)).toBeNull();
  });

  it('correctly formats coordinates including zero (0,0 / Null Island) (D5)', () => {
    const zeroCoordsReq: DirectionsRequest = {
      origin: { type: 'endpoint', endpoint: { title: 'Null Island', latitude: 0, longitude: 0 } },
      destination: { title: 'Greenwich', latitude: 51.48, longitude: 0 },
    };
    const url = buildGoogleMapsUrl(zeroCoordsReq);
    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('origin')).toBe('0,0');
    expect(parsed.searchParams.get('destination')).toBe('51.48,0');
  });

  it('rejects URLs that exceed the 2048 character limit (D5)', () => {
    const longTitle = 'A'.repeat(2500);
    const longReq: DirectionsRequest = {
      origin: { type: 'current_location' },
      destination: { title: longTitle },
    };
    expect(buildGoogleMapsUrl(longReq)).toBeNull();
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
    isPaid: false, recordedPaid: 0,
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

  it('resolves transport departure as destination (incoming) for full journey', () => {
    const flight: TripItem = {
      ...dummyItem,
      id: 'flight-1',
      kind: 'transport',
      subkind: 'flight',
      title: 'Sofia to Munich',
      details: { from: 'Sofia Airport', to: 'Munich Airport' },
    };
    const incoming = resolveItemEndpoint(flight, 'destination', 'full');
    expect(incoming?.title).toBe('Sofia Airport');
  });

  it('resolves transport arrival as origin (outgoing) for full journey', () => {
    const flight: TripItem = {
      ...dummyItem,
      id: 'flight-1',
      kind: 'transport',
      subkind: 'flight',
      title: 'Sofia to Munich',
      details: { from: 'Sofia Airport', to: 'Munich Airport' },
    };
    const outgoing = resolveItemEndpoint(flight, 'origin', 'full');
    expect(outgoing?.title).toBe('Munich Airport');
  });

  it('resolves overnight transport correctly based on timeline entry role (D1)', () => {
    const sleeperTrain: TripItem = {
      ...dummyItem,
      id: 'train-1',
      kind: 'transport',
      subkind: 'train',
      title: 'Santa Claus Express',
      details: { from: 'Helsinki Central Station', to: 'Rovaniemi Railway Station' },
    };

    // Day 2 arrival entry: approaching arrival should resolve to Rovaniemi, NOT Helsinki!
    const approachingArrival = resolveItemEndpoint(sleeperTrain, 'destination', 'end');
    expect(approachingArrival?.title).toBe('Rovaniemi Railway Station');

    // Day 2 arrival entry: departing from arrival
    const leavingArrival = resolveItemEndpoint(sleeperTrain, 'origin', 'end');
    expect(leavingArrival?.title).toBe('Rovaniemi Railway Station');

    // Day 1 departure entry: approaching departure resolves to Helsinki
    const approachingDeparture = resolveItemEndpoint(sleeperTrain, 'destination', 'start');
    expect(approachingDeparture?.title).toBe('Helsinki Central Station');

    // Day 1 departure entry: departing from departure
    const leavingDeparture = resolveItemEndpoint(sleeperTrain, 'origin', 'start');
    expect(leavingDeparture?.title).toBe('Helsinki Central Station');
  });

  it('resolves car rental pickup and return based on timeline entry role (D1)', () => {
    const carRental: TripItem = {
      ...dummyItem,
      id: 'car-1',
      kind: 'transport',
      subkind: 'car',
      title: 'Europcar Rental',
      details: { from: 'Rovaniemi Airport Pickup', to: 'Rovaniemi Downtown Drop-off' },
    };

    // Pickup entry
    const pickup = resolveItemEndpoint(carRental, 'destination', 'start');
    expect(pickup?.title).toBe('Rovaniemi Airport Pickup');

    // Return entry
    const returnEndpoint = resolveItemEndpoint(carRental, 'destination', 'end');
    expect(returnEndpoint?.title).toBe('Rovaniemi Downtown Drop-off');
  });

  it('returns null when item has no location at all', () => {
    const itemWithoutLoc: TripItem = {
      ...dummyItem,
      locationName: null,
      address: null,
      latitude: null,
      longitude: null,
      details: null,
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
    isPaid: false, recordedPaid: 0,
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

  it('allows connectors after multi-day hotel check-in on the same day (D2)', () => {
    // Hotel check-in 21 Nov 15:00, checkout 24 Nov 11:00
    const hotelCheckIn: TripItem = {
      ...baseItem,
      id: 'hotel-1',
      kind: 'stay',
      subkind: 'hotel',
      title: 'Arctic TreeHouse Hotel',
      locationName: 'Arctic TreeHouse Hotel',
      latitude: 66.54,
      longitude: 25.84,
      start: { local: '2026-11-21T15:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-24T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    // Dinner 21 Nov 19:00
    const dinner: TripItem = {
      ...baseItem,
      id: 'dinner-1',
      kind: 'food',
      subkind: 'restaurant',
      title: 'Restaurant Nili',
      locationName: 'Restaurant Nili',
      latitude: 66.50,
      longitude: 25.73,
      start: { local: '2026-11-21T19:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T21:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [
      {
        key: 'hotel-1',
        item: hotelCheckIn,
        role: 'start' as const,
        moment: hotelCheckIn.start!,
        instant: '2026-11-21T13:00:00Z',
        time: '15:00',
      },
      {
        key: 'dinner-1',
        item: dinner,
        role: 'full' as const,
        moment: dinner.start!,
        instant: '2026-11-21T17:00:00Z',
        time: '19:00',
      },
    ];

    const connectors = findTimelineConnectors(entries);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].fromItem.id).toBe('hotel-1');
    expect(connectors[0].toItem.id).toBe('dinner-1');
    expect(connectors[0].origin.title).toBe('Arctic TreeHouse Hotel');
    expect(connectors[0].destination.title).toBe('Restaurant Nili');
  });

  it('allows connectors after car rental pickup to next activity (D2)', () => {
    // Car rental 21 Nov 08:00 to 24 Nov 18:00
    const carRental: TripItem = {
      ...baseItem,
      id: 'car-1',
      kind: 'transport',
      subkind: 'car',
      title: 'Rental Car',
      details: { from: 'Rovaniemi Airport', to: 'Rovaniemi Airport' },
      start: { local: '2026-11-21T08:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-24T18:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const safari: TripItem = {
      ...baseItem,
      id: 'safari-1',
      kind: 'activity',
      title: 'Husky Safari',
      locationName: 'Bearhill Husky',
      latitude: 66.6,
      longitude: 25.9,
      start: { local: '2026-11-21T10:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T12:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = [
      {
        key: 'car-1',
        item: carRental,
        role: 'start' as const,
        moment: carRental.start!,
        instant: '2026-11-21T06:00:00Z',
        time: '08:00',
      },
      {
        key: 'safari-1',
        item: safari,
        role: 'full' as const,
        moment: safari.start!,
        instant: '2026-11-21T08:00:00Z',
        time: '10:00',
      },
    ];

    const connectors = findTimelineConnectors(entries);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].origin.title).toBe('Rovaniemi Airport');
    expect(connectors[0].destination.title).toBe('Bearhill Husky');
  });

  it('connects overnight train arrival to next stop using real timelineEntries (D1 & D2)', () => {
    const sleeperTrain: TripItem = {
      ...baseItem,
      id: 'train-1',
      kind: 'transport',
      subkind: 'train',
      title: 'Overnight Sleeper',
      details: { from: 'Helsinki Central Station', to: 'Rovaniemi Railway Station' },
      start: { local: '2026-11-20T19:27', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T07:40', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const breakfast: TripItem = {
      ...baseItem,
      id: 'breakfast-1',
      kind: 'food',
      title: 'Cafe Rovaniemi',
      locationName: 'Cafe Rovaniemi',
      start: { local: '2026-11-21T08:30', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T09:30', precision: 'time', tz: 'Europe/Helsinki' },
    };

    // Use real timelineEntries() output
    const allEntries = timelineEntries([sleeperTrain, breakfast]);
    // Filter to day 2 (2026-11-21)
    const day2Entries = allEntries.filter((e) => e.moment.local.startsWith('2026-11-21'));

    const connectors = findTimelineConnectors(day2Entries);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].origin.title).toBe('Rovaniemi Railway Station');
    expect(connectors[0].destination.title).toBe('Cafe Rovaniemi');
  });

  it('connects preceding activity to arrival location using real timelineEntries (D1)', () => {
    const earlyWalk: TripItem = {
      ...baseItem,
      id: 'walk-1',
      kind: 'activity',
      title: 'Sunrise Walk',
      locationName: 'Lainio River Bridge',
      start: { local: '2026-11-21T06:30', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T07:15', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const sleeperTrain: TripItem = {
      ...baseItem,
      id: 'train-1',
      kind: 'transport',
      subkind: 'train',
      title: 'Overnight Sleeper',
      details: { from: 'Helsinki Central Station', to: 'Rovaniemi Railway Station' },
      start: { local: '2026-11-20T19:27', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T07:40', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const allEntries = timelineEntries([earlyWalk, sleeperTrain]);
    const day2Entries = allEntries.filter((e) => e.moment.local.startsWith('2026-11-21'));

    const connectors = findTimelineConnectors(day2Entries);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].origin.title).toBe('Lainio River Bridge');
    // Destination must resolve to Rovaniemi, NOT Helsinki!
    expect(connectors[0].destination.title).toBe('Rovaniemi Railway Station');
  });
});

describe('findTripStays, findStayForDay and findTripSavedPlaces', () => {
  const stayItem: TripItem = {
    id: 'stay-1',
    tripId: 't1',
    kind: 'stay',
    subkind: 'hotel',
    status: 'confirmed',
    priority: null,
    title: 'Hotel Sky Ounasvaara',
    start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
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
    isPaid: false, recordedPaid: 0,
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

  it('finds confirmed stays with locations, including coordinate-only stays (D3)', () => {
    const coordOnlyStay: TripItem = {
      ...stayItem,
      id: 'coord-stay',
      locationName: null,
      address: null,
      latitude: 66.51,
      longitude: 25.71,
    };
    const stays = findTripStays([stayItem, activityItem, coordOnlyStay]);
    expect(stays).toHaveLength(2);
    expect(stays.map((s) => s.id)).toEqual(['stay-1', 'coord-stay']);
  });

  it('resolves stay matching route day in multi-city trip and transition day (D3)', () => {
    const hotelHelsinki: TripItem = {
      ...stayItem,
      id: 'hotel-helsinki',
      title: 'Hotel Helsinki',
      start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const hotelRovaniemi: TripItem = {
      ...stayItem,
      id: 'hotel-rovaniemi',
      title: 'Hotel Rovaniemi',
      start: { local: '2026-11-22T15:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-25T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const stays = [hotelHelsinki, hotelRovaniemi];

    // Day 21 Nov: Hotel Helsinki
    expect(findStayForDay(stays, '2026-11-21')?.id).toBe('hotel-helsinki');

    // Day 22 Nov: Check-out Helsinki / Check-in Rovaniemi transition -> Rovaniemi takes precedence
    expect(findStayForDay(stays, '2026-11-22')?.id).toBe('hotel-rovaniemi');

    // Day 23 Nov: Hotel Rovaniemi
    expect(findStayForDay(stays, '2026-11-23')?.id).toBe('hotel-rovaniemi');

    // Before or after trip
    expect(findStayForDay(stays, '2026-11-19')).toBeNull();
    expect(findStayForDay(stays, '2026-11-26')).toBeNull();
  });

  it('finds unique saved places across trip', () => {
    const places = findTripSavedPlaces([stayItem, activityItem]);
    expect(places).toHaveLength(2);
    expect(places.map((p) => p.title)).toContain('Hotel Sky Ounasvaara');
    expect(places.map((p) => p.title)).toContain('SantaPark');
  });
});

describe('Route-day hotel selection and item detail directions', () => {
  const baseStay: TripItem = {
    id: 'base-stay',
    tripId: 't1',
    kind: 'stay',
    subkind: 'hotel',
    status: 'confirmed',
    priority: null,
    title: 'Base Hotel',
    start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-21T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    locationName: 'Base Hotel',
    address: 'Base Address',
    latitude: 60.1,
    longitude: 24.9,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false, recordedPaid: 0,
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  };

  const hotelHelsinki: TripItem = {
    ...baseStay,
    id: 'hotel-helsinki',
    title: 'Hotel Helsinki',
    start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-21T11:00', precision: 'time', tz: 'Europe/Helsinki' },
  };

  const hotelRovaniemi: TripItem = {
    ...baseStay,
    id: 'hotel-rovaniemi',
    title: 'Hotel Rovaniemi',
    start: { local: '2026-11-21T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-22T11:00', precision: 'time', tz: 'Europe/Helsinki' },
  };

  const hotelIvalo: TripItem = {
    ...baseStay,
    id: 'hotel-ivalo',
    title: 'Hotel Ivalo',
    start: { local: '2026-11-22T15:00', precision: 'time', tz: 'Europe/Helsinki' },
    end: { local: '2026-11-23T11:00', precision: 'time', tz: 'Europe/Helsinki' },
  };

  const stays = [hotelHelsinki, hotelRovaniemi, hotelIvalo];

  it('selects arrival-day hotel for connector following overnight train arrival (Overnight arrival -> next activity)', () => {
    const sleeperTrain: TripItem = {
      ...baseStay,
      id: 'train-overnight',
      kind: 'transport',
      subkind: 'train',
      title: 'Santa Claus Express',
      details: { from: 'Helsinki Central', to: 'Rovaniemi Railway Station' },
      start: { local: '2026-11-20T19:27', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T07:40', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const nextActivity: TripItem = {
      ...baseStay,
      id: 'act-santapark',
      kind: 'activity',
      title: 'SantaPark',
      locationName: 'SantaPark',
      address: 'Tarvantie 1',
      start: { local: '2026-11-21T09:30', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T12:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const entries = timelineEntries([sleeperTrain, nextActivity]);
    const day21Entries = entries.filter((e) => e.moment.local.startsWith('2026-11-21'));

    const connectors = findTimelineConnectors(day21Entries);
    expect(connectors).toHaveLength(1);
    expect(connectors[0].day).toBe('2026-11-21');
    expect(connectors[0].origin.title).toBe('Rovaniemi Railway Station');
    expect(connectors[0].destination.title).toBe('SantaPark');

    // Crucial check: hotel for this connector MUST be Hotel Rovaniemi (Nov 21), NOT Hotel Helsinki (Nov 20 departure)
    const activeHotel = findStayForDay(stays, connectors[0].day);
    expect(activeHotel?.id).toBe('hotel-rovaniemi');
    expect(activeHotel?.title).toBe('Hotel Rovaniemi');
  });

  it('resolves distinct dates for departure vs arrival on different dates', () => {
    const overnightFlight: TripItem = {
      ...baseStay,
      id: 'flight-1',
      kind: 'transport',
      subkind: 'flight',
      title: 'Red-eye Flight',
      details: { from: 'HEL', to: 'RVN' },
      start: { local: '2026-11-20T23:30', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T01:30', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const departureDay = resolveItemDirectionsDay(overnightFlight, 'start');
    const arrivalDay = resolveItemDirectionsDay(overnightFlight, 'end');
    const defaultDay = resolveItemDirectionsDay(overnightFlight);

    expect(departureDay).toBe('2026-11-20');
    expect(arrivalDay).toBe('2026-11-21');
    expect(defaultDay).toBe('2026-11-20');
  });

  it('resolves correct hotel across consecutive days with different hotels', () => {
    expect(findStayForDay(stays, '2026-11-20')?.id).toBe('hotel-helsinki');
    expect(findStayForDay(stays, '2026-11-21')?.id).toBe('hotel-rovaniemi');
    expect(findStayForDay(stays, '2026-11-22')?.id).toBe('hotel-ivalo');
  });

  it('chooses departure hotel vs arrival hotel appropriately in item detail', () => {
    const overnightTrain: TripItem = {
      ...baseStay,
      id: 'train-multi-day',
      kind: 'transport',
      subkind: 'train',
      title: 'Overnight Train',
      details: { from: 'Helsinki Central', to: 'Rovaniemi Railway Station' },
      start: { local: '2026-11-20T19:27', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-21T07:40', precision: 'time', tz: 'Europe/Helsinki' },
    };

    // When user requests "To departure": uses departure day (Nov 20) -> Helsinki hotel
    const departureDay = resolveItemDirectionsDay(overnightTrain, 'start');
    const departureHotel = findStayForDay(stays, departureDay);
    expect(departureHotel?.id).toBe('hotel-helsinki');

    // When user requests "To arrival": uses arrival day (Nov 21) -> Rovaniemi hotel, NOT departure hotel!
    const arrivalDay = resolveItemDirectionsDay(overnightTrain, 'end');
    const arrivalHotel = findStayForDay(stays, arrivalDay);
    expect(arrivalHotel?.id).toBe('hotel-rovaniemi');
  });

  it('handles no suitable hotel and overlapping stays with priority rules', () => {
    // No suitable hotel
    expect(findStayForDay([], '2026-11-21')).toBeNull();
    expect(findStayForDay(stays, '2026-11-15')).toBeNull();
    expect(findStayForDay(stays, null)).toBeNull();

    // Overlapping stays on the same day: later check-in instant takes precedence
    const longStay: TripItem = {
      ...baseStay,
      id: 'long-stay',
      title: 'Long Stay Chalet',
      start: { local: '2026-11-20T10:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-25T11:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const specialStay: TripItem = {
      ...baseStay,
      id: 'special-stay',
      title: 'Aurora Glass Igloo',
      start: { local: '2026-11-21T16:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    };

    const overlappingStays = [longStay, specialStay];
    // On Nov 21, both overlap, but specialStay has later check-in (16:00 vs 10:00 on Nov 20)
    expect(findStayForDay(overlappingStays, '2026-11-21')?.id).toBe('special-stay');

    // If starts are identical, later end takes precedence
    const staySameStartEarlierEnd: TripItem = {
      ...baseStay,
      id: 'stay-early-end',
      title: 'Stay A',
      start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-22T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    const staySameStartLaterEnd: TripItem = {
      ...baseStay,
      id: 'stay-late-end',
      title: 'Stay B',
      start: { local: '2026-11-20T15:00', precision: 'time', tz: 'Europe/Helsinki' },
      end: { local: '2026-11-23T10:00', precision: 'time', tz: 'Europe/Helsinki' },
    };
    expect(
      findStayForDay([staySameStartEarlierEnd, staySameStartLaterEnd], '2026-11-21')?.id,
    ).toBe('stay-late-end');
  });
});

describe('DirectionsSheet stable requestKey generation', () => {
  it('uses explicit requestKey when provided', () => {
    const key = computeDirectionsRequestKey(
      { title: 'SantaPark' },
      { type: 'current_location' },
      'custom-request-key-123',
    );
    expect(key).toBe('custom-request-key-123');
  });

  it('computes stable fallback key from destination and origin', () => {
    const dest = { title: 'SantaPark', latitude: 66.54, longitude: 25.84 };
    const origin1 = {
      type: 'endpoint' as const,
      endpoint: { title: 'Hotel Sky', latitude: 66.5, longitude: 25.7 },
    };
    const origin2 = {
      type: 'endpoint' as const,
      endpoint: { title: 'Hotel Sky', latitude: 66.5, longitude: 25.7 },
    };

    const key1 = computeDirectionsRequestKey(dest, origin1);
    const key2 = computeDirectionsRequestKey(dest, origin2);

    expect(key1).toBe('66.54,25.84<-66.5,25.7');
    expect(key1).toBe(key2);
  });
});

describe('parseCoordinates', () => {
  it('reads what Google Maps copies, and a space or semicolon between', () => {
    expect(parseCoordinates('66.5115, 25.7311')).toEqual({ latitude: 66.5115, longitude: 25.7311 });
    expect(parseCoordinates(' -33.8568 151.2153 ')).toEqual({ latitude: -33.8568, longitude: 151.2153 });
    expect(parseCoordinates('(41.9028;12.4964)')).toEqual({ latitude: 41.9028, longitude: 12.4964 });
    expect(parseCoordinates('0, 0')).toEqual({ latitude: 0, longitude: 0 });
  });

  it('is undefined when empty, null when not a pair in range', () => {
    expect(parseCoordinates('  ')).toBeUndefined();
    for (const bad of ['66.5', '91, 0', '0, 181', '66,5, 25,7', 'Rovaniemi', '66.5, 25.7, 3', '1e2, 3']) {
      expect([bad, parseCoordinates(bad)]).toEqual([bad, null]);
    }
  });

  it('round-trips through coordinatesText', () => {
    expect(coordinatesText(66.5115, 25.7311)).toBe('66.5115, 25.7311');
    expect(parseCoordinates(coordinatesText(-0.5, 0))).toEqual({ latitude: -0.5, longitude: 0 });
    expect(coordinatesText(null, 25)).toBe('');
  });
});
