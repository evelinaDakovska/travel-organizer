import { parseActivityFile } from './activityFormat';
import {
  ACTIVITIES_FORMAT_BLOCK,
  buildPlanningContext,
  DEFAULT_PLANNING_OPTIONS,
  PLANNING_INTENTIONS,
  planningInputOf,
  planningItemOf,
  requestText,
  scrubPlanningText,
  type PlanningOptions,
} from './planningContext';
import type { LocalMoment } from './time';
import type { TravellerClassification } from './traveller';
import type { TripItem } from './tripItem';

const TZ = 'Europe/Helsinki';
const trip = { name: 'Lapland 2026', destination: 'Rovaniemi, Finland', startDate: '2026-11-20', endDate: '2026-11-24', defaultTz: TZ };
const at = (local: string, tz = TZ): LocalMoment => ({ local, tz, precision: local.length > 10 ? 'time' : 'date' });

let n = 0;
function item(extra: Partial<TripItem>): TripItem {
  return {
    id: `item-${++n}`,
    tripId: 'lap',
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
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...extra,
  };
}

const ALL_ON: PlanningOptions = { ...DEFAULT_PLANNING_OPTIONS, ideas: true, stays: true, travellers: true };
const SWITCHES: PlanningOptions[] = [false, true].flatMap((ideas) =>
  [false, true].flatMap((stays) =>
    [false, true].map((travellers) => ({ ...DEFAULT_PLANNING_OPTIONS, ideas, stays, travellers })),
  ),
);

function context(items: TripItem[], options: PlanningOptions = DEFAULT_PLANNING_OPTIONS, travellers: TravellerClassification[] = []) {
  return buildPlanningContext(planningInputOf(trip, items, travellers), options);
}

// ─── Privacy ─────────────────────────────────────────────────────────────────────────────────────

const FAKES = {
  booking: 'ZX9QW7',
  bookingTwo: 'HOTEL-RES-55821',
  email: 'mia.private@example.com',
  phone: '+359 88 765 4321',
  passport: 'P<BGRIVANOVA<<MIA<<<<<<<<<<<<<<<<<<<<<<<<<<',
  passportNo: '381234567',
  card: '4111 1111 1111 1111',
  iban: 'BG80BNBG96611020345678',
  walletUrl: 'https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiJ9.SECRET',
  signedUrl: 'https://bookings.example.com/manage?token=abc123SIGNED&sig=deadbeef',
  note: 'Door code 4417, key under the mat',
  address: 'Kauppakatu 12 B 7, 96100 Rovaniemi',
  receipt: 'receipt-k-market.jpg',
  traveller: 'Evelina Secretova',
  carrier: 'SecretAir',
  flightNo: 'SA777',
  seat: '14C',
};

/** Every excluded field of every kind of item holds a fake; titles and place names are clean. */
function privateTrip(): TripItem[] {
  const leaky = {
    confirmationCode: FAKES.booking,
    notes: `${FAKES.note} ${FAKES.email} ${FAKES.phone} ${FAKES.passport} ${FAKES.card} ${FAKES.iban}`,
    address: FAKES.address,
    latitude: 66.5,
    longitude: 25.7,
    priceAmount: 123456,
    priceCurrency: 'EUR',
    isPaid: true,
  };
  return [
    item({ ...leaky, kind: 'transport', subkind: 'flight', title: 'Flight to Rovaniemi', start: at('2026-11-20T07:10', 'Europe/Sofia'), end: at('2026-11-20T10:40'), startTzOverride: 'Europe/Sofia', details: { from: 'Sofia', to: 'Rovaniemi', carrier: FAKES.carrier, number: FAKES.flightNo, seat: FAKES.seat, journeyId: 'journey-internal-1', reminder: 'off', pricing: { lines: [{ label: FAKES.traveller, quantity: 1, unitAmount: 123456 }] } } }),
    item({ ...leaky, confirmationCode: FAKES.bookingTwo, kind: 'stay', subkind: 'apartment', title: 'Old town flat', locationName: 'Old town flat', start: at('2026-11-20T15:00'), end: at('2026-11-23T11:00') }),
    item({ ...leaky, title: 'Husky safari', locationName: 'Bearhill Husky', start: at('2026-11-21T13:00') }),
    item({ ...leaky, status: 'idea', priority: 'must', title: 'Arktikum', locationName: 'Arktikum' }),
    item({ ...leaky, kind: 'task', title: `Send passport ${FAKES.passportNo} to ${FAKES.email}`, start: at('2026-11-10') }),
    item({ ...leaky, status: 'cancelled', title: `Cancelled dinner ${FAKES.signedUrl}`, start: at('2026-11-22T19:00') }),
  ];
}

describe('privacy — nothing outside the allowlist reaches the text', () => {
  it.each(SWITCHES.map((o) => [JSON.stringify({ ideas: o.ideas, stays: o.stays, travellers: o.travellers }), o]))(
    'with %s',
    (_, options) => {
      const text = context(privateTrip(), options as PlanningOptions, ['adult', 'child']);
      for (const [what, fake] of Object.entries(FAKES)) {
        expect([what, text.includes(fake)]).toEqual([what, false]);
      }
      for (const forbidden of ['4417', '123456', '1234.56', 'Paid', 'paid', 'journey-internal-1', 'item-', 'lap', '66.5', '25.7', 'Send passport', 'Cancelled dinner', 'Secretova']) {
        // "paid" appears only in the fixed instruction "booked or paid"; no field value says it.
        if (forbidden === 'paid') continue;
        expect([forbidden, text.includes(forbidden)]).toEqual([forbidden, false]);
      }
      expect(text).toContain('Nothing above is necessarily booked or paid.');
      // No address of any kind — not even an example a receiving app could take for a link.
      expect(text).not.toMatch(/https?:|www\./i);
    },
  );

  it('the allowlist mapper copies no excluded field', () => {
    const mapped = planningItemOf(privateTrip()[0])!;
    expect(Object.keys(mapped).sort()).toEqual(
      ['completedAt', 'end', 'endTzOverride', 'from', 'id', 'kind', 'locationName', 'priority', 'start', 'startTzOverride', 'status', 'subkind', 'title', 'to'].sort(),
    );
    expect(JSON.stringify(mapped)).not.toMatch(/SecretAir|SA777|14C|Kauppakatu|Door code|123456|ZX9QW7/);
  });

  it('scrubs what was typed into titles and place names', () => {
    const items = [
      item({ confirmationCode: FAKES.booking, title: `Husky safari — ref ${FAKES.booking}`, locationName: `Farm, mail ${FAKES.email}`, start: at('2026-11-21T13:00') }),
      item({ title: `Dinner, call ${FAKES.phone}`, locationName: `Bistro ${FAKES.signedUrl}`, start: at('2026-11-21T19:00') }),
      item({ title: `Pay ${FAKES.card}`, start: at('2026-11-22') }),
      item({ title: `Hotel ${FAKES.bookingTwo.toLowerCase()}`, start: at('2026-11-23') }),
      item({ confirmationCode: FAKES.bookingTwo, title: 'Unrelated', start: at('2026-11-24') }),
    ];
    const text = context(items);
    for (const fake of [FAKES.booking, FAKES.email, FAKES.phone, FAKES.signedUrl, FAKES.card, FAKES.bookingTwo.toLowerCase(), 'example.com']) {
      expect([fake, text.includes(fake)]).toEqual([fake, false]);
    }
    expect(text).toContain('- 13:00 — Husky safari — ref …, at Farm, mail … [Activity]');
    expect(text).toContain('- 19:00 — Dinner, call …, at Bistro … [Activity]');
  });
});

describe('scrubPlanningText — removes what it should, keeps what is useful', () => {
  const s = (text: string, secrets: string[] = []) => scrubPlanningText(text, secrets);

  it('keeps dates, times, road and flight numbers and ordinary names', () => {
    for (const keep of [
      'Drive the E75 to Inari',
      'Route 66 diner',
      'Flight AY1234 to Helsinki',
      'Train IC 27 at 14:30',
      'Concert 2026-11-21',
      'Market on 21.11.2026 at 10:00',
      'Fair 21.11.2026 14:30',
      'Fair 2026-11-21 14:30–18:00',
      'Bus 8 to Santa Village',
      'Hotel Aurora, room with a view',
      'Kemi SnowCastle 2026',
      'Gate 12, terminal 2',
      'Mökkikylä Särkijärvi',
      'Call it a day at 18:00–20:00',
    ]) {
      expect(s(keep)).toBe(keep);
    }
  });

  it('removes the trip’s own references as whole words only', () => {
    expect(s('Safari ABC123 confirmed', ['ABC123'])).toBe('Safari … confirmed');
    expect(s('Safari abc123', ['ABC123'])).toBe('Safari …');
    expect(s('ABC1234 is not it', ['ABC123'])).toBe('ABC1234 is not it');
    expect(s('Ref:ABC123.', ['ABC123'])).toBe('Ref:….');
    // Too short to be a reference safely.
    expect(s('Gate 12', ['12'])).toBe('Gate 12');
    // Regex characters in a reference are literal.
    expect(s('Ticket A.B*C', ['A.B*C'])).toBe('Ticket …');
  });

  it('removes emails, links, phone-like and long digit runs', () => {
    expect(s('Ask anna.k@mail.fi')).toBe('Ask …');
    expect(s('See https://x.example/a?t=1 now')).toBe('See … now');
    expect(s('See www.booking.com/mine')).toBe('See …');
    expect(s('Phone +358 40 123 4567')).toBe('Phone …');
    expect(s('Phone (040) 123-45-67')).toBe('Phone …');
    expect(s('Card 4111-1111-1111-1111')).toBe('Card …');
    expect(s('Account 12345678901')).toBe('Account …');
    // Short numbers stay.
    expect(s('Room 4417 at 7 pm')).toBe('Room 4417 at 7 pm');
  });
});

// ─── Content and dates ───────────────────────────────────────────────────────────────────────────

describe('buildPlanningContext — the itinerary', () => {
  it('lists every day, times exactly, idea vs planned, and only this trip', () => {
    const text = context([
      item({ title: 'Husky safari', subkind: 'tour', locationName: 'Bearhill Husky', start: at('2026-11-21T13:00'), end: at('2026-11-21T16:00') }),
      item({ title: 'Breakfast walk', start: at('2026-11-21T08:05') }),
      item({ title: 'Snow day', start: at('2026-11-22') }),
      item({ status: 'idea', priority: 'want', kind: 'food', subkind: 'restaurant', title: 'Lunch at Nili', start: at('2026-11-23') }),
    ]);
    expect(text).toContain(
      [
        '### Fri 20 Nov', '- Nothing planned yet.', '',
        '### Sat 21 Nov',
        '- 08:05 — Breakfast walk [Activity]',
        '- 13:00–16:00 — Husky safari, at Bearhill Husky [Activity · Tour]', '',
        '### Sun 22 Nov', '- Snow day [Activity]', '',
        '### Mon 23 Nov', '- Nothing planned yet.', '',
        '### Tue 24 Nov', '- Nothing planned yet.',
      ].join('\n'),
    );
    expect(text).toContain('## Ideas (not decided)\n- Lunch at Nili [Food · Restaurant] — want — considering Mon 23 Nov');
    expect(text).toContain('- Dates: Fri 20 Nov – Tue 24 Nov 2026 (5 days)');
    expect(text).toContain('- Destination: Rovaniemi, Finland');
  });

  it('collapses three or more empty days, not two', () => {
    const long = buildPlanningContext(
      planningInputOf({ ...trip, endDate: '2026-11-30' }, [item({ title: 'A', start: at('2026-11-23') })], []),
      DEFAULT_PLANNING_OPTIONS,
    );
    expect(long).toContain('### Fri 20 Nov – Sun 22 Nov\n- Nothing planned yet.');
    expect(long).toContain('### Tue 24 Nov – Mon 30 Nov\n- Nothing planned yet.');
    const two = buildPlanningContext(
      planningInputOf({ ...trip, endDate: '2026-11-22' }, [item({ title: 'A', start: at('2026-11-20') })], []),
      DEFAULT_PLANNING_OPTIONS,
    );
    expect(two).toContain('### Sat 21 Nov\n- Nothing planned yet.\n\n### Sun 22 Nov\n- Nothing planned yet.');
  });

  it('names a zone only where it differs from the trip, at either end', () => {
    const text = context([
      item({ kind: 'transport', subkind: 'flight', title: 'Flight', start: at('2026-11-20T07:10', 'Europe/Sofia'), end: at('2026-11-20T10:40'), startTzOverride: 'Europe/Sofia', details: { from: 'Sofia', to: 'Rovaniemi' } }),
      item({ kind: 'transport', subkind: 'flight', title: 'Flight home', start: at('2026-11-24T18:00'), end: at('2026-11-24T19:30', 'Europe/Sofia'), endTzOverride: 'Europe/Sofia', details: { from: 'Rovaniemi', to: 'Sofia' } }),
      item({ title: 'Same zone', start: at('2026-11-21T10:00'), startTzOverride: TZ }),
    ]);
    expect(text).toContain('- 07:10 (Sofia time) → 10:40 — Flight (Sofia → Rovaniemi) [Travel · Flight]');
    expect(text).toContain('- 18:00 → 19:30 (Sofia time) — Flight home (Rovaniemi → Sofia) [Travel · Flight]');
    expect(text).toContain('- 10:00 — Same zone [Activity]');
    expect(text).toContain('- Times are local to Europe/Helsinki unless another zone is shown.');
  });

  it('splits what crosses midnight onto both days', () => {
    const text = context([
      item({ kind: 'transport', subkind: 'train', title: 'Night train', start: at('2026-11-22T21:30'), end: at('2026-11-23T07:45'), details: { from: 'Rovaniemi', to: 'Helsinki' } }),
    ]);
    expect(text).toContain('### Sun 22 Nov\n- Departs 21:30 — Night train (Rovaniemi → Helsinki) [Travel · Train]');
    expect(text).toContain('### Mon 23 Nov\n- Arrives 07:45 — Night train (Rovaniemi → Helsinki) [Travel · Train]');
  });

  it('keeps undated plans, and plans before or after the trip, in their own places', () => {
    const text = context([
      item({ title: 'Snowmobile tour' }),
      item({ title: 'Airport hotel shuttle', start: at('2026-11-19T22:00') }),
      item({ title: 'Sauna on the way home', start: at('2026-11-25') }),
    ]);
    expect(text).toContain('### Planned, no date yet\n- Snowmobile tour [Activity]');
    expect(text).toContain('### Before the trip\n- Thu 19 Nov, 22:00 — Airport hotel shuttle [Activity]');
    expect(text).toContain('### After the trip\n- Wed 25 Nov, Sauna on the way home [Activity]');
  });

  it('leaves out to-dos and cancelled plans entirely', () => {
    const text = context([
      item({ kind: 'task', title: 'Check in online', start: at('2026-11-20T06:00') }),
      item({ status: 'cancelled', title: 'Old dinner', start: at('2026-11-21T19:00') }),
    ]);
    expect(text).not.toContain('Check in online');
    expect(text).not.toContain('Old dinner');
  });

  it('makes a valid context for an empty trip and a one-day trip', () => {
    const empty = context([]);
    expect(empty).toContain('### Fri 20 Nov – Tue 24 Nov\n- Nothing planned yet.');
    expect(empty).not.toContain('## Ideas');
    const oneDay = buildPlanningContext(planningInputOf({ ...trip, endDate: trip.startDate }, [], []), DEFAULT_PLANNING_OPTIONS);
    expect(oneDay).toContain('- Dates: Fri 20 Nov 2026 (1 day)');
    expect(oneDay).toContain('### Fri 20 Nov\n- Nothing planned yet.');
  });

  it('names the trip when it has no destination, and spans years', () => {
    const text = buildPlanningContext(
      planningInputOf({ ...trip, destination: null, startDate: '2026-12-30', endDate: '2027-01-02' }, [], []),
      DEFAULT_PLANNING_OPTIONS,
    );
    expect(text).toContain('- Trip: Lapland 2026');
    expect(text).toContain('- Dates: Wed 30 Dec 2026 – Sat 2 Jan 2027 (4 days)');
  });
});

describe('buildPlanningContext — switches', () => {
  const stays = () => [
    item({ kind: 'stay', subkind: 'hotel', title: 'Arctic Snow Hotel', locationName: 'Arctic Snow Hotel', address: FAKES.address, start: at('2026-11-20T15:00'), end: at('2026-11-23T11:00') }),
    item({ kind: 'stay', title: 'Cabin', start: at('2026-11-23T16:00'), end: at('2026-11-24T10:00') }),
    item({ kind: 'stay', subkind: 'hostel', title: 'Hostel', start: at('2026-11-24') }),
    item({ kind: 'stay', status: 'idea', title: 'Glass igloo' }),
  ];

  it('stays appear nowhere unless switched on, and then once, as nights', () => {
    const off = context(stays());
    for (const name of ['Arctic Snow Hotel', 'Cabin', 'Hostel', 'Glass igloo', 'Check in', '## Where we stay']) {
      expect([name, off.includes(name)]).toEqual([name, false]);
    }
    const on = context(stays(), { ...DEFAULT_PLANNING_OPTIONS, stays: true });
    expect(on).toContain(
      '## Where we stay\n- Nights of Fri 20 Nov – Sun 22 Nov: Arctic Snow Hotel (hotel)\n- Night of Mon 23 Nov: Cabin (stay)\n- From Tue 24 Nov: Hostel (hostel)',
    );
    expect(on).toContain('- Dates not set: Glass igloo (stay) — an idea, not decided');
    // Not repeated in the daily itinerary, and never the address.
    expect(on).not.toContain('Check in');
    expect(on.match(/Arctic Snow Hotel/g)).toHaveLength(1);
    expect(on).not.toContain('Kauppakatu');
  });

  it('ideas can be left out', () => {
    const items = [item({ status: 'idea', title: 'Arktikum' })];
    expect(context(items)).toContain('Arktikum');
    expect(context(items, { ...DEFAULT_PLANNING_OPTIONS, ideas: false })).not.toContain('Arktikum');
  });

  it('traveller counts are numbers only, from the trip’s own classifications', () => {
    const on = { ...DEFAULT_PLANNING_OPTIONS, travellers: true };
    expect(context([], DEFAULT_PLANNING_OPTIONS, ['adult', 'child'])).not.toContain('## Travellers');
    expect(context([], on, ['adult', 'adult', 'child'])).toContain('## Travellers\n- 3 travellers: 2 adults, 1 child');
    expect(context([], on, ['adult', 'child', 'unspecified'])).toContain('- 3 travellers: 1 adult, 1 child, 1 not specified');
    expect(context([], on, ['unspecified', 'unspecified'])).toContain('- 2 travellers\n');
    expect(context([], on, ['child'])).toContain('- 1 traveller: 1 child');
    expect(context([], on, [])).toContain('## Travellers\n- Not recorded in the app.');
  });
});

describe('the request and the instructions', () => {
  it.each(PLANNING_INTENTIONS.filter((i) => i.key !== 'custom').map((i) => [i.key, i.text]))('%s', (key, expected) => {
    const options = { ...DEFAULT_PLANNING_OPTIONS, intention: key as PlanningOptions['intention'] };
    expect(context([], options)).toContain(`## My request\n${expected}\n`);
    // Only the request changes.
    const others = context([], DEFAULT_PLANNING_OPTIONS);
    expect(context([], options).replace(expected, '')).toBe(others.replace(requestText(DEFAULT_PLANNING_OPTIONS), ''));
  });

  it('puts the person’s own request in verbatim, at most 500 characters', () => {
    const own = 'We arrive tired — keep day one free. Call me on +359 88 765 4321 if needed!';
    const text = context([], { ...DEFAULT_PLANNING_OPTIONS, intention: 'custom', customRequest: `  ${own}  ` });
    expect(text).toContain(`## My request\n${own}\n`);
    expect(requestText({ intention: 'custom', customRequest: 'x'.repeat(600) })).toHaveLength(500);
    expect(requestText({ intention: 'custom', customRequest: '   ' })).toBe('Help me plan this trip.');
  });

  it('tells the assistant to keep plans, not invent, and add only new activities', () => {
    const text = context([]);
    expect(text).toContain('## How to help');
    expect(text).toMatch(/Don't drop, move or replace anything without asking/);
    expect(text).toMatch(/Don't invent bookings, prices, opening hours, availability or travel times/);
    expect(text.trimEnd().endsWith("Only new suggestions — don't repeat what is listed above.")).toBe(true);
  });

  it('describes the 2C format so that a reply following it imports cleanly', () => {
    expect(ACTIVITIES_FORMAT_BLOCK).toContain('"format": "travel-organizer-activities", "version": 1');
    const reply = {
      format: 'travel-organizer-activities',
      version: 1,
      activities: [
        { title: 'Ranua Wildlife Park', kind: 'activity', status: 'idea', date: '2026-11-22', startTime: '10:00', endTime: '14:00', location: { name: 'Ranua Wildlife Park', address: 'Rovaniementie 29, Ranua' }, notes: 'Half a day.', links: [{ url: 'https://example.com/ranua' }] },
        { title: 'Dinner at a kota', kind: 'food', status: 'planned', date: '2026-11-21', startTime: '19:00' },
      ],
    };
    const parsed = parseActivityFile(JSON.stringify(reply), trip);
    if (!parsed.ok) throw new Error(parsed.reason);
    for (const activity of parsed.activities) {
      expect(activity.errors).toEqual([]);
      expect(activity.ignored).toEqual([]);
    }
  });
});

describe('determinism and size', () => {
  it('is byte-identical for the same trip, whatever order the items come in', () => {
    const items = privateTrip().concat(
      item({ id: 'z1', title: 'Twin', start: at('2026-11-21T09:00') }),
      item({ id: 'a1', title: 'Twin', start: at('2026-11-21T09:00') }),
    );
    const a = context(items, ALL_ON, ['adult', 'child']);
    const b = context([...items].reverse(), ALL_ON, ['adult', 'child']);
    expect(b).toBe(a);
    expect(context(items, ALL_ON, ['adult', 'child'])).toBe(a);
  });

  it('formats a large itinerary within a bound', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      item({ title: `Activity ${i}`, start: at(`2026-11-${String(20 + (i % 5)).padStart(2, '0')}T${String(6 + (i % 16)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`) }),
    );
    const started = Date.now();
    const text = context(many);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(text.split('\n').filter((line) => line.startsWith('- ') && line.includes('Activity ')).length).toBe(300);
  });
});
