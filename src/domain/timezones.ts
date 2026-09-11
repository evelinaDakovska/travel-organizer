/**
 * Hermes has no `Intl.supportedValuesOf('timeZone')` (verified on device, M1 spike),
 * so the picker needs its own list. Weighted towards Europe; extend as needed.
 */
export const TIMEZONES = [
  'Europe/Sofia', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid',
  'Europe/Paris', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Zurich',
  'Europe/Rome', 'Europe/Vienna', 'Europe/Prague', 'Europe/Warsaw', 'Europe/Budapest',
  'Europe/Bucharest', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Copenhagen', 'Europe/Oslo',
  'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Tallinn', 'Europe/Riga', 'Europe/Vilnius',
  'Europe/Kyiv', 'Europe/Belgrade', 'Europe/Zagreb', 'Europe/Sarajevo', 'Europe/Skopje',
  'Europe/Tirane', 'Europe/Ljubljana', 'Europe/Bratislava', 'Europe/Malta',
  'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Bogota',
  'America/Lima', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Africa/Casablanca', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Johannesburg', 'Africa/Tunis',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Tehran',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok',
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Hong_Kong',
  'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Sydney',
  'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu',
  'UTC',
] as const;

export type Timezone = (typeof TIMEZONES)[number];

export function isKnownTimezone(tz: string): boolean {
  return (TIMEZONES as readonly string[]).includes(tz);
}

/** 'Europe/Sofia' -> 'Sofia'; 'America/Argentina/Buenos_Aires' -> 'Buenos Aires'. */
export function timezoneLabel(tz: string): string {
  return tz.split('/').pop()!.replace(/_/g, ' ');
}

export function searchTimezones(query: string): readonly string[] {
  const q = query.trim().toLowerCase();
  if (!q) return TIMEZONES;
  return TIMEZONES.filter((tz) => tz.toLowerCase().replace(/_/g, ' ').includes(q));
}
