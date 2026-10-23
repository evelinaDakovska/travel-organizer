import { currencyDecimals } from './currencies';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** '19–22 Sep 2026' · '28 Sep – 3 Oct 2026' · '28 Dec 2026 – 3 Jan 2027' */
export function formatDateRange(startDate: string, endDate: string): string {
  const a = parts(startDate);
  const b = parts(endDate);

  if (startDate === endDate) return `${a.day} ${MONTHS[a.month - 1]} ${a.year}`;
  if (a.year !== b.year) {
    return `${a.day} ${MONTHS[a.month - 1]} ${a.year} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${MONTHS[a.month - 1]} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  }
  return `${a.day}–${b.day} ${MONTHS[a.month - 1]} ${a.year}`;
}

/** What a trip with no dates says where a dated one gives them (Phase 6, P6-4). */
export const DATES_NOT_SET = 'Dates not set';

/** A trip's dates as a range, or 'Dates not set' for one without (Phase 6). */
export function formatTripDates(trip: { startDate: string | null; endDate: string | null }): string {
  if (trip.startDate === null || trip.endDate === null) return DATES_NOT_SET;
  return formatDateRange(trip.startDate, trip.endDate);
}

/** '22 Nov' — a day on the rail of a trip without dates. */
export function formatDayMonth(date: string): string {
  const { month, day } = parts(date);
  return `${day} ${MONTHS[month - 1]}`;
}

/** 'Saturday, 19 September' — for day headers. */
export function formatDayHeading(date: string): string {
  const { year, month, day } = parts(date);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} ${MONTHS_LONG[month - 1]}`;
}

export function formatDuration(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** 'in 1h 32m' · 'in 6 days' · 'now' · '2h ago' */
export function formatRelative(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 1) return 'now';

  let value: string;
  if (abs < 60) value = `${abs}m`;
  else if (abs < 1440) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    value = m === 0 ? `${h}h` : `${h}h ${m}m`;
  } else {
    const d = Math.round(abs / 1440);
    value = d === 1 ? '1 day' : `${d} days`;
  }
  return minutes > 0 ? `in ${value}` : `${value} ago`;
}

export function formatMoney(minorUnits: number, currency: string): string {
  const sign = minorUnits < 0 ? '-' : '';
  const abs = Math.abs(minorUnits);
  const whole = `${sign}${currency} ${Math.floor(abs / 100)}`;
  // A yen has no cents: 'JPY 1500', unless hundredths were stored, which are never hidden.
  if (currencyDecimals(currency) === 0 && abs % 100 === 0) return whole;
  return `${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** 'Saturday, 19 September · 14:00', or just the day when only the date is known. */
export function formatMoment(local: string, precision: 'date' | 'time'): string {
  const day = formatDayHeading(local.slice(0, 10));
  return precision === 'time' ? `${day} · ${local.slice(11, 16)}` : day;
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** 'Sat 19 Sep' — for cards, where the full day heading is too long. */
export function formatShortDate(date: string): string {
  const { year, month, day } = parts(date);
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]}`;
}

/** 'Sat 19 Sep · 06:10', or just the day when only the date is known. */
export function formatShortMoment(local: string, precision: 'date' | 'time'): string {
  const day = formatShortDate(local.slice(0, 10));
  return precision === 'time' ? `${day} · ${local.slice(11, 16)}` : day;
}

/** '664 B' · '240 KB' · '2.4 MB' · '18 MB' */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/** The decimal part: a point or a comma and at most two digits, at the very end. */
const DECIMAL_PART = /^(.*?)([.,])(\d{0,2})$/;
/** Thousands grouped by one separator, every group after the first exactly three digits. */
const GROUPED = /^\d{1,3}([.,' ])\d{3}(?:\1\d{3})*$/;

/**
 * A typed or pasted amount in minor units, or what is wrong with it (FB-2):
 * - `undefined` — nothing entered, so no price;
 * - `null` — not an amount we can read without guessing. Never a different number.
 *
 * '12.50' and '12,50' are both 1250 — a phone set to a European locale puts a comma on the
 * decimal key — and '12.' is 1200 while it is being typed. Thousands may be grouped where that
 * cannot be mistaken for decimals: '1,234.50', '1.234,50', '1 234,50', '1,234,567'. '1.234' on
 * its own could be either, so it is refused, as are signs, letters and a third decimal.
 */
export function parseAmount(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  const decimal = DECIMAL_PART.exec(trimmed);
  const whole = decimal ? decimal[1] : trimmed;
  const decimalSeparator = decimal?.[2];
  const fraction = decimal?.[3] ?? '';
  if (whole === '' && fraction === '') return null;

  let digits = whole;
  if (!/^\d*$/.test(whole)) {
    const grouped = GROUPED.exec(whole);
    const groupSeparator = grouped?.[1];
    if (!groupSeparator || groupSeparator === decimalSeparator) return null;
    const groups = whole.split(groupSeparator);
    const pointOrComma = groupSeparator === '.' || groupSeparator === ',';
    if (pointOrComma && groups.length === 2 && !decimalSeparator) return null;
    digits = groups.join('');
  }

  const minorUnits = Number(digits || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

/** What the price field shows for a stored amount: '12.50', '25', never a float artefact. */
export function amountText(minorUnits: number | undefined): string {
  if (minorUnits === undefined) return '';
  const whole = Math.trunc(minorUnits / 100);
  const cents = Math.abs(minorUnits % 100);
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, '0')}`;
}

/** '1 file', '3 files'. Regular plurals only — every word the app counts takes an s. */
export function countOf(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** 'a', 'a and b', 'a, b and c'. Empty when there is nothing to list. */
export function listPhrase(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Whether text laid out as these lines was broken inside a word ('Expense' / 's'), which Android
 * does when one word is wider than the line. A break at a space, a hyphen, a dash or a slash is fine.
 */
export function breaksInsideWord(lines: readonly string[]): boolean {
  const breakable = /[\s\-–—/]/;
  for (let i = 0; i < lines.length - 1; i++) {
    const before = lines[i].slice(-1);
    const after = lines[i + 1].slice(0, 1);
    if (before && after && !breakable.test(before) && !breakable.test(after)) return true;
  }
  return false;
}
