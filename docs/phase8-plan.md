# Phase 8 — `.ics` calendar export (plan, 2026-10-23)

Roadmap: `MASTER_ROADMAP.md` §14. The owner asked for Phase 8 to follow Phase 7 directly, planned,
built and tested in one run ("when done, directly continue to phase 8 - plan, implement and test").
This plan is written first and not waited on; the decisions are in §2 for review.

Data rules still bind: emulator and synthetic data only, no phone, no release APK, no merge, no
backend. **No migration and no format change.** No Google sign-in and no Calendar API.

## 1. What exists

- **The timeline model** (`timeline.ts`, `timelineEntries`): an item's start and end roles, local
  wall clock plus IANA zone, and `toInstant`.
- **Zone offsets** via `@date-fns/tz` (`TZDate`, `tzOffset`), already a dependency.
- **Sharing a generated text file:** `src/files/activityFiles.ts` (`shareText`: cache file, then
  `Sharing.shareAsync`).
- **The privacy pattern:** *Plan with AI* and *Export activities* leave out booking references,
  people, documents and payments.

## 2. Decisions (for the owner's review)

**P8-1 — A one-time file, not a sync.**
- Overview › More › *Add to calendar* builds `<trip>-calendar.ics` and opens the share sheet: Save, or
  a calendar app.
- The screen says it plainly: *A copy for your calendar app. Later changes here do not reach it;
  export again to update.*
- Nothing claims Google Calendar integration.

**P8-2 — What can go in.**
- Dated plans (*In my itinerary*) are ticked by default. Dated ideas are offered unticked.
- To-dos and cancelled plans are left out, and the screen says so: a calendar event is not a task.
- Undated items cannot be exported and are not listed.
- **Selection:** the plans are listed by day. Each day has a *whole day* tick, and each plan its own,
  so you can choose the whole trip, some days or single plans.

**P8-3 — How each plan becomes events.** Nothing is invented: no default duration, no time for a
date-only plan.
- **A timed plan** with an end: `DTSTART` and `DTEND`, each in its own zone. A flight from Sofia to
  Helsinki keeps both zones.
- **A timed plan without an end:** `DTSTART` only. RFC 5545 makes that an event with no duration.
- **A date-only plan:** an all-day event (`VALUE=DATE`), with `DTEND` the day after its last day
  (exclusive, as RFC 5545 counts).
- **Stays and car rentals** become two events, *Check in · Hotel* and *Check out · Hotel* (*Pick up* /
  *Return* for a car), as the Timeline shows them. A five-night block would cover the whole calendar.
  A stay that starts and ends the same day is one event.

**P8-4 — Time zones exactly.**
- Every timed value is written as `TZID=<IANA zone>` with its local wall-clock time, so a calendar
  shows 06:10 Sofia time whatever zone the phone is in.
- Each zone used gets a `VTIMEZONE`, as RFC 5545 requires. Its offsets and transitions are computed
  from the tz database (`tzOffset`) for the years the events span, with one year either side. Each
  transition is written out explicitly (no `RRULE`), so DST changes, half-hour zones and
  rule changes are exact.

**P8-5 — Stable UIDs, so a re-export updates rather than duplicates.**
- `UID:<item id>[-start|-end]@travel-organizer.app` never changes for the same plan.
- `SEQUENCE` grows with the item's `updated_at`, and `DTSTAMP` is the export time.
- Calendar apps differ: Apple Calendar and Outlook update an event with the same UID. Google Calendar's
  file import may skip or duplicate one. The screen and the user guide say so.

**P8-6 — Private by default.**
- **Always in:** the title, and the place for a journey: *Sofia → Helsinki*.
- **On by default:** the place name and address (`LOCATION`) and the coordinates (`GEO`).
- **Off by default, switchable:**
  - notes;
  - booking references;
  - who is going (names);
  - links (URLs).
- **Never in:** documents, prices, payments, or a trip's notes.
- The screen lists what will be included before sharing.

**P8-7 — Correct RFC 5545 text.**
- UTF-8 and CRLF line endings.
- `TEXT` values escape backslash, semicolon, comma and line break.
- Lines are folded at 75 octets without splitting a multi-byte character.
- `PRODID` and `VERSION:2.0`; `CALSCALE:GREGORIAN`; `METHOD:PUBLISH`.

**P8-8 — An undated trip** exports whatever dated plans it has. With none, the screen says there is
nothing to add.

## 3. Steps

1. **Domain:** `src/domain/ics.ts`:
   - `calendarEvents(items, options)`: items to events;
   - `vtimezone(zone, from, to)`;
   - `buildIcs(events, options)`;
   - escaping and folding.
2. **Tests:**
   - unit tests for every rule above;
   - a **standards check**: each generated file is parsed by `ical.js`, Mozilla's RFC 5545 parser
     (a dev dependency only). Its own timezone engine must turn our `VTIMEZONE` and `TZID` values into
     the same instants `toInstant` gives, across a DST change, an overnight flight between zones and a
     half-hour zone.
3. **Screen:** `app/trip/[tripId]/export-calendar.tsx`: selection, privacy switches, summary, then
   *Share calendar file*. Writing the file goes through `src/files/`. An entry in Overview › More.
4. **Docs and version 0.21.0.**
5. **Emulator:** export E2E Lapland, check the file's text, open it with a calendar app if the
   emulator has one, and share it.
