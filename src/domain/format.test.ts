import { formatDateRange, formatDayHeading, formatDuration, formatMoment, formatMoney, formatRelative } from './format';

describe('formatDateRange', () => {
  it('collapses a same-month range', () => {
    expect(formatDateRange('2026-09-19', '2026-09-22')).toBe('19–22 Sep 2026');
  });

  it('spells out both months across a month boundary', () => {
    expect(formatDateRange('2026-09-28', '2026-10-03')).toBe('28 Sep – 3 Oct 2026');
  });

  it('repeats the year across a year boundary', () => {
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('shows a single day once', () => {
    expect(formatDateRange('2026-09-19', '2026-09-19')).toBe('19 Sep 2026');
  });
});

describe('formatDayHeading', () => {
  it('names the correct weekday', () => {
    expect(formatDayHeading('2026-09-19')).toBe('Saturday, 19 September');
    expect(formatDayHeading('2026-11-20')).toBe('Friday, 20 November');
  });
});

describe('formatRelative', () => {
  it('formats the spec example', () => {
    expect(formatRelative(92)).toBe('in 1h 32m');
  });

  it('handles minutes, round hours, days and the past', () => {
    expect(formatRelative(45)).toBe('in 45m');
    expect(formatRelative(120)).toBe('in 2h');
    expect(formatRelative(2880)).toBe('in 2 days');
    expect(formatRelative(1440)).toBe('in 1 day');
    expect(formatRelative(-120)).toBe('2h ago');
    expect(formatRelative(0)).toBe('now');
  });
});

describe('formatDuration', () => {
  it('singularises one day', () => {
    expect(formatDuration(1)).toBe('1 day');
    expect(formatDuration(4)).toBe('4 days');
  });
});

describe('formatMoney', () => {
  it('renders minor units without floating point drift', () => {
    expect(formatMoney(4250, 'EUR')).toBe('EUR 42.50');
    expect(formatMoney(5, 'EUR')).toBe('EUR 0.05');
    expect(formatMoney(100000, 'BGN')).toBe('BGN 1000.00');
  });
});

describe('formatMoment', () => {
  it('shows the time when one was given', () => {
    expect(formatMoment('2026-09-19T14:00', 'time')).toBe('Saturday, 19 September · 14:00');
  });

  it('shows only the day when the hour is unknown', () => {
    expect(formatMoment('2026-09-19', 'date')).toBe('Saturday, 19 September');
  });

  it('keeps a real midnight visible rather than hiding it', () => {
    expect(formatMoment('2026-09-19T00:00', 'time')).toBe('Saturday, 19 September · 00:00');
  });
});
