/**
 * The public activities format (2C): a small JSON file an AI assistant can write and this app can
 * read — and write back, for selected activities. Deliberately independent of the database: no
 * ids, no table names, no files. Everything read from a file is untrusted, so it is checked here,
 * mapped to the `TripItemInput` every form produces, and then put through that same
 * `tripItemInputSchema` — nothing can be imported that the app's own form would refuse.
 *
 * Public description: docs/ai-activities-format.md. JSON Schema: ./activityFormat.schema.json.
 */

import { CURRENCY_CODE, isKnownCurrency } from './currencies';
import { amountText, formatShortDate, parseAmount } from './format';
import {
  defaultLinkLabel,
  guessLinkSubtype,
  isSafeExternalUrl,
  type ResourceSubtype,
} from './resource';
import { isValidLocal } from './time';
import { isResolvableTimezone } from './timezones';
import {
  isValidSubkind,
  PRIORITIES,
  transportDetails,
  tripItemInputSchema,
  type Priority,
  type TripItem,
  type TripItemInput,
  type TripItemKind,
} from './tripItem';

export const ACTIVITY_FORMAT = 'travel-organizer-activities';
export const ACTIVITY_FORMAT_VERSION = 1;

export const ACTIVITY_LIMITS = {
  fileBytes: 1_000_000,
  activities: 300,
  /** Objects inside objects. The format itself needs 4 (root → activities → activity → links → link). */
  depth: 6,
  title: 120,
  locationName: 120,
  address: 240,
  notes: 4000,
  links: 10,
  url: 2048,
  linkLabel: 120,
} as const;

/** To-dos are not activities: they are dated chores with a done state the format has no word for. */
export const ACTIVITY_KINDS = ['activity', 'food', 'stay', 'transport', 'other'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** `planned` is the app's `confirmed` — *In my itinerary*. Neither means booked or paid. */
export const ACTIVITY_STATUSES = ['idea', 'planned'] as const;

export type ActivityTrip = { defaultTz: string; startDate: string; endDate: string };

export type ActivityLink = { label: string; url: string; subtype: ResourceSubtype };

/** A field the file holds that is not read, and why. */
export type IgnoredField = { field: string; reason: string };

export type ParsedActivity = {
  /** Position in the file, from 0. */
  index: number;
  /** What to call it on screen, even when it is invalid. */
  title: string;
  /** Null when invalid; then `errors` says why. */
  input: TripItemInput | null;
  links: ActivityLink[];
  errors: string[];
  warnings: string[];
  ignored: IgnoredField[];
};

export type ActivityFileResult =
  | { ok: false; reason: string }
  | { ok: true; activities: ParsedActivity[]; ignored: IgnoredField[] };

const TOP_LEVEL_KEYS = new Set(['format', 'version', 'activities']);
const ACTIVITY_KEYS = new Set([
  'title',
  'kind',
  'type',
  'status',
  'priority',
  'date',
  'startTime',
  'endDate',
  'endTime',
  'timeZone',
  'endTimeZone',
  'location',
  'notes',
  'description',
  'price',
  'links',
  'transport',
]);
const LOCATION_KEYS = new Set(['name', 'address', 'latitude', 'longitude']);
const PRICE_KEYS = new Set(['amount', 'currency']);
const LINK_KEYS = new Set(['label', 'url']);
const TRANSPORT_KEYS = new Set(['from', 'to', 'carrier', 'number']);

/** Keys a JSON parser turns into own properties, and that must never reach an object spread. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** IANA names only: `isResolvableTimezone` alone would also take an offset such as '+02:00'. */
const IANA_ZONE = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/;
const HTTP_URL = /^https?:\/\/\S+$/i;
const NUMBER_AMOUNT = /^\d+(\.\d{1,2})?$/;

/** Why a field the format does not have is left out — said in the user's terms. */
function ignoredReason(field: string): string {
  const name = field.split('.').pop()!;
  const key = name.toLowerCase();
  if (field.startsWith('price.')) {
    return /per|adult|child|person|unit|each|quantity|people/.test(key)
      ? 'Per-person prices are not imported yet — only the total'
      : 'Not part of the price — only amount and currency';
  }
  if (/^(id|ids)$|Ids?$|_ids?$/.test(name)) return 'Ids are made by the app';
  if (/booking|confirmation|reference|code/.test(key)) return 'Booking references are not imported';
  if (/paid|payment/.test(key)) return 'Paid status is never imported';
  if (/participant|traveller|traveler|people|who/.test(key)) return 'Who is going is not imported';
  if (/file|attachment|document|photo|image/.test(key)) return 'Files are not imported';
  if (key === 'seat') return 'Seats are not imported';
  if (/created|updated|completed|timestamp/.test(key)) return 'Set by the app';
  if (/reminder/.test(key)) return 'Reminders follow the app’s own rules';
  return 'Not part of the format';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Depth of the deepest object or array, and whether any key is one that must never be used. */
function inspectStructure(value: unknown, depth = 0): { depth: number; dangerous: boolean } {
  if (value === null || typeof value !== 'object') return { depth, dangerous: false };
  let deepest = depth + 1;
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  for (const [key, child] of entries) {
    if (!Array.isArray(value) && DANGEROUS_KEYS.has(key)) return { depth: deepest, dangerous: true };
    const inner = inspectStructure(child, depth + 1);
    if (inner.dangerous) return inner;
    deepest = Math.max(deepest, inner.depth);
    if (deepest > ACTIVITY_LIMITS.depth) return { depth: deepest, dangerous: false };
  }
  return { depth: deepest, dangerous: false };
}

/** AI chats wrap JSON in a Markdown fence and editors add a BOM; both are taken off, nothing else. */
export function unwrapJsonText(text: string): string {
  const trimmed = text.replace(/^﻿/, '').trim();
  const fenced = /^```[A-Za-z]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Reads a whole file. A problem with the file itself — not JSON, not this format, a newer version,
 * too big, a structure no activity file has — refuses all of it. A problem with one activity makes
 * only that activity invalid.
 */
export function parseActivityFile(text: string, trip: ActivityTrip): ActivityFileResult {
  if (utf8Length(text) > ACTIVITY_LIMITS.fileBytes) {
    return { ok: false, reason: 'This file is larger than 1 MB, too large for an activities file.' };
  }
  const body = unwrapJsonText(text);
  if (body === '') return { ok: false, reason: 'This file is empty.' };

  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return {
      ok: false,
      reason: 'This file is not valid JSON. Check that it was saved or copied whole.',
    };
  }

  const structure = inspectStructure(root);
  if (structure.dangerous) {
    return { ok: false, reason: 'This file contains a structure activity files never have.' };
  }
  if (structure.depth > ACTIVITY_LIMITS.depth) {
    return { ok: false, reason: 'This file is nested more deeply than an activities file can be.' };
  }
  if (!isPlainObject(root) || root.format !== ACTIVITY_FORMAT) {
    return {
      ok: false,
      reason: `This is not a Travel Organizer activities file ("format" must be "${ACTIVITY_FORMAT}").`,
    };
  }
  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: '"version" must be the number 1.' };
  }
  if (version > ACTIVITY_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `This file is version ${version}, made for a newer version of Travel Organizer. Update the app first.`,
    };
  }
  const list = root.activities;
  if (!Array.isArray(list)) return { ok: false, reason: 'The file has no "activities" list.' };
  if (list.length === 0) return { ok: false, reason: 'The file has no activities in it.' };
  if (list.length > ACTIVITY_LIMITS.activities) {
    return {
      ok: false,
      reason: `The file has ${list.length} activities; at most ${ACTIVITY_LIMITS.activities} can be imported at once.`,
    };
  }

  return {
    ok: true,
    ignored: Object.keys(root)
      .filter((key) => !TOP_LEVEL_KEYS.has(key))
      .map((field) => ({ field, reason: ignoredReason(field) })),
    activities: list.map((raw, index) => parseActivity(raw, index, trip)),
  };
}

/** One activity. Every problem is collected, so the preview can say all of them at once. */
export function parseActivity(raw: unknown, index: number, trip: ActivityTrip): ParsedActivity {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ignored: IgnoredField[] = [];
  const fallbackTitle = `Activity ${index + 1}`;

  if (!isPlainObject(raw)) {
    return {
      index,
      title: fallbackTitle,
      input: null,
      links: [],
      errors: ['This entry is not an activity (expected an object with a title).'],
      warnings,
      ignored,
    };
  }

  const ignoreUnknown = (object: Record<string, unknown>, known: Set<string>, prefix: string) => {
    for (const key of Object.keys(object)) {
      if (!known.has(key)) {
        const field = prefix + key;
        ignored.push({ field, reason: ignoredReason(field) });
      }
    }
  };
  ignoreUnknown(raw, ACTIVITY_KEYS, '');

  /** Text, trimmed; null and '' are absent. Wrong type or too long is an error. */
  const text = (value: unknown, field: string, max: number): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      errors.push(`"${field}" must be text.`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
      errors.push(`"${field}" is longer than ${max} characters.`);
      return undefined;
    }
    return trimmed === '' ? undefined : trimmed;
  };

  /** A nested object, or absent. Anything else is an error. */
  const object = (value: unknown, field: string): Record<string, unknown> | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!isPlainObject(value)) {
      errors.push(`"${field}" must be an object.`);
      return undefined;
    }
    return value;
  };

  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  const title = text(raw.title, 'title', ACTIVITY_LIMITS.title);
  if (title === undefined && !errors.some((e) => e.startsWith('"title"'))) {
    errors.push('It has no title.');
  }

  // Kind, type, status, priority — the app's own values only.
  let kind: ActivityKind = 'activity';
  const rawKind = text(raw.kind, 'kind', 40);
  if (rawKind !== undefined) {
    if ((ACTIVITY_KINDS as readonly string[]).includes(rawKind)) kind = rawKind as ActivityKind;
    else errors.push(`"kind" "${rawKind}" is not supported — use ${ACTIVITY_KINDS.join(', ')}.`);
  }

  let subkind: string | undefined = text(raw.type, 'type', 40);
  if (subkind !== undefined && !isValidSubkind(kind as TripItemKind, subkind)) {
    warnings.push(`"${subkind}" is not a type of ${kind}, so it is left out.`);
    subkind = undefined;
  }

  let status: 'idea' | 'confirmed' = 'idea';
  const rawStatus = text(raw.status, 'status', 40);
  if (rawStatus === 'planned') status = 'confirmed';
  else if (rawStatus !== undefined && rawStatus !== 'idea') {
    errors.push(`"status" "${rawStatus}" is not supported — use idea or planned.`);
  }

  let priority: Priority | undefined;
  const rawPriority = text(raw.priority, 'priority', 40);
  if (rawPriority !== undefined) {
    if (!(PRIORITIES as readonly string[]).includes(rawPriority)) {
      warnings.push(`Priority "${rawPriority}" is not must, want or maybe, so it is left out.`);
    } else if (status === 'confirmed') {
      warnings.push('Priority is for ideas only, so it is left out.');
    } else {
      priority = rawPriority as Priority;
    }
  }

  // When. Nothing is filled in that the file did not say.
  // Generous lengths: a wrong value is better reported as not a date than as too long.
  const date = text(raw.date, 'date', 40);
  const startTime = text(raw.startTime, 'startTime', 40);
  const endDate = text(raw.endDate, 'endDate', 40);
  const endTime = text(raw.endTime, 'endTime', 40);
  const checkDate = (value: string | undefined, field: string) => {
    if (value !== undefined && !isValidLocal(value, 'date')) {
      errors.push(`"${field}" "${value}" is not a real date — use YYYY-MM-DD.`);
      return false;
    }
    return true;
  };
  const checkTime = (value: string | undefined, field: string) => {
    if (value !== undefined && !TIME.test(value)) {
      errors.push(`"${field}" "${value}" is not a time — use HH:mm, 24-hour.`);
      return false;
    }
    return true;
  };
  const datesOk = checkDate(date, 'date') && checkDate(endDate, 'endDate');
  const timesOk = checkTime(startTime, 'startTime') && checkTime(endTime, 'endTime');
  if (date === undefined) {
    for (const [value, field] of [
      [startTime, 'startTime'],
      [endDate, 'endDate'],
      [endTime, 'endTime'],
    ] as const) {
      if (value !== undefined) errors.push(`"${field}" needs a "date".`);
    }
  }

  const zone = (value: unknown, field: string): string | undefined => {
    const tz = text(value, field, 64);
    if (tz === undefined) return undefined;
    if (!IANA_ZONE.test(tz) || !isResolvableTimezone(tz)) {
      errors.push(`"${field}" "${tz}" is not a time zone — use a name like Europe/Helsinki.`);
      return undefined;
    }
    return tz;
  };
  const timeZone = zone(raw.timeZone, 'timeZone');
  const endTimeZone = zone(raw.endTimeZone, 'endTimeZone');

  let start: TripItemInput['start'];
  let end: TripItemInput['end'];
  if (date !== undefined && datesOk && timesOk) {
    start = { local: startTime ? `${date}T${startTime}` : date, ...(timeZone ? { tz: timeZone } : {}) };
    const endDay = endDate ?? date;
    if (endTime !== undefined || endDay !== date) {
      // The end is in the start's zone unless the file says otherwise — a flight says otherwise.
      const tz = endTimeZone ?? timeZone;
      end = { local: endTime ? `${endDay}T${endTime}` : endDay, ...(tz ? { tz } : {}) };
    }
  }
  if (date === undefined && timeZone !== undefined) {
    warnings.push('A time zone without a date means nothing, so it is left out.');
  }
  if (end === undefined && endTimeZone !== undefined && date !== undefined) {
    warnings.push('"endTimeZone" without an end time is left out.');
  }

  // Where.
  const location = object(raw.location, 'location');
  let locationName: string | undefined;
  let address: string | undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;
  if (location) {
    ignoreUnknown(location, LOCATION_KEYS, 'location.');
    locationName = text(location.name, 'location.name', ACTIVITY_LIMITS.locationName);
    address = text(location.address, 'location.address', ACTIVITY_LIMITS.address);
    const coordinate = (value: unknown, field: string, limit: number) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`"${field}" must be a number.`);
        return undefined;
      }
      if (Math.abs(value) > limit) {
        errors.push(`"${field}" ${value} is out of range (−${limit} to ${limit}).`);
        return undefined;
      }
      return value;
    };
    latitude = coordinate(location.latitude, 'location.latitude', 90);
    longitude = coordinate(location.longitude, 'location.longitude', 180);
    const hasLat = location.latitude !== undefined && location.latitude !== null;
    const hasLng = location.longitude !== undefined && location.longitude !== null;
    if (hasLat !== hasLng) errors.push('A location needs both latitude and longitude, or neither.');
  }

  // Notes: the format's description goes first, its notes after — both kept, said in the docs.
  const description = text(raw.description, 'description', ACTIVITY_LIMITS.notes);
  const ownNotes = text(raw.notes, 'notes', ACTIVITY_LIMITS.notes);
  const notes = [description, ownNotes].filter(Boolean).join('\n\n') || undefined;

  // Price: the total, never per person, never paid.
  let priceAmount: number | undefined;
  let priceCurrency: string | undefined;
  const price = object(raw.price, 'price');
  if (price) {
    ignoreUnknown(price, PRICE_KEYS, 'price.');
    const amount = price.amount;
    if (amount === undefined || amount === null) {
      errors.push('"price" needs an "amount".');
    } else if (typeof amount === 'string') {
      const parsed = parseAmount(amount);
      if (parsed === undefined || parsed === null) {
        errors.push(`"price.amount" "${amount}" is not an amount — use a number like 12.50.`);
      } else {
        priceAmount = parsed;
      }
    } else if (typeof amount === 'number') {
      // `String` of a finite number is its shortest exact form, so 12.345 and 1e21 both show.
      if (!Number.isFinite(amount) || !NUMBER_AMOUNT.test(String(amount))) {
        errors.push(
          `"price.amount" ${String(amount)} is not an amount — at most two decimals, not negative.`,
        );
      } else {
        const minor = Math.round(amount * 100);
        if (Number.isSafeInteger(minor)) priceAmount = minor;
        else errors.push('"price.amount" is too large.');
      }
    } else {
      errors.push('"price.amount" must be a number or text like "12.50".');
    }
    const currency = text(price.currency, 'price.currency', 3 + 10);
    if (currency === undefined) {
      if (!errors.some((e) => e.startsWith('"price.currency"'))) {
        errors.push('"price" needs a "currency", like EUR.');
      }
    } else if (!CURRENCY_CODE.test(currency)) {
      errors.push(`"price.currency" "${currency}" is not a currency code — use three capitals, like EUR.`);
    } else {
      priceCurrency = currency;
      if (!isKnownCurrency(currency)) warnings.push(`${currency} is not a currency code we know — check it.`);
    }
  }

  // Links: web pages only. A geo:, mailto: or javascript: link is refused, not rewritten.
  const links: ActivityLink[] = [];
  const rawLinks = raw.links;
  if (rawLinks !== undefined && rawLinks !== null) {
    if (!Array.isArray(rawLinks)) {
      errors.push('"links" must be a list.');
    } else if (rawLinks.length > ACTIVITY_LIMITS.links) {
      errors.push(`At most ${ACTIVITY_LIMITS.links} links per activity.`);
    } else {
      rawLinks.forEach((entry, i) => {
        const field = `links[${i}]`;
        if (!isPlainObject(entry)) {
          errors.push(`"${field}" must be an object with a "url".`);
          return;
        }
        ignoreUnknown(entry, LINK_KEYS, `${field}.`);
        const url = text(entry.url, `${field}.url`, ACTIVITY_LIMITS.url);
        const label = text(entry.label, `${field}.label`, ACTIVITY_LIMITS.linkLabel);
        if (url === undefined) {
          if (!errors.some((e) => e.startsWith(`"${field}.url"`))) errors.push(`"${field}" has no "url".`);
          return;
        }
        if (!HTTP_URL.test(url) || !isSafeExternalUrl(url)) {
          errors.push(`"${field}.url" must start with https:// or http://.`);
          return;
        }
        links.push({ url, label: label ?? defaultLinkLabel(url), subtype: guessLinkSubtype(url) });
      });
    }
  }

  // A route, for travel only.
  let details: Record<string, unknown> | undefined;
  const transport = object(raw.transport, 'transport');
  if (transport) {
    if (kind !== 'transport') {
      warnings.push('"transport" is only for kind transport, so it is left out.');
    } else {
      ignoreUnknown(transport, TRANSPORT_KEYS, 'transport.');
      const route = {
        from: text(transport.from, 'transport.from', 80),
        to: text(transport.to, 'transport.to', 80),
        carrier: text(transport.carrier, 'transport.carrier', 60),
        number: text(transport.number, 'transport.number', 24),
      };
      const kept = Object.fromEntries(Object.entries(route).filter(([, v]) => v !== undefined));
      if (Object.keys(kept).length > 0) details = kept;
    }
  }

  if (status === 'confirmed' && date === undefined && errors.length === 0) {
    warnings.push('Planned without a date — it goes under “No date yet” on the Timeline.');
  }
  if (date !== undefined && datesOk && (date > trip.endDate || (endDate ?? date) < trip.startDate)) {
    warnings.push(`On ${formatShortDate(date)}, outside this trip’s dates.`);
  }

  const shownTitle = title ?? (rawTitle.slice(0, ACTIVITY_LIMITS.title) || fallbackTitle);
  if (errors.length > 0) {
    return { index, title: shownTitle, input: null, links, errors, warnings, ignored };
  }

  // The form's own schema has the last word: end before start, a price without a currency, …
  const candidate = {
    kind,
    subkind: subkind ?? null,
    status,
    priority: priority ?? null,
    title,
    start,
    end,
    locationName,
    address,
    latitude,
    longitude,
    notes,
    details,
    priceAmount,
    priceCurrency,
    isPaid: false,
  };
  const parsed = tripItemInputSchema(trip.defaultTz).safeParse(candidate);
  if (!parsed.success) {
    return {
      index,
      title: shownTitle,
      input: null,
      links,
      errors: parsed.error.issues.map((issue) => issue.message),
      warnings,
      ignored,
    };
  }
  return { index, title: shownTitle, input: parsed.data, links, errors, warnings, ignored };
}

// ─── Export ──────────────────────────────────────────────────────────────────────────────────────

export type ExportLink = { label: string; url: string; subtype: ResourceSubtype };

export type ActivityExport = {
  /** The JSON document, ready to write. */
  document: { format: string; version: number; activities: Record<string, unknown>[] };
  /** Items that could not go in, with the reason, so nothing is left out silently. */
  excluded: { id: string; title: string; reason: string }[];
  /** Links not written: wallet passes, tickets, confirmations and anything not http(s). */
  skippedLinks: number;
};

/** Which items an export can offer at all: ideas and plans, never to-dos or cancelled ones. */
export function exportBlocker(item: Pick<TripItem, 'kind' | 'status'>): string | null {
  if (item.kind === 'task') return 'To-dos are not part of the activities format';
  if (item.status === 'cancelled') return 'Cancelled — the format cannot say so';
  return null;
}

/** Website and map pages only: a wallet pass or a ticket link can carry a personal booking. */
function isExportableLink(link: ExportLink): boolean {
  const url = link.url.trim();
  return (
    (link.subtype === 'website' || link.subtype === 'maps') &&
    HTTP_URL.test(url) &&
    url.length <= ACTIVITY_LIMITS.url
  );
}

/** One stored item in the public format. Only the fields the format has; nothing private. */
export function activityFromItem(
  item: TripItem,
  links: readonly ExportLink[],
  tripDefaultTz: string,
): Record<string, unknown> {
  const activity: Record<string, unknown> = { title: item.title, kind: item.kind };
  if (item.subkind && isValidSubkind(item.kind, item.subkind)) activity.type = item.subkind;
  activity.status = item.status === 'confirmed' ? 'planned' : 'idea';
  if (item.status === 'idea' && item.priority) activity.priority = item.priority;

  if (item.start) {
    activity.date = item.start.local.slice(0, 10);
    if (item.start.precision === 'time') activity.startTime = item.start.local.slice(11, 16);
    if (item.startTzOverride) activity.timeZone = item.startTzOverride;
  }
  if (item.start && item.end) {
    const endDay = item.end.local.slice(0, 10);
    if (endDay !== activity.date) activity.endDate = endDay;
    if (item.end.precision === 'time') activity.endTime = item.end.local.slice(11, 16);
    // An end in another zone than the start's is written as the zone it resolves to, so it means
    // the same thing in a trip with another default zone.
    if (item.endTzOverride !== item.startTzOverride) {
      activity.endTimeZone = item.endTzOverride ?? tripDefaultTz;
    }
  }

  const location: Record<string, unknown> = {};
  if (item.locationName) location.name = item.locationName;
  if (item.address) location.address = item.address;
  if (item.latitude !== null && item.longitude !== null) {
    location.latitude = item.latitude;
    location.longitude = item.longitude;
  }
  if (Object.keys(location).length > 0) activity.location = location;

  if (item.notes) activity.notes = item.notes;
  if (item.priceAmount !== null && item.priceCurrency) {
    activity.price = { amount: amountText(item.priceAmount), currency: item.priceCurrency };
  }

  const kept = links.filter(isExportableLink).map((link) => ({ label: link.label, url: link.url.trim() }));
  if (kept.length > 0) activity.links = kept;

  const route = transportDetails(item);
  if (route) {
    const transport = Object.fromEntries(
      (['from', 'to', 'carrier', 'number'] as const).flatMap((key) =>
        route[key] ? [[key, route[key]]] : [],
      ),
    );
    if (Object.keys(transport).length > 0) activity.transport = transport;
  }
  return activity;
}

/**
 * The file for the chosen items. Each activity is read back through the importer before it is
 * written, so every exported file imports again; one that would not is listed, never altered.
 */
export function buildActivityExport(
  items: readonly TripItem[],
  linksByItem: ReadonlyMap<string, readonly ExportLink[]>,
  trip: ActivityTrip,
): ActivityExport {
  const activities: Record<string, unknown>[] = [];
  const excluded: ActivityExport['excluded'] = [];
  let skippedLinks = 0;

  for (const item of items) {
    const blocker = exportBlocker(item);
    if (blocker) {
      excluded.push({ id: item.id, title: item.title, reason: blocker });
      continue;
    }
    const links = linksByItem.get(item.id) ?? [];
    const activity = activityFromItem(item, links, trip.defaultTz);
    const check = parseActivity(activity, activities.length, trip);
    if (check.input === null) {
      excluded.push({ id: item.id, title: item.title, reason: check.errors[0] ?? 'Cannot be written' });
      continue;
    }
    skippedLinks += links.length - ((activity.links as unknown[] | undefined)?.length ?? 0);
    activities.push(activity);
  }

  return {
    document: { format: ACTIVITY_FORMAT, version: ACTIVITY_FORMAT_VERSION, activities },
    excluded,
    skippedLinks,
  };
}

/** `Lapland-activities-2026-10-19.json`, from the trip's name. */
export function activityFileName(tripName: string, now: Date): string {
  const safe =
    tripName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'trip';
  return `${safe}-activities-${now.toISOString().slice(0, 10)}.json`;
}
