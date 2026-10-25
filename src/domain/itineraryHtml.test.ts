import {
  DEFAULT_PDF_OPTIONS,
  escapeHtml,
  itineraryFileName,
  itineraryHtml,
  type ItineraryInput,
} from './itineraryHtml';
import type { Resource } from './resource';
import type { LocalMoment } from './time';
import type { Trip } from './trip';
import type { TripItem } from './tripItem';

const HEL = 'Europe/Helsinki';
const at = (local: string, tz = HEL): LocalMoment => ({
  local,
  tz,
  precision: local.length > 10 ? 'time' : 'date',
});

const trip: Trip = {
  id: 't',
  name: 'Лапландия',
  destination: 'Finland',
  startDate: '2026-11-20',
  endDate: '2026-11-22',
  defaultTz: HEL,
  coverPath: null,
  notes: null,
  travellerCount: null,
  travellers: [],
  convertedTravellers: [],
  reportCurrency: null,
  createdAt: '',
  updatedAt: '',
};

const item = (over: Partial<TripItem> & { id: string; title: string }): TripItem => ({
  tripId: 't',
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
  isPaid: false, recordedPaid: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const flight = item({
  id: 'f',
  kind: 'transport',
  subkind: 'flight',
  title: 'Flight to Munich',
  start: at('2026-11-20T06:00', 'Europe/Sofia'),
  end: at('2026-11-20T07:05', 'Europe/Berlin'),
  startTzOverride: 'Europe/Sofia',
  endTzOverride: 'Europe/Berlin',
  details: { from: 'Sofia', to: 'Munich' },
  confirmationCode: 'ABC123',
  notes: 'Gate closes 05:40',
});

const boardingPass = { id: 'r', label: 'Boarding pass SOF-MUC' } as Resource;

const input = (over: Partial<ItineraryInput> = {}): ItineraryInput => ({
  trip,
  items: [
    flight,
    item({ id: 'h', title: 'Husky <safari> & “tea”', start: at('2026-11-22T09:00'), status: 'idea' }),
    item({ id: 'k', kind: 'task', title: 'Pack', start: at('2026-11-19') }),
  ],
  travellers: [{ id: 'p', name: 'Мия', sortOrder: 0, classification: 'unspecified' }],
  documents: new Map([['f', [boardingPass]]]),
  lists: [],
  generatedAt: new Date(2026, 9, 13, 9, 42),
  ...over,
});

describe('escapeHtml', () => {
  it('turns markup characters into text', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });
});

describe('itineraryHtml (C4)', () => {
  it('keeps names and references out unless chosen (FB-18)', () => {
    const html = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(html).not.toContain('ABC123');
    expect(html).not.toContain('Мия');
    const chosen = itineraryHtml(input(), { ...DEFAULT_PDF_OPTIONS, references: true, travellers: true });
    expect(chosen).toContain('ABC123');
    expect(chosen).toContain('Мия');
  });

  it('keeps Cyrillic as written and escapes everything typed', () => {
    const html = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(html).toContain('<h1>Лапландия</h1>');
    expect(html).toContain('Husky &lt;safari&gt; &amp; “tea”');
    expect(html).not.toContain('<safari>');
  });

  it('lists every trip day, an empty one saying so, with its day number', () => {
    const html = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(html).toContain('Friday, 20 November <span class="daynum">Day 1</span>');
    expect(html).toMatch(/Saturday, 21 November.*Day 2.*<\/h2>\s*<p class="empty">Nothing planned\.<\/p>/s);
    expect(html).toContain('Sunday, 22 November');
  });

  it('gives a journey both ends in their own zones, the arrival named by its city', () => {
    const html = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(html).toContain('<div class="time">06:00</div>');
    expect(html).toContain('Sofia time');
    expect(html).toContain('Arrives 07:05 · Munich time');
  });

  it('names attachments, never links them, and marks a maybe as optional', () => {
    const html = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(html).toContain('Documents: Boarding pass SOF-MUC');
    expect(html).not.toMatch(/href=|media\//);
    expect(html).toContain('<span class="tag">Optional</span>');
  });

  it('puts tasks, lists and costs in only when chosen', () => {
    const plain = itineraryHtml(input(), DEFAULT_PDF_OPTIONS);
    expect(plain).not.toContain('To do');
    const withTasks = itineraryHtml(input(), { ...DEFAULT_PDF_OPTIONS, tasks: true });
    expect(withTasks).toContain('<h2>To do</h2>');
    expect(withTasks).toContain('☐ Pack');
  });

  it('shows a breakdown with who each rate is for, group prices and extras, only for plans (3C)', () => {
    const pricing = {
      mode: 'perPerson',
      lines: [
        { quantity: 2, unitAmount: 9000, for: 'adult' },
        { quantity: 1, unitAmount: 0, for: 'child' },
        { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true },
      ],
    };
    const priced = (id: string, status: TripItem['status']) =>
      item({ id, title: `Safari ${id}`, status, details: { pricing }, priceAmount: 22000, priceCurrency: 'EUR' });
    const html = itineraryHtml(input({ items: [priced('a', 'confirmed'), priced('b', 'idea')] }), {
      ...DEFAULT_PDF_OPTIONS,
      costs: true,
    });
    expect(html).toContain(
      'Safari a: 2 × EUR 90.00 Adult + 1 × free Child + Extra: 2 × EUR 20.00 Sled = EUR 220.00',
    );
    expect(html).not.toContain('Safari b:');
  });

  it('counts recorded payments in paid and to pay, once, and names no payer (3D-1)', () => {
    const hotel = item({
      id: 'h',
      title: 'Hotel Aurora',
      priceAmount: 25000,
      priceCurrency: 'EUR',
      recordedPaid: 10000,
    });
    const html = itineraryHtml(input({ items: [hotel] }), { ...DEFAULT_PDF_OPTIONS, costs: true });
    expect(html).toContain(
      '<tr><td>EUR 250.00</td><td>Paid EUR 100.00</td><td>To pay EUR 150.00</td></tr>',
    );
    expect(html).not.toMatch(/recorded|Deposit/);
  });

  it('adds one converted line for a trip with a reporting currency, naming what has no rate (Phase 4)', () => {
    const hotel = item({ id: 'h', title: 'Hotel', priceAmount: 25000, priceCurrency: 'EUR' });
    const safari = item({ id: 's', title: 'Safari', priceAmount: 10000, priceCurrency: 'USD' });
    const ferry = item({ id: 'f2', title: 'Ferry', priceAmount: 6000, priceCurrency: 'NOK' });
    const conversion = {
      rates: [{ currency: 'USD', baseCurrency: 'EUR', rate: '0.92', rateDate: '2026-10-23' }],
      expenses: [],
      payments: [],
    };
    const converted = itineraryHtml(
      input({ trip: { ...trip, reportCurrency: 'EUR' }, items: [hotel, safari, ferry], conversion }),
      { ...DEFAULT_PDF_OPTIONS, costs: true },
    );
    expect(converted).toContain(
      '<p>Partial converted total: <strong>≈ EUR 342.00</strong> (estimated at 1 USD = 0.92 EUR); not included: NOK 60.00, with no rate.</p>',
    );
    const pdf = (items: TripItem[], rates = conversion.rates) =>
      itineraryHtml(input({ trip: { ...trip, reportCurrency: 'EUR' }, items, conversion: { ...conversion, rates } }), {
        ...DEFAULT_PDF_OPTIONS,
        costs: true,
      });
    // All in the reporting currency already: the table says it, no "EUR 250.00 in EUR." (QA O-06).
    expect(pdf([hotel])).not.toContain('Converted total');
    expect(pdf([hotel])).not.toContain('in EUR.');
    // Complete and estimated; partial and exact; nothing counted.
    expect(pdf([hotel, safari])).toContain('<p>Converted total: <strong>≈ EUR 342.00</strong> (estimated at 1 USD = 0.92 EUR).</p>');
    expect(pdf([hotel, ferry])).toContain('<p>Partial converted total: <strong>EUR 250.00</strong>; not included: NOK 60.00, with no rate.</p>');
    expect(pdf([ferry])).toContain('<p>No total in EUR: no rate for NOK 60.00.</p>');
    expect(pdf([ferry])).not.toContain('EUR 0.00');
    // Not converted: no line, and the table is as before.
    const plain = itineraryHtml(input({ items: [hotel, safari], conversion }), { ...DEFAULT_PDF_OPTIONS, costs: true });
    expect(plain).not.toContain('in EUR');
    expect(plain).toContain('<tr><td>USD 100.00</td>');
  });

  it('says when it was made', () => {
    expect(itineraryHtml(input(), DEFAULT_PDF_OPTIONS)).toContain('Made 13 Oct 2026, 09:42');
  });
});

describe('itineraryFileName', () => {
  it('names the file for the trip and the minute, keeping letters of any script', () => {
    expect(itineraryFileName('Lapland', new Date(2026, 9, 13, 9, 42))).toBe(
      'Lapland-itinerary-2026-10-13-0942.pdf',
    );
    expect(itineraryFileName('Лапландия / Winter!', new Date(2026, 0, 2, 23, 5))).toBe(
      'Лапландия-Winter-itinerary-2026-01-02-2305.pdf',
    );
    expect(itineraryFileName('???', new Date(2026, 0, 2, 23, 5))).toMatch(/^trip-itinerary-/);
    // A letter with a mark stays one letter.
    expect(itineraryFileName('Мурманский', new Date(2026, 0, 2, 23, 5))).toMatch(/^Мурманский-/);
  });
});
