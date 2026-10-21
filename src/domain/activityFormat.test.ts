import {
  ACTIVITY_LIMITS,
  activityFileName,
  activityFromItem,
  buildActivityExport,
  parseActivity,
  parseActivityFile,
  unwrapJsonText,
  type ActivityTrip,
  type ParsedActivity,
} from './activityFormat';
import { tripItemInputSchema, type TripItem } from './tripItem';

const trip: ActivityTrip = { defaultTz: 'Europe/Helsinki', startDate: '2026-11-20', endDate: '2026-11-24' };

const file = (activities: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'travel-organizer-activities', version: 1, activities, ...extra });

function one(activity: unknown): ParsedActivity {
  const result = parseActivityFile(file([activity]), trip);
  if (!result.ok) throw new Error(result.reason);
  return result.activities[0];
}

const refused = (text: string) => {
  const result = parseActivityFile(text, trip);
  return result.ok ? null : result.reason;
};

describe('parseActivityFile — the file as a whole', () => {
  it('reads a minimal file', () => {
    const result = parseActivityFile(file([{ title: 'Arktikum' }]), trip);
    expect(result.ok).toBe(true);
  });

  it('refuses what is not JSON, not this format, or not this version', () => {
    expect(refused('{"format": "travel-organizer-activities", "version": 1, "activities": [')).toMatch(/not valid JSON/);
    expect(refused('')).toMatch(/empty/);
    expect(refused('[]')).toMatch(/not a Travel Organizer activities file/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-trip', version: 1, activities: [] }))).toMatch(/not a Travel Organizer activities file/);
    expect(refused(JSON.stringify({ version: 1, activities: [{ title: 'x' }] }))).toMatch(/"format"/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: 2, activities: [{ title: 'x' }] }))).toMatch(/version 2, made for a newer version/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: '1', activities: [{ title: 'x' }] }))).toMatch(/must be the number 1/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: 0, activities: [{ title: 'x' }] }))).toMatch(/must be the number 1/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: 1.5, activities: [{ title: 'x' }] }))).toMatch(/must be the number 1/);
  });

  it('refuses a file without activities, with none, or with too many', () => {
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: 1 }))).toMatch(/no "activities" list/);
    expect(refused(JSON.stringify({ format: 'travel-organizer-activities', version: 1, activities: {} }))).toMatch(/no "activities" list/);
    expect(refused(file([]))).toMatch(/no activities in it/);
    const many = Array.from({ length: ACTIVITY_LIMITS.activities + 1 }, (_, i) => ({ title: `A${i}` }));
    expect(refused(file(many))).toMatch(/301 activities; at most 300/);
    expect(refused(file(many.slice(0, 300)))).toBeNull();
  });

  it('refuses a file over 1 MB before parsing it', () => {
    const big = file([{ title: 'x', notes: 'a'.repeat(3000) }]).padEnd(ACTIVITY_LIMITS.fileBytes + 1, ' ');
    expect(refused(big)).toMatch(/larger than 1 MB/);
  });

  it('counts the size in bytes, not characters', () => {
    // 'ä' is two bytes in UTF-8.
    const text = file([{ title: 'x' }]).padEnd(ACTIVITY_LIMITS.fileBytes / 2 + 10, ' ') + 'ä'.repeat(ACTIVITY_LIMITS.fileBytes / 2);
    expect(text.length).toBeLessThan(ACTIVITY_LIMITS.fileBytes + 20);
    expect(refused(text)).toMatch(/larger than 1 MB/);
  });

  it('refuses prototype keys anywhere and structures nested too deeply', () => {
    expect(refused('{"format":"travel-organizer-activities","version":1,"activities":[{"title":"x","__proto__":{"isPaid":true}}]}')).toMatch(/structure activity files never have/);
    expect(refused(file([{ title: 'x', location: { constructor: { prototype: 1 } } }]))).toMatch(/structure/);
    expect(refused(file([{ title: 'x', notes: { a: { b: { c: { d: 1 } } } } }]))).toMatch(/nested more deeply/);
    // The deepest the format itself goes passes.
    expect(refused(file([{ title: 'x', links: [{ url: 'https://example.com' }] }]))).toBeNull();
  });

  it('takes off a BOM and one Markdown code fence, and nothing else', () => {
    const body = file([{ title: 'Arktikum' }]);
    expect(unwrapJsonText(`﻿${body}`)).toBe(body);
    expect(unwrapJsonText('```json\n' + body + '\n```')).toBe(body);
    expect(unwrapJsonText('```\r\n' + body + '\r\n```\n')).toBe(body);
    expect(parseActivityFile('```json\n' + body + '\n```', trip).ok).toBe(true);
    expect(refused('Here you go:\n```json\n' + body + '\n```')).toMatch(/not valid JSON/);
  });

  it('reports top-level fields it does not read', () => {
    const result = parseActivityFile(file([{ title: 'x' }], { trip: { name: 'Lapland' }, generatedBy: 'ChatGPT' }), trip);
    expect(result.ok && result.ignored.map((f) => f.field)).toEqual(['trip', 'generatedBy']);
  });

  it('keeps going past an entry that is not an activity', () => {
    const result = parseActivityFile(file(['Husky safari', null, 3, [], { title: 'Arktikum' }]), trip);
    if (!result.ok) throw new Error(result.reason);
    expect(result.activities.map((a) => a.input !== null)).toEqual([false, false, false, false, true]);
    expect(result.activities[0].errors[0]).toMatch(/not an activity/);
    expect(result.activities[0].title).toBe('Activity 1');
  });
});

describe('parseActivity — fields', () => {
  it('maps a full activity to the input the form would produce', () => {
    const parsed = one({
      title: '  Husky safari ',
      kind: 'activity',
      type: 'tour',
      status: 'planned',
      date: '2026-11-21',
      startTime: '13:00',
      endTime: '16:00',
      location: { name: 'Bearhill Husky', address: 'Sierijärventie 55', latitude: 66.5, longitude: 25.7 },
      notes: 'Warm clothes provided',
      price: { amount: '290.00', currency: 'EUR' },
      links: [{ label: 'Website', url: 'https://example.com/husky' }],
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.ignored).toEqual([]);
    const formValues = {
      kind: 'activity',
      subkind: 'tour',
      status: 'confirmed',
      priority: null,
      title: 'Husky safari',
      start: { local: '2026-11-21T13:00' },
      end: { local: '2026-11-21T16:00' },
      locationName: 'Bearhill Husky',
      address: 'Sierijärventie 55',
      latitude: 66.5,
      longitude: 25.7,
      notes: 'Warm clothes provided',
      priceAmount: 29000,
      priceCurrency: 'EUR',
      isPaid: false,
    };
    expect(parsed.input).toEqual(tripItemInputSchema(trip.defaultTz).parse(formValues));
    expect(parsed.links).toEqual([{ label: 'Website', url: 'https://example.com/husky', subtype: 'website' }]);
  });

  it('defaults to an undated activity idea, unpaid, with nothing invented', () => {
    const { input } = one({ title: 'Arktikum' });
    expect(input).toEqual({
      kind: 'activity',
      subkind: null,
      status: 'idea',
      priority: null,
      title: 'Arktikum',
      isPaid: false,
    });
  });

  it('treats null as absent', () => {
    const parsed = one({ title: 'x', type: null, date: null, startTime: null, location: null, price: null, links: null, notes: null, priority: null, timeZone: null });
    expect(parsed.errors).toEqual([]);
    expect(parsed.input?.start).toBeUndefined();
  });

  it('needs a title', () => {
    expect(one({}).errors).toContain('It has no title.');
    expect(one({ title: '   ' }).errors).toContain('It has no title.');
    expect(one({ title: 7 }).errors).toContain('"title" must be text.');
    expect(one({ title: 'a'.repeat(121) }).errors[0]).toMatch(/longer than 120/);
    expect(one({ title: 'a'.repeat(121) }).title).toHaveLength(120);
  });

  describe('kind, type, status, priority', () => {
    it('takes the app’s kinds, never a to-do', () => {
      for (const kind of ['activity', 'food', 'stay', 'transport', 'other']) {
        expect(one({ title: 'x', kind }).input?.kind).toBe(kind);
      }
      expect(one({ title: 'x', kind: 'task' }).errors[0]).toMatch(/"kind" "task" is not supported/);
      expect(one({ title: 'x', kind: 'Activity' }).errors[0]).toMatch(/not supported/);
      expect(one({ title: 'x', kind: 'sightseeing' }).input).toBeNull();
    });

    it('drops a type that is not of its kind, saying so', () => {
      const parsed = one({ title: 'x', kind: 'food', type: 'museum' });
      expect(parsed.input?.subkind).toBeNull();
      expect(parsed.warnings[0]).toMatch(/"museum" is not a type of food/);
      expect(one({ title: 'x', kind: 'food', type: 'cafe' }).input?.subkind).toBe('cafe');
    });

    it('maps planned to confirmed and refuses any other status', () => {
      expect(one({ title: 'x', status: 'idea' }).input?.status).toBe('idea');
      expect(one({ title: 'x', status: 'planned' }).input?.status).toBe('confirmed');
      for (const status of ['booked', 'confirmed', 'cancelled', 'Planned', 'done']) {
        const parsed = one({ title: 'x', status });
        expect(parsed.input).toBeNull();
        expect(parsed.errors[0]).toBe(`"status" "${status}" is not supported — use idea or planned.`);
      }
    });

    it('keeps a priority on ideas only', () => {
      expect(one({ title: 'x', priority: 'must' }).input?.priority).toBe('must');
      const planned = one({ title: 'x', status: 'planned', priority: 'must' });
      expect(planned.input?.priority).toBeNull();
      expect(planned.warnings).toContain('Priority is for ideas only, so it is left out.');
      expect(one({ title: 'x', priority: 'urgent' }).warnings[0]).toMatch(/not must, want or maybe/);
    });
  });

  describe('dates and times', () => {
    it('builds date-only, timed and multi-day moments', () => {
      expect(one({ title: 'x', date: '2026-11-21' }).input?.start).toEqual({ local: '2026-11-21' });
      expect(one({ title: 'x', date: '2026-11-21', startTime: '09:05' }).input?.start).toEqual({ local: '2026-11-21T09:05' });
      const stay = one({ title: 'Hotel', kind: 'stay', date: '2026-11-20', startTime: '15:00', endDate: '2026-11-24', endTime: '11:00' });
      expect(stay.input?.end).toEqual({ local: '2026-11-24T11:00' });
      expect(one({ title: 'x', date: '2026-11-20', endDate: '2026-11-22' }).input?.end).toEqual({ local: '2026-11-22' });
      // An end on the same day with no time says nothing.
      expect(one({ title: 'x', date: '2026-11-20', endDate: '2026-11-20' }).input?.end).toBeUndefined();
    });

    it('refuses dates that are not on the calendar and times that are not times', () => {
      expect(one({ title: 'x', date: '2026-02-30' }).errors[0]).toMatch(/"date" "2026-02-30" is not a real date/);
      expect(one({ title: 'x', date: '21/11/2026' }).input).toBeNull();
      expect(one({ title: 'x', date: '2026-11-21T13:00' }).input).toBeNull();
      expect(one({ title: 'x', date: 20261121 }).errors[0]).toBe('"date" must be text.');
      for (const time of ['25:00', '9:00', '13:60', '13:00:00', '1pm']) {
        expect(one({ title: 'x', date: '2026-11-21', startTime: time }).errors[0]).toMatch(/is not a time/);
      }
    });

    it('needs a date for any time or end', () => {
      expect(one({ title: 'x', startTime: '13:00' }).errors).toContain('"startTime" needs a "date".');
      expect(one({ title: 'x', endTime: '13:00' }).errors).toContain('"endTime" needs a "date".');
      expect(one({ title: 'x', endDate: '2026-11-21' }).errors).toContain('"endDate" needs a "date".');
    });

    it('refuses an end before its start, as the form does', () => {
      const parsed = one({ title: 'x', date: '2026-11-21', startTime: '16:00', endTime: '13:00' });
      expect(parsed.input).toBeNull();
      expect(parsed.errors).toContain('It cannot end before it starts');
      expect(one({ title: 'x', date: '2026-11-22', endDate: '2026-11-21' }).input).toBeNull();
    });

    it('takes IANA zones only; the end follows the start’s zone unless it has its own', () => {
      const flight = one({
        title: 'AY531', kind: 'transport', type: 'flight', status: 'planned',
        date: '2026-11-20', startTime: '07:10', endTime: '10:40',
        timeZone: 'Europe/Sofia', endTimeZone: 'Europe/Helsinki',
      });
      expect(flight.input?.start).toEqual({ local: '2026-11-20T07:10', tz: 'Europe/Sofia' });
      expect(flight.input?.end).toEqual({ local: '2026-11-20T10:40', tz: 'Europe/Helsinki' });
      const same = one({ title: 'x', date: '2026-11-20', startTime: '07:10', endTime: '10:40', timeZone: 'Europe/Sofia' });
      expect(same.input?.end).toEqual({ local: '2026-11-20T10:40', tz: 'Europe/Sofia' });
      for (const tz of ['+02:00', 'GMT+2', 'Helsinki', 'Europe/Nowhere', 'EET']) {
        expect(one({ title: 'x', date: '2026-11-20', timeZone: tz }).errors[0]).toMatch(/is not a time zone/);
      }
      expect(one({ title: 'x', date: '2026-11-20', timeZone: 'UTC' }).input?.start?.tz).toBe('UTC');
    });

    it('warns about a zone with nothing to apply to', () => {
      expect(one({ title: 'x', timeZone: 'Europe/Sofia' }).warnings[0]).toMatch(/time zone without a date/);
      expect(one({ title: 'x', date: '2026-11-20', endTimeZone: 'Europe/Sofia' }).warnings[0]).toMatch(/endTimeZone/);
    });

    it('flags dates outside the trip but imports them (D8)', () => {
      const parsed = one({ title: 'Book the safari', date: '2026-10-01' });
      expect(parsed.input).not.toBeNull();
      expect(parsed.warnings[0]).toMatch(/outside this trip’s dates/);
      expect(one({ title: 'x', date: '2026-11-24' }).warnings).toEqual([]);
      // A stay that ends inside the trip is not outside it.
      expect(one({ title: 'x', date: '2026-11-18', endDate: '2026-11-21' }).warnings).toEqual([]);
    });

    it('says where a planned activity without a date goes', () => {
      expect(one({ title: 'x', status: 'planned' }).warnings).toEqual([
        'Planned without a date — it goes under “No date yet” on the Timeline.',
      ]);
    });
  });

  describe('location', () => {
    it('needs both coordinates or neither, in range', () => {
      expect(one({ title: 'x', location: { latitude: 66.5 } }).errors).toContain('A location needs both latitude and longitude, or neither.');
      expect(one({ title: 'x', location: { latitude: 91, longitude: 0 } }).errors[0]).toMatch(/out of range/);
      expect(one({ title: 'x', location: { latitude: 0, longitude: -181 } }).errors[0]).toMatch(/out of range/);
      expect(one({ title: 'x', location: { latitude: '66.5', longitude: '25.7' } }).errors[0]).toBe('"location.latitude" must be a number.');
      expect(one({ title: 'x', location: { latitude: -90, longitude: 180 } }).input?.latitude).toBe(-90);
      expect(one({ title: 'x', location: 'Rovaniemi' }).errors[0]).toBe('"location" must be an object.');
      expect(one({ title: 'x', location: ['Rovaniemi'] }).errors[0]).toBe('"location" must be an object.');
    });

    it('enforces the text limits', () => {
      expect(one({ title: 'x', location: { name: 'a'.repeat(121) } }).input).toBeNull();
      expect(one({ title: 'x', location: { address: 'a'.repeat(241) } }).input).toBeNull();
      expect(one({ title: 'x', location: { address: 'a'.repeat(240) } }).input?.address).toHaveLength(240);
    });
  });

  describe('notes and description', () => {
    it('stores a description in the notes, before them', () => {
      expect(one({ title: 'x', description: 'Lappish food.', notes: 'Book ahead.' }).input?.notes).toBe('Lappish food.\n\nBook ahead.');
      expect(one({ title: 'x', description: 'Lappish food.' }).input?.notes).toBe('Lappish food.');
      expect(one({ title: 'x', notes: 'a'.repeat(4001) }).input).toBeNull();
    });

    it('keeps text as text: markup and SQL are just characters', () => {
      const notes = `<script>alert(1)</script>'); DROP TABLE trip_items; --`;
      expect(one({ title: 'x', notes }).input?.notes).toBe(notes);
    });
  });

  describe('price', () => {
    it('reads amounts as minor units without guessing', () => {
      const amount = (value: unknown) => one({ title: 'x', price: { amount: value, currency: 'EUR' } });
      expect(amount('290.00').input?.priceAmount).toBe(29000);
      expect(amount('12,50').input?.priceAmount).toBe(1250);
      expect(amount('1,234.50').input?.priceAmount).toBe(123450);
      expect(amount(290).input?.priceAmount).toBe(29000);
      expect(amount(12.5).input?.priceAmount).toBe(1250);
      expect(amount(0.1).input?.priceAmount).toBe(10);
      expect(amount(0).input?.priceAmount).toBe(0);
      for (const bad of ['12.345', '-5', '1.234', 'about 20', '', 12.345, -5, 1e21, Number.NaN, true, {}]) {
        expect(amount(bad).input).toBeNull();
      }
    });

    it('needs an amount and a currency code', () => {
      expect(one({ title: 'x', price: { currency: 'EUR' } }).errors).toContain('"price" needs an "amount".');
      expect(one({ title: 'x', price: { amount: 5 } }).errors).toContain('"price" needs a "currency", like EUR.');
      for (const currency of ['eur', 'EURO', '€', 'E1R', 978]) {
        expect(one({ title: 'x', price: { amount: 5, currency } }).input).toBeNull();
      }
      const unknown = one({ title: 'x', price: { amount: 5, currency: 'ABC' } });
      expect(unknown.input?.priceCurrency).toBe('ABC');
      expect(unknown.warnings[0]).toMatch(/ABC is not a currency code we know/);
    });

    it('never marks anything paid, and reports per-person prices instead of storing them', () => {
      const parsed = one({
        title: 'x',
        status: 'planned',
        isPaid: true,
        paid: true,
        price: { amount: '290', currency: 'EUR', perPerson: { adult: 120, child: 50 }, adult: 120, note: 'est.' },
      });
      expect(parsed.input?.isPaid).toBe(false);
      expect(parsed.input?.priceAmount).toBe(29000);
      expect(parsed.input?.details).toBeUndefined();
      expect(parsed.ignored).toEqual([
        { field: 'isPaid', reason: 'Paid status is never imported' },
        { field: 'paid', reason: 'Paid status is never imported' },
        { field: 'price.perPerson', reason: 'Per-person prices are not imported yet — only the total' },
        { field: 'price.adult', reason: 'Per-person prices are not imported yet — only the total' },
        { field: 'price.note', reason: 'Not part of the price — only amount and currency' },
      ]);
    });
  });

  describe('links', () => {
    it('takes http and https links only', () => {
      for (const url of ['javascript:alert(1)', 'file:///sdcard/x.pdf', 'geo:66.5,25.7', 'mailto:a@b.c', 'intent://x', 'ftp://x', 'example.com', 'https:// spaced.com']) {
        expect(one({ title: 'x', links: [{ url }] }).input).toBeNull();
      }
      const ok = one({ title: 'x', links: [{ url: 'https://www.google.com/maps/place/Arktikum' }, { url: 'http://example.com/a' }] });
      expect(ok.links).toEqual([
        { url: 'https://www.google.com/maps/place/Arktikum', label: 'google.com', subtype: 'maps' },
        { url: 'http://example.com/a', label: 'example.com', subtype: 'website' },
      ]);
    });

    it('limits how many and how long, and wants objects', () => {
      const links = Array.from({ length: 11 }, () => ({ url: 'https://example.com' }));
      expect(one({ title: 'x', links }).errors[0]).toMatch(/At most 10 links/);
      expect(one({ title: 'x', links: [{ url: `https://example.com/${'a'.repeat(2048)}` }] }).input).toBeNull();
      expect(one({ title: 'x', links: ['https://example.com'] }).errors[0]).toMatch(/must be an object/);
      expect(one({ title: 'x', links: 'https://example.com' }).errors[0]).toBe('"links" must be a list.');
      expect(one({ title: 'x', links: [{ label: 'Site' }] }).errors[0]).toMatch(/has no "url"/);
    });
  });

  describe('transport', () => {
    it('keeps a route on travel and nothing else', () => {
      const parsed = one({ title: 'AY531', kind: 'transport', transport: { from: 'HEL', to: 'RVN', carrier: 'Finnair', number: 'AY531', seat: '12A' } });
      expect(parsed.input?.details).toEqual({ from: 'HEL', to: 'RVN', carrier: 'Finnair', number: 'AY531' });
      expect(parsed.ignored).toEqual([{ field: 'transport.seat', reason: 'Seats are not imported' }]);
      const notTravel = one({ title: 'x', transport: { from: 'A' } });
      expect(notTravel.input?.details).toBeUndefined();
      expect(notTravel.warnings[0]).toMatch(/only for kind transport/);
    });
  });

  it('never reads ids, references, people, files or app state from a file', () => {
    const parsed = one({
      title: 'x',
      id: 'abc',
      tripId: 'other-trip',
      trip_id: 'other-trip',
      confirmationCode: 'ABC123',
      bookingReference: 'ABC123',
      participants: ['me'],
      travellers: ['Mia'],
      attachments: [{ path: '/sdcard/x' }],
      createdAt: '2020-01-01',
      completedAt: '2020-01-01',
      reminder: 'off',
      me: true,
      start_utc: 'x',
    });
    expect(parsed.input).toEqual({ kind: 'activity', subkind: null, status: 'idea', priority: null, title: 'x', isPaid: false });
    expect(Object.fromEntries(parsed.ignored.map((f) => [f.field, f.reason]))).toEqual({
      id: 'Ids are made by the app',
      tripId: 'Ids are made by the app',
      trip_id: 'Ids are made by the app',
      confirmationCode: 'Booking references are not imported',
      bookingReference: 'Booking references are not imported',
      participants: 'Who is going is not imported',
      travellers: 'Who is going is not imported',
      attachments: 'Files are not imported',
      createdAt: 'Set by the app',
      completedAt: 'Set by the app',
      reminder: 'Reminders follow the app’s own rules',
      me: 'Not part of the format',
      start_utc: 'Not part of the format',
    });
  });

  it('collects every problem of an activity at once', () => {
    const parsed = one({ title: 'x', status: 'booked', date: '2026-13-01', price: { amount: '-1', currency: 'eur' } });
    expect(parsed.errors).toHaveLength(4);
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────────────────────────

function item(extra: Partial<TripItem>): TripItem {
  return {
    id: 'i1',
    tripId: 'lap',
    kind: 'activity',
    subkind: null,
    status: 'idea',
    priority: null,
    title: 'Arktikum',
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
    isPaid: false, recordedPaid: 0,
    createdAt: '2026-10-19T09:00:00.000Z',
    updatedAt: '2026-10-19T09:00:00.000Z',
    ...extra,
  };
}

describe('activityFromItem', () => {
  it('writes only the format’s fields, never private ones', () => {
    const activity = activityFromItem(
      item({
        status: 'confirmed',
        kind: 'transport',
        subkind: 'flight',
        title: 'Flight to Rovaniemi',
        start: { local: '2026-11-20T07:10', tz: 'Europe/Sofia', precision: 'time' },
        end: { local: '2026-11-20T10:40', tz: 'Europe/Helsinki', precision: 'time' },
        startTzOverride: 'Europe/Sofia',
        endTzOverride: 'Europe/Helsinki',
        confirmationCode: 'ABC123',
        isPaid: true,
        priceAmount: 18000,
        priceCurrency: 'EUR',
        notes: 'Window seat',
        details: { from: 'SOF', to: 'RVN', carrier: 'Finnair', number: 'AY1', seat: '12A', journeyId: 'j1', reminder: 'off', refundable: false, pricing: { lines: [] } },
        completedAt: null,
      }),
      [
        { label: 'Finnair', url: 'https://finnair.com', subtype: 'website' },
        { label: 'Boarding pass', url: 'https://pay.google.com/x', subtype: 'wallet' },
        { label: 'Booking', url: 'https://finnair.com/manage?token=secret', subtype: 'confirmation' },
        { label: 'E-ticket', url: 'https://x.com/t', subtype: 'ticket' },
        { label: 'Pin', url: 'geo:66,25', subtype: 'maps' },
      ],
      'Europe/Helsinki',
    );
    expect(activity).toEqual({
      title: 'Flight to Rovaniemi',
      kind: 'transport',
      type: 'flight',
      status: 'planned',
      date: '2026-11-20',
      startTime: '07:10',
      endTime: '10:40',
      timeZone: 'Europe/Sofia',
      endTimeZone: 'Europe/Helsinki',
      notes: 'Window seat',
      price: { amount: '180', currency: 'EUR' },
      links: [{ label: 'Finnair', url: 'https://finnair.com' }],
      transport: { from: 'SOF', to: 'RVN', carrier: 'Finnair', number: 'AY1' },
    });
    const text = JSON.stringify(activity);
    for (const secret of ['ABC123', '12A', 'j1', 'secret', 'pay.google', 'isPaid', 'i1', 'lap']) {
      expect(text).not.toContain(secret);
    }
  });

  it('writes an end zone that follows the trip as the zone it resolves to', () => {
    const activity = activityFromItem(
      item({
        start: { local: '2026-11-20T07:10', tz: 'Europe/Sofia', precision: 'time' },
        end: { local: '2026-11-20T10:40', tz: 'Europe/Helsinki', precision: 'time' },
        startTzOverride: 'Europe/Sofia',
        endTzOverride: null,
      }),
      [],
      'Europe/Helsinki',
    );
    expect(activity.endTimeZone).toBe('Europe/Helsinki');
  });
});

describe('buildActivityExport', () => {
  const items = [
    item({ id: 'a', title: 'Arktikum', priority: 'must', locationName: 'Arktikum', latitude: 66.5, longitude: 25.7 }),
    item({ id: 'b', title: 'Pack', kind: 'task' }),
    item({ id: 'c', title: 'Old dinner', status: 'cancelled', kind: 'food' }),
    item({ id: 'd', title: 'Too long', notes: 'a'.repeat(4001) }),
    item({ id: 'e', title: 'Safari', status: 'confirmed', start: { local: '2026-11-21', tz: 'Europe/Helsinki', precision: 'date' } }),
  ];
  const links = new Map([['a', [{ label: 'Pass', url: 'https://pay.google.com/x', subtype: 'wallet' as const }, { label: 'Site', url: 'https://arktikum.fi', subtype: 'website' as const }]]]);

  it('leaves out to-dos, cancelled plans and anything that would not import again, saying why', () => {
    const built = buildActivityExport(items, links, trip);
    expect(built.document.format).toBe('travel-organizer-activities');
    expect(built.document.version).toBe(1);
    expect(built.document.activities.map((a) => a.title)).toEqual(['Arktikum', 'Safari']);
    expect(built.excluded).toEqual([
      { id: 'b', title: 'Pack', reason: 'To-dos are not part of the activities format' },
      { id: 'c', title: 'Old dinner', reason: 'Cancelled — the format cannot say so' },
      { id: 'd', title: 'Too long', reason: '"notes" is longer than 4000 characters.' },
    ]);
    expect(built.skippedLinks).toBe(1);
  });

  it('writes a file the importer reads back with nothing lost and nothing to warn about', () => {
    const built = buildActivityExport(items, links, trip);
    const result = parseActivityFile(JSON.stringify(built.document), trip);
    if (!result.ok) throw new Error(result.reason);
    expect(result.ignored).toEqual([]);
    for (const activity of result.activities) {
      expect(activity.errors).toEqual([]);
      expect(activity.ignored).toEqual([]);
    }
    expect(result.activities[0].input).toMatchObject({ title: 'Arktikum', priority: 'must', latitude: 66.5, longitude: 25.7, status: 'idea' });
    expect(result.activities[0].links).toEqual([{ label: 'Site', url: 'https://arktikum.fi', subtype: 'website' }]);
    expect(result.activities[1].input).toMatchObject({ title: 'Safari', status: 'confirmed', start: { local: '2026-11-21' } });
  });
});

describe('activityFileName', () => {
  it('is filename-safe', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(activityFileName('Lapland, Finland', now)).toBe('Lapland-Finland-activities-2026-10-19.json');
    expect(activityFileName('Mélník / Praha', now)).toBe('Melnik-Praha-activities-2026-10-19.json');
    expect(activityFileName('???', now)).toBe('trip-activities-2026-10-19.json');
  });
});

describe('parseActivity directly', () => {
  it('is the same check the file applies to each entry', () => {
    expect(parseActivity({ title: 'x' }, 4, trip).index).toBe(4);
  });
});
