/**
 * What a Google Maps link says about a place, read from the URL alone (Phase 7,
 * `docs/phase7-plan.md` §3). Nothing here fetches: a short link is only recognised, and
 * `acceptedRedirect` judges where the one lookup request (`lookUpMapsLink`) ended up.
 *
 * Read only what the link itself states: the name and address Google writes into a place URL, the
 * place's own coordinates (`!3d…!4d…`), or a query's `lat,lng`. A viewport (`@lat,lng,15z`) is where
 * the map happened to be centred, not the place, so it is never taken.
 */

import { metresBetween, normaliseTitle, SAME_PLACE_METRES } from './activityDuplicates';
import { parseCoordinates, validateCoordinates } from './directions';
import type { TripItem } from './tripItem';

export type MapsPlace = {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

const NOTHING: MapsPlace = { name: null, address: null, latitude: null, longitude: null };

/** Longer than any real place URL's name and address, short enough to keep junk out of a field. */
const MAX_TEXT = 240;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** 'google.com', 'google.fi', 'google.co.uk' — Google's own hosts, with or without www. */
function isGoogleHost(host: string): boolean {
  return /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

function isMapsHost(host: string): boolean {
  return /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

function isConsentHost(host: string): boolean {
  return /^consent\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

/** A short link that only a lookup can open: maps.app.goo.gl/…, goo.gl/maps/…. https only. */
export function isShortMapsLink(value: string): boolean {
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  return host === 'goo.gl' && /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
}

/** A long Google Maps URL on Google's own hosts — the kind `parseMapsLink` can read. */
function isLongMapsUrl(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (isMapsHost(host)) return true;
  return isGoogleHost(host) && /^\/maps(\/|$)/.test(url.pathname);
}

/** Any link this phase treats as Google Maps: long, short, consent-wrapped or `geo:`. */
export function isGoogleMapsLink(value: string): boolean {
  if (/^geo:/i.test(value.trim())) return geoPlace(value.trim()) !== null;
  if (isShortMapsLink(value)) return true;
  const url = unwrapConsent(parseUrl(value));
  return url !== null && isLongMapsUrl(url);
}

/** Google's cookie notice wraps the real page: consent.google.<tld>/…?continue=<the maps URL>. */
function unwrapConsent(url: URL | null): URL | null {
  if (!url) return null;
  if (!isConsentHost(url.hostname.toLowerCase())) return url;
  const inner = parseUrl(url.searchParams.get('continue') ?? '');
  return inner && !isConsentHost(inner.hostname.toLowerCase()) ? inner : null;
}

function clean(text: string | null | undefined): string | null {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, MAX_TEXT) : null;
}

/** Seven places, about a centimetre: Google writes 66.50394779999999, which is float noise. */
const round7 = (value: number) => Math.round(value * 1e7) / 1e7;

function coordinates(latitude: number, longitude: number): Pick<MapsPlace, 'latitude' | 'longitude'> | null {
  // 0,0 is what `geo:0,0?q=…` uses for "no position", not a place in the Gulf of Guinea.
  if (latitude === 0 && longitude === 0) return null;
  return validateCoordinates(latitude, longitude)
    ? { latitude: round7(latitude), longitude: round7(longitude) }
    : null;
}

const DMS = /^\s*(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"\s*([EW])\s*$/i;

/** 66°30'14.2"N 25°43'45.8"E — how Google names a dropped pin — as decimal degrees. */
function fromDegrees(text: string): Pick<MapsPlace, 'latitude' | 'longitude'> | null {
  const m = DMS.exec(text);
  if (!m) return null;
  const decimal = (d: string, min: string, sec: string, hemisphere: string) =>
    (Number(d) + Number(min) / 60 + Number(sec) / 3600) * (/[SW]/i.test(hemisphere) ? -1 : 1);
  // Six places, about 10 cm: more would only be noise from the seconds' rounding.
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return coordinates(round(decimal(m[1], m[2], m[3], m[4])), round(decimal(m[5], m[6], m[7], m[8])));
}

/** 'lat,lng' as query text ('66.50,25.72', '66.50, 25.72', '66.50+25.72', or in degrees), else null. */
function coordinatesIn(text: string | null): Pick<MapsPlace, 'latitude' | 'longitude'> | null {
  if (!text) return null;
  const spaced = text.replace(/\+/g, ' ');
  const parsed = parseCoordinates(spaced);
  return parsed ? coordinates(parsed.latitude, parsed.longitude) : fromDegrees(spaced);
}

/** The place's own pin in a place URL's data: …!3d66.5039478!4d25.7293906… */
function placePin(url: URL): Pick<MapsPlace, 'latitude' | 'longitude'> | null {
  const match = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(url.pathname + url.search);
  return match ? coordinates(Number(match[1]), Number(match[2])) : null;
}

/** 'Arktikum, Pohjoisranta 4, 96200 Rovaniemi, Finland' → the name, and the address after it. */
function nameAndAddress(text: string | null): Pick<MapsPlace, 'name' | 'address'> {
  const value = clean(text);
  if (!value) return { name: null, address: null };
  const comma = value.indexOf(',');
  if (comma < 0) return { name: value, address: null };
  return { name: clean(value.slice(0, comma)), address: clean(value.slice(comma + 1)) };
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function geoPlace(value: string): MapsPlace | null {
  const match = /^geo:(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:[;?](.*))?$/i.exec(value);
  if (!match) return null;
  const query = new URLSearchParams(match[3]?.split('?').pop() ?? '').get('q');
  const position = coordinates(Number(match[1]), Number(match[2])) ?? coordinatesIn(query);
  const named = coordinatesIn(query) ? null : clean(query);
  return { ...NOTHING, name: named, ...(position ?? {}) };
}

/**
 * What the link says about the place, or null when it is not a Google Maps link this can read (a
 * short link included: it needs `lookUpMapsLink` first). Fields the link does not give are null —
 * never guessed.
 */
export function parseMapsLink(value: string): MapsPlace | null {
  const text = value.trim();
  if (/^geo:/i.test(text)) return geoPlace(text);
  const url = unwrapConsent(parseUrl(text));
  if (!url || !isLongMapsUrl(url)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const after = (word: string) => {
    const index = segments.indexOf(word);
    return index >= 0 && segments[index + 1] !== undefined ? decodeSegment(segments[index + 1]) : null;
  };

  // A place page: /maps/place/<name, address>/[@viewport]/data=…
  const place = after('place');
  if (place !== null) {
    const pin = placePin(url) ?? coordinatesIn(place);
    const words = coordinatesIn(place) ? { name: null, address: null } : nameAndAddress(place);
    return { ...NOTHING, ...words, ...(pin ?? {}) };
  }

  // A documented query (`api=1&query=`) or the older q= / ll= / daddr= parameters.
  const query =
    url.searchParams.get('query') ??
    url.searchParams.get('q') ??
    url.searchParams.get('daddr') ??
    url.searchParams.get('ll');
  if (query !== null) {
    const position = coordinatesIn(query);
    return position ? { ...NOTHING, ...position } : { ...NOTHING, ...nameAndAddress(query) };
  }

  // /maps/search/<lat>,<lng> or /maps/search/<text>
  const search = after('search');
  if (search !== null) {
    const position = coordinatesIn(search);
    return position ? { ...NOTHING, ...position } : { ...NOTHING, ...nameAndAddress(search) };
  }

  // Only a viewport (/maps/@66.5,25.7,15z) or the bare map: a Maps link, but no place in it.
  return { ...NOTHING };
}

/**
 * Where a short-link lookup ended up, if it is somewhere this trusts: a Google Maps page on Google's
 * own https hosts, or the cookie notice wrapping one. Null otherwise — the link is still saved.
 */
export function acceptedRedirect(finalUrl: string): MapsPlace | null {
  const url = parseUrl(finalUrl);
  if (!url || url.protocol !== 'https:') return null;
  const inner = unwrapConsent(url);
  if (!inner || inner.protocol !== 'https:' || !isLongMapsUrl(inner)) return null;
  return parseMapsLink(inner.toString());
}

/** Whether the parse found anything worth showing: a name, an address or coordinates. */
export function hasPlaceFacts(place: MapsPlace | null): place is MapsPlace {
  return place !== null && (place.name !== null || place.address !== null || place.latitude !== null);
}

/**
 * Something the trip already holds that this place may be (P7-4): the same title, or within 100 m
 * (the 2C rule). A warning only — two visits to one place can be meant.
 */
export function findPlaceDuplicate(
  candidate: { title: string; latitude: number | null; longitude: number | null },
  items: readonly Pick<TripItem, 'id' | 'title' | 'status' | 'latitude' | 'longitude'>[],
): { id: string; title: string; status: TripItem['status']; reason: 'title' | 'place' } | null {
  const title = normaliseTitle(candidate.title);
  for (const item of items) {
    if (title !== '' && normaliseTitle(item.title) === title) {
      return { id: item.id, title: item.title, status: item.status, reason: 'title' };
    }
    const distance = metresBetween(candidate, item);
    if (distance !== null && distance <= SAME_PLACE_METRES) {
      return { id: item.id, title: item.title, status: item.status, reason: 'place' };
    }
  }
  return null;
}
