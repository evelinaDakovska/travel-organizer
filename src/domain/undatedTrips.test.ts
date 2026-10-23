/**
 * Phase 6 — trips without fixed dates (`docs/phase6-plan.md` §2). One place for the decisions, and
 * beside each the dated case it must leave as it was (P6-13).
 */
import { parseActivityFile } from './activityFormat';
import { dayStops, daysForStop, defaultStopKey, stopDescription, stopKey, stopLabels, tripDates } from './dayRail';
import { formatTripDates } from './format';
import { DEFAULT_PDF_OPTIONS, itineraryHtml } from './itineraryHtml';
import { overviewPlan } from './overview';
import { buildPlanningContext, DEFAULT_PLANNING_OPTIONS, planningInputOf } from './planningContext';
import { suggestTrip } from './share';
import { taskStart, templateTask } from './templates';
import type { LocalMoment } from './time';
import { buildTimeline } from './timeline';
import {
  defaultItemDate,
  groupTrips,
  isDated,
  isTripActive,
  parseTripRow,
  tripInputSchema,
  tripPhase,
  tripPhaseLabel,
  type Trip,
} from './trip';
import type { TripItem } from './tripItem';

const TZ = 'Europe/Helsinki';
const at = (local: string): LocalMoment => ({ local, tz: TZ, precision: local.length > 10 ? 'time' : 'date' });
const now = new Date(2026, 9, 23, 12, 0); // 23 Oct 2026, the device's local noon

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't',
    name: 'Japan someday',
    destination: 'Japan',
    startDate: null,
    endDate: null,
    defaultTz: 'Asia/Tokyo',
    coverPath: null,
    notes: null,
    travellerCount: null,
    travellers: [],
    convertedTravellers: [],
    reportCurrency: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}
const dated = (over: Partial<Trip> = {}) => trip({ name: 'Lapland', startDate: '2026-11-20', endDate: '2026-11-24', ...over });

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
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('the trip itself (P6-1, P6-2)', () => {
  const base = { name: 'Japan', defaultTz: 'Asia/Tokyo' };

  it('takes both dates or neither, never one', () => {
    expect(tripInputSchema.safeParse({ ...base, startDate: null, endDate: null }).success).toBe(true);
    expect(tripInputSchema.safeParse({ ...base, startDate: '2027-04-01', endDate: '2027-04-05' }).success).toBe(true);
    const half = tripInputSchema.safeParse({ ...base, startDate: '2027-04-01', endDate: null });
    expect(half.success).toBe(false);
    if (!half.success) expect(half.error.issues[0].message).toBe('Choose both dates, or none');
    expect(tripInputSchema.safeParse({ ...base, startDate: null, endDate: '2027-04-01' }).success).toBe(false);
    expect(tripInputSchema.safeParse({ ...base, startDate: '2027-04-05', endDate: '2027-04-01' }).success).toBe(false);
  });

  it('reads a row without dates as null dates, never a placeholder', () => {
    const parsed = parseTripRow({
      id: 't',
      name: 'Japan',
      destination: null,
      start_date: null,
      end_date: null,
      default_tz: 'Asia/Tokyo',
      cover_path: null,
      notes: null,
      traveller_count: null,
      travellers: null,
      created_at: '',
      updated_at: '',
    });
    expect([parsed.startDate, parsed.endDate, isDated(parsed)]).toEqual([null, null, false]);
  });

  it('says Dates not set where a dated trip gives its dates', () => {
    expect(formatTripDates(trip())).toBe('Dates not set');
    expect(formatTripDates(dated())).toBe('20–24 Nov 2026');
  });
});

describe('Home and the phase (P6-4, P6-5)', () => {
  it('groups undated trips on their own, the most recently changed first; dated groups unchanged', () => {
    const past = dated({ id: 'past', startDate: '2026-01-01', endDate: '2026-01-05' });
    const next = dated({ id: 'next' });
    const later = dated({ id: 'later', startDate: '2027-02-01', endDate: '2027-02-03' });
    const old = trip({ id: 'old', updatedAt: '2026-09-01T00:00:00.000Z' });
    const fresh = trip({ id: 'fresh', updatedAt: '2026-10-20T00:00:00.000Z' });
    const grouped = groupTrips([fresh, past, later, old, next], now);
    expect(grouped.upcoming.map((t) => t.id)).toEqual(['next', 'later']);
    expect(grouped.undated.map((t) => t.id)).toEqual(['fresh', 'old']);
    expect(grouped.past.map((t) => t.id)).toEqual(['past']);
  });

  it('an undated trip is never active, and its phase is Dates not set', () => {
    expect(isTripActive(trip(), now)).toBe(false);
    expect(tripPhase(trip(), now)).toEqual({ phase: 'undated' });
    expect(tripPhaseLabel({ phase: 'undated' })).toBe('Dates not set');
    expect(tripPhase(dated(), now)).toEqual({ phase: 'before', daysToGo: 28 });
  });

  it('the Overview is laid out as before a trip: the lead is the first journey to come', () => {
    const train = item({ kind: 'transport', subkind: 'train', title: 'Train', start: at('2026-11-02T08:00') });
    const museum = item({ title: 'Museum', start: at('2026-10-30T10:00') });
    const plan = overviewPlan([museum, train], trip(), now);
    expect(plan.lead?.reason).toBe('firstDeparture');
    expect(plan.lead?.entry.item.title).toBe('Train');
  });

  it('the item form opens on today for an undated trip, on the first day before a dated one', () => {
    expect(defaultItemDate(trip(), now)).toBe('2026-10-23');
    expect(defaultItemDate(dated(), now)).toBe('2026-11-20');
  });
});

describe('the Timeline rail (P6-6)', () => {
  it('has no day numbers, no Before or After: All, the dates with entries, No date', () => {
    const stops = dayStops(trip(), ['2027-04-02', '2026-12-01', '2027-04-02'], true);
    expect(stops.map(stopKey)).toEqual(['all', '2026-12-01', '2027-04-02', 'undated']);
    expect(stops.filter((s) => s.kind === 'day').map((s) => s.kind === 'day' && s.number)).toEqual([null, null]);
    expect(tripDates(trip())).toEqual([]);
  });

  it('labels an unnumbered day by its date, and says it in full', () => {
    const day = { kind: 'day' as const, date: '2026-11-22', number: null };
    expect(stopLabels(day)).toEqual({ label: '22 Nov', sublabel: 'Sun' });
    expect(stopDescription(day, '2026-11-22')).toBe('Sunday, 22 November, today');
  });

  it('opens on All; Before and After show nothing', () => {
    expect(defaultStopKey(trip(), '2026-10-23')).toBe('all');
    const days = buildTimeline([item({ start: at('2026-12-01T10:00') })]);
    expect(daysForStop({ kind: 'before' }, days, trip())).toEqual([]);
    expect(daysForStop({ kind: 'after' }, days, trip())).toEqual([]);
    expect(daysForStop({ kind: 'all' }, days, trip())).toHaveLength(1);
  });

  it('a dated trip keeps its numbered days and Before', () => {
    const stops = dayStops(dated(), ['2026-11-01'], false);
    expect(stops.map(stopKey)).toEqual(['all', 'before', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    expect(stopLabels(stops[2])).toEqual({ label: 'Day 1', sublabel: 'Fri 20' });
  });
});

describe('templates (P6-9)', () => {
  it('a task is added without a date to a trip without dates', () => {
    expect(taskStart({ offsetDays: -2, time: '09:00' }, null)).toBeUndefined();
    expect(taskStart({ offsetDays: -2, time: '09:00' }, '2026-11-20')).toEqual({ local: '2026-11-18T09:00' });
  });

  it('a task saved from a trip without dates is saved undated', () => {
    const task = { title: 'Book the ryokan', notes: null, start: at('2026-12-01T10:00') };
    expect(templateTask(task, null)).toEqual({ title: 'Book the ryokan', offsetDays: null, time: null });
    expect(templateTask(task, '2026-11-20')).toEqual({ title: 'Book the ryokan', offsetDays: 11, time: '10:00' });
  });
});

describe('Plan with AI and the activities import (P6-10)', () => {
  const tripInput = { name: 'Japan someday', destination: 'Japan', startDate: null, endDate: null, defaultTz: 'Asia/Tokyo' };

  it('says the dates are not decided, and lists dated plans by their own dates', () => {
    const concert = item({ title: 'Concert', start: { local: '2027-04-02T19:00', tz: 'Asia/Tokyo', precision: 'time' } });
    const text = buildPlanningContext(planningInputOf(tripInput, [concert], []), DEFAULT_PLANNING_OPTIONS);
    expect(text).toContain('- Dates: Not decided yet. Do not assume any; give a date only to a plan tied to one.');
    expect(text).toContain('### Fri 2 Apr');
    expect(text).toContain('Concert');
    expect(text).not.toContain('Before the trip');
    expect(text).not.toContain('Nothing planned yet');
  });

  it('gives no outside-the-dates warning on a trip without dates', () => {
    const file = JSON.stringify({ format: 'travel-organizer-activities', version: 1, activities: [{ title: 'Temple', date: '2027-04-03', status: 'idea' }] });
    const undated = parseActivityFile(file, { defaultTz: 'Asia/Tokyo', startDate: null, endDate: null });
    const datedTrip = parseActivityFile(file, { defaultTz: 'Asia/Tokyo', startDate: '2026-11-20', endDate: '2026-11-24' });
    if (!undated.ok || !datedTrip.ok) throw new Error('the file should read');
    expect(undated.activities[0].warnings).toEqual([]);
    expect(datedTrip.activities[0].warnings.some((w) => w.includes('outside this trip'))).toBe(true);
  });
});

describe('the PDF (P6-11)', () => {
  const pdf = (t: Trip, items: TripItem[]) =>
    itineraryHtml(
      { trip: t, items, travellers: [], documents: new Map(), lists: [], generatedAt: now },
      DEFAULT_PDF_OPTIONS,
    );

  it('says Dates not set, and lists only the days that have plans, unnumbered', () => {
    const html = pdf(trip(), [item({ title: 'Concert', start: at('2027-04-02T19:00') })]);
    expect(html).toContain('Dates not set');
    expect(html).toContain('Friday, 2 April');
    expect(html).not.toContain('Day 1');
    expect(html).not.toContain('Nothing planned.');
  });

  it('a dated trip still lists every day, empty ones included', () => {
    const html = pdf(dated(), []);
    expect(html.match(/Nothing planned\./g)).toHaveLength(5);
    expect(html).toContain('Day 5');
  });
});

describe('share to the app (P6-12)', () => {
  it('offers a current or upcoming dated trip first, then one without dates, then a past one', () => {
    const past = dated({ id: 'past', startDate: '2026-01-01', endDate: '2026-01-05' });
    const someday = trip({ id: 'someday' });
    expect(suggestTrip([someday, past, dated({ id: 'next' })], now)?.id).toBe('next');
    expect(suggestTrip([past, someday], now)?.id).toBe('someday');
    expect(suggestTrip([past], now)?.id).toBe('past');
  });
});
