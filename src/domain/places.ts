/**
 * Where things are: the link that opens a place in a maps app, the names offered while typing a
 * place, and which booked items the Places tab lists beside the ideas (U5).
 */

import { timelineEntries } from './timeline';
import type { TripItem } from './tripItem';

type Located = Pick<TripItem, 'locationName' | 'address' | 'latitude' | 'longitude'>;

/**
 * A `geo:` link, which Android hands to whichever maps app is installed — Google Maps searches
 * for it, and finds it offline too when the area is downloaded. Coordinates win when they exist;
 * otherwise the name and address together are the most precise search. Null with nothing to find.
 */
export function mapsUrl(item: Located): string | null {
  const query = [item.locationName, item.address]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

  if (item.latitude !== null && item.longitude !== null) {
    const at = `${item.latitude},${item.longitude}`;
    return query ? `geo:${at}?q=${at}(${encodeURIComponent(query)})` : `geo:${at}?q=${at}`;
  }
  return query ? `geo:0,0?q=${encodeURIComponent(query)}` : null;
}

export type KnownPlace = { name: string; address: string | null };

/**
 * Places already written somewhere, offered while typing so the same hotel or station is not
 * typed twice. Matches anywhere in the name, case-insensitively; names that start with the query
 * come first. Nothing is offered for an empty query or for the exact name already typed.
 */
export function suggestPlaces(
  known: readonly KnownPlace[],
  query: string,
  limit = 4,
): KnownPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const matches = known.filter((place) => {
    const name = place.name.toLowerCase();
    if (name === q || !name.includes(q) || seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  const starts = (place: KnownPlace) => (place.name.toLowerCase().startsWith(q) ? 0 : 1);
  return matches
    .sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Booked items that say where they are, for the Places tab under the ideas: the hotel, the
 * museum, the restaurant. Timeline order, then undated by title. Cancelled ones are left out.
 */
export function bookedPlaces<T extends TripItem>(items: readonly T[]): T[] {
  const located = items.filter(
    (item) => item.status === 'confirmed' && (item.locationName?.trim() || item.address?.trim()),
  );

  const dated = timelineEntries(located)
    .filter((entry) => entry.role !== 'end')
    .map((entry) => entry.item);
  const seen = new Set(dated.map((item) => item.id));
  const undated = located
    .filter((item) => !seen.has(item.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  return [...dated, ...undated];
}
