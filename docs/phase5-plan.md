# Phase 5 — the day route map: plan

Written 2026-10-23 on `phase-3d1` at `b449846` (0.17.1, schema 13), after the Phase 4 review
corrections. It turns `MASTER_ROADMAP.md` §11 into an exact proposal.

**How this phase is run (owner, 2026-10-23):** "when done, start directly with next phase — plan and
implement, then test". The plan is written down and not waited on. Every decision that is normally
the owner's is listed in §9 for review afterwards. The data rules still bind:
- `phase-3d1` only;
- synthetic data on emulators only;
- no release APK, no phone, no merge;
- no backend and no new paid service.

## 1. What exists today

- **Coordinates.** `trip_items.latitude` / `longitude` exist, but **only AI-imported activities
  (2C) carry them**. The item form has no coordinate field. For a trip typed in by hand, an in-app map
  would be almost empty.
- **Directions (0.7.0, D5).** `domain/directions.ts` builds Google Maps A → B links from a place
  name, an address or coordinates (`formatEndpointQuery`). It resolves transport endpoints by role
  (`resolveItemEndpoint`), finds a day's stay (`findStayForDay`), and draws connectors between
  timed, confirmed plans. No API key; Google Maps resolves *current location* itself.
- **Timeline.** `buildTimeline` groups by local day and orders by instant, and splits multi-day items
  into `start` and `end` entries.
- `react-native-svg` is installed. No map SDK is.

## 2. The provider decision (gate) — P5-1

| Option | What it takes | Cost / privacy | Offline |
|---|---|---|---|
| Google Maps SDK (`react-native-maps`) | A Google Cloud project, a billing account and an API key in the APK | Usage billed; every view sends the area to Google | No (cached tiles only) |
| MapLibre with a tile host (MapTiler and similar) | A native module and a provider key | A free tier, then paid; every view sends the area | Only with downloaded regions |
| OpenStreetMap's own tiles | A native module or a WebView | Free, but the OSM tile policy discourages app use; every view sends the area | No |
| **A schematic drawn in the app (chosen)** | `react-native-svg`, already installed | **Nothing leaves the phone** | **Yes** |

**Chosen: a schematic plus a hand-off.**
- **The schematic** shows the day's stops that have coordinates, as numbered pins in timeline order,
  joined by dashed straight lines, on a plain background with a north arrow and no street map. It is
  labelled *Straight lines show the order, not the way*.
- **The hand-off** is *Open the day in Google Maps*: a multi-stop directions link, which is where
  real roads, transit and durations come from.
- **Why:**
  - no key, account, cost or network request;
  - it works offline, during the trip;
  - it fits the read-optimised, local-first rules (CLAUDE.md §1–§2) and master §11: "never imply
    straight lines are drivable routes", "avoid invented travel durations".
- **A tiled map** stays possible later as a layer under the same stops. It needs the owner's decision
  on a provider, a key and its cost (*Discovery*).

## 3. Scope

**In Phase 5:**
1. **The day's stops** (pure, `domain/dayRoute.ts`), in timeline order:
   - **Start base:** the stay you wake up in, if you do not check out of it at a time today.
   - **Timed plans:** confirmed plans and ideas, but not tasks.
     - A transport item gives its **departure** and its **arrival** on the day each happens. An
       overnight train starts today and arrives tomorrow.
     - Other kinds give their place.
   - **End base:** the stay you sleep in, if its check-in is not already today's stop.
   - **Equal places in a row** (check-out and a lunch at the same hotel) merge into one stop that
     names both.
   - **Date-only plans** are listed as *Some time this day*, not in the order, because their order is
     unknown.
   - **Plans with no place at all** are listed as *No place given*.
   - **Cancelled** plans are left out.
2. **The schematic** (`features/map/DaySchematic.tsx`): the stops that have coordinates.
   - The projection is local equirectangular, with longitude scaled by cos(latitude). It keeps the
     aspect, fits the stops with padding, and handles a span across the 180th meridian.
   - Pins at the same place share one marker, labelled *1 · 5*.
   - Stops without coordinates stay in the list and the Google link, *not on the drawing*, and are
     named under it.
   - Nothing is drawn when fewer than one stop has coordinates. Then: *No coordinates for this day's
     places yet*.
3. **The day screen** (`app/trip/[tripId]/day-map.tsx`):
   - a day switcher: previous and next day, within the trip's days that have stops;
   - the schematic;
   - the ordered stops, each with time, place and title, opening its plan;
   - *Some time this day* and *No place given*;
   - *Open the day in Google Maps*.
4. **The hand-off** (`dayRouteLinks`):
   - origin is the first stop, destination the last, waypoints in order.
   - **At most five stops per link**: origin, three waypoints and the destination. Google documents
     three waypoints in mobile browsers and nine in the app, so a link never silently drops stops if
     it opens in a browser.
   - A longer day gets *Part 1, Part 2…*, overlapping on the shared stop.
   - **Mode:** *Any* (Google Maps chooses), *Driving* or *Walking*.
   - **Transit is not offered for multi-stop links,** because Google Maps does not route transit
     through waypoints. A transit leg stays on the Timeline's existing A → B connectors.
   - **One stop** gives a plain *Show in Google Maps* search link.
   - Nothing is fetched by the app. Google Maps needs a connection, and the screen says so.
5. **Entry points:** a *Map* action beside each day heading on the Timeline, and *Day map* on
   Overview for today (or the first day). Viewing changes nothing (master §11).
6. **Coordinates in the item form** — P5-3. An optional *Coordinates* field that accepts
   `66.5115, 25.7311`: what Google Maps copies on a long press. Both or neither. It is validated, and
   cleared by emptying it.
   - **Why:** without it, only AI-imported plans can ever appear on the schematic.
   - **No migration:** the columns exist.
   - Phase 7 (Maps share links) will fill coordinates without typing.

**All days (P5-4).** No single all-days drawing: a week of stops on one schematic is unreadable,
and implies trips between days. The screen shows one day at a time; the switcher walks the days.

**Not in Phase 5:**
- tiles or a street map;
- the device's location;
- routing, distances or durations in the app;
- geocoding names into coordinates, which would need an online service;
- the AI formats, which already carry coordinates.

## 4. Data and formats

No migration, no schema change, and no backup or archive format change: coordinates are existing
columns. The app version is **0.18.0**, versionCode 29.

## 5. Edge cases (tested)

- A trip's first day (no start base) and its last day (no end base).
- A day spent entirely in one hotel.
- An overnight train (departure today, arrival tomorrow).
- A flight within the day (two stops).
- A car rental.
- Check-out and check-in on the same day.
- Two stays covering the same night (`findStayForDay`'s order).
- A place visited twice (same coordinates, two stops, one marker).
- Coordinates only on some stops.
- None at all.
- `0, 0` (valid).
- Out-of-range values.
- Date-only plans.
- Ideas, tasks and cancelled plans.
- A day with more than five stops (two links).
- Long names, and URLs kept under 2 048 characters (each part is checked; a part over the limit drops
  its coordinates-less text first, else it is not offered).
- Time zones: the day is the local day, as on the Timeline.

## 6. Accessibility, performance, battery

- The list carries everything the drawing shows. The drawing has a summary label (*Map of 4 stops:
  …*).
- An SVG of at most a few dozen elements: no tiles, no GPS, no background work.

## 7. Order of work

1. `parseCoordinates` and the item form field, with tests.
2. `dayRoute.ts`: stops, merging, the lists, the schematic projection and the links, with tests.
3. The `DaySchematic` component, the day screen and the entry points.
4. Emulator: synthetic trips (one with coordinates, one without), 360 dp / font 2.0 / dark, the
   Google Maps hand-off.
5. Docs: technical reference §25, D47, status, product status, roadmap and handoff.

## 8. Risks

- **A schematic may be read as a map.** The note sits on the drawing itself, the lines are dashed,
  and there is no street background.
- **Wrong coordinates typed in.** They are shown beside the plan, and the hand-off uses them as they
  are.

## 9. Decisions taken without the owner (for review)

| # | Question | Chosen | Why | Alternatives |
|---|---|---|---|---|
| P5-1 | Map provider | An offline schematic (SVG) plus a Google Maps hand-off | No key, cost or network; works offline; never implies roads | Google Maps SDK or MapLibre with a tile key (owner decision on cost and privacy; possible later as a layer) |
| P5-2 | Stops per Google link | 5 (three waypoints), split into parts | Never silently dropped in a mobile browser | 11 (nine waypoints, the app only) |
| P5-3 | How coordinates get in | An optional *Coordinates* field in the item form (paste from Google Maps) | Otherwise only AI imports could appear | Wait for Phase 7; online geocoding (needs a service) |
| P5-4 | All days | One day at a time with a switcher | A multi-day drawing is unreadable and implies travel between days | All days on one drawing, coloured by day |
| P5-5 | Ideas on the day | Included, marked *Idea* | They are what you might do that day | Confirmed plans only, as the connectors do |
| P5-6 | Transit day links | Not offered; the A → B connectors serve transit | Google Maps does not route transit through waypoints | Offering it and letting Maps ignore the stops |

## 10. As built

**In progress (stopped at a usage limit, 2026-10-23):**
- **Done and committed:**
  - `parseCoordinates` / `coordinatesText` and the item form's *Coordinates* field, with the
    both-or-neither rule and coordinates on the item page;
  - `domain/dayRoute.ts` (stops, bases, merging, the lists, `schematicLayout`, `dayRouteLinks`), with
    tests;
  - the `DaySchematic` component and the `dayMap` icon.
- **Left:**
  - the day screen `app/trip/[tripId]/day-map.tsx` (switcher, schematic, stops, the lists, the Google
    Maps parts with Any / Driving / Walking);
  - the *Map* action on the Timeline day headings and Overview;
  - the emulator E2E;
  - the docs: technical reference §25, D47, status, product status, roadmap, handoff;
  - the version bump to 0.18.0.
