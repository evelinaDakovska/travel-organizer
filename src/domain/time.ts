import { TZDate } from '@date-fns/tz';

export type TimePrecision = 'date' | 'time';

/** A wall-clock moment as written on a ticket, plus the zone it was written in. */
export type LocalMoment = {
  /** 'YYYY-MM-DD' when precision is 'date', 'YYYY-MM-DDTHH:mm' when 'time'. Never carries an offset. */
  local: string;
  /** IANA zone id, e.g. 'Europe/Sofia'. */
  tz: string;
  precision: TimePrecision;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidLocal(local: string, precision: TimePrecision): boolean {
  const match = precision === 'date' ? DATE_ONLY.exec(local) : DATE_TIME.exec(local);
  if (!match) return false;

  const [year, month, day] = [+match[1], +match[2], +match[3]];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (new TZDate(year, month - 1, day, 'UTC').getUTCDate() !== day) return false;

  if (precision === 'time') {
    const [hours, minutes] = [+match[4], +match[5]];
    if (hours > 23 || minutes > 59) return false;
  }
  return true;
}

/** Which precision a string is, or null if it is neither. The shape decides — never the caller. */
export function localPrecision(local: string): TimePrecision | null {
  if (isValidLocal(local, 'date')) return 'date';
  if (isValidLocal(local, 'time')) return 'time';
  return null;
}

/**
 * Resolve a wall-clock moment to a UTC instant, used only as a sort key.
 * A date-only moment resolves to local midnight so it sorts to the top of its day.
 */
export function toInstant({ local, tz, precision }: LocalMoment): string {
  if (!isValidLocal(local, precision)) {
    throw new Error(`Invalid ${precision} value: ${JSON.stringify(local)}`);
  }
  const match = (precision === 'date' ? DATE_ONLY : DATE_TIME).exec(local)!;
  const zoned = new TZDate(
    +match[1],
    +match[2] - 1,
    +match[3],
    precision === 'time' ? +match[4] : 0,
    precision === 'time' ? +match[5] : 0,
    tz,
  );
  return new Date(zoned.getTime()).toISOString();
}

/** The day a moment belongs to. Derived from local text so a late-evening event never shifts day. */
export function dayKey({ local }: LocalMoment): string {
  return local.slice(0, 10);
}

/** 'HH:mm' as written on the ticket, or null when no time was given. */
export function timeOfDay({ local, precision }: LocalMoment): string | null {
  return precision === 'time' ? local.slice(11, 16) : null;
}

/** Whole minutes until the moment. Negative once it has passed. */
export function minutesUntil(moment: LocalMoment, now: Date = new Date()): number {
  return Math.round((Date.parse(toInstant(moment)) - now.getTime()) / 60_000);
}

/** A trip is past once its end date is behind the device's local date. */
export function isPastDate(endDate: string, now: Date = new Date()): boolean {
  const deviceToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return endDate < deviceToday;
}

/** 'YYYY-MM-DD' at that instant in that zone — the date it is *there*, whatever the device says. */
export function localDateIn(now: Date, tz: string): string {
  const zoned = new TZDate(now.getTime(), tz);
  return [
    zoned.getFullYear(),
    String(zoned.getMonth() + 1).padStart(2, '0'),
    String(zoned.getDate()).padStart(2, '0'),
  ].join('-');
}
