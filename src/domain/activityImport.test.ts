import { parseActivityFile, type ActivityTrip } from './activityFormat';
import { buildImportPreview, previewCounts, selectedRows, selectionNotices } from './activityImport';
import type { TripItem } from './tripItem';

const trip: ActivityTrip = { defaultTz: 'Europe/Helsinki', startDate: '2026-11-20', endDate: '2026-11-24' };
const now = new Date('2026-10-19T09:00:00Z');

function preview(activities: unknown[], existing: TripItem[] = []) {
  const parsed = parseActivityFile(
    JSON.stringify({ format: 'travel-organizer-activities', version: 1, activities }),
    trip,
  );
  if (!parsed.ok) throw new Error(parsed.reason);
  return buildImportPreview(parsed.activities, parsed.ignored, existing);
}

const existingSafari = {
  id: 'safari',
  tripId: 'lap',
  kind: 'activity',
  subkind: 'tour',
  status: 'confirmed',
  priority: null,
  title: 'Husky safari',
  start: { local: '2026-11-21T13:00', tz: 'Europe/Helsinki', precision: 'time' },
  end: null,
  startTzOverride: null,
  endTzOverride: null,
  completedAt: null,
  locationName: 'Bearhill Husky',
  address: null,
  latitude: null,
  longitude: null,
  confirmationCode: 'REAL-REF',
  notes: null,
  details: null,
  priceAmount: 29000,
  priceCurrency: 'EUR',
  isPaid: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
} as TripItem;

describe('buildImportPreview', () => {
  const rows = preview(
    [
      { title: 'Husky safari', status: 'planned', date: '2026-11-21', startTime: '13:00' }, // duplicate of existing
      { title: 'Arktikum', priority: 'must' },
      { title: 'Lunch', status: 'booked' }, // invalid
      { title: 'arktikum' }, // repeat inside the file
      { title: 'Snowmobile', status: 'planned', date: '2026-11-22', startTime: '10:00', price: { amount: 120, currency: 'EUR' } },
    ],
    [existingSafari],
  );

  it('ticks valid, non-duplicate entries only', () => {
    expect(rows.initiallySelected).toEqual([1, 4]);
    expect(rows.rows.map((r) => r.selectable)).toEqual([true, true, false, true, true]);
    expect(rows.rows[0].duplicate?.source).toBe('existing');
    expect(rows.rows[3].duplicate?.source).toBe('file');
  });

  it('counts what is in the file and what will be added', () => {
    expect(previewCounts(rows.rows, new Set(rows.initiallySelected))).toEqual({
      total: 5,
      valid: 4,
      invalid: 1,
      duplicates: 2,
      selected: 2,
      excluded: 3,
    });
  });

  it('writes only ticked valid entries, even if an invalid one is in the set', () => {
    const chosen = selectedRows(rows.rows, new Set([0, 2, 4]));
    expect(chosen.map((r) => r.index)).toEqual([0, 4]);
  });
});

describe('selectionNotices', () => {
  it('counts priced plans and plans that will remind, using the reminder rules', () => {
    const { rows } = preview([
      { title: 'Snowmobile', status: 'planned', date: '2026-11-22', startTime: '10:00', price: { amount: 120, currency: 'EUR' } },
      { title: 'Past plan', status: 'planned', date: '2026-01-01' },
      { title: 'Undated plan', status: 'planned', price: { amount: 5, currency: 'EUR' } },
      { title: 'Idea with a price', price: { amount: 5, currency: 'EUR' }, date: '2026-11-22' },
    ]);
    expect(selectionNotices(rows, trip.defaultTz, now)).toEqual({
      pricedPlans: 2,
      remindingPlans: 1,
      ideas: 1,
      plans: 3,
    });
  });
});
