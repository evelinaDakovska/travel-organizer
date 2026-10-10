import {
  addMonths,
  inRange,
  monthGrid,
  monthOf,
  monthTitle,
  selectRangeDay,
} from './calendar';

describe('monthGrid', () => {
  it('starts on Monday and pads the first week', () => {
    // 1 October 2026 is a Thursday.
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('holds every day of the month, in whole weeks', () => {
    const weeks = monthGrid({ year: 2028, month: 2 });
    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days[28]).toBe('2028-02-29');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('needs no padding for a month starting on Monday', () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid({ year: 2026, month: 6 })[0][0]).toBe('2026-06-01');
  });
});

describe('months', () => {
  it('steps across a year boundary both ways', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('reads the month off a date and titles it', () => {
    expect(monthOf('2026-10-23')).toEqual({ year: 2026, month: 10 });
    expect(monthTitle({ year: 2026, month: 10 })).toBe('October 2026');
  });
});

describe('selectRangeDay', () => {
  it('takes the start, then the end', () => {
    const first = selectRangeDay(null, '2026-10-19');
    expect(first).toEqual({ start: '2026-10-19', end: null });
    expect(selectRangeDay(first, '2026-10-23')).toEqual({ start: '2026-10-19', end: '2026-10-23' });
  });

  it('allows a one-day trip by tapping the same day twice', () => {
    const first = selectRangeDay(null, '2026-10-19');
    expect(selectRangeDay(first, '2026-10-19')).toEqual({ start: '2026-10-19', end: '2026-10-19' });
  });

  it('starts again from an earlier day rather than ending before the start', () => {
    const first = selectRangeDay(null, '2026-10-19');
    expect(selectRangeDay(first, '2026-10-12')).toEqual({ start: '2026-10-12', end: null });
  });

  it('starts a new range after a finished one', () => {
    const done = { start: '2026-10-19', end: '2026-10-23' };
    expect(selectRangeDay(done, '2026-11-02')).toEqual({ start: '2026-11-02', end: null });
  });
});

describe('inRange', () => {
  it('covers both ends and the days between', () => {
    const range = { start: '2026-10-19', end: '2026-10-23' };
    expect(['2026-10-19', '2026-10-21', '2026-10-23'].every((d) => inRange(range, d))).toBe(true);
    expect(inRange(range, '2026-10-24')).toBe(false);
  });

  it('marks only the start while the end is still open', () => {
    const open = { start: '2026-10-19', end: null };
    expect(inRange(open, '2026-10-19')).toBe(true);
    expect(inRange(open, '2026-10-20')).toBe(false);
  });
});
