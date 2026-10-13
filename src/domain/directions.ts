/**
 * Pure domain rules for Directions and Google Maps A -> B links.
 * Zero React, zero React Native, zero SQLite imports.
 */

import { toInstant } from './time';
import type { TimelineEntry } from './timeline';
import { transportDetails, type TripItem } from './tripItem';

export type DirectionEndpoint = {
  title: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type TravelMode = 'walking' | 'driving' | 'transit';

export type OriginChoice =
  | { type: 'current_location' }
  | { type: 'endpoint'; endpoint: DirectionEndpoint };

export type DirectionsRequest = {
  origin: OriginChoice;
  destination: DirectionEndpoint;
  travelMode?: TravelMode | null;
};

export type TimelineConnector = {
  id: string;
  fromItem: TripItem;
  toItem: TripItem;
  origin: DirectionEndpoint;
  destination: DirectionEndpoint;
};

/**
 * Validates latitude and longitude as a pair.
 * Accept zero coordinates (e.g. 0, 0 / Null Island).
 */
export function validateCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Formats an endpoint query for Google Maps.
 * Coordinates take priority when valid as a pair.
 * Otherwise, combines place name and address without repeating overlapping text.
 */
export function formatEndpointQuery(endpoint: DirectionEndpoint): string | null {
  if (validateCoordinates(endpoint.latitude, endpoint.longitude)) {
    return `${endpoint.latitude},${endpoint.longitude}`;
  }

  const title = endpoint.title?.trim() ?? '';
  const address = endpoint.address?.trim() ?? '';

  if (!title && !address) return null;

  if (title && address) {
    // Avoid duplicate if address already includes the title
    if (address.toLowerCase().includes(title.toLowerCase())) {
      return address;
    }
    return `${title}, ${address}`;
  }

  return title || address;
}

/**
 * Checks if two endpoints refer to the same location, suppressing redundant connectors.
 */
export function areEndpointsEqual(
  a: DirectionEndpoint | null | undefined,
  b: DirectionEndpoint | null | undefined,
): boolean {
  if (!a || !b) return false;

  if (validateCoordinates(a.latitude, a.longitude) && validateCoordinates(b.latitude, b.longitude)) {
    return a.latitude === b.latitude && a.longitude === b.longitude;
  }

  const queryA = formatEndpointQuery(a)?.toLowerCase().trim();
  const queryB = formatEndpointQuery(b)?.toLowerCase().trim();
  return !!queryA && queryA === queryB;
}

/**
 * Pure URL builder for Google Maps A -> B directions.
 * Returns null if the destination cannot be resolved into a query.
 * For current location, the `origin` query parameter is omitted entirely.
 * If travelMode is unspecified/null, `travelmode` is omitted.
 */
export function buildGoogleMapsUrl(request: DirectionsRequest): string | null {
  const destQuery = formatEndpointQuery(request.destination);
  if (!destQuery) return null;

  const params = new URLSearchParams();
  params.set('api', '1');

  if (request.origin.type === 'endpoint') {
    const originQuery = formatEndpointQuery(request.origin.endpoint);
    if (originQuery) {
      params.set('origin', originQuery);
    }
  }

  params.set('destination', destQuery);

  if (request.travelMode) {
    params.set('travelmode', request.travelMode);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Resolves an item's location endpoint depending on its timeline role.
 *
 * For transport:
 * - 'destination' (incoming / heading to it): uses `details.from` (departure airport/station).
 * - 'origin' (outgoing / leaving from it): uses `details.to` (arrival airport/station).
 *
 * For stays and other items:
 * - Uses locationName, address, and coordinates.
 *
 * Returns null if the item has no resolvable location.
 */
export function resolveItemEndpoint(
  item: TripItem,
  role: 'origin' | 'destination',
): DirectionEndpoint | null {
  if (item.kind === 'transport') {
    const details = transportDetails(item);
    if (role === 'destination') {
      const from = details?.from?.trim();
      if (from) {
        return {
          title: from,
          address: item.address ?? null,
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
        };
      }
    } else {
      const to = details?.to?.trim();
      if (to) {
        return {
          title: to,
          address: null,
          latitude: null,
          longitude: null,
        };
      }
    }
  }

  const hasLocation =
    Boolean(item.locationName?.trim()) ||
    Boolean(item.address?.trim()) ||
    validateCoordinates(item.latitude, item.longitude);

  if (!hasLocation) {
    return null;
  }

  return {
    title: item.locationName?.trim() || item.title.trim(),
    address: item.address?.trim() || null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
  };
}

/**
 * Finds valid connectors between consecutive commitments on a single day.
 *
 * Excludes:
 * - Cancelled items and ideas (uncommitted).
 * - Tasks (preparation to-dos).
 * - Date-only items (no fixed time in sequence).
 * - Overlapping events (ambiguous physical order).
 * - Middle missing-location events (suppresses connectors rather than creating misleading shortcuts).
 * - Consecutive events resolving to the same endpoint.
 */
export function findTimelineConnectors(
  entries: readonly TimelineEntry<TripItem>[],
): TimelineConnector[] {
  // Only evaluate confirmed, non-task, timed entries
  const eligible = entries.filter((e) => {
    if (e.item.status !== 'confirmed') return false;
    if (e.item.kind === 'task') return false;
    if (e.moment.precision === 'date') return false;
    return true;
  });

  const connectors: TimelineConnector[] = [];

  for (let i = 0; i < eligible.length - 1; i++) {
    const curr = eligible[i];
    const next = eligible[i + 1];

    // Check if curr and next overlap in time
    if (curr.item.end) {
      const currEnd = toInstant(curr.item.end);
      const nextStart = toInstant(next.moment);
      if (currEnd > nextStart) {
        // Ambiguous overlap, suppress connector
        continue;
      }
    }

    const origin = resolveItemEndpoint(curr.item, 'origin');
    const destination = resolveItemEndpoint(next.item, 'destination');

    // Both must have resolvable locations
    if (!origin || !destination) {
      continue;
    }

    // Suppress if origin and destination resolve to the same place
    if (areEndpointsEqual(origin, destination)) {
      continue;
    }

    connectors.push({
      id: `${curr.item.id}->${next.item.id}`,
      fromItem: curr.item,
      toItem: next.item,
      origin,
      destination,
    });
  }

  return connectors;
}

/**
 * Finds confirmed stay items with known locations for a trip.
 */
export function findTripStays(items: readonly TripItem[]): TripItem[] {
  return items.filter(
    (item) =>
      item.status === 'confirmed' &&
      item.kind === 'stay' &&
      (Boolean(item.locationName?.trim()) || Boolean(item.address?.trim())),
  );
}

/**
 * Collects distinct saved place endpoints across a trip.
 */
export function findTripSavedPlaces(items: readonly TripItem[]): DirectionEndpoint[] {
  const seen = new Set<string>();
  const endpoints: DirectionEndpoint[] = [];

  for (const item of items) {
    if (item.status === 'cancelled') continue;
    const ep = resolveItemEndpoint(item, 'origin');
    if (ep) {
      const key = formatEndpointQuery(ep)?.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        endpoints.push(ep);
      }
    }
  }

  return endpoints;
}
