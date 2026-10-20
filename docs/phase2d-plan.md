# Phase 2D — Plan with AI (planning context export): plan

Written 2026-10-20 against `dc83ee7` (0.10.0, 1082 tests, clean, in sync with `origin/main`).
**Approved by the owner the same day** with three refinements, folded in below and listed in §11. Builds on
`phase2-plan.md` §7 (2A), corrected where 2C changed things.

## 1. What 2A said, and what changes

| 2A §7 | Now | Why |
|---|---|---|
| JSON (`travel-organizer-planning-context`) | **Markdown text** | It is read by an assistant *and* by the person in the preview; nothing parses it back. The importable format stays 2C's JSON |
| *Plan with AI* merges template + context | Kept: one screen, one text — the context ends with a compact *activities format* block | The brief: compact instruction, full schema shared separately (Import activities → *Share the format*) |
| Typed *planning notes* | Replaced by the **request**: a preset intention or the person's own words | Brief §2A |
| Switches *Where we stay* / *Who is travelling* / *Saved places* | Kept, defaults off / off / **on** | Brief §2B |
| `base` area derived from stays | **No derived area** — a stay's own place name, only when switched on | Brief §4: never derive an area from incomplete data |

No migration, no new dependency (`expo-clipboard` is installed; React Native's `Share` shares
text with no native module), no network.

## 2. The context — format and example (synthetic)

Deterministic: same trip + same choices → byte-identical text (no timestamp, stable ordering).

```markdown
# Travel Organizer — planning context

## My request
Help me improve this itinerary: better order, sensible pacing, nothing important missed.

## Trip
- Destination: Rovaniemi, Finland
- Dates: Fri 20 Nov – Tue 24 Nov 2026 (5 days)
- Times are local to Europe/Helsinki unless another zone is shown.

## Itinerary (already planned)

### Fri 20 Nov
- 07:10 (Sofia time) → 10:40 — Flight: Sofia → Rovaniemi [Travel · Flight]

### Sat 21 Nov
- 13:00–16:00 — Husky safari, at Bearhill Husky [Activity · Tour]
- 20:00 — Northern lights walk [Activity]

### Sun 22 Nov
- Nothing planned yet.

### Mon 23 Nov – Tue 24 Nov            ← runs of 3+ empty days are collapsed; 2 are listed
...

### Planned, no date yet
- Snowmobile tour [Activity]

## Where we stay                                                  ← only with "Where we stay"
- Nights of Fri 20 Nov – Mon 23 Nov: Arctic Snow Hotel (hotel)

## Ideas (not decided)
- Arktikum science museum, at Arktikum [Activity · Museum] — must
- Lunch at Nili [Food · Restaurant] — want — considering Sat 21 Nov

## Travellers                                                     ← only with "Who is travelling"
- 3 travellers: 2 adults, 1 child

## How to help
- The itinerary above is what I already plan to do. Don't drop, move or replace anything without
  asking; suggest changes separately and say why.
- Keep ideas and planned activities apart; an idea is not decided.
- Point out clashes, impossible transfers and days that look too full or too empty.
- Don't invent bookings, prices, opening hours, availability or travel times — say when something
  needs checking.
- Nothing above is necessarily booked or paid.
- Ask me if something essential is missing.

## If I ask for activities to import
Reply with only JSON in the Travel Organizer activities format, version 1:
{"format": "travel-organizer-activities", "version": 1, "activities": [ ... ]}
Each activity: "title" (required); optional "kind" (activity, food, stay, transport, other),
"status" ("idea" for suggestions — never "booked"), "date" (YYYY-MM-DD), "startTime"/"endTime"
(HH:mm), "location" {"name", "address"}, "notes", "links" [{"url": "https://..."}].
Leave out anything you don't know. Only new suggestions — don't repeat what is listed above.
```

## 3. Privacy: an allowlist, not a filter

**One mapper is the only code that touches a stored item**: `planningItemOf(item)` returns a
`PlanningItem` with exactly these fields — `kind`, `subkind`, `status`, `priority`, `title`,
`start`/`end` (wall clock + zone), `startTzOverride`/`endTzOverride`, `locationName`, and for
transport `from`/`to`. Everything else — `notes`, `address`, coordinates, `confirmation_code`,
`details` (carrier, number, seat, journey, reminder, pricing, refundable), prices, `is_paid`,
participants, ids, timestamps — is never copied into the planning model, so no later code can leak
it. The repository reads **only** the one trip's row, its items, and (only when the switch is on)
its members' classifications. Notes, resources (files and links), expenses, payments, lists,
templates and settings (Me) are **not read at all**.

| Data | In the context |
|---|---|
| Trip destination (else name), dates, default zone | always |
| Planned items (`confirmed`, not tasks): day, time(s), zone when it differs, title, kind/type, place name; transport route | always |
| Undated planned items | always, own section |
| Ideas: title, kind/type, priority, place name, *considering <date>* | on by default (switch) |
| Stays | **only with *Where we stay***, and then only in their own section: the nights covered and the place name — never in the daily itinerary, never an address |
| Traveller counts by adult / child / not specified | **only with *Who is travelling*** — numbers only |
| Tasks, cancelled items | never |
| Notes, addresses, coordinates, links, booking references, carrier/flight number/seat, prices, paid, receipts, documents, expenses, payments, lists, names, Me, ids, other trips | never — not selectable |

**Titles and place names are free text** and are the one allowlisted risk: *"Hotel Aurora — ref
X7K2P9"* is possible. They pass through `scrubPlanningText`, which removes, before anything else
sees them: every booking reference stored **anywhere in the trip** (exact, case-insensitive), email
addresses, URLs, phone-number-like digit runs (7+ digits with spaces/dashes/brackets/+), and long
digit strings (card/passport-like, 8+ digits). Removed text becomes `…`. The preview then shows
the exact result (decision 2).

## 4. Rules the text follows

- Days from the trip's start to end, each listed; an empty day says *Nothing planned yet*; three or
  more empty days in a row collapse into one range line. Items before or after the trip dates go
  in *Before the trip* / *After the trip* (D8: items are not confined to trip dates).
- Times exactly as stored (`HH:mm`, wall clock); a date-only item has no time; the trip's zone is
  stated once and an item in another zone says so (*Sofia time*), using the existing `zoneName`.
- Multi-day items split like the Timeline: start on its day, end on its day (*Check in* /
  *Check out*, *Departs* / *Arrives*) via `buildTimeline` + `entryRoleLabel`; an overnight leg
  crossing midnight shows its arrival on the next day.
- Never *booked*, *confirmed* or *paid*: planned items are "already planned"; nothing about money.
- Request: preset text, or the person's own words (≤ 500 chars, trimmed, put under *My request*
  verbatim — see decision 6).

## 5. Planning intentions (presets → the *My request* paragraph)

| Preset | Text |
|---|---|
| Improve my itinerary (default) | Help me improve this itinerary: better order, sensible pacing, nothing important missed. |
| Fill free time | Suggest things to do in the free time — the empty days and the gaps between plans. |
| Is it too busy? | Check whether the schedule is too busy or unrealistic, and tell me where to ease off. |
| Places to eat | Suggest places to eat that fit the plans, near where I'll be. |
| General planning | Help me plan this trip. |
| My own words | the text typed |

Only *My request* changes; the rest of the text is the same for every intention.

## 6. UI — `app/trip/[tripId]/plan-with-ai.tsx`

Overview → More → **Plan with AI** (`getTripMoreActions`, a new icon). One scrolling screen, no
wizard, Back leaves it:

1. **What would you like help with?** — the presets as a choice list; *My own words* opens a text
   field.
2. **What to include** — always included, as plain text (*the trip, its dates and the itinerary*);
   switches: *Ideas not decided yet* (on), *Where we stay* (off), *Who is travelling — numbers
   only* (off); one line: *Never included: names, booking references, prices, notes, documents,
   links.*
3. **Exactly what will be shared** — the generated text, selectable, in a bordered box, updating
   as choices change; its length in characters.
4. Pinned footer: **Copy for ChatGPT** · **Share** (both receive the very string shown; busy-guarded).
   Copy → *Copied — paste it into ChatGPT*; Share → the Android text share sheet. Below the box:
   *Want importable suggestions? Ask for "activities to import", save the reply as a .json file,
   then Import activities.* with a button to the import screen.

Choices are not saved (no write of any kind; next time starts from the defaults). An empty trip
still produces a valid context (*Nothing planned yet* + the request).

## 7. Files

| File | What |
|---|---|
| `src/domain/planningContext.ts` (+ test) | `PlanningItem`, `planningItemOf`, `scrubPlanningText`, `PLANNING_INTENTIONS`, `PlanningOptions` + defaults, `buildPlanningContext(input, options)` → string |
| `src/repositories/planningContext.ts` (+ test) | `readPlanningInput(db, tripId)`: trip, items, member classifications — nothing else |
| `app/trip/[tripId]/plan-with-ai.tsx` | the screen |
| `src/config/features.ts` (+ test), `src/ui/components/Icon.tsx` | the More action |
| `app.json` | 0.11.0, versionCode 18 |
| Docs | phase2-plan (as built), roadmap, status, product-status, technical reference §19, user guide, session handoff, decision log D36, CLAUDE.md table, `ai-activities-format.md` (pointer) |

## 8. Tests

**Unit (synthetic):** one trip only (a second trip's items, notes and travellers never appear);
dates/times byte-exact; zones (item zone ≠ trip zone labelled; same zone not); idea vs planned;
undated planned section; empty days and collapsed runs; empty trip; before/after-trip items;
overnight crossing midnight; multi-day stay split; tasks and cancelled absent; switches: ideas
off/on, stays off/on (name only, never address), traveller counts off/on with adult/child/not
specified from per-trip classification and no names; every intention and custom text; the
format block present and consistent with the 2C parser (a JSON reply built exactly from the block's
field list imports with no errors); deterministic (same input twice → identical; input order
shuffled → identical); 200-item trip formats and stays under a bound. **Negative privacy:** a
fixture whose excluded fields hold fake booking codes, emails, phone numbers, passport-like
strings, card numbers, private URLs (wallet, signed, token query), sensitive notes, a receipt, a
document label, traveller names and Me — assert none of those strings occur in the output for any
switch combination; and the same fakes placed **in titles and place names** are scrubbed.
Repository: reads one trip; runs without touching any table's rows (hash of every table equal).

**E2E (brief §9, A–J)** on `TO_2B_Test` (debuggable build of the same code, synthetic data) and J on
`Pixel_10_Pro` (release 0.11.0 `install -r` over 0.10.0). Copy is verified by pasting the clipboard
into a text field and dumping it; Share by sharing to Travel Organizer itself (it accepts `text/*`)
and comparing the received text. Before/after database diffs around every step (G). F's *trip with
no fixed dates* is **N/A** (Phase 6).

## 9. Data safety

Read-only end to end: the screen runs selects only, writes no setting, makes no network call.
Nothing on the phone changes when the text is generated, copied or shared.

## 10. Decisions for the owner (recommendation first)

1. **Markdown text** rather than JSON — **recommended** (2A's JSON was for a parser that does not
   exist; the person must read it in the preview).
2. **Titles and place names included, scrubbed** of the trip's own booking references, emails,
   URLs, phone-like and long digit strings — **recommended** — or titles verbatim (the preview is
   the only control), or no titles at all (the context becomes useless).
3. **Notes, descriptions, addresses, coordinates and links: never, not even as an option** in 2D
   — **recommended**.
4. ***Where we stay* shows each stay's place name and dates** (location name, else title), never an
   address — **recommended** — or the stay's kind only (*a hotel*), or not offered.
5. ***Who is travelling* is one switch** giving the total and adult / child / not specified from the
   trip's traveller profiles; legacy typed names are not counted — **recommended** — or two
   switches (total; breakdown).
6. **The custom request is the person's own words, not scrubbed** (they typed it into this screen
   to share) — **recommended** — or scrubbed like titles.
7. **Transport shows the route (from → to) and times; never carrier, flight number or seat** —
   **recommended** — or carrier + number too (useful for arrival planning, identifies the flight).
8. **Ideas: on by default**, with a switch; a dated idea says *considering <date>* —
   **recommended**.
9. **A compact activities-format block is always at the end** (~8 lines), the full schema stays
   on Import activities — **recommended** — or a switch for it, or none (the person shares the
   schema separately).
10. **Choices are not remembered** (no writes at all) — **recommended** — or remembered per trip
    in settings.
11. **Version 0.11.0, versionCode 18.**

## 11. The owner's refinements (2026-10-20)

1. **The scrub is best effort, and says so.** Above the exact preview: *"Review this text before
   sharing. Activity titles and place names may contain personal information."* The scrub must
   not damage useful text: dates (`2026-11-21`, `21.11.2026`), times, road and route numbers
   (`E75`, `Route 66`), flight-like codes in titles and ordinary place names stay. It removes
   only: booking references stored in the trip (whole-word, case-insensitive), emails, URLs,
   phone-like numbers (9+ digits with separators, not shaped like a date) and digit runs of 10+.
   Tests prove both sides.
2. **Copy and Share use exactly the previewed string** — one variable, rendered, copied and shared;
   no prefix, suffix or transformation. The custom request appears verbatim in it.
3. **Accommodation without repetition.** With *Where we stay* off, stays appear nowhere. With it
   on, stays are **not** added to the daily itinerary; a separate *Where we stay* section lists
   each stay once as the nights it covers (*Nights of Fri 20 Nov – Mon 23 Nov: Arctic Snow Hotel
   (hotel)*), from its check-in and check-out dates; a stay with no check-out says *from Fri 20 Nov*.
   Place name (else title, both scrubbed) and kind of stay only — no address, times, references or
   guests.

## 12. As built and verified (0.11.0, 2026-10-20)

Built as planned with the refinements of §11. Technical: technical reference §19; rationale: D36;
E2E: `%USERPROFILE%\Pictures\TravelOrganizer-0.11.0-2D-e2e\E2E-LOG.md` — A–J **pass**, F's
undated trip N/A. Changes found during E2E: Copy and Share are stacked full width (*Copy for
ChatGPT* was cut short side by side); the format block says *full web addresses only* instead of a
literal `https://...` (a receiving app took the context for a link); the scrub's date guard accepts
only real calendar dates (`(040) 123-45-67` slipped through as a "date").
