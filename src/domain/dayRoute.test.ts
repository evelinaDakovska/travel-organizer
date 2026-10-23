import { addDays, dayRoute, dayRouteLinks, routeDays, schematicLayout, STOPS_PER_LINK, type RouteStop } from './dayRoute';
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

  it('arrival day: no start base; a flight gives its departure and arrival; the timed check-in is in order', () => {
    const route = dayRoute([hotel, flight], '2026-11-20');
    expect(shape(route.stops)).toEqual([
      ['Helsinki HEL', ['departure:Flight to Rovaniemi@10:30']],
      ['Rovaniemi RVN', ['arrival:Flight to Rovaniemi@11:45']],
      ['Arctic Snow Hotel', ['check-in:Arctic Snow Hotel@15:00']],
    ]);
  });

  it('check-out day: the timed check-out is in order, and no night follows', () => {
    const route = dayRoute([hotel, husky], '2026-11-23');
    expect(shape(route.stops)).toEqual([['Arctic Snow Hotel', ['check-out:Arctic Snow Hotel@11:00']]]);
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
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
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
    expect(layout.path).toEqual([0, 1, 2]);
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
    expect(layout.path).toEqual([0, 1, 0]);
  });

  it('one place sits in the middle; none gives nothing', () => {
    expect(schematicLayout([stop('A', 10, 10)], 300, 200, 20).points).toEqual([{ numbers: [1], x: 150, y: 100 }]);
    expect(schematicLayout([stop('A', null, null)], 300, 200, 20)).toEqual({ points: [], path: [] });
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
