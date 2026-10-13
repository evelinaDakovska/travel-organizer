import {
  amountText,
  countOf,
  formatDateRange,
  formatDayHeading,
  formatDuration,
  formatFileSize,
  formatMoment,
  formatMoney,
  formatRelative,
  formatShortDate,
  formatShortMoment,
  listPhrase,
  parseAmount,
} from './format';

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

describe('formatShortDate', () => {
  it('abbreviates the weekday and month for cards', () => {
    expect(formatShortDate('2026-09-19')).toBe('Sat 19 Sep');
    expect(formatShortDate('2026-11-24')).toBe('Tue 24 Nov');
  });
});

describe('formatShortMoment', () => {
  it('adds the time as written, when there is one', () => {
    expect(formatShortMoment('2026-09-19T06:10', 'time')).toBe('Sat 19 Sep · 06:10');
    expect(formatShortMoment('2026-09-19T00:00', 'time')).toBe('Sat 19 Sep · 00:00');
  });

  it('shows only the day for a date-only moment', () => {
    expect(formatShortMoment('2026-09-19', 'date')).toBe('Sat 19 Sep');
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

describe('formatFileSize', () => {
  it('uses the smallest unit that reads naturally', () => {
    expect(formatFileSize(664)).toBe('664 B');
    expect(formatFileSize(240_000)).toBe('234 KB');
    expect(formatFileSize(2_500_000)).toBe('2.4 MB');
    expect(formatFileSize(18_000_000)).toBe('17 MB');
  });
});

describe('parseAmount', () => {
  it('reads a point or a comma as the decimal separator', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12,50')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
  });

  it('keeps a half-typed amount readable while the user is still typing', () => {
    expect(parseAmount('12.')).toBe(1200);
    expect(parseAmount('12,')).toBe(1200);
  });

  it('is undefined for nothing at all, so there is no price', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('   ')).toBeUndefined();
  });

  it('never stores a float', () => {
    expect(parseAmount('0.29')).toBe(29);
    expect(parseAmount('19.99')).toBe(1999);
    expect(Number.isInteger(parseAmount('19.99'))).toBe(true);
  });

  it('reads whole amounts, a leading separator and surrounding spaces', () => {
    expect(parseAmount('25')).toBe(2500);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('.5')).toBe(50);
    expect(parseAmount(' 12,50 ')).toBe(1250);
  });

  it('reads thousands grouping only where it cannot be decimals (FB-2)', () => {
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseAmount('1.234,50')).toBe(123450);
    expect(parseAmount('1 234,50')).toBe(123450);
    expect(parseAmount("1'234.50")).toBe(123450);
    expect(parseAmount('1 234')).toBe(123400);
    expect(parseAmount('1,234,567')).toBe(123456700);
    expect(parseAmount('1.234.567,89')).toBe(123456789);
  });

  it('refuses what it would have to guess at, rather than change the amount (FB-2)', () => {
    // Was 1250: the sign was stripped.
    expect(parseAmount('-12.50')).toBeNull();
    expect(parseAmount('+12')).toBeNull();
    // Thousands or a mistyped decimal? Either is plausible.
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
    // Was 1.23: only the first comma was read as the point.
    expect(parseAmount('1,234,56')).toBeNull();
    expect(parseAmount('1.234.50')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('12,50,1')).toBeNull();
    expect(parseAmount('1,23.50')).toBeNull();
    expect(parseAmount('12 50')).toBeNull();
  });

  it('refuses pasted text with a currency or letters instead of stripping them', () => {
    expect(parseAmount('€12,50')).toBeNull();
    expect(parseAmount('12.50 EUR')).toBeNull();
    expect(parseAmount('12e3')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount(',')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('refuses an amount too large to store exactly', () => {
    expect(parseAmount('99999999999999999')).toBeNull();
  });
});

describe('amountText', () => {
  it('shows cents only when there are some', () => {
    expect(amountText(1250)).toBe('12.50');
    expect(amountText(2500)).toBe('25');
    expect(amountText(5)).toBe('0.05');
    expect(amountText(undefined)).toBe('');
  });
});

describe('countOf', () => {
  it('adds an s to anything but one', () => {
    expect(countOf(0, 'file')).toBe('0 files');
    expect(countOf(1, 'file')).toBe('1 file');
    expect(countOf(3, 'expense')).toBe('3 expenses');
  });
});

describe('listPhrase', () => {
  it('reads like a sentence', () => {
    expect(listPhrase([])).toBe('');
    expect(listPhrase(['2 items'])).toBe('2 items');
    expect(listPhrase(['2 items', '1 file'])).toBe('2 items and 1 file');
    expect(listPhrase(['2 items', '3 expenses', '1 file'])).toBe('2 items, 3 expenses and 1 file');
  });
});
