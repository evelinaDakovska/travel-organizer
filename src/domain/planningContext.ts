/**
 * Plan with AI (2D): one trip as a short Markdown text to paste into ChatGPT or any assistant, so
 * it knows what is already planned. Read-only and pure. Built from an **allowlist**:
 * `planningItemOf` is the only code that reads a stored item, and it copies only the fields a
 * planner needs — notes, addresses, coordinates, links, references, prices, people and ids never
 * reach the text. Titles and place names are free text, so they are scrubbed (best effort, never a
 * guarantee: the screen says so above the exact preview). Same input, same text — byte for byte.
 */

import { tripDates } from './dayRail';
import { formatShortDate } from './format';
import { entryRoleLabel } from './itinerary';
import { addCalendarDays, dayKey, timeOfDay, type LocalMoment } from './time';
import { buildTimeline, type TimelineEntry } from './timeline';
import type { TravellerClassification } from './traveller';
import { isDated, type Trip } from './trip';
import {
  isValidSubkind,
  kindLabel,
  PRIORITIES,
  subkindLabel,
  transportDetails,
  type Priority,
  type TripItem,
  type TripItemKind,
} from './tripItem';
import { zoneName } from './zoneHints';

// ─── The allowlist ───────────────────────────────────────────────────────────────────────────────

/**
 * Everything the planning text may use from an item, and nothing else. `id` stays in memory as a
 * tie-breaker for a stable order; it is never written.
 */
export type PlanningItem = {
  id: string;
  kind: TripItemKind;
  subkind: string | null;
  status: 'idea' | 'confirmed';
  priority: Priority | null;
  title: string;
  start: LocalMoment | null;
  end: LocalMoment | null;
  startTzOverride: string | null;
  endTzOverride: string | null;
  locationName: string | null;
  /** Transport only: the two ends of the route. Never carrier, number or seat. */
  from: string | null;
  to: string | null;
  completedAt: null;
};

/** Null for what a planner is never told about: to-dos and cancelled plans. */
export function planningItemOf(item: TripItem): PlanningItem | null {
  if (item.kind === 'task' || item.status === 'cancelled') return null;
  const route = transportDetails(item);
  return {
    id: item.id,
    kind: item.kind,
    subkind: item.subkind !== null && isValidSubkind(item.kind, item.subkind) ? item.subkind : null,
    status: item.status,
    priority: item.status === 'idea' ? item.priority : null,
    title: item.title,
    start: item.start,
    end: item.end,
    startTzOverride: item.startTzOverride,
    endTzOverride: item.endTzOverride,
    locationName: item.locationName,
    from: route?.from ?? null,
    to: route?.to ?? null,
    completedAt: null,
  };
}

export type PlanningInput = {
  trip: Pick<Trip, 'name' | 'destination' | 'startDate' | 'endDate' | 'defaultTz'>;
  items: PlanningItem[];
  /** Per-trip classifications of the trip's traveller profiles — never names. */
  travellers: TravellerClassification[];
  /** Every booking reference stored in the trip, removed wherever it appears in a title. */
  secrets: string[];
};

/** The only bridge from stored rows to the planning model. */
export function planningInputOf(
  trip: PlanningInput['trip'],
  items: readonly TripItem[],
  travellers: readonly TravellerClassification[],
): PlanningInput {
  return {
    trip: {
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      defaultTz: trip.defaultTz,
    },
    items: items.flatMap((item) => planningItemOf(item) ?? []),
    travellers: [...travellers],
    secrets: items.flatMap((item) => (item.confirmationCode ? [item.confirmationCode] : [])),
  };
}

// ─── The scrub (best effort) ─────────────────────────────────────────────────────────────────────

const REMOVED = '…';
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Digits with the separators phone and card numbers use. Judged by the callback below. */
const NUMBERISH = /\+?\(?\d[\d ()./-]{6,}\d/g;
const DATES = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g;

/** A real calendar date inside the digits — 2026-11-21, 21.11.2026 — keeps them; 123-45-67 does not. */
function holdsDate(text: string): boolean {
  for (const m of text.matchAll(DATES)) {
    const [month, day] = m[1] ? [+m[2], +m[3]] : [+m[5], +m[4]];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  }
  return false;
}
const LONG_DIGITS = /\d{10,}/g;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Takes out what should not leave the phone if someone typed it into a title or place name: the
 * trip's own booking references (as whole words), emails, links, phone-like numbers (9+ digits,
 * not shaped like a date) and long digit runs. Dates, times, road and flight numbers and ordinary
 * names are left alone. Best effort — the person reviews the exact text before sharing.
 */
export function scrubPlanningText(text: string, secrets: readonly string[]): string {
  let out = text.replace(URL, REMOVED).replace(EMAIL, REMOVED);
  for (const secret of new Set(secrets.map((s) => s.trim()).filter((s) => s.length >= 3))) {
    out = out.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(secret)}(?=[^\\p{L}\\p{N}]|$)`, 'giu'),
      `$1${REMOVED}`,
    );
  }
  out = out.replace(NUMBERISH, (match) => {
    const digits = match.replace(/\D/g, '').length;
    return digits >= 9 && !holdsDate(match) ? REMOVED : match;
  });
  out = out.replace(LONG_DIGITS, REMOVED);
  return out.replace(/\s+/g, ' ').trim();
}

// ─── The request ─────────────────────────────────────────────────────────────────────────────────

export const PLANNING_INTENTIONS = [
  { key: 'improve', label: 'Improve my itinerary', text: 'Help me improve this itinerary: better order, sensible pacing, nothing important missed.' },
  { key: 'freeTime', label: 'Fill free time', text: 'Suggest things to do in the free time — the empty days and the gaps between plans.' },
  { key: 'busy', label: 'Is it too busy?', text: 'Check whether the schedule is too busy or unrealistic, and tell me where to ease off.' },
  { key: 'food', label: 'Places to eat', text: "Suggest places to eat that fit the plans, near where I'll be." },
  { key: 'general', label: 'General planning', text: 'Help me plan this trip.' },
  { key: 'custom', label: 'In my own words', text: '' },
] as const;

export type PlanningIntention = (typeof PLANNING_INTENTIONS)[number]['key'];

export const CUSTOM_REQUEST_MAX = 500;

export type PlanningOptions = {
  intention: PlanningIntention;
  /** Used when `intention` is `custom`, verbatim (trimmed, at most 500 characters). */
  customRequest: string;
  ideas: boolean;
  stays: boolean;
  travellers: boolean;
};

export const DEFAULT_PLANNING_OPTIONS: PlanningOptions = {
  intention: 'improve',
  customRequest: '',
  ideas: true,
  stays: false,
  travellers: false,
};

export function requestText(options: Pick<PlanningOptions, 'intention' | 'customRequest'>): string {
  if (options.intention === 'custom') {
    const own = options.customRequest.trim().slice(0, CUSTOM_REQUEST_MAX);
    return own || 'Help me plan this trip.';
  }
  return PLANNING_INTENTIONS.find((intention) => intention.key === options.intention)!.text;
}

// ─── The text ────────────────────────────────────────────────────────────────────────────────────

const HOW_TO_HELP = [
  "The itinerary above is what I already plan to do. Don't drop, move or replace anything without asking; suggest changes separately and say why.",
  'Keep ideas and planned activities apart; an idea is not decided.',
  'Point out clashes, impossible transfers and days that look too full or too empty.',
  "Don't invent bookings, prices, opening hours, availability or travel times — say when something needs checking.",
  'Nothing above is necessarily booked or paid.',
  'Ask me if something essential is missing.',
];

/** Compact, and consistent with the 2C parser — a test builds a reply from it and imports it. */
export const ACTIVITIES_FORMAT_BLOCK = `## If I ask for activities to import
Reply with only JSON in the Travel Organizer activities format, version 1:
{"format": "travel-organizer-activities", "version": 1, "activities": [ ... ]}
Each activity: "title" (required); optional "kind" (activity, food, stay, transport, other), "status" ("idea" for suggestions, "planned" only if I said I will do it — never "booked"), "date" (YYYY-MM-DD), "startTime" and "endTime" (HH:mm, 24-hour), "location" {"name", "address"}, "notes", "links" [{"url"}] with full web addresses only.
Leave out anything you don't know. Only new suggestions — don't repeat what is listed above.`;

function kindText(item: Pick<PlanningItem, 'kind' | 'subkind'>): string {
  return item.subkind ? `${kindLabel(item.kind)} · ${subkindLabel(item.subkind)}` : kindLabel(item.kind);
}

/** 'Sofia time' when this end is not in the trip's zone; null when it is. */
function zoneNote(zone: string, tripTz: string, place: string | null): string | null {
  return zone === tripTz ? null : `${zoneName(zone, place)} time`;
}

function timeWithZone(moment: LocalMoment, tripTz: string, place: string | null): string | null {
  const time = timeOfDay(moment);
  if (!time) return null;
  const note = zoneNote(moment.tz, tripTz, place);
  return note ? `${time} (${note})` : time;
}

function describe(item: PlanningItem, secrets: readonly string[]): string {
  const title = scrubPlanningText(item.title, secrets) || 'Untitled';
  const from = item.from ? scrubPlanningText(item.from, secrets) : '';
  const to = item.to ? scrubPlanningText(item.to, secrets) : '';
  const route = from && to ? `${from} → ${to}` : from || (to ? `→ ${to}` : '');
  const place = item.locationName ? scrubPlanningText(item.locationName, secrets) : '';
  const where =
    item.kind === 'transport'
      ? route && !title.includes(route) ? ` (${route})` : ''
      : place && place.toLowerCase() !== title.toLowerCase() ? `, at ${place}` : '';
  return `${title}${where} [${kindText(item)}]`;
}

function entryLine(entry: TimelineEntry<PlanningItem>, tripTz: string, secrets: readonly string[]): string {
  const { item, role } = entry;
  const startPlace = item.kind === 'transport' ? item.from : null;
  const endPlace = item.kind === 'transport' ? item.to : null;
  const label = entryRoleLabel({ role, item });
  let when: string | null;
  if (role === 'full') {
    const start = item.start ? timeWithZone(item.start, tripTz, startPlace) : null;
    const end = item.end ? timeWithZone(item.end, tripTz, endPlace) : null;
    const sameZone = (item.start?.tz ?? tripTz) === (item.end?.tz ?? tripTz);
    when = start && end ? `${start}${sameZone ? '–' : ' → '}${end}` : start;
  } else {
    when = timeWithZone(entry.moment, tripTz, role === 'start' ? startPlace : endPlace);
  }
  const prefix = [label, when].filter(Boolean).join(' ');
  return `- ${prefix ? `${prefix} — ` : ''}${describe(item, secrets)}`;
}

/** Ideas: most wanted first, then by title; the id only breaks exact ties. */
function ideaOrder(a: PlanningItem, b: PlanningItem): number {
  const rank = (p: Priority | null) => (p === null ? PRIORITIES.length : PRIORITIES.indexOf(p));
  return rank(a.priority) - rank(b.priority) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function startOrder(a: PlanningItem, b: PlanningItem): number {
  const ka = a.start?.local ?? '9999';
  const kb = b.start?.local ?? '9999';
  return ka.localeCompare(kb) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function tripDatesLine(trip: PlanningInput['trip']): string {
  // Said plainly, so no assistant assumes dates the person has not chosen (P6-10).
  if (!isDated(trip)) return 'Not decided yet. Do not assume any; give a date only to a plan tied to one.';
  const days = tripDates(trip).length;
  const startYear = trip.startDate.slice(0, 4);
  const endYear = trip.endDate.slice(0, 4);
  const range =
    trip.startDate === trip.endDate
      ? `${formatShortDate(trip.startDate)} ${startYear}`
      : startYear === endYear
        ? `${formatShortDate(trip.startDate)} – ${formatShortDate(trip.endDate)} ${endYear}`
        : `${formatShortDate(trip.startDate)} ${startYear} – ${formatShortDate(trip.endDate)} ${endYear}`;
  return `${range} (${days} ${days === 1 ? 'day' : 'days'})`;
}

/** The nights a stay covers, said once — the overnight base, not its check-in times. */
function stayLine(stay: PlanningItem, secrets: readonly string[]): string {
  const name = scrubPlanningText(stay.locationName || stay.title, secrets) || 'A place to stay';
  const what = stay.subkind ? subkindLabel(stay.subkind).toLowerCase() : 'stay';
  let nights: string;
  if (!stay.start) nights = 'Dates not set';
  else {
    const first = dayKey(stay.start);
    const out = stay.end ? dayKey(stay.end) : null;
    if (out === null || out <= first) nights = `From ${formatShortDate(first)}`;
    else {
      const last = addCalendarDays(out, -1);
      nights = last === first ? `Night of ${formatShortDate(first)}` : `Nights of ${formatShortDate(first)} – ${formatShortDate(last)}`;
    }
  }
  return `- ${nights}: ${name} (${what})${stay.status === 'idea' ? ' — an idea, not decided' : ''}`;
}

function travellersLine(classes: readonly TravellerClassification[]): string {
  if (classes.length === 0) return '- Not recorded in the app.';
  const count = (c: TravellerClassification) => classes.filter((x) => x === c).length;
  const parts = [
    count('adult') ? `${count('adult')} ${count('adult') === 1 ? 'adult' : 'adults'}` : null,
    count('child') ? `${count('child')} ${count('child') === 1 ? 'child' : 'children'}` : null,
    count('unspecified') && (count('adult') || count('child')) ? `${count('unspecified')} not specified` : null,
  ].filter(Boolean);
  const total = `${classes.length} ${classes.length === 1 ? 'traveller' : 'travellers'}`;
  return `- ${parts.length > 0 ? `${total}: ${parts.join(', ')}` : total}`;
}

/** The whole text, exactly as the preview shows it and as it is copied and shared. */
export function buildPlanningContext(input: PlanningInput, options: PlanningOptions): string {
  const { trip, secrets } = input;
  const tz = trip.defaultTz;
  const isStay = (item: PlanningItem) => item.kind === 'stay';
  const visible = input.items.filter((item) => options.stays || !isStay(item));
  // Stays never join the daily itinerary: with the switch on they have their own section.
  const planned = visible.filter((item) => item.status === 'confirmed' && !isStay(item));
  const ideas = visible.filter((item) => item.status === 'idea').sort(ideaOrder);
  const stays = visible.filter((item) => item.status === 'confirmed' && isStay(item)).sort(startOrder);

  const lines: string[] = ['# Travel Organizer — planning context', ''];
  lines.push('## My request', requestText(options), '');

  const destination = trip.destination ? scrubPlanningText(trip.destination, secrets) : '';
  const name = scrubPlanningText(trip.name, secrets);
  lines.push('## Trip');
  lines.push(destination ? `- Destination: ${destination}` : `- Trip: ${name}`);
  lines.push(`- Dates: ${tripDatesLine(trip)}`);
  lines.push(`- Times are local to ${tz} unless another zone is shown.`, '');

  // Days: every trip day; three or more empty days in a row collapse into one line. Without trip
  // dates, only the days that have plans, by their own dates.
  const byDay = new Map<string, TimelineEntry<PlanningItem>[]>();
  for (const day of buildTimeline(planned)) byDay.set(day.day, day.entries);
  const days = isDated(trip) ? tripDates(trip) : [...byDay.keys()].sort();
  const before = isDated(trip) ? [...byDay.keys()].filter((day) => day < trip.startDate) : [];
  const after = isDated(trip) ? [...byDay.keys()].filter((day) => day > trip.endDate) : [];
  const dayBlock = (day: string) => [
    `### ${formatShortDate(day)}`,
    ...(byDay.get(day) ?? []).map((entry) => entryLine(entry, tz, secrets)),
  ];

  lines.push('## Itinerary (already planned)', '');
  if (before.length > 0) {
    lines.push('### Before the trip');
    for (const day of before) {
      for (const entry of byDay.get(day)!) lines.push(entryLine(entry, tz, secrets).replace(/^- /, `- ${formatShortDate(day)}, `));
    }
    lines.push('');
  }
  for (let i = 0; i < days.length; ) {
    if (byDay.has(days[i])) {
      lines.push(...dayBlock(days[i]), '');
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && !byDay.has(days[j + 1])) j++;
    const run = j - i + 1;
    if (run >= 3) {
      lines.push(`### ${formatShortDate(days[i])} – ${formatShortDate(days[j])}`, '- Nothing planned yet.', '');
    } else {
      for (let k = i; k <= j; k++) lines.push(`### ${formatShortDate(days[k])}`, '- Nothing planned yet.', '');
    }
    i = j + 1;
  }
  if (after.length > 0) {
    lines.push('### After the trip');
    for (const day of after) {
      for (const entry of byDay.get(day)!) lines.push(entryLine(entry, tz, secrets).replace(/^- /, `- ${formatShortDate(day)}, `));
    }
    lines.push('');
  }
  const undated = planned.filter((item) => item.start === null).sort(startOrder);
  if (undated.length > 0) {
    lines.push('### Planned, no date yet', ...undated.map((item) => `- ${describe(item, secrets)}`), '');
  }

  if (options.stays) {
    lines.push('## Where we stay');
    lines.push(...(stays.length > 0 ? stays.map((stay) => stayLine(stay, secrets)) : ['- Not recorded in the app.']));
    lines.push('');
  }

  if (options.ideas && ideas.length > 0) {
    lines.push('## Ideas (not decided)');
    for (const idea of ideas) {
      if (isStay(idea)) {
        lines.push(stayLine(idea, secrets));
        continue;
      }
      const extras = [
        idea.priority,
        idea.start ? `considering ${formatShortDate(dayKey(idea.start))}${timeOfDay(idea.start) ? `, ${timeWithZone(idea.start, tz, null)}` : ''}` : null,
      ].filter(Boolean);
      lines.push(`- ${describe(idea, secrets)}${extras.length > 0 ? ` — ${extras.join(' — ')}` : ''}`);
    }
    lines.push('');
  }

  if (options.travellers) lines.push('## Travellers', travellersLine(input.travellers), '');

  lines.push('## How to help', ...HOW_TO_HELP.map((line) => `- ${line}`), '');
  lines.push(ACTIVITIES_FORMAT_BLOCK);
  return `${lines.join('\n')}\n`;
}
