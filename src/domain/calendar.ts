/**
 * The month grid and the two-tap range selection behind the trip's date picker. Android's own
 * picker has no range mode, so the calendar is drawn by the app. Dates are 'YYYY-MM-DD' text
 * throughout — never a Date, so no device zone can shift a day.
 */

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Monday first, as calendars are printed in Europe. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** A month as `{ year, month }`, month 1–12. */
export type Month = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function monthOf(date: string): Month {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

export function addMonths({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 'October 2026' */
export function monthTitle({ year, month }: Month): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/**
 * Weeks of seven cells, Monday first. Cells outside the month are null, so the grid lines up
 * under the weekday initials without showing another month's days.
 */
export function monthGrid({ year, month }: Month): (string | null)[][] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay is 0 for Sunday; shift so Monday is column 0.
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => isoDate(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A range being picked: the end is null between the first tap and the second. */
export type DateRange = { start: string; end: string | null };

/**
 * First tap sets the start; the second sets the end. A second tap before the start begins
 * again from there, and a tap after a finished range starts a new one — the way a booking
 * site's calendar behaves.
 */
export function selectRangeDay(range: DateRange | null, day: string): DateRange {
  if (range === null || range.end !== null || day < range.start) return { start: day, end: null };
  return { start: range.start, end: day };
}

export function inRange(range: DateRange | null, day: string): boolean {
  if (range === null) return false;
  return day >= range.start && day <= (range.end ?? range.start);
}
