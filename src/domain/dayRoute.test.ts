import { dayRoute, dayRouteLinks, routeDays, schematicLayout, STOPS_PER_LINK, type RouteStop } from './dayRoute';
import type { TripItem } from './tripItem';

const HEL = 'Europe/Helsinki';
const at = (local: string) => ({ local, tz: HEL, precision: (local.length > 10 ? 'time' : 'date') as 'time' | 'date' });

let count = 0;
function item(over: Partial<TripItem> & { title: string }): TripItem {
  count += 1;
  return {
    id: over.id ?? `i${count}`,
    tripId: 't1',
    kind: 'activity',
    subkind: null,
    status: 'confirmed',
    priority: null,
    start: null,
    end: null,
    startTzOverride: null,
    endTzOverride: null,
    completedAt: null,
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    confirmationCode: null,
    notes: null,
    details: null,
    priceAmount: null,
    priceCurrency: null,
    isPaid: false,
    recordedPaid: 0,
    createdAt: '2026-10-23T00:00:00Z',
    updatedAt: '2026-10-23T00:00:00Z',
    ...over,
  } as TripItem;
}

const hotel = item({
  id: 'hotel',
  kind: 'stay',
  title: 'Arctic Snow Hotel',
  locationName: 'Arctic Snow Hotel',
  latitude: 66.65,
  longitude: 26.02,
  start: at('2026-11-20T15:00'),
  end: at('2026-11-23T11:00'),
});
const flight = item({
  id: 'flight',
  kind: 'transport',
  subkind: 'flight',
  title: 'Flight to Rovaniemi',
  details: { from: 'Helsinki HEL', to: 'Rovaniemi RVN' },
  start: at('2026-11-20T10:30'),
  end: at('2026-11-20T11:45'),
});
const husky = item({ id: 'husky', title: 'Husky safari', locationName: 'Bearhill Husky', latitude: 66.6, longitude: 25.9, start: at('2026-11-21T13:00') });
const lunch = item({ id: 'lunch', kind: 'food', title: 'Lunch', locationName: 'Arctic Snow Hotel', latitude: 66.65, longitude: 26.02, start: at('2026-11-21T12:00') });
const santa = item({ id: 'santa', title: 'SantaPark', locationName: 'SantaPark', start: at('2026-11-21T17:00'), status: 'idea' });
const task = item({ id: 'task', kind: 'task', title: 'Check in online', start: at('2026-11-21T09:00') });
const someDay = item({ id: 'aurora', title: 'Aurora hunt', locationName: 'Lake', start: at('2026-11-21') });
const placeless = item({ id: 'nowhere', title: 'Call home', start: at('2026-11-21T20:00') });
const cancelled = item({ id: 'gone', title: 'Cancelled tour', locationName: 'X', status: 'cancelled', start: at('2026-11-21T15:00') });

const shape = (stops: RouteStop[]) =>
  stops.map((stop) => [stop.label, stop.plans.map((plan) => `${plan.role}:${plan.title}${plan.time ? `@${plan.time}` : ''}${plan.idea ? ' (idea)' : ''}`)]);

describe('dayRoute', () => {
  it('a full day: wake at the hotel, plans in order, ideas marked, back to the hotel; the rest listed apart', () => {
    const route = dayRoute([hotel, flight, husky, lunch, santa, task, someDay, placeless, cancelled], '2026-11-21');
    expect(shape(route.stops)).toEqual([
      // Waking at the hotel and lunch there are one stop: equal places in a row.
      ['Arctic Snow Hotel', ['wake:Arctic Snow Hotel', 'visit:Lunch@12:00']],
      ['Bearhill Husky', ['visit:Husky safari@13:00']],
      ['SantaPark', ['visit:SantaPark@17:00 (idea)']],
      ['Arctic Snow Hotel', ['sleep:Arctic Snow Hotel']],
    ]);
    expect(route.someTime).toEqual([{ itemId: 'aurora', title: 'Aurora hunt' }]);
    expect(route.noPlace).toEqual([{ itemId: 'nowhere', title: 'Call home', time: '20:00' }]);
  });

  it('arrival day: no start base; a flight gives its departure and arrival; the timed check-in, then the night there, as one stop', () => {
    const route = dayRoute([hotel, flight], '2026-11-20');
    expect(shape(route.stops)).toEqual([
      ['Helsinki HEL', ['departure:Flight to Rovaniemi@10:30']],
      ['Rovaniemi RVN', ['arrival:Flight to Rovaniemi@11:45']],
      ['Arctic Snow Hotel', ['check-in:Arctic Snow Hotel@15:00', 'sleep:Arctic Snow Hotel']],
    ]);
  });

  it('check-out day: waking there and the timed check-out are one stop, and no night follows', () => {
    const route = dayRoute([hotel, husky], '2026-11-23');
    expect(shape(route.stops)).toEqual([['Arctic Snow Hotel', ['wake:Arctic Snow Hotel', 'check-out:Arctic Snow Hotel@11:00']]]);
  });

  it('wakes at the hotel before a 09:00 visit and an 11:00 check-out: the day does not start at the visit (review P3)', () => {
    const cafe = item({ title: 'Breakfast', kind: 'food', locationName: 'Cafe Kauppayhtiö', start: at('2026-11-23T09:00') });
    const route = dayRoute([hotel, cafe], '2026-11-23');
    expect(shape(route.stops)).toEqual([
      ['Arctic Snow Hotel', ['wake:Arctic Snow Hotel']],
      ['Cafe Kauppayhtiö', ['visit:Breakfast@09:00']],
      ['Arctic Snow Hotel', ['check-out:Arctic Snow Hotel@11:00']],
    ]);
    // Times are only what was written: the wake-up base has none, and nothing between is invented.
    expect(route.stops[0].plans[0].time).toBeNull();
  });

  it('ends the night at the hotel after a dinner that follows the check-in (the evening mirror of P3)', () => {
    const dinner = item({ title: 'Dinner', kind: 'food', locationName: 'Nili', start: at('2026-11-20T19:00') });
    const route = dayRoute([hotel, dinner], '2026-11-20');
    expect(shape(route.stops)).toEqual([
      ['Arctic Snow Hotel', ['check-in:Arctic Snow Hotel@15:00']],
      ['Nili', ['visit:Dinner@19:00']],
      ['Arctic Snow Hotel', ['sleep:Arctic Snow Hotel']],
    ]);
  });

  it('date-only stays are bases at the edges, check-out and check-in on the same day', () => {
    const first = item({ id: 'a', kind: 'stay', title: 'Hotel A', locationName: 'Hotel A', start: at('2026-11-20'), end: at('2026-11-22') });
    const second = item({ id: 'b', kind: 'stay', title: 'Hotel B', locationName: 'Hotel B', start: at('2026-11-22'), end: at('2026-11-24') });
    const route = dayRoute([first, second, husky], '2026-11-22');
    expect(shape(route.stops)).toEqual([
      ['Hotel A', ['check-out:Hotel A']],
      ['Hotel B', ['check-in:Hotel B']],
    ]);
    expect(route.someTime).toEqual([]);
  });

  it('an overnight train: the departure on its day, the arrival on the next', () => {
    const train = item({
      kind: 'transport',
      subkind: 'train',
      title: 'Santa Claus Express',
      details: { from: 'Helsinki', to: 'Rovaniemi' },
      start: at('2026-11-19T19:00'),
      end: at('2026-11-20T08:00'),
    });
    expect(shape(dayRoute([train], '2026-11-19').stops)).toEqual([['Helsinki', ['departure:Santa Claus Express@19:00']]]);
    expect(shape(dayRoute([train], '2026-11-20').stops)).toEqual([['Rovaniemi', ['arrival:Santa Claus Express@08:00']]]);
  });

  describe('journeys are placed by their ends only (review P1)', () => {
    const withCoordinates = item({
      title: 'Flight with a saved pin',
      kind: 'transport',
      subkind: 'flight',
      details: { from: 'Sofia SOF', to: 'Helsinki HEL' },
      locationName: 'Somewhere',
      latitude: 60.3172,
      longitude: 24.9633,
      start: at('2026-11-20T06:10'),
      end: at('2026-11-20T09:05'),
    });

    it('a flight within the day: both ends are stops, neither takes the saved coordinates', () => {
      const stops = dayRoute([withCoordinates], '2026-11-20').stops;
      expect(stops.map((stop) => [stop.label, stop.coordinates, stop.place.latitude ?? null])).toEqual([
        ['Sofia SOF', null, null],
        ['Helsinki HEL', null, null],
      ]);
      // Nothing to draw: an unplaced end, never a pin at the wrong end.
      expect(schematicLayout(stops, 300, 200, 20).points).toEqual([]);
    });

    it('an overnight train with coordinates: unplaced on both days', () => {
      const train = { ...withCoordinates, id: 'night-train', details: { from: 'Helsinki', to: 'Rovaniemi' }, end: at('2026-11-21T08:00') };
      expect(dayRoute([train], '2026-11-20').stops.map((stop) => [stop.label, stop.coordinates])).toEqual([['Helsinki', null]]);
      expect(dayRoute([train], '2026-11-21').stops.map((stop) => [stop.label, stop.coordinates])).toEqual([['Rovaniemi', null]]);
    });

    it('the Google Maps link names the ends, not the saved coordinates', () => {
      const [link] = dayRouteLinks(dayRoute([withCoordinates], '2026-11-20').stops);
      const url = new URL(link.url!);
      expect(url.searchParams.get('origin')).toBe('Sofia SOF');
      expect(url.searchParams.get('destination')).toBe('Helsinki HEL');
    });
  });

  it('a day in one hotel only: wake and sleep there, two stops at one place', () => {
    const route = dayRoute([hotel], '2026-11-22');
    expect(shape(route.stops)).toEqual([['Arctic Snow Hotel', ['wake:Arctic Snow Hotel', 'sleep:Arctic Snow Hotel']]]);
  });

  it('a stay with no place is listed, never a stop', () => {
    const bare = item({ id: 'bare', kind: 'stay', title: 'Cabin', start: at('2026-11-20'), end: at('2026-11-23') });
    const route = dayRoute([bare], '2026-11-21');
    expect(route.stops).toEqual([]);
    expect(route.noPlace).toEqual([{ itemId: 'bare', title: 'Cabin', time: null }]);
  });

  it('keeps coordinates only when they are a valid pair, 0, 0 included', () => {
    const zero = item({ title: 'Null Island', locationName: 'Null Island', latitude: 0, longitude: 0, start: at('2026-11-21T10:00') });
    const half = item({ title: 'Half', locationName: 'Half', latitude: 10, longitude: null, start: at('2026-11-21T11:00') });
    const stops = dayRoute([zero, half], '2026-11-21').stops;
    expect(stops.map((stop) => stop.coordinates)).toEqual([{ latitude: 0, longitude: 0 }, null]);
  });

  it('lists the days that have anything to show', () => {
    expect(routeDays([hotel, flight], ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-24'])).toEqual([
      '2026-11-20',
      '2026-11-21',
    ]);
  });
});

describe('schematicLayout', () => {
  const stop = (label: string, latitude: number | null, longitude: number | null): RouteStop => ({
    key: label,
    label,
    place: { title: label, latitude, longitude },
    coordinates: latitude === null || longitude === null ? null : { latitude, longitude },
    plans: [],
  });

  it('fits the stops with coordinates, north up, numbers kept from the list', () => {
    const layout = schematicLayout(
      [stop('A', 60, 25), stop('No coords', null, null), stop('B', 61, 25), stop('C', 60, 27)],
      300,
      200,
      20,
    );
    expect(layout.points.map((p) => p.numbers)).toEqual([[1], [3], [4]]);
    const [a, b, c] = layout.points;
    expect(b.y).toBeLessThan(a.y); // north is up
    expect(c.x).toBeGreaterThan(a.x);
    for (const p of layout.points) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(280 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(180 + 1e-9);
    }
    // Stop 2 has no coordinates, so 1 and 3 are not joined; 3 and 4 are consecutive and are.
    expect(layout.segments).toEqual([[1, 2]]);
  });

  it('never joins two drawn stops across one without coordinates (review P2)', () => {
    const layout = schematicLayout([stop('Hotel', 66.6, 26), stop('Restaurant', null, null), stop('Museum', 66.5, 25.7)], 300, 300, 20);
    expect(layout.points.map((p) => p.numbers)).toEqual([[1], [3]]);
    expect(layout.segments).toEqual([]);
  });

  it('breaks the line at the gap and keeps the runs either side', () => {
    const layout = schematicLayout(
      [stop('A', 60, 25), stop('B', 60.1, 25), stop('Unknown', null, null), stop('C', 60.2, 25), stop('D', 60.3, 25)],
      300,
      300,
      20,
    );
    expect(layout.points.map((p) => p.numbers)).toEqual([[1], [2], [4], [5]]);
    expect(layout.segments).toEqual([[0, 1], [2, 3]]);
  });

  it('keeps proportions: a degree of longitude is shorter in the north', () => {
    const layout = schematicLayout([stop('A', 60, 24), stop('B', 61, 24), stop('C', 60, 26)], 1000, 1000, 0);
    const [a, b, c] = layout.points;
    const north = a.y - b.y; // 1 degree of latitude
    const east = c.x - a.x; // 2 degrees of longitude at about 60.3°N
    expect(east / north).toBeCloseTo(2 * Math.cos((60.333 * Math.PI) / 180), 2);
  });

  it('a place visited again is one point with both numbers; the path returns to it', () => {
    const layout = schematicLayout([stop('Hotel', 66.6, 26), stop('Safari', 66.5, 25.9), stop('Hotel', 66.6, 26)], 300, 300, 20);
    expect(layout.points.map((p) => p.numbers)).toEqual([[1, 3], [2]]);
    expect(layout.segments).toEqual([[0, 1, 0]]);
  });

  it('one place sits in the middle; none gives nothing', () => {
    expect(schematicLayout([stop('A', 10, 10)], 300, 200, 20).points).toEqual([{ numbers: [1], x: 150, y: 100 }]);
    expect(schematicLayout([stop('A', null, null)], 300, 200, 20)).toEqual({ points: [], segments: [] });
  });

  it('unwraps a span across the 180th meridian', () => {
    const layout = schematicLayout([stop('Fiji', -18, 179.5), stop('Samoa', -14, -171.8)], 300, 300, 0);
    const [fiji, samoa] = layout.points;
    expect(samoa.x).toBeGreaterThan(fiji.x); // east of Fiji, not across the world
  });
});

describe('dayRouteLinks', () => {
  const stops = (n: number, coords = true) =>
    Array.from({ length: n }, (_, i): RouteStop => ({
      key: String(i),
      label: `Stop ${i + 1}`,
      place: coords ? { title: `Stop ${i + 1}`, latitude: 60 + i / 100, longitude: 25 } : { title: `Stop ${i + 1}`, address: 'Rovaniemi' },
      coordinates: null,
      plans: [],
    }));

  it('one link through up to five stops, in order, with the mode', () => {
    const [link] = dayRouteLinks(stops(4), 'walking');
    const url = new URL(link.url!);
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('60,25');
    expect(url.searchParams.get('waypoints')).toBe('60.01,25|60.02,25');
    expect(url.searchParams.get('destination')).toBe('60.03,25');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    expect(link).toMatchObject({ from: 1, to: 4 });
  });

  it('a longer day in parts that share their joining stop, never more than three waypoints', () => {
    const links = dayRouteLinks(stops(11));
    expect(links.map(({ from, to }) => [from, to])).toEqual([[1, 5], [5, 9], [9, 11]]);
    for (const link of links) {
      const waypoints = new URL(link.url!).searchParams.get('waypoints');
      expect((waypoints?.split('|').length ?? 0)).toBeLessThanOrEqual(STOPS_PER_LINK - 2);
      expect(new URL(link.url!).searchParams.get('travelmode')).toBeNull();
    }
  });

  it('two stops are a plain A → B; one stop is a search; none is nothing', () => {
    const [two] = dayRouteLinks(stops(2, false));
    expect(new URL(two.url!).searchParams.get('origin')).toBe('Stop 1, Rovaniemi');
    expect(new URL(two.url!).searchParams.get('waypoints')).toBeNull();
    const [one] = dayRouteLinks(stops(1, false));
    expect(one.url).toBe('https://www.google.com/maps/search/?api=1&query=Stop%201%2C%20Rovaniemi');
    expect(dayRouteLinks([])).toEqual([]);
  });

  it('a part too long for Google Maps is not offered', () => {
    const long = stops(3, false).map((stop) => ({ ...stop, place: { title: 'x'.repeat(900) } }));
    expect(dayRouteLinks(long)[0].url).toBeNull();
  });
});
