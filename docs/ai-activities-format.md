# The Travel Organizer activities format (version 1)

A small, public JSON format for **adding activities to a trip** in Travel Organizer — written by
you, by a script, or by an AI assistant such as ChatGPT — and for **sharing chosen activities** out
of a trip. It describes activities only. It has nothing to do with how the app stores data: no ids,
no database fields, no files.

- JSON Schema (draft 2020-12): [`schema/travel-organizer-activities-v1.schema.json`](schema/travel-organizer-activities-v1.schema.json)
- In the app: a trip's **Overview → More → Import activities** (with *Copy instructions for
  ChatGPT* and *Share the format*), and **Export activities**.
- Code: `src/domain/activityFormat.ts` (reader and writer), `activityTemplate.ts` (the
  instructions below). Tests keep this page, the schema and the code in step.

## Use it with ChatGPT

1. In the trip, open **More → Import activities → Copy instructions for ChatGPT**.
2. Paste them into a chat, then describe the trip: where, when, who, what you like.
3. Ask for the file. Save the answer as a `.json` file (a Markdown code fence around it is fine).
4. **Import activities → Choose a file**. Every activity is shown before anything is added; tick
   the ones you want and tap **Add**.

The instructions the app copies, word for word:

```text
Generate a Travel Organizer activities file in JSON, using the format below.

Rules:
- Output only the JSON: no comments, no explanation.
- "format" is always "travel-organizer-activities" and "version" is always 1.
- Each activity needs a "title". Every other field is optional — leave it out when you do not know it.
- Include only information you know or can verify. Do not invent dates, times, prices, addresses, coordinates, links or booking details.
- Use "status": "idea" for a suggestion. Use "planned" only for something the traveller has said they will do. Never write "booked" or "confirmed".
- "kind" is one of: activity, food, stay, transport, other.
- "type" is optional and must belong to the kind:
  activity: museum, gallery, tour, attraction, event, theatre, outdoor, spa
  food: restaurant, cafe, bar, bakery, market
  stay: hotel, apartment, hostel, guesthouse, camping
  transport: flight, train, bus, ferry, car, taxi, transfer, walk
  other: luggage, insurance, parking, shopping, viewpoint
- "priority" (ideas only): must, want or maybe.
- Dates are YYYY-MM-DD. Times are 24-hour HH:mm, local to the place. A time needs a date.
- "timeZone" (optional) is an IANA name such as Europe/Helsinki; leave it out to use the trip's zone.
- "location" may have "name", "address", and "latitude" with "longitude" (both or neither).
- "description" and "notes" are plain text, up to 4000 characters each.
- "price" is the expected total: {"amount": "12.50", "currency": "EUR"} — at most two decimals, a three-letter currency code. Leave it out when unknown. It is never a payment.
- "links": up to 10, each {"label": "...", "url": "https://..."}; only https or http.
- "transport" (only for kind transport) may have "from", "to", "carrier", "number".
- At most 300 activities.

Example:
(the three-activity example the app includes — the first three activities of the example below)
```

An example instruction to send after it: *"Generate a Travel Organizer activities JSON file for
our trip to Rovaniemi, 20–24 November 2026, two adults and a child, using this format. Include only
information you know or can verify. Do not invent dates, prices, locations or booking details. Use
idea status when an activity is only a suggestion."*

## A complete example

Copy this as it is — it imports without a single warning.

```json
{
  "format": "travel-organizer-activities",
  "version": 1,
  "activities": [
    {
      "title": "Husky safari",
      "kind": "activity",
      "type": "tour",
      "status": "planned",
      "date": "2026-11-21",
      "startTime": "13:00",
      "endTime": "16:00",
      "location": { "name": "Bearhill Husky", "address": "Sierijärventie 55, Rovaniemi" },
      "price": { "amount": "290.00", "currency": "EUR" },
      "links": [{ "label": "Website", "url": "https://example.com/husky-safari" }],
      "notes": "Warm clothes are provided."
    },
    {
      "title": "Arktikum science museum",
      "kind": "activity",
      "type": "museum",
      "status": "idea",
      "priority": "must",
      "location": { "name": "Arktikum", "latitude": 66.5115, "longitude": 25.7311 }
    },
    {
      "title": "Lunch at Nili",
      "kind": "food",
      "type": "restaurant",
      "status": "idea",
      "priority": "want",
      "description": "Lappish food: reindeer, salmon, berries."
    },
    {
      "title": "Santa Claus Village",
      "kind": "other",
      "type": "viewpoint",
      "status": "idea",
      "location": { "name": "Santa Claus Village", "address": "Tähtikuja 1, Rovaniemi" }
    },
    {
      "title": "Flight to Rovaniemi",
      "kind": "transport",
      "type": "flight",
      "status": "planned",
      "date": "2026-11-20",
      "startTime": "07:10",
      "endTime": "10:40",
      "timeZone": "Europe/Sofia",
      "endTimeZone": "Europe/Helsinki",
      "transport": { "from": "SOF", "to": "RVN", "carrier": "Finnair", "number": "AY1234" }
    },
    {
      "title": "Apartment in the centre",
      "kind": "stay",
      "type": "apartment",
      "status": "idea",
      "date": "2026-11-20",
      "startTime": "15:00",
      "endDate": "2026-11-24",
      "endTime": "11:00",
      "price": { "amount": 480, "currency": "EUR" }
    }
  ]
}
```

The smallest file there can be:

```json
{ "format": "travel-organizer-activities", "version": 1, "activities": [{ "title": "Arktikum" }] }
```

## The envelope

| Field | Required | Value |
|---|---|---|
| `format` | yes | exactly `"travel-organizer-activities"` |
| `version` | yes | the number `1` |
| `activities` | yes | a list of 1 to **300** activities |

The whole file is at most **1 MB** of UTF-8 text, and nothing in it is nested more than 6 levels.

## An activity

Only `title` is required. **Leave out what you do not know**; `null` means the same as leaving it
out. Nothing missing is ever filled in by the app — no date, time, price or place is invented.

| Field | Type | Rules |
|---|---|---|
| `title` | text | 1–120 characters |
| `kind` | text | `activity` (default), `food`, `stay`, `transport`, `other` |
| `type` | text | optional, must belong to the kind — see below |
| `status` | text | `idea` (default) or `planned` |
| `priority` | text | `must`, `want` or `maybe` — ideas only |
| `date` | text | `YYYY-MM-DD`, a real calendar date |
| `startTime` | text | `HH:mm`, 24-hour, local to the place; needs `date` |
| `endDate` | text | `YYYY-MM-DD`, not before `date`; needs `date`; only when it ends on a later day |
| `endTime` | text | `HH:mm`; needs `date` |
| `timeZone` | text | IANA name, e.g. `Europe/Helsinki`; leave it out to use the trip's zone |
| `endTimeZone` | text | IANA name, only when the end is elsewhere (a flight's arrival); otherwise the end is in `timeZone` |
| `location` | object | `name` (≤ 120), `address` (≤ 240), `latitude` (−90…90) and `longitude` (−180…180) — both or neither |
| `notes` | text | ≤ 4000 characters |
| `description` | text | ≤ 4000; stored in the notes — first, then a blank line, then `notes` |
| `price` | object | `amount`: text like `"12.50"` or a number, not negative, at most two decimals; `currency`: three capitals (ISO 4217), e.g. `EUR`. Both required |
| `links` | list | up to 10 of `{ "label": "...", "url": "https://..." }`; `http` and `https` only, ≤ 2048 characters; the label is optional (≤ 120) |
| `transport` | object | kind `transport` only: `from`, `to` (≤ 80), `carrier` (≤ 60), `number` (≤ 24) |

**Types by kind**

| Kind | Types |
|---|---|
| activity | museum, gallery, tour, attraction, event, theatre, outdoor, spa |
| food | restaurant, cafe, bar, bakery, market |
| stay | hotel, apartment, hostel, guesthouse, camping |
| transport | flight, train, bus, ferry, car, taxi, transfer, walk |
| other | luggage, insurance, parking, shopping, viewpoint |

**Status.** `idea` is a suggestion: it is saved to the trip's **Places**. `planned` means the
traveller has decided to do it: it goes on the **Timeline** (under *No date yet* when it has no
date) and, if it is dated and still ahead, gets the app's usual reminders. **Neither means booked
or paid.** There is no `booked`, `confirmed` or `cancelled` in this format; an activity that uses
them is refused, with the reason, rather than having its meaning changed.

**Price.** The expected total for the activity, never a payment: imported activities are never
marked paid. A *planned* activity with a price appears in the trip's Expenses as an **unpaid**
booking cost. Prices per person (adult/child) are not part of version 1: a file that has them gets
only the total imported, and the preview names each per-person field it left out.

## What the app does with a file

**Never read from a file**, whatever it says: ids of any kind, booking or confirmation references,
paid status, who is going, traveller names, files or attachments, timestamps, reminders, settings.
Any field the format does not have is listed in the preview as *Not imported*, with the reason; its
value is not read.

| Problem | Result |
|---|---|
| Not JSON, wrong `format`, `version` not 1 (or newer), no activities, more than 300, larger than 1 MB, nested deeper than 6, a `__proto__` / `constructor` / `prototype` key | The **whole file is refused**, with the reason. Nothing is added |
| A wrong value: a date not on the calendar, `25:00`, an unsupported status or kind, coordinates out of range or one without the other, a negative or three-decimal amount, `eur`, a link that is not http(s), an end before its start, text over its limit, a field of the wrong type | **That activity is invalid** and cannot be ticked; the others still import |
| A type not of its kind, a priority on a planned activity, a date outside the trip's dates, a planned activity without a date, a currency code that is not in ISO 4217 | A **warning**; the activity can still be added |
| A field the format does not have | **Not imported**, listed with the reason |

**Possible duplicates** — of something already in the trip, or of an earlier entry in the same
file — start unticked and say why: the *same title* on the same day (and at the same time, when
both have one) or with no date on either side, at places that do not contradict each other; or the
*same place at the same date and time*, whatever the titles. A similar name, or the same title on
another day, is not a duplicate. Tick one to add it anyway. Nothing is ever merged or overwritten.

**Adding** writes only the ticked activities, all in one go: if anything fails, none of them is
added. Ids are made by the app; nothing already in the trip is changed. Afterwards the app lists
the new activities to review, edit or delete one by one.

## Exporting

**Export activities** writes chosen ideas and plans in this same format, and every exported file
imports again. To-dos and cancelled plans are not offered (the format has no word for them). In
the file: every field above that the activity has. Never in the file: booking references, who is
going, traveller names, documents and photos, paid or not, reminders, other trips, any id. Links:
website and map pages only — wallet passes, tickets and booking confirmations are left out,
because their addresses can carry a personal booking. A plan that was paid arrives elsewhere as
planned and unpaid. An end time that follows the trip's zone is written with that zone's name, so
it means the same in a trip with another zone.

## Versions and compatibility

- `format` never changes. `version` is a whole number.
- **Version 1 is fixed.** No field is added to it and no meaning changes. Anything new — a field,
  a value, a meaning — is **version 2**, with its own schema file.
- The app keeps reading every version it ever read. A file of a version newer than the app is
  refused whole (*made for a newer version of Travel Organizer — update the app*), never partly
  read.
- A field this version does not know is reported and skipped, not fatal — so when an assistant adds
  something extra, everything it wrote correctly still imports, and the person sees what was left
  out.
- The schema is strict (`additionalProperties: false`), so a validator flags extra fields that the
  app would merely skip.
