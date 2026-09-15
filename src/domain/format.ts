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
  return `${sign}${currency} ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
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
