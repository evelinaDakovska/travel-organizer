# Directions & Google Maps A → B — Implementation Plan

Derived from `travel-organizer-directions-spec.md` · 13 October 2026

## 1. Context and Goals

Users planning trips need to navigate between itinerary stops without retyping addresses or coordinates into Google Maps manually.
This release introduces Phase 1: **A → B in Google Maps**.

Key characteristics:
- Local-first, privacy-preserving: no server, no Google Maps API keys, no device GPS permissions required.
- Standard Google Maps HTTPS URL scheme (`https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=...`).
- When "Current location" is chosen, `origin` parameter is omitted; Google Maps resolves it natively.
- Entry points:
  1. **Timeline**: Quiet connector rows between consecutive located commitments on a day.
  2. **Item Detail**: "How to get there" action beside the location/address.
  3. **Overview**: "Directions" action on the lead upcoming event panel.
- Interactive bottom sheet (`DirectionsSheet`):
  - Clear **From** and **To** display with names and addresses.
  - Origin switcher: *Current location*, *Previous stop* (when applicable), *Hotel/Base* (when stay is active), *Another saved place*.
  - Mode selector: *Any* (unspecified), *Walking*, *Driving*, *Transit*.
  - Primary button: *Open in Google Maps*.
  - Fallback handling: explains if Maps cannot open, with *Copy address*.

---

## 2. Domain Architecture (`src/domain/directions.ts`)

Pure TypeScript module, zero React / React Native / Expo / SQLite imports. Pure Node execution for instant Jest tests.

### Types
```ts
export type DirectionEndpoint = {
  title: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type OriginChoice =
  | { type: 'current_location' }
  | { type: 'endpoint'; endpoint: DirectionEndpoint };

export type TravelMode = 'walking' | 'driving' | 'transit';

export type DirectionsRequest = {
  origin: OriginChoice;
  destination: DirectionEndpoint;
  travelMode?: TravelMode | null;
};

export type TimelineConnector = {
  id: string; // e.g. `${fromKey}->${toKey}`
  day: string; // 'YYYY-MM-DD' calendar day of connector moment
  fromItem: TripItem;
  toItem: TripItem;
  origin: DirectionEndpoint;
  destination: DirectionEndpoint;
};
```

### Core Functions
1. `validateCoordinates(lat, lng): boolean`
   - Accepts finite numbers with lat in `[-90, 90]`, lng in `[-180, 180]`.
   - Explicitly accepts `0, 0` (zero coordinates).
2. `formatEndpointQuery(endpoint: DirectionEndpoint): string`
   - If coordinates are valid, returns `${latitude},${longitude}`.
   - Otherwise, formats cleaned title and address, avoiding duplicated text if address already includes title.
3. `areEndpointsEqual(a, b): boolean`
   - Compares coordinates or case-insensitive titles and addresses.
   - Suppresses redundant connectors (e.g. stay check-out -> stay baggage claim at same hotel).
4. `buildGoogleMapsUrl(request: DirectionsRequest): string | null`
   - Validates destination. Returns `null` if destination has neither coordinates nor query text.
   - If `origin.type === 'endpoint'`, adds `&origin=...`. If `current_location`, omits `origin`.
   - If `travelMode` is set, adds `&travelmode=...`.
5. `resolveItemEndpoint(item: TripItem, role: 'origin' | 'destination'): DirectionEndpoint | null`
   - Resolves outgoing vs incoming endpoints:
     - For `transport` items:
       - Destination: uses `details.from` (departure point).
       - Origin: uses `details.to` (arrival point).
     - For other items (`stay`, `activity`, `food`, etc.):
       - Uses `item.locationName`, `item.address`, `item.latitude`, `item.longitude`.
   - Returns `null` if item has no location info.
6. `findTimelineConnectors(entries: readonly TimelineEntry<TripItem>[]): TimelineConnector[]`
   - Filters out cancelled items, tasks, ideas (uncommitted), and date-only entries (no timed sequence).
   - Loops consecutive timed entries:
     - If entry `i-1` and entry `i` overlap in time (end of `i-1` > start of `i`), suppress connector.
     - Resolves `origin` from `i-1` and `destination` from `i`.
     - If middle item has missing location, connector is suppressed (avoids misleading shortcut routes).
     - If `areEndpointsEqual(origin, destination)`, connector is suppressed.
     - Assigns `day` from `curr.moment` so overnight arrivals match arrival day hotel.
7. `resolveItemDirectionsDay(item: TripItem, role?: 'start' | 'end' | null): string | null`
   - Resolves target calendar day for item directions:
     - Transport arrival (`'end'`): uses arrival date (`item.end ?? item.start`).
     - Transport departure (`'start'`) or general items: uses departure/activity date (`item.start ?? item.end`).
8. `findStayForDay(stays: readonly TripItem[], targetDay?: string | null): TripItem | null`
   - Selects the active stay covering `targetDay` (checkin <= targetDay < checkout).
   - In transitions or overlapping stays, prioritizes latest check-in instant, then latest checkout.
9. `computeDirectionsRequestKey(destination, initialOrigin, requestKey?): string`
   - Computes stable request identity to prevent resetting sheet state on parent re-renders.

---

## 3. UI Components

### 3.1 `TimelineConnectorRow.tsx`
- Quiet separator aligned with the timeline body.
- Left column: 72dp width, subtle neutral rail.
- Body: 16–18dp Route icon, label "Directions to [Place]", secondary "From [Origin]".
- Minimum 48dp hit target.

### 3.2 `DirectionsSheet.tsx`
- Built on top of the design system's `Sheet` component.
- Shows To: title and address.
- Shows From: current choice and Change button / options.
- Radio / chips for:
  - Current location (resolved by Google Maps)
  - Previous stop (if available)
  - Hotel / Base (if available from trip stays for that route day)
  - Another saved place (picker/sheet list)
- Mode picker: [Any, Walking, Driving, Transit].
- Action: "Open in Google Maps".
- Failure handling: Alerts user with "Could not open Maps" and provides "Copy address" action.
- Reset behavior:
  - Preserves user origin/mode choices while the sheet remains open across parent refreshes and clock ticks.
  - Resets to defaults only on intentional sheet opening or when request identity (`requestKey`) changes.

---

## 4. Entry Point Integration

1. `app/trip/[tripId]/(tabs)/timeline.tsx`:
   - Compute `connectors` for the current day's entries.
   - Render `TimelineConnectorRow` between matching entries.
   - Tapping opens `DirectionsSheet`.
2. `app/item/[itemId]/index.tsx`:
   - Beside the address / Open in Maps: add "How to get there".
   - Opens `DirectionsSheet` with this item as destination.
3. `app/trip/[tripId]/(tabs)/index.tsx`:
   - In `Lead` panel: add "Directions" action next to tickets if lead item has a resolvable location.

---

## 5. Verification & Testing

- Unit tests (`src/domain/directions.test.ts`):
  - Coordinates, zero coordinates (0,0), text query fallback.
  - URL encoding: Cyrillic, Finnish, spaces, ampersands, quotes.
  - Current location omission of `origin`.
  - Modes: walking, driving, transit, omitted.
  - Transport endpoint semantics (arrival airport for outgoing, departure airport for incoming).
  - Timeline connector suppression for same location, overlapping times, tasks, ideas, date-only, missing middle location.
- Typecheck: `npx tsc --noEmit`.
- Device QA: Android emulator `Pixel_10_Pro`:
  - Verify timeline connectors render cleanly and open `DirectionsSheet`.
  - Verify switching origin and mode.
  - Verify clicking "Open in Google Maps" launches URL intent.
  - Verify item detail and overview entry points.
