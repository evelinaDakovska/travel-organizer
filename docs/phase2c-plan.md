# Phase 2C — AI activity import & selective export: plan

Written 2026-10-19 against `abd36ae` (0.9.0, 992 tests). **Approved by the owner the same day**
with three refinements, folded in below and listed in §10. Builds on `phase2-plan.md` §6 (2A), corrected where 0.8.0/0.9.0
or the 2C brief changed things.

## 1. What 2A got wrong or left open, checked against the code

| 2A said | Now | Source |
|---|---|---|
| `status: idea \| planned` | Kept. *planned* = `confirmed`, which the app calls **In my itinerary** — not "booked". The app has no separate *booked* state, so nothing is lost or upgraded | `ItemForm.tsx` `STATUS_LABELS` |
| A *planned* item needs a date | No: the Timeline already has **No date yet** for undated confirmed items (`undatedConfirmed`). A planned activity without a date is importable and lands there | `timeline.tsx`, `itinerary.ts` |
| Booking reference imported "only if present" | **Not in v1** (brief). A `bookingReference` in a file is reported as ignored | brief §2 |
| Per-person prices shown, total written | **Not in v1** — Phase 3. `price.perPerson` is reported as ignored, never stored | brief §2 |
| *Add as Ideas / Plans* switch in the preview | Dropped: the file's status is used, missing → idea | brief §2 |
| Paste from the clipboard | Dropped: a file from the document picker only | brief §4 |
| Undo after import | Not in 2C (see §9, decision 7) | — |
| Price on a planned item | Counts in the Expenses tab's **booking costs, as unpaid** (`bookingCosts.ts` counts every priced `confirmed` item). `is_paid` is never set | `bookingCosts.ts` |
| Reminders | A planned, dated, future import gets the default reminders by kind with no extra code (reconciled from the database) | `domain/reminders.ts` |
| Currency "3 letters" | The form takes any 3 letters (`MoneyInputs` upper-cases). The importer requires `^[A-Z]{3}$` and warns on a code outside a curated ISO 4217 list (Hermes has no `Intl.supportedValuesOf`) | `MoneyInputs.tsx`, finding 3 |

No migration and no new native dependency: `expo-document-picker`, `expo-file-system`,
`expo-sharing` and `expo-clipboard` are already installed.

## 2. The public format, version 1

File `…-activities.json`, UTF-8, ≤ **1 MB**, ≤ **300** activities. It is independent of the
database: no ids, no table or column names, no file references.

```jsonc
{
  "format": "travel-organizer-activities",   // required, exact
  "version": 1,                              // required integer; > 1 → "made for a newer version"
  "activities": [                            // required, 1–300 items
    {
      "title": "Husky safari",               // required, 1–120 chars
      "kind": "activity",                    // activity | food | stay | transport | other (default activity)
      "type": "tour",                        // optional; must be a type of that kind (the app's SUBKINDS)
      "status": "idea",                      // idea | planned (default idea)
      "priority": "must",                    // optional must | want | maybe — ideas only
      "date": "2026-11-21",                  // optional YYYY-MM-DD (a real calendar date)
      "startTime": "13:00",                  // optional HH:mm, needs date
      "endDate": "2026-11-21",               // optional, needs date, not before it
      "endTime": "16:00",                    // optional HH:mm, needs date
      "timeZone": "Europe/Helsinki",         // optional IANA; omitted = follows the trip
      "endTimeZone": "Europe/Helsinki",      // optional, e.g. a flight landing elsewhere
      "location": {                          // optional
        "name": "Bearhill Husky",            //   ≤ 120
        "address": "Sierijärventie 55",      //   ≤ 240
        "latitude": 66.5, "longitude": 25.7  //   both or neither; ±90 / ±180
      },
      "notes": "Warm clothes provided",      // optional, ≤ 4000
      "description": "…",                    // optional, ≤ 4000 — stored in notes (decision 3)
      "price": { "amount": "290.00", "currency": "EUR" },  // optional; amount string or number, ≥ 0, ≤ 2 decimals
      "links": [ { "label": "Website", "url": "https://…" } ], // optional, ≤ 10; http/https only, ≤ 2048
      "transport": { "from": "HEL", "to": "RVN", "carrier": "Finnair", "number": "AY531" } // transport only
    }
  ]
}
```

**Mapping.** Every activity becomes a `TripItemInput` and goes through the **same**
`tripItemInputSchema(trip.defaultTz)` every form uses, so nothing can be imported that the app's own
form would refuse (end before start, subkind not of its kind, …). `planned` → `confirmed`;
`date` + `startTime` → `start.local` (`2026-11-21T13:00` or `2026-11-21`); `price.amount` → minor
units through the A2 `parseAmount` rules (strings) or an exact two-decimal check (numbers) —
`12.345`, `-5`, `1.234` are refused, never guessed. Links → `resources` rows (`kind='link'`,
subtype by `guessLinkSubtype`, label by `defaultLinkLabel` when absent). `isPaid` is always false;
no participants; no confirmation code; no `completed_at`; ids minted in the app.

**Never accepted from a file** (reported as *ignored*, never read): `id`, any `*Id`, `tripId`,
`isPaid`/`paid`, `confirmationCode`/`bookingReference`, `participants`/`travellers`, `files`,
`attachments`, `createdAt`/`updatedAt`, `completedAt`, `reminder`, `settings`, `me`, `price.perPerson`
— and any other unknown key. `task` is not a kind here (to-dos are not activities).

**Versioning.** `format` never changes. Within v1 nothing is added or reinterpreted; any new field
or meaning is **v2**, and the app keeps reading every older version it ever read. A file newer than
the app is refused whole with *"made for a newer version of Travel Organizer — update the app"*.
Unknown fields in a v1 file are reported, not fatal, so a v2-ish file from an AI still imports what
v1 understands, and says what it left out.

**Artefacts.**
- `docs/ai-activities-format.md` — the public document: fields, rules, versioning, a complete
  copyable example, and the instruction text for ChatGPT.
- `docs/schema/travel-organizer-activities-v1.schema.json` — standard JSON Schema (draft 2020-12).
- `src/domain/activityFormat.ts` exports the same schema object and the AI template text, so the app
  can share/copy exactly what the docs say. A test asserts the docs file equals it, and (with `ajv`,
  dev-only — decision 8) that every example in the docs validates against it and the Zod parser
  agrees on a set of good and bad files.

## 3. Validation: four tiers, in order

| Tier | Examples | Result |
|---|---|---|
| **Fatal file** | > 1 MB (checked from the file size before reading), not UTF-8 text, not JSON, root not an object, wrong `format`, `version` missing / not an integer / newer, `activities` missing / not an array / empty / > 300, nesting deeper than 6, a `__proto__`/`constructor`/`prototype` key anywhere | Refused whole, one message, nothing written |
| **Invalid activity** | not an object, no title, bad date (`2026-02-30`), bad time (`25:00`), time without date, end before start, bad zone, lat without lng or out of range, bad amount, currency not `^[A-Z]{3}$`, price without currency, unsupported `status` (`booked`, `cancelled` → *"use idea or planned"*), unknown `kind`, a link that is not http(s), a known field of the wrong type (e.g. `location` an array), a string over its limit | Shown greyed with every reason; cannot be selected; the rest imports |
| **Warning** | `type` not valid for its kind (dropped), `priority` on a planned activity (dropped), date outside the trip's dates (D8: allowed), planned without a date (*goes under No date yet*), currency not in the ISO list, planned + price (*counts as an unpaid booking cost*) | Shown; selectable |
| **Ignored field** | every key in §2's "never accepted" list and any unknown key, per activity and at the top level | Listed by name; the value is never read |

A leading BOM and a single surrounding Markdown code fence (```` ```json ````) are stripped — AI
chats add them; nothing else is altered. Strings are trimmed and stored as plain text (SQL is
bound, never built; React renders text, never HTML).

## 4. Duplicates — conservative and explained

Pure `findActivityDuplicates(candidates, existingItems)`. Titles are normalised: lower case, accents
stripped (NFD), punctuation to spaces, whitespace collapsed. Places: normalised name, or coordinates
within **100 m**. A candidate is a **likely duplicate** of an existing item (any status, including
cancelled — named as such) or of an **earlier** activity in the same file when:

1. **Same title and compatible time** — same date (and, if both have a start time, the same time),
   or both undated; **and** their places do not contradict (both located but > 1 km apart / different
   names → not a duplicate). *"Same title as 'Husky safari' (Sat 21 Nov)"*.
2. **Same place, same date and same start time**, whatever the titles. *"Same place and time as
   'Lunch at Nili' (Sat 21 Nov, 13:00)"*.

So: a similar title on another date is **not** a duplicate; the same venue on the same day with a
different title is **not** a duplicate unless the start time also matches; one dated and one undated
with the same title **is** flagged (planning a saved idea). Likely duplicates start **deselected**
and can be ticked. Within a file the first occurrence stays selected, later ones are deselected.
Nothing is ever merged, updated or deleted.

## 5. Import — `app/trip/[tripId]/import-activities.tsx`

Entry: Overview → More → **Import activities** (`getTripMoreActions`). One screen whose content moves
through states, like *Import a trip* — no wizard, Back always leaves it:

1. **Start** — target trip named in the header; what the file is; **Choose a file** (document
   picker, `*/*`, copied to cache, size checked before reading, the copy deleted after);
   **Get the AI template**: *Copy instructions for ChatGPT* (clipboard) and *Share the schema file*.
2. **Refused** — the fatal reason, *Choose another file*.
3. **Preview** — summary line *"9 in the file · 7 valid · 1 invalid · 1 possible duplicate ·
   6 selected"*; file-level ignored fields; **Select all / Deselect all** (valid ones only); a
   `FlatList` of rows: checkbox, `KindTile`, title (2 lines), date/time, place, *Idea · Must* or
   *Planned*, price, then each warning, duplicate reason and ignored field; invalid rows greyed with
   their reasons. Pinned footer **Add 6 activities** (disabled at 0; busy-guarded against a double
   tap).
   Above the footer, when it applies to what is ticked: *"2 planned activities with a price will
   appear in Expenses as unpaid booking costs. An estimated price is not a payment — nothing is
   marked paid."* and *"3 planned activities are in the future and will get the app's usual
   reminders."* (counted with the existing `reminderFor`; the reminder system is not changed).
4. **Done** — *"Added 6 activities to Lapland: 4 ideas on Places, 2 plans on the Timeline. 3 were
   not added."*, then **Review imported activities**: the new records, live (an item deleted from
   its detail screen drops off the list), each opening the existing item screen where it is edited
   or deleted one at a time. No bulk delete, no Undo. *Back to the trip*. Failure: *"Nothing was
   added"* + reason, preview kept.

**Write** — `repositories/activityImport.ts` `importActivities(db, tripId, inputs)`: **one**
`withTransactionAsync` (not exclusive — finding 6) inserting each item (`insertTripItem`) and its
link rows (`createResource`); returns the new ids. Any error rolls back the whole batch. The trip id
comes from the route and is checked to exist inside the transaction. Nothing existing is read for
writing, updated or deleted.

## 6. Export — `app/trip/[tripId]/export-activities.tsx`

Entry: Overview → More → **Export activities**. One screen:
- `Segments`: **All · Ideas · Planned** filters the list; checkboxes per row; **Select all / Deselect
  all** act on what is shown; footer **Share 5 activities** (JSON written to the cache, then the
  Android share sheet, `application/json`).
- Offered: ideas and planned items of every kind but `task`. **Not offered**, counted in a note:
  to-dos and cancelled items (*"Cancelled plans and to-dos are not exported — the format has no way
  to say 'cancelled', so they would arrive as live plans"*).
- *What is in the file*: titles, kinds and types, idea/planned and priority, dates, times and zones,
  places, notes, prices, website and map links, travel routes. *Never*: booking references, who is
  going, traveller names, documents, photos, paid or not, reminders, other trips, ids.
- Links exported: only `website` and `maps` subtypes with http(s) URLs (decision 5); a skipped link
  is counted in the summary. Seats are not exported.
- Every exported activity is run back through the importer's parser before sharing; one that would
  not re-import (e.g. a pre-existing title > 120 written by an older version) is listed and left
  out, never altered. So **every exported file re-imports**.
- Prices: total and currency. A priced planned item exports as `planned` with its price; the paid
  flag is not carried, so it re-imports as unpaid (stated on the screen).

## 7. Files to add / change

| File | What |
|---|---|
| `src/domain/activityFormat.ts` (+ test) | Limits, the JSON Schema object, AI template text, `parseActivityFile(text, trip)` → `{fatal}` or `{activities: [{index, input, links, warnings, ignored, errors}]}`, `activitiesToFile(items, links)` |
| `src/domain/activityDuplicates.ts` (+ test) | Normalisation, `findActivityDuplicates`, default selection |
| `src/domain/currencies.ts` (+ test) | Curated ISO 4217 active codes |
| `src/repositories/activityImport.ts` (+ test) | The one-transaction writer; `listExportableActivities` (items + their links) |
| `src/files/activityFiles.ts` | Pick + read with size limit; write + share JSON; share schema |
| `app/trip/[tripId]/import-activities.tsx`, `export-activities.tsx` | The two screens |
| `src/features/activities/ActivityPreviewRow.tsx` | One preview row (shared by nothing else — kept in the feature) |
| `src/config/features.ts` (+ test) | Two More actions |
| `docs/ai-activities-format.md`, `docs/schema/…v1.schema.json` | Public format |
| `app.json` | 0.10.0, versionCode 17 |
| Docs | phase2-plan (as built), roadmap, status, product-status, technical-reference §18, user-guide, session-handoff §11, decision-log D35, CLAUDE.md doc table |

## 8. Tests and verification

**Automated** (node, `better-sqlite3`, synthetic only): format/version/limits/depth/prototype keys;
BOM and fence; every field and enum; real-calendar dates, times, zones, both-or-neither coordinates;
amounts (strings, numbers, `12.345`, `-5`, `1.234`, `1e3`); currencies; links (`javascript:`,
`file:`, `geo:` refused); ignored and forbidden fields never reach the input; `planned`→`confirmed`,
default `idea`, `isPaid` false; mapped inputs equal what the form produces; duplicate rules incl.
accents, the four C-scenarios, inside the file, and no false positive on similar names; selection
writes exactly the selected rows plus links; **rollback** (failure injected at the n-th insert and
at a link insert → zero new rows); existing rows byte-identical before/after (hash of every table);
export privacy (a fixture with confirmation codes, participants, files, wallet links, paid flags,
seats, notes on other trips — none of it in the JSON); **round trip** export → import into another
trip equals every supported field; JSON Schema ⇔ Zod agreement; full suite and `tsc`.

**E2E (brief §10, scenarios A–J)** on **`TO_2B_Test`** with a fresh debuggable build of the same
code (so the database can be inspected with `run-as`; restored afterwards, never committed), files
pushed to Downloads and picked through the real document picker; then **J** — the release-signed
0.10.0 with `install -r` over 0.9.0 on **`Pixel_10_Pro`** (synthetic data already there; the two
unknown zips in its Downloads are not opened). Rollback on device via a temporary `__DEV__`-only
switch, removed and grepped for before the commit. Evidence, matrix and screenshots in
`%USERPROFILE%\Pictures\TravelOrganizer-0.10.0-2C-e2e\`. No physical phone is connected.

## 9. Decisions for the owner (recommendation first)

1. **Statuses:** `idea` | `planned` (= In my itinerary). `booked`, `confirmed`, `cancelled` in a file
   make that activity invalid with *"use idea or planned"* — **recommended** — or `confirmed` accepted
   as an alias of planned.
2. **Kinds:** activity, food, stay, transport (with from/to/carrier/number; no seat) and other; no
   to-dos — **recommended** — or activity/food/other only.
3. **`description`:** accepted and stored in notes (description first, a blank line, then notes),
   documented — **recommended** — or ignored with a warning (the format has `notes` only).
4. **Price:** total + currency only; on a planned activity it counts as an unpaid booking cost;
   per-person prices ignored and reported until Phase 3 — **approved, refined (§10.1)**.
5. **Links on export:** website and maps (http/https) only; wallet, ticket and confirmation links
   never — **recommended** — or no links at all.
6. **No *Add as* switch** in the preview: the file's status, default idea — **recommended**.
7. **No Undo** after import — **approved, replaced by *Review imported activities* (§10.2)**.
8. **`ajv` as a dev dependency** (tests only, not in the APK) to prove the published JSON Schema and
   the app's parser agree — **recommended** — or hand-written schema with no machine check.
9. **Entry points:** Overview → More only — **recommended** — or also on Places' Add sheet.
10. **Version:** 0.10.0, versionCode 17.

All other decisions (1–3, 5–6, 8–10) **approved as proposed**.

## 10. The owner's refinements (2026-10-19)

1. **Pricing.** Total and currency only. Per-person or other pricing fields (`price.perPerson`,
   `price.adult`, `price.child`, `priceAdult`, `pricePerPerson`, any other key inside `price`)
   are **outside the v1 schema** and never silently dropped: the preview names each one under
   *Not imported* with *"Per-person prices are not imported yet — only the total"*. The preview says
   that a planned activity's price appears as an **unpaid booking cost** in Expenses, and that an
   estimated price is not a payment.
2. **Post-import review** instead of Undo (§5, step 4): the newly created records, opening the
   existing item screen; no bulk delete.
3. **Reminders.** The preview says how many ticked planned activities are in the future and will
   get the existing reminders. The reminder system is unchanged.
4. **AI-friendly.** The published schema and example use plain names and nesting no deeper than
   needed (`location`, `price`, `links`, `transport`), every enum written out, no internal
   names, ids or table terms; the AI instructions are short, rule-first, and end with *"Output only
   the JSON"*. Tested: the example in the docs and the template imports with zero warnings.

## 11. As built and verified (0.10.0, 2026-10-20)

Built as planned, with the refinements of §10. Status and how it was verified: `status.md` *P2·2C*;
technical detail: technical reference §18; rationale: decision log D35; full E2E matrix and
screenshots: `%USERPROFILE%PicturesTravelOrganizer-0.10.0-2C-e2eE2E-LOG.md` — scenarios A–J
**pass**.

**Beyond the plan, found during E2E and fixed:**
- `useLiveQuery` waits for a pause in change events (50 ms, at most 10 s) and queues at most one
  read behind a running one. Before, a 300-activity import took 43 s — minutes with Timeline and
  Places open — because every row written made every mounted query re-read and re-render. Now
  3.1–3.2 s. A shared hook: every batch write benefits (restore, trip import).
- Preview rows announce their errors, duplicate reason, warnings and ignored fields to a screen
  reader; invalid rows dim only their description, not their error text.
- The selection notices (price, reminders) moved from the pinned footer into the list — at font 2.0
  on 360 dp the footer covered half the screen.
- `Segments` labels stay on one line (shrink to fit) — *Planned* wrapped mid-word at font 2.0.
- Export rows are checkbox rows (no chevron); *Choose another file* opens the picker directly and
  dismissing it keeps the preview.

**Deviations from the plan:** none in the format. The ajv check runs over the docs' examples, the
app's example and template, exported files, and 19 bad documents that schema and parser must both
refuse.
