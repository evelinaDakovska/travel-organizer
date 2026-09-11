# Project: Personal Travel Organizer

I want to build a mobile application for my own personal use to organize everything related to trips I have already planned.

I am a frontend developer and have been working professionally with React Native for about a year. I am comfortable with React, React Native and TypeScript. I want to build this application myself with Claude assisting me throughout the development process.

This should be treated as a real maintainable application, but it is initially a personal project, so avoid unnecessary enterprise architecture and premature abstraction.

---

# 1. Product idea

The application is a personal travel hub.

Its purpose is NOT to recommend destinations, generate itineraries, search for flights/hotels or plan trips for me.

Instead, it should become the single source of truth for everything I have already decided, booked or saved for a trip.

When preparing for a trip, information ends up scattered across many places:

- airline booking emails
- boarding passes
- Google Wallet
- train tickets
- hotel confirmations
- PDFs
- museum tickets
- theatre tickets
- restaurant reservations
- websites
- Google Maps
- screenshots
- notes
- recommendations
- lists of places I may visit

I want all of this accessible from one trip inside one application.

The most important real-world scenario is:

"I am currently travelling, possibly stressed and possibly without reliable internet. I need to know what happens next and find the relevant ticket, booking, address or document within seconds."

Optimize the product around that scenario.

---

# 2. Product principles

The app should be:

- local-first
- offline-friendly
- fast
- visually clean
- easy to use while travelling
- flexible
- maintainable
- opinionated enough to be convenient without forcing every trip into the same structure

Prefer simple solutions over clever architecture.

Important travel information and downloaded documents should remain available offline.

The application should organize information, not become another travel planning service.

---

# 3. Home screen

The initial screen displays trips.

The primary section is Upcoming Trips.

Each trip should appear as a visually pleasant card containing approximately:

- destination/trip name
- start date
- end date
- duration
- optional image
- possibly a small summary of the next event

Example:

MILAN

19–22 Sep 2026
4 days

Next:
Flight Sofia → Bergamo
19 Sep · 06:10

There should also be access to Past Trips.

Past trips should remain available as an archive rather than disappearing.

---

# 4. Trip structure

When opening a trip, I currently imagine four main views:

1. Timeline
2. Bookings
3. Places
4. Notes / Trip information

These should mostly be different views over shared underlying data.

Do NOT duplicate an activity into separate "activity" and "timeline" records.

For example:

If I create a museum booking for September 19 at 14:00, that item belongs to Activities but automatically appears at the correct position in the Timeline.

---

# 5. Trip overview / immediate information

One of the most useful parts of the trip screen should be immediate contextual information.

When travelling, I should be able to open the application and see something like:

TODAY
Saturday, Sep 19

NEXT

14:00
Duomo Fast Track
in 1h 32m

[Open tickets]

AFTER THAT

19:30
Dinner reservation

The user should not have to navigate through:

Activities → Museum → Reservation → Documents → Ticket

to perform the most common action.

Important information should normally be accessible within one or two taps.

---

# 6. Timeline

Timeline is one of the core features.

It displays dated TripItems chronologically and groups them by day.

Example:

Saturday · September 19

06:10
Flight
Sofia → Bergamo

08:00
Bus
Bergamo → Milan

11:00
Hotel
Leave luggage

14:00
Duomo Fast Track

19:30
Restaurant reservation

Items can have:

- exact start time
- start/end time
- date but no exact time
- potentially multiple-day duration

Items without a precise time should still appear sensibly within that day's timeline.

The timeline must be DERIVED from TripItems.

It should not have a separate duplicated itinerary data model.

---

# 7. Bookings

Bookings should provide categorized access to structured trip items.

Initial categories:

## Transport

Examples:

- flights
- trains
- buses
- ferry
- rental car
- airport transfer

## Stay

Examples:

- hotel
- Airbnb/apartment
- other accommodation

## Activities

Examples:

- museum
- theatre
- tour
- excursion
- attraction
- event

## Food

Examples:

- restaurant reservation
- booked experience

## Other

Catch-all for things that don't fit cleanly elsewhere.

Examples might include:

- luggage storage
- travel insurance
- parking
- miscellaneous reservation

Do not create completely independent architecture for every category unless there is a concrete need.

---

# 8. Places / recommendations

Not everything saved for a trip is booked.

I often collect recommendations such as:

- restaurants
- cafés
- shops
- vintage stores
- museums
- viewpoints
- attractions
- interesting streets
- places someone recommended to me

I want to store these too.

A saved place should optionally have a priority:

MUST
Something I strongly want to do.

WANT
Something I would like to do.

MAYBE
Something to consider if we have time.

Possible fields:

- title/name
- category
- priority
- address
- coordinates
- Google Maps URL
- website
- notes

Example:

Pavé

Cafe
WANT

Breakfast / pastries
Recommended by X

[Maps]
[Website]

A place may initially have no date.

Later I should potentially be able to assign it to a particular day, at which point it can also appear in the timeline.

---

# 9. Trip items

Most meaningful things associated with a trip should use a generic TripItem concept.

Initial conceptual model:

type TripItemType =
  | 'transport'
  | 'stay'
  | 'activity'
  | 'food'
  | 'place'
  | 'other';

type TripItem = {
  id: string;
  tripId: string;

  type: TripItemType;
  title: string;

  startAt?: string;
  endAt?: string;

  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;

  bookingReference?: string;

  notes?: string;

  priority?: 'must' | 'want' | 'maybe';
};

This is only a starting point.

Review it critically before implementation.

I prefer a flexible model rather than many tables containing almost identical data.

However, do not force genuinely different concepts into one table purely for architectural elegance.

---

# 10. Resources / attachments

This is a major part of the application.

A TripItem may have multiple things associated with it.

For example:

DUOMO FAST TRACK
September 19 · 14:00

Resources:

- Tickets.pdf
- Booking confirmation
- Booking website
- Google Maps
- Google Wallet link
- reservation reference

Or:

FLIGHT SOFIA → HELSINKI

Resources:

- booking confirmation PDF
- airline booking page
- boarding pass
- Google Wallet link
- booking reference

I do NOT want fields like:

ticketUrl
pdfUrl
walletUrl
confirmationUrl
mapsUrl

hardcoded onto every TripItem.

Instead, use a generic Resource/Attachment concept.

Starting idea:

type ResourceType =
  | 'file'
  | 'url'
  | 'email'
  | 'wallet'
  | 'maps'
  | 'bookingReference'
  | 'other';

type Resource = {
  id: string;
  tripItemId: string;

  type: ResourceType;

  label: string;

  uri?: string;
  value?: string;
};

A TripItem should support zero or many Resources.

Please evaluate whether "Resource" is the best domain name and whether files need additional metadata.

---

# 11. Files and offline behavior

PDFs and similar important documents are especially important.

If I import a ticket into the application, I want to be able to access it while travelling even if I have no internet connection.

Therefore, do not simply save the original external URI if that URI may later become inaccessible.

Investigate the correct Expo/React Native approach for copying imported files into application-controlled local storage.

We need to think about:

- local file persistence
- app document directory
- filenames
- MIME types
- metadata
- deletion
- cleanup when a TripItem or Trip is deleted
- backup implications
- what happens if the original file disappears
- Android permissions

Do not over-engineer it, but offline ticket access is a core requirement.

---

# 12. Share to App

This is a feature I strongly want.

Example scenario:

I receive a PDF ticket.

From Android:

Share → Travel Organizer

The application opens:

Add to trip:

[ Milan ]
[ Lapland ]

Then perhaps:

Create new item
or
Attach to existing item

Similarly:

I find a restaurant website in Chrome.

Share → Travel Organizer

Trip:
Milan

Save as:
Place

Title:
Restaurant X

Priority:
Want

Save

I want to investigate receiving:

- URLs
- text
- PDFs/files

through the Android share sheet.

This may require native Android configuration or an Expo config plugin.

Before implementing this, research what Expo currently supports and whether it can be done cleanly in an Expo development build.

Do not eject from Expo casually just for this feature.

---

# 13. Transport-specific information

Transport may eventually benefit from structured details.

Possible model:

type TransportMode =
  | 'flight'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'other';

type TransportDetails = {
  mode: TransportMode;

  origin?: string;
  destination?: string;

  carrier?: string;
  serviceNumber?: string;

  terminal?: string;
  gate?: string;
  seat?: string;
};

However, do not over-engineer transport in V1.

A train, flight and rental car have very different possible metadata.

Start with information that provides actual user value.

---

# 14. Google Maps

Locations should be able to open externally in Google Maps or the platform's maps application.

We do NOT need a complex embedded map for MVP.

Eventually, a trip-wide map containing saved places could be useful.

That is not necessary initially.

---

# 15. Google Wallet

Some bookings provide an "Add to Google Wallet" option.

Initially, I want the application to be able to store the relevant Wallet/save link as a Resource and open it.

Do NOT assume that the application can read and enumerate arbitrary passes already stored in the user's personal Google Wallet.

Do not build Google Wallet API integration for MVP.

A deeper Wallet integration can be investigated much later if there is a meaningful use case.

---

# 16. Email

Many travel reservations arrive only through email.

Eventually I would like an "Import from Gmail" feature.

Possible future flow:

Import from Gmail

→ find booking confirmation

→ select email

→ associate with existing Trip or create TripItem

→ save relevant attachments

Eventually this could include automatic extraction of booking information.

However:

Gmail integration is NOT part of MVP.

Do not implement OAuth or Gmail APIs now.

---

# 17. Future smart import

Eventually, AI could be useful for parsing existing information rather than generating travel recommendations.

Example:

I import a PDF ticket or booking email.

The application extracts:

{
  "type": "activity",
  "title": "Duomo Fast Track",
  "startAt": "2026-09-19T14:00:00+02:00",
  "location": "Duomo di Milano",
  "bookingReference": "...",
  "participants": 3
}

Then the app asks:

Add this to Milan?

[Confirm]

The user should always confirm extracted information.

This is a future feature.

Do not add AI infrastructure for MVP.

---

# 18. Notifications

For TripItems with dates/times, local reminders could be useful.

Examples:

"Duomo Fast Track in 1 hour"

"Train to Rovaniemi tomorrow at 19:29"

For MVP, basic local notifications are enough.

Avoid building a complex notification rules engine.

We can decide later what default reminder behavior makes sense.

---

# 19. Search

Within a trip I should be able to search.

Example searches:

"Duomo"
"Ryanair"
"hotel"
"train"
"restaurant"

Search can initially operate over locally stored structured data.

No external search service is needed.

---

# 20. MVP scope

Version 1 should focus on:

1. Create Trip
2. Edit Trip
3. Delete Trip

4. Create TripItem
5. Edit TripItem
6. Delete TripItem

7. TripItem categories:
   - transport
   - stay
   - activity
   - food
   - other

8. Optional date/time information

9. Automatic chronological Timeline

10. Saved Places

11. Must / Want / Maybe priorities

12. Notes

13. Booking references

14. URLs

15. Import and locally store PDFs/files

16. Open addresses/locations in Maps

17. Multiple Resources per TripItem

18. Search inside a Trip

19. Basic local notifications

20. Offline access

21. Investigate/implement Android Share-to-App if practical with Expo

The application should already be genuinely useful after this version.

---

# 21. Explicitly NOT MVP

Do NOT implement these now:

- AI recommendations
- AI itinerary generation
- automatic trip planning
- flight search
- hotel search
- booking APIs
- Gmail integration
- Google Calendar integration
- complex Google Wallet API integration
- cloud backend
- user accounts
- authentication
- collaborative trips
- social features
- weather
- currency conversion
- complex embedded maps
- automatic booking parsing
- recommendation engine

Architecture should not make future additions unnecessarily difficult, but DO NOT build abstractions for hypothetical features that may never exist.

---

# 22. Possible Phase 2+

Later we may consider:

- Gmail import
- automatic booking extraction
- Google Calendar
- smart PDF parsing
- trip-wide map
- shared trips
- cloud sync
- weather
- currency information
- automatic association of a booking with a trip
- duplicate detection
- more advanced notifications
- Google Wallet-related improvements

These are context, not current requirements.

---

# 23. Technical preferences

Primary stack:

- React Native
- Expo
- TypeScript
- Expo Router
- SQLite
- Zod
- React Hook Form

For state management, evaluate whether we actually need Redux Toolkit or Zustand.

SQLite should likely be the source of truth for persisted domain data.

Do not introduce global state simply because this is a React application.

TanStack Query may become relevant if/when we introduce a backend, but do not add it without a use case.

---

# 24. Local-first architecture

The application should be designed local-first.

For MVP:

Phone
↓
SQLite + local file storage

There should be no backend requirement.

This has several advantages for this project:

- works offline
- simple architecture
- no authentication
- no hosting
- no synchronization complexity
- personal data stays primarily on device

We may later add optional synchronization.

Do not design MVP around a server.

---

# 25. Database principles

I want explicit database migrations.

Avoid magical schema synchronization.

Think carefully about:

- Trips
- TripItems
- Resources
- optional category-specific metadata
- deletion/cascade behavior
- ordering
- timestamps
- future migrations

Prefer deriving UI state through queries instead of copying database records into a giant global store.

Please propose an actual SQLite schema before implementation.

---

# 26. Dates and time zones

Travel applications have tricky date/time behavior.

This should be considered explicitly before implementation.

A trip may contain:

- flight departing Sofia
- arrival in Helsinki
- train in Helsinki
- activity in Rovaniemi

Do not blindly store everything as device-local Date values.

We need a sensible strategy for:

- date-only values
- local wall-clock times
- time zones
- ISO values
- display when the phone changes timezone during travel

Please propose a robust but not excessively complicated strategy.

This is important.

---

# 27. UX priorities

The app should feel like a travel tool rather than a CRUD database UI.

The most important information hierarchy is approximately:

1. What trip am I on?
2. What happens next?
3. Where do I need to be?
4. When?
5. Where is my ticket/document?
6. What comes after that?

Creating/editing records matters, but retrieval while travelling matters more.

Use sensible mobile interaction patterns.

Do not bury primary actions in multiple screens.

---

# 28. Visual direction

Do not build the final visual design yet.

For now, aim for:

- modern
- clean
- spacious
- travel-oriented
- card-based where appropriate
- strong typography hierarchy
- easily scannable timeline

Avoid:

- dashboard-looking enterprise UI
- excessive gradients
- excessive shadows
- tiny information-dense cards
- unnecessary animations
- visual clutter

We can refine the design separately.

---

# 29. Example real trip #1 — Milan

Use this as conceptual sample data when useful.

Trip:

Milan
19–22 September 2026

Examples of information that could exist:

Transport:
- flight to Bergamo
- transfer Bergamo → Milan
- return journey

Stay:
- Imperiale Suites Dante

Activity:
- Duomo Fast Track
- September 19 at 14:00
- booked ticket/document

Potential places:
- restaurants
- cafés
- vintage shops
- outlets
- Lake Como ideas

Some are bookings.
Some are recommendations.
Some are must-do.
Some are optional.

This distinction is exactly what the application should handle well.

---

# 30. Example real trip #2 — Lapland

Trip:

Finland / Lapland
20–24 November 2026

Route includes:

Sofia
→ Helsinki
→ Rovaniemi

Examples:

Flight to Helsinki

Night train:
Santa Claus Express
Helsinki → Rovaniemi
20 November
19:29
sleeper cabin reservation

Accommodation in/around Rovaniemi

Possible structured activities:

- Santa Claus Village
- SantaPark
- Elf School
- Secret Forest / Searching for Santa
- reindeer farm/sleigh
- husky activity

Some activities will be booked.
Others may simply be planned.

Rental car may also exist.

Return flight:
Rovaniemi → Sofia

This trip demonstrates why the Timeline cannot simply be a list of attractions.

Transport, accommodation and activities all need to coexist chronologically.

---

# 31. Important distinction: booked vs planned

We should consider whether TripItems need some notion of status.

Potential concepts:

- idea
- planned
- booked
- cancelled
- completed

But do NOT blindly add these values.

Evaluate whether this provides enough UX value to justify the complexity.

For example, Places already have:

must / want / maybe

while reservations might have:

booked

These are different concepts.

Please propose a clean solution.

---

# 32. Important distinction: TripItem vs Place

We should explicitly decide whether a Place is:

A) a TripItem with type = 'place'

or

B) its own entity

There are arguments both ways.

A place may initially have no date, then later become part of a particular day.

An activity booking is also usually associated with a place.

Do not choose purely based on reducing table count.

Think about the domain and expected queries.

Explain the tradeoff and recommend one approach.

---

# 33. Important distinction: Resources

Similarly, think about whether bookingReference belongs directly on TripItem or should be a Resource.

Potential resource types include:

- local file
- URL
- email reference
- wallet link
- Maps link
- booking reference

But these are not technically identical things.

Please evaluate whether one Resource model is appropriate or whether we need a distinction such as:

Attachment
Link
Reference

Prefer the simplest model that remains semantically reasonable.

---

# 34. Error cases to consider

Eventually the application should handle cases such as:

- imported file no longer exists at original location
- invalid URL
- trip deleted
- TripItem deleted with local files attached
- activity cancelled
- date changed
- phone timezone changed
- document has same filename as another document
- Share-to-App invoked when app was closed
- Share-to-App invoked while another trip is open
- notification refers to deleted item

We do not need to solve every edge case immediately.

But architectural choices should not obviously break common cases.

---

# 35. Development philosophy

I will be reviewing and understanding the code.

Do not generate an enormous application in one pass.

Do not create hundreds of files before we have agreed on architecture.

Do not silently make product decisions when the specification is ambiguous.

When there is a meaningful architectural tradeoff:

1. explain it briefly
2. recommend an option
3. wait for confirmation when the decision has significant downstream consequences

For small implementation details, use sensible judgment without constantly asking questions.

---

# 36. Working with me

Treat me as the developer, not as a non-technical product owner.

You can discuss:

- TypeScript
- React patterns
- hooks
- SQLite
- native modules
- Android
- Expo
- architecture
- performance
- testing
- migrations

Challenge bad technical assumptions.

Do not explain basic React concepts unless they are relevant to a decision.

When generating code, prefer production-quality readable TypeScript over clever abstractions.

---

# 37. Documentation

Create a CLAUDE.md in the repository once we have agreed on the architecture.

It should contain the durable project context that future Claude sessions need:

- product purpose
- product principles
- chosen stack
- architecture decisions
- domain terminology
- important constraints
- folder conventions
- database conventions
- testing conventions
- current development phase

Do NOT simply dump this entire prompt into CLAUDE.md.

Convert it into concise durable engineering context.

Keep CLAUDE.md updated when we make important architectural decisions.

---

# 38. Implementation approach

I want to build the application incrementally.

A possible high-level sequence is:

Milestone 0
Architecture and project decisions.

Milestone 1
Project foundation and database.

Milestone 2
Trips CRUD + Home.

Milestone 3
TripItems + Bookings.

Milestone 4
Timeline.

Milestone 5
Resources/files.

Milestone 6
Places.

Milestone 7
Search.

Milestone 8
Notifications.

Milestone 9
Android Share-to-App.

Milestone 10
UX polish, offline testing and edge cases.

This is only a suggestion.

Please propose a better milestone structure if appropriate.

Each milestone should leave the repository in a working state.

---

# 39. Testing

Propose a pragmatic testing strategy.

This is a personal application, so we do not need enterprise-level test coverage.

However, some logic deserves tests, particularly:

- timeline ordering
- date/time/timezone handling
- database operations/migrations
- derived "next item"
- file/resource behavior where practical

Prefer tests that protect meaningful domain logic over snapshot-testing every UI component.

---

# 40. Your first task

DO NOT start implementing the application yet.

DO NOT scaffold the entire application yet.

First, analyze this specification as a senior React Native engineer.

Return:

1. Your understanding of the product in a concise summary.

2. Any product ambiguities we should resolve before coding.

3. Architectural risks or areas where this specification is over-engineered.

4. Your recommended domain model.

5. Your recommended SQLite schema.

6. Your recommendation for:
   - TripItem vs Place
   - Resource model
   - booking/planning status
   - date/time/timezone representation

7. Proposed navigation/information architecture.

8. Recommended React Native / Expo libraries.

For each dependency, explain what problem it solves. Avoid dependencies we don't need.

9. Which requirements need:
   - normal Expo APIs
   - Expo config
   - custom config plugin
   - native Android functionality

Pay particular attention to Share-to-App.

10. Recommended folder structure.

11. Recommended testing strategy.

12. A milestone-by-milestone implementation plan.

13. Anything you think we should REMOVE from MVP.

14. Anything important that is currently MISSING from the specification.

Do not write implementation code yet except for very small examples needed to explain an architectural recommendation.

Challenge my assumptions rather than simply agreeing with the specification.

After I review your response, we will make the architectural decisions together and only then initialize/implement the project.