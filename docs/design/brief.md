# Design brief — Travel Organizer

A brief for a designer (or a design tool) who knows nothing about this project. It explains what
the app is for, who uses it and when, what already exists, and what we want design help with.

---

## 1. The app in one paragraph

Travel Organizer is a personal, offline-first **Android** app that holds everything already
decided, booked or saved for a trip: plane and train tickets, boarding passes, hotel
confirmations, PDFs and screenshots, booking references, links, places someone recommended, and
notes. It is **not** a planner, a recommender or a booking service. It never searches for flights
or suggests restaurants. It organises information that already exists, so that during the trip the
right document is on screen within seconds, with or without internet.

## 2. The one scenario everything is designed around

> *"I am travelling, possibly stressed, possibly without internet. I need to know what happens
> next and find the relevant ticket within seconds."*

Picture: standing in a boarding queue at 05:40 with a backpack on one shoulder and a coffee in the
other hand. Or at a hotel desk after a delayed night train, asked for the booking reference. Or
walking out of a metro station in a city whose language you do not read, looking for the museum
you booked for 10:30.

### The asymmetry that drives every design decision

| | Writing (adding things) | Reading (using the app on the trip) |
|---|---|---|
| **When** | At home, weeks ahead | Abroad, in the moment |
| **Where** | Sofa, wifi, calm | Airport, station, street, often offline |
| **Mood** | Unhurried | Stressed, distracted, one-handed |
| **Tolerance** | A plain form is fine | Every extra tap is a cost |

**This is a read-optimised app with a tolerable write path.** Data entry may be a boring form.
Retrieval may not. Spend design effort on the reading side: the Now card, the timeline, opening a
ticket, finding a booking reference. Forms should be clean and quick, not clever.

A corollary: **the most valuable content is files the app does not create** — the airline's PDF,
a screenshot of a QR code. The PDF is the product; everything else is metadata to find it fast.

## 3. Who uses it

One person (the owner) and their travel companions looking over their shoulder. No accounts, no
sharing, no collaboration, no cloud. A few trips a year, each with roughly 10–50 things in it and
up to ~30 attached files.

- **Device:** Samsung Galaxy S26 Ultra — a large, tall Android phone. Android only; no iOS, no
  tablets, no web. Designs should target a ~412 × 915 dp portrait phone and respect Android
  conventions (system back gesture, edge-to-edge, status and navigation bars).
- **Light and dark mode** both matter; dark mode gets used at night on trains and in dim airports.
- **Language:** English UI. Place names and documents will be in many languages.

## 4. The things in the app (the domain, in plain words)

### Trip
A dated journey: *Milan, 19–22 Sep 2026*. Has a name, an optional destination, **mandatory** start
and end dates, a main timezone, optional travelling companions, and notes.

### Trip item — "anything meaningful attached to a trip"
Every flight, hotel, museum ticket, restaurant idea and to-do is one of these. Two independent
properties describe an item:

**What sort of thing it is (`kind`)**, with an optional finer **type (`subkind`)**:

| Kind | Types |
|---|---|
| Travel | flight · train · bus · ferry · car · taxi · transfer · walk |
| Stay | hotel · apartment · hostel · guesthouse · camping |
| Activity | museum · gallery · tour · attraction · event · theatre · outdoor · spa |
| Food | restaurant · café · bar · bakery · market |
| To do | check-in · booking · document · packing |
| Other | luggage · insurance · parking · shopping · viewpoint |

**How committed it is (`status`)**:

| Status | Meaning | Where it shows |
|---|---|---|
| **Idea** | Saved, not booked — "a friend said this café is great". Can have a priority: **must / want / maybe** | Places tab; also on the timeline if it has a date — and should then look visibly *not booked* |
| **Booked** (confirmed) | Paid for, reserved, happening | Bookings tab and the timeline |
| **Cancelled** | Kept on purpose, because the cancellation confirmation PDF is still needed | Greyed out in lists; **hidden** from the timeline and the Now card |

The important idea: **a "Place" is not a separate thing**. It is simply an item whose status is
*Idea*. Booking it later just changes its status and gives it a date.

Other item details: title, start and end (date only, or date + time), location name and address,
**booking reference** (shown prominently, meant to be *copied* at a desk), notes, price with
currency and paid/unpaid. Travel items also have **from → to**, carrier, number and seat
(e.g. *Sofia → Bergamo · W6 4315 · seat 12A*).

**To-dos** are items too — "online check-in opens", "book the restaurant" — dated and tickable.

### Attachments ("resources")
Hang off an item or off the whole trip. Two behaviours:
- **File** — a PDF, image or screenshot, copied into the app so it works offline forever. Can go
  missing (e.g. restored from an old backup) and must then say so clearly.
- **Link** — a booking page, a Google Wallet pass, a Google Maps pin, an email address or phone
  number. Opens in the right app.

Each has a label and a type: document · ticket · confirmation · wallet pass · map · website.

### Notes
Many titled notes per trip, pinnable: door codes, Wi-Fi passwords, "tip the driver in cash".

## 5. Time — a subtle but important design constraint

Everything is shown **as written on the ticket, in local time**. A flight departing Sofia at 06:10
always shows **06:10**, even after the phone switches to Italian time. The app never converts a
ticket's time into "your" time. Each item may carry its own timezone (a flight leaves in one zone
and lands in another); the trip has a main one.

Design implications:
- The timeline groups by **local day of the item**, not the phone's day.
- When an item's timezone differs from the trip's, it may need a quiet hint
  (*"Europe/Sofia"*) — but it must never clutter the common case.
- Countdowns (*"in 1 h 32 m"*) are real elapsed time and are correct across zones.
- Some items have only a date ("check-in day"), some a real time. *00:00* is a real time and must
  look different from "no time".

## 6. Information architecture

```
Home — all trips (Upcoming, Past)
└── Trip
    ├── Overview      ← default. The "Now" card + trip info + trip documents
    ├── Timeline      ← dated items grouped by day
    ├── Bookings      ← what's booked, grouped by kind
    ├── Places        ← ideas, by priority
    ├── Notes
    └── Search        ← titles, notes, locations, references, notes
        └── Item detail
            ├── Open ticket(s)
            ├── When · Where · Booking (reference, number, seat, price)
            ├── Notes
            └── Tickets & links (attachments) → attachment detail (rename, type, remove)

Add / edit trip · Add / edit item · Add link
Settings · Export / import backup (zip) · Share-to-app landing (receive a PDF from Gmail)
Local reminders (notifications) for upcoming items
```

**Cold start:** if exactly one trip is in progress, the app opens straight into it.

## 7. What exists today

Built and working on a device: Home, trip create/edit/delete, trip Overview (basic), item
create/edit/delete, item detail, attachments (pick file, pick photo, add link, open, rename,
remove, missing-file state), trip-level documents on the Overview. Visual language so far is
**deliberately plain**: a warm off-white background, white cards with hairline borders, one deep
green accent, pill-shaped chips, generous spacing, system font. No icon set yet — attachments use
short text badges (PDF, IMG, LINK, MAP, PASS).

Not built yet, and where design input is most wanted: the Now card, the Timeline, the Bookings /
Places / Notes tabs and their navigation, search, export/import, share-to-app, reminders.

### Current tokens (starting point, not a constraint)

| Token | Light | Dark |
|---|---|---|
| background | `#FBFAF8` | `#141413` |
| surface (cards) | `#FFFFFF` | `#1E1D1B` |
| surfaceSunken | `#F2F0EC` | `#272623` |
| border | `#E5E1DA` | `#343330` |
| text | `#1A1917` | `#F5F3EF` |
| textMuted | `#6B6862` | `#A8A49C` |
| textFaint | `#9C9890` | `#7A766E` |
| accent | `#1F6F5C` | `#6FC0A8` |
| accentSoft | `#E4F0EC` | `#1C2E29` |
| danger | `#B3261E` | `#F2B8B5` |
| warning | `#8A5A00` | `#E8B45F` |

Spacing 4 · 8 · 12 · 16 · 24 · 32 · 48. Radius 8 · 12 · 16 · 22 · pill.
Type: display 32/700 · title 22/600 · heading 17/600 · body 15/400 · label 13/500 ·
caption 12/400 · overline 11/600 letter-spaced caps.

## 8. What we want from design

Priority order — the top of the list is where the app succeeds or fails.

### 8.1 The Now card (trip Overview) — most important screen
Answers "what happens next?" at a glance. Proposed structure:
**TODAY** (what's on today) · **NEXT** (the next thing, with a countdown) · **AFTER THAT** ·
a big **Open ticket** button for the next item's attachments.

States to design:
- Next item in 3 days / in 2 hours / in 12 minutes / happening right now
- The next thing is a **check-out** at 11:00 (derived from a multi-day hotel stay)
- The next thing is a **to-do** ("online check-in opens 06:10") dated *before* the trip starts
- Next item has one attachment (opens directly) / several (opens a sheet) / none
- Nothing scheduled today, but something tomorrow
- Nothing upcoming at all → **no Now card** (trip over, or nothing dated)
- A cancelled item must never appear here

### 8.2 Opening a ticket
The single most important interaction. One attachment opens directly in Android's viewer; several
open a bottom sheet to choose. It appears on the Now card, on timeline rows and on item detail.
Show us how it looks in each place, including the **file missing** state.

### 8.3 Timeline
Dated items grouped under day headers (*Saturday, 19 September*). Items with only a date sit at the
top of their day. Needs to show at a glance: time, title, type, from → to for travel, booked vs
idea, done to-dos, attachments available.

**Open question we'd like a design answer to:** a hotel from 19 to 22 September appears as
**two entries** — *check-in* on the 19th and *check-out* on the 22nd — with nothing on the days in
between. An overnight train does the same: *depart* on one day, *arrive* the next. How should
these paired entries look so they read as one stay/journey? Should the days in between show a quiet
"staying at Hotel Brera" line, or nothing?

### 8.4 Trip navigation
Overview · Timeline · Bookings · Places · Notes, plus Search. Tabs at the top, at the bottom, a
segmented control, or something else? One-handed use on a tall phone matters.

### 8.5 Bookings and Places tabs
- **Bookings:** everything booked, grouped by kind (Travel, Stay, Activity, Food…), each showing
  the booking reference ready to copy, paid/unpaid, attachments.
- **Places:** ideas sorted by priority (must → want → maybe → unrated). Needs a fast way to
  **promote** an idea into a dated, booked item.

### 8.6 Item detail
Already exists (see §7). Open to improvements, especially: making the booking reference easy to
read out loud and copy, showing from → to for travel, and grouping attachments.

### 8.7 Lower priority
Home (trip list with an "in progress" state), Search results, Notes, Export/import backup screen,
Share-to-app landing ("save this PDF to which trip / which item?"), add/edit forms, empty states,
a small icon set for kinds and attachment types.

## 9. Design principles

1. **Seconds, not minutes.** The next ticket is at most one tap from the trip's front screen.
2. **Calm under stress.** Strong hierarchy, big targets, few competing actions, nothing that
   animates for its own sake.
3. **Honest about state.** Booked vs idea vs cancelled, missing file, no internet needed — always
   visible, never ambiguous.
4. **Local time is sacred.** Never display a converted time for a ticket.
5. **Offline is normal,** not an error state. There are no spinners waiting on a network.
6. **Plain write path.** Forms are clean, fast and forgiving, not wizards.
7. **Spacious, card-based, scannable.** Readable in sunlight and in a dark train.

## 10. Explicitly out of scope

No AI features, itinerary generation, flight or hotel search, booking APIs, Gmail or calendar
integration, Google Wallet API (only links to passes), weather, currency conversion, embedded maps,
accounts, sync, collaboration, or social features. Please don't design for these.

## 11. Sample content to design with

Use these realistic (fictional) trips rather than lorem ipsum.

### Milan · 19–22 Sep 2026 · main timezone Europe/Rome
| Status | Item | When (local) | Details |
|---|---|---|---|
| Booked | ✈ Flight Sofia → Bergamo | Sat 19 Sep, 06:10 (Europe/Sofia) → 07:20 | Wizz Air W6 4315 · seat 12A · ref QX7K2M · boarding pass PDF + Wallet link |
| To do | Online check-in opens | Fri 18 Sep, 06:10 | — |
| Booked | 🚌 Airport bus Bergamo → Milano Centrale | Sat 19 Sep, 08:00 | ticket screenshot |
| Booked | 🏨 Hotel Brera | 19 Sep 15:00 → 22 Sep 11:00 | ref HB-99812 · €420 paid · confirmation PDF · Maps pin |
| Booked | Duomo rooftop, fast track | Sun 20 Sep, 10:30 | 2 tickets PDF · €34 not paid yet |
| Idea · must | Pasticceria Marchesi | no date | café · recommended by a friend |
| Idea · want | Aperitivo on the Navigli | no date | bar |
| Idea · maybe | 10 Corso Como | no date | shopping |
| Cancelled | Last Supper tour | Mon 21 Sep, 09:15 | cancellation email PDF |
| To do | Book dinner at Trattoria Milanese | Mon 14 Sep | — |

Trip documents: travel insurance PDF · passport scan. Notes: *Hotel door code 4821#*, *Wi-Fi:
Brera_Guest / aperol2026*.

### Finland / Lapland · 20–24 Nov 2026 · main timezone Europe/Helsinki
| Status | Item | When (local) | Details |
|---|---|---|---|
| Booked | ✈ Flight Sofia → Helsinki | Fri 20 Nov, 11:25 (Europe/Sofia) → 13:45 | Finnair AY 1234 · ref H7PLQ2 |
| Booked | 🚆 Santa Claus Express, Helsinki → Rovaniemi (overnight sleeper) | Fri 20 Nov 19:27 → Sat 21 Nov 07:45 | cabin 3, berth 22 · ticket PDF |
| Booked | 🚗 Rental car, Rovaniemi | 21 Nov 09:00 → 24 Nov 08:00 | ref ROV-5581 · voucher PDF |
| Booked | 🏡 Log cabin near Rovaniemi | 21 Nov 15:00 → 24 Nov 11:00 | Airbnb link · check-in instructions screenshot |
| Booked | Husky safari | Sun 22 Nov, 10:00 | €190 paid · meeting point Maps pin |
| Idea · must | Northern lights tour | no date | tour |
| Idea · maybe | Snowmobile trip | no date | outdoor |
| To do | Buy thermal gloves | Tue 17 Nov | packing |

This trip is the one that proves the timeline cannot be a list of attractions: two timezones, an
overnight train that departs one day and arrives the next, a car and a cabin that both span days.

## 12. Deliverables that would help most

1. The **trip Overview with the Now card**, in the states listed in §8.1, light and dark.
2. **Timeline** for the Lapland trip, including the overnight train and the multi-day cabin.
3. **Open-ticket** interaction: button, bottom sheet, missing-file state.
4. **Trip navigation** proposal (§8.4).
5. **Bookings** and **Places** tabs, including promoting an idea.
6. Refinements to **item detail** and a small **icon set** for kinds and attachment types.
