import ICAL from 'ical.js';

import {
  buildIcs,
  calendarEvents,
  DEFAULT_ICS_OPTIONS,
  escapeText,
  foldLine,
  icsFileName,
  isCalendarItem,
  offsetTransitions,
} from './ics';
import { toInstant, type LocalMoment } from './time';
import type { TripItem } from './tripItem';

const at = (local: string, tz = 'Europe/Helsinki'): LocalMoment => ({
  local,
  tz,
  precision: local.length > 10 ? 'time' : 'date',
});

let n = 0;
function item(over: Partial<TripItem>): TripItem {
  return {
    id: `i${++n}`,
    tripId: 't',
    kind: 'activity',
    subkind: null,
    status: 'confirmed',
    priority: null,
    title: 'Something',
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
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-20T09:00:00.000Z',
    ...over,
  };
}

const flight = item({
  id: 'flight',
  kind: 'transport',
  subkind: 'flight',
  title: 'Flight to Helsinki',
  details: { from: 'Sofia', to: 'Helsinki' },
  start: at('2026-11-20T06:10', 'Europe/Sofia'),
  end: at('2026-11-20T09:05', 'Europe/Helsinki'),
  confirmationCode: 'ABC123',
  locationName: 'Gate 4',
});
const hotel = item({
  id: 'hotel',
  kind: 'stay',
  title: 'Arctic Snow Hotel',
  locationName: 'Arctic Snow Hotel',
  address: 'Lehtoahontie 27, Rovaniemi',
  latitude: 66.6,
  longitude: 26.0,
  start: at('2026-11-20T15:00'),
  end: at('2026-11-24T11:00'),
  notes: 'Door code 4711',
});
const husky = item({ id: 'husky', title: 'Husky safari; long, fun', start: at('2026-11-21T10:00'), end: at('2026-11-21T13:00') });
const market = item({ id: 'market', title: 'Christmas market', start: at('2026-11-22'), end: at('2026-11-23') });
const aurora = item({ id: 'aurora', title: 'Aurora watch', start: at('2026-11-22T21:30') });

const NOW = new Date(Date.UTC(2026, 9, 23, 9, 0, 0));

/** Parse with Mozilla's RFC 5545 parser, its timezones registered from the file itself. */
function parse(text: string) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const zone of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(zone);
  }
  return calendar;
}
const events = (calendar: ICAL.Component) => calendar.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c));

afterEach(() => ICAL.TimezoneService.reset());

describe('which items become events (P8-2, P8-3)', () => {
  it('leaves out to-dos, cancelled and undated items', () => {
    expect(isCalendarItem(item({ kind: 'task', start: at('2026-11-20') }))).toBe(false);
    expect(isCalendarItem(item({ status: 'cancelled', start: at('2026-11-20') }))).toBe(false);
    expect(isCalendarItem(item({ start: null }))).toBe(false);
    expect(isCalendarItem(item({ status: 'idea', start: at('2026-11-20') }))).toBe(true);
  });

  it('a stay is a check-in and a check-out; a flight is one event across zones; in time order', () => {
    const list = calendarEvents([aurora, hotel, husky, flight, market]);
    expect(list.map((e) => [e.summary, e.start.local, e.end?.local ?? null])).toEqual([
      ['Flight to Helsinki', '2026-11-20T06:10', '2026-11-20T09:05'],
      ['Check in · Arctic Snow Hotel', '2026-11-20T15:00', null],
      ['Husky safari; long, fun', '2026-11-21T10:00', '2026-11-21T13:00'],
      ['Christmas market', '2026-11-22', '2026-11-23'],
      ['Aurora watch', '2026-11-22T21:30', null],
      ['Check out · Arctic Snow Hotel', '2026-11-24T11:00', null],
    ]);
  });

  it('a car rental is a pick-up and a drop-off; a same-day stay is one event', () => {
    const car = item({ kind: 'transport', subkind: 'car', title: 'Car', start: at('2026-11-21T09:00'), end: at('2026-11-23T18:00') });
    const dayUse = item({ kind: 'stay', title: 'Day room', start: at('2026-11-21T09:00'), end: at('2026-11-21T17:00') });
    expect(calendarEvents([car, dayUse]).map((e) => e.summary)).toEqual(['Car', 'Day room', 'Car'].map((t, i) =>
      i === 0 ? 'Pick up · Car' : i === 2 ? 'Drop off · Car' : t,
    ));
  });

  it('gives stable UIDs per plan and end, and a SEQUENCE that grows with edits (P8-5)', () => {
    const [checkIn] = calendarEvents([hotel]);
    expect(checkIn.uid).toBe('hotel-start@travel-organizer.app');
    expect(calendarEvents([flight])[0].uid).toBe('flight@travel-organizer.app');
    const later = calendarEvents([{ ...flight, updatedAt: '2026-10-21T09:00:00.000Z' }])[0];
    expect(later.uid).toBe('flight@travel-organizer.app');
    expect(later.sequence).toBeGreaterThan(calendarEvents([flight])[0].sequence);
  });
});

describe('privacy (P8-6)', () => {
  it('by default: title, the journey route, the place and coordinates; no reference, notes, people or links', () => {
    const text = buildIcs(
      calendarEvents([flight, hotel], DEFAULT_ICS_OPTIONS, {
        people: new Map([['hotel', ['Evelina']]]),
        links: new Map([['hotel', ['https://example.com/booking/secret']]]),
      }),
      'Lapland',
      NOW,
    );
    expect(text).toContain('LOCATION:Sofia → Helsinki');
    expect(text).toContain('LOCATION:Arctic Snow Hotel\\, Lehtoahontie 27\\, Rovaniemi');
    expect(text).toContain('GEO:66.6;26');
    for (const secret of ['ABC123', 'Door code', 'Evelina', 'example.com', 'Gate 4']) {
      expect([secret, text.includes(secret)]).toEqual([secret, false]);
    }
  });

  it('each option adds only its own part', () => {
    const extras = { people: new Map([['hotel', ['Evelina', 'Ana']]]), links: new Map([['hotel', ['https://example.com/b']]]) };
    const all = calendarEvents([hotel], { places: false, notes: true, references: true, people: true, links: true }, extras);
    expect(all[0].description).toBe('Who: Evelina, Ana\nDoor code 4711\nhttps://example.com/b');
    expect(all[0].location).toBeNull();
    expect(all[0].geo).toBeNull();
    expect(calendarEvents([flight], { ...DEFAULT_ICS_OPTIONS, references: true })[0].description).toBe('Booking reference: ABC123');
  });
});

describe('RFC 5545 text (P8-7)', () => {
  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('folds at 75 octets without splitting a multi-byte character', () => {
    const line = `SUMMARY:${'Лапландия '.repeat(12)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('uses CRLF throughout and the required calendar properties', () => {
    const text = buildIcs(calendarEvents([husky]), 'Lapland', NOW);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTAMP:20261023T090000Z');
  });

  it('names the file safely', () => {
    expect(icsFileName('Лапландия 2026 / Rovaniemi')).toBe('2026-Rovaniemi-calendar.ics');
    expect(icsFileName('Lapland')).toBe('Lapland-calendar.ics');
  });
});

describe('zones (P8-4)', () => {
  it('finds each DST change to the minute', () => {
    const changes = offsetTransitions('Europe/Sofia', Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
    expect(changes.map((c) => [new Date(c.at).toISOString(), c.from, c.to])).toEqual([
      ['2026-03-29T01:00:00.000Z', 120, 180],
      ['2026-10-25T01:00:00.000Z', 180, 120],
    ]);
    expect(offsetTransitions('Asia/Tokyo', Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1))).toEqual([]);
  });
});

describe('the standards check: Mozilla ical.js reads every file back to the same instants', () => {
  const instant = (time: ICAL.Time) => time.toJSDate().toISOString();

  it('every event, every zone, the overnight flight between zones', () => {
    const night = item({
      id: 'night',
      kind: 'transport',
      subkind: 'flight',
      title: 'Night flight',
      start: at('2026-11-24T22:40', 'Europe/Helsinki'),
      end: at('2026-11-25T06:15', 'America/New_York'),
    });
    const list = calendarEvents([flight, hotel, husky, aurora, night]);
    const parsed = events(parse(buildIcs(list, 'Lapland', NOW)));
    expect(parsed).toHaveLength(list.length);
    parsed.forEach((event, i) => {
      expect(event.uid).toBe(list[i].uid);
      // Read in our VTIMEZONE, not as floating time: the zone it resolved is the one we wrote.
      expect(event.startDate.zone.tzid).toBe(list[i].start.tz);
      expect(event.summary).toBe(list[i].summary);
      expect(instant(event.startDate)).toBe(toInstant(list[i].start));
      if (list[i].end) expect(instant(event.endDate)).toBe(toInstant(list[i].end!));
    });
  });

  it('across a DST change, in a half-hour zone, and in the southern hemisphere', () => {
    const cases = [
      item({ title: 'Before', start: at('2026-03-28T12:00', 'Europe/Sofia') }),
      item({ title: 'After', start: at('2026-03-29T12:00', 'Europe/Sofia') }),
      item({ title: 'Autumn night', start: at('2026-10-25T05:30', 'Europe/Sofia') }),
      item({ title: 'Lord Howe', start: at('2026-10-04T12:00', 'Australia/Lord_Howe'), end: at('2026-10-05T12:00', 'Australia/Lord_Howe') }),
      item({ title: 'Adelaide', start: at('2026-01-10T09:15', 'Australia/Adelaide') }),
      item({ title: 'Kathmandu', start: at('2027-02-01T08:00', 'Asia/Kathmandu') }),
    ];
    const list = calendarEvents(cases);
    const parsed = events(parse(buildIcs(list, 'Zones', NOW)));
    parsed.forEach((event, i) => {
      expect([event.summary, instant(event.startDate)]).toEqual([list[i].summary, toInstant(list[i].start)]);
      if (list[i].end) expect(instant(event.endDate)).toBe(toInstant(list[i].end!));
    });
  });

  it('all-day events: no time, and DTEND the day after the last day', () => {
    const parsed = events(parse(buildIcs(calendarEvents([market, item({ title: 'One day', start: at('2026-11-21') })]), 'L', NOW)));
    const [one, two] = parsed;
    expect([one.summary, one.startDate.isDate, one.startDate.toString(), one.endDate.toString()]).toEqual([
      'One day',
      true,
      '2026-11-21',
      '2026-11-22',
    ]);
    expect([two.summary, two.startDate.toString(), two.endDate.toString()]).toEqual(['Christmas market', '2026-11-22', '2026-11-24']);
  });

  it('a timed plan with no end has no invented end', () => {
    const text = buildIcs(calendarEvents([aurora]), 'L', NOW);
    expect(text).not.toContain('DTEND');
    expect(text).not.toContain('DURATION');
  });

  it('text survives the round trip: escapes, Unicode, line breaks, folding', () => {
    const odd = item({
      title: 'Лапландия; “quotes”, back\\slash and a very long title that must be folded across several lines 🦌',
      notes: 'Line one\nLine two, with a comma; and a semicolon',
      start: at('2026-11-21T10:00'),
    });
    const [event] = events(parse(buildIcs(calendarEvents([odd], { ...DEFAULT_ICS_OPTIONS, notes: true }), 'Лапландия', NOW)));
    expect(event.summary).toBe(odd.title);
    expect(event.description).toBe(odd.notes);
  });

  it('an empty export is still a valid calendar', () => {
    const calendar = parse(buildIcs([], 'Empty', NOW));
    expect(events(calendar)).toEqual([]);
  });
});
