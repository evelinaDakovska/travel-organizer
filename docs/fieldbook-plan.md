# Fieldbook — plan

Source: the owner's design review, `travel-organizer-design-review.html` (12 October 2026, kept
outside the repo): a fresh review of 0.5.1 (`6415f6b`), the **Fieldbook** redesign and eight
approved product additions.

**How this was run (owner, 2026-10-13):** plan → review → implement → test, step by step, **without
stopping for approval**; open questions are researched and decided on the recommendation; a full
code review and a full QA pass of the whole app at the end; every decision taken is listed in
§5 for the owner to go through afterwards. Status lives in `docs/status.md` (section *FB*), as
always; this file is the plan and the decision record.

**Rules that still hold:** data safety above everything — no step deletes or rewrites existing
data; migrations are additive and rehearsed over **0.5.1** on the emulator from the exact APK on the
phone; the owner's phone is **not touched** in this run. Domain logic stays pure and tested.

---

## 1. Scope

| Part | What | Device | Migration |
|---|---|---|---|
| **A** | The review's seven engineering findings | no | no |
| **B** | The Fieldbook redesign: tokens, primitives, every screen, day tabs, documents | emulator | no |
| **C** | Approved additions: lists, travellers, price per person, itinerary PDF, templates | emulator | **003** |
| — | Passports, in-app feedback | — | deferred, §4 |

---

## 2. Part A — the review's findings

Each step: failing test first, then the fix. All in `src/domain` or `src/hooks` unless said.

**A1 · A zero price is not money owed.** `paymentStatus` returns *To pay* for a confirmed, unpaid
item with `priceAmount = 0`. Owed means `amount > 0`. A free booking gets no payment pill (the
review allows *Free* or nothing; nothing is calmer and matches "no tag on every item"). Totals:
a zero price adds nothing and is not counted as an item to pay — `countsAsSpent` requires a positive
amount, so it is also left out of the Bookings lists. Journeys: a free first leg gives its legs no
inherited state. Tests: explicit zero, null, paid, positive unpaid, cancelled, journey.

**A2 · Amount parsing never changes meaning.** `parseAmount('-12.50')` is 1250 today because every
non-digit is stripped. New rule (`parseAmount` returns `number | undefined | null` →
*empty | invalid*, no longer conflated):
- empty or whitespace → `undefined` (no price);
- digits with **one** decimal separator, `.` or `,`, followed by 1–2 digits → that amount;
- grouping is accepted only when unambiguous: `1,234.50`, `1.234,50`, `1 234,50`, `1'234.50` —
  the last separator is the decimal, every earlier group has exactly 3 digits;
- anything else is **invalid** (`null`): a sign, letters, 3+ decimals, `1.234` / `1,234` alone
  (a thousands group or a typo? refuse rather than guess).

`AmountInput` passes `NaN` for invalid so the form's `z.number()` refuses it with *Enter an amount
like 12.50*, instead of today's silent "no price". Schemas gain `.nonnegative()` for item prices
(expenses already `CHECK (amount > 0)`). Tests include pasted text with spaces and a currency sign
(`€ 12,50` → invalid: we say so rather than strip).

**A3 · A date-only end is the next calendar midnight, not +24 h.** `endInstantOf`: the instant of
the day after the end date at 00:00 in the end's zone (`nextDate` in `time.ts`). The 24-hour
"span, not event" cutoff becomes **one calendar day**: an item is an event when it ends no later
than the same wall-clock time the next day in its start zone (`addDaysLocal`). Tests on real
transition days: Europe/Sofia 2026-03-29 (23 h) and 2026-10-25 (25 h), and the days beside them.

**A4 · Backup says what really happened.** After the share sheet closes the app does not know where
the file went, so the result reads *Archive created — save it somewhere off this phone (Drive,
email to yourself)*. The archive name carries a timestamp, `travel-organizer-2026-10-13-0942.zip`
(domain `archiveFileName(now)`, tested). The export reads every table inside **one read
transaction** so a write cannot land between two tables' reads (verified against expo-sqlite's
API before building). The documented limit: the zip is built in memory — the user guide gains
the size it was tested at.

**A5 · Query states never overclaim.** `queryView`: when the latest read **failed** and the data
held is `null` or empty, that is `failed`, not `missing` / `empty` — the last good read may be old.
Now: while the items read is still loading, the task list shows a small loading line instead of
*Nothing left to do*. Classifier tests plus a hook test over the async lifecycle if the hook changes.

**A6 · A zone filled from the city follows the city.** Provenance without storing anything: a time's
zone counts as **automatic** while it equals the zone the current From/To city implies (that is
how it got there). When the city changes, an automatic zone is replaced by the new city's (or
cleared if the new city keeps the trip's clock); a zone that does not match its city was chosen by
hand and is left alone, with the existing hint showing the difference instead of overriding it.
**Labels:** where a time's zone came from its city, say the city — *07:05 · Munich time* — while
`Europe/Berlin` is what is stored (`cityZoneLabel`).

**A7 · Docs.** `review-plan.md`, `paid-plan.md`, `feedback-plan.md`, `n6-plan.md`: an *Archived —
done* line at the top pointing at `status.md`.

---

## 3. Part B — the Fieldbook redesign

No schema change, no data change. Every step: typecheck, tests, then the emulator in light and
dark, with sample data, at default and large font scale.

**B1 · Tokens.** `palette.ts` gets the Fieldbook ramps: cool neutral, action blue, attention
(burnt orange), success green, danger kept. `roles.ts` maps them (canvas `#F5F7FA` / `#111821`,
surface `#FFFFFF` / `#1B2530`, ink, secondary, action, border, attention), keeping the role
names components already use so screens do not change for colour alone; new roles are added to
`roles.test.ts`. Type: **Caprasimo leaves the UI**; `type.*` becomes Figtree — screen title
28/34 semibold, section 18/24, item 16/22, body 16/22, meta 13/18, key time 32/38 tabular. Radii
10 / 14 / 16 / 6. No shadow on peer rows.

**B2 · Primitives.** `ListRow` (divider rows instead of cards), `LeadPanel` (the one highlighted
event), `HeaderAction` (labelled header buttons), `DateRail` (accessible horizontal day selector),
`Sheet` (bottom sheet used by add and *More*), `CopyValue` (labelled copy — `expo-clipboard`, an
Expo module, needs a native rebuild).

**B3 · Timeline with day tabs.** A rail of **every** trip day (`Day 1 · Fri 20`), plus *Before*
and *After* when anything is dated outside the trip. Default: today during the trip, Day 1 before
it, the last day after; the selection survives data refreshes. A day with nothing shows *Nothing
planned* + *Add a plan* (prefilled to that day). A time column on the left, title and route on the
right, *Open ticket* as a row action, *Optional* on ideas, *To pay* kept. *No date yet* stays,
under its own rail entry. Domain: `timelineDays(trip, items)` — tested across zones and
overnight arrivals.

**B4 · Item detail.** Transport: departure and arrival columns (code or city, local time, zone),
stacked at large font scale. The ticket action names what it opens. Reference with a labelled
*Copy*. Then price, reminder, notes. **Edit** at the top; *Add to itinerary / Cancel / Restore /
Delete* in a labelled **More** sheet, the cancel-before-delete rule (D21) unchanged.

**B5 · Overview (was Now).** Tab label *Overview*; the route stays `index`. Before the trip:
countdown, the first travel commitment as the lead panel, *Get ready* tasks, then the first day's
other travel, then *Stay & transport*. During: today's date and *Day n of m*, happening now as the
lead, then next, then date-only plans, then *Your base* (the stay covering tonight) as a compact
row. Tasks keep *Show done*; completing one offers **Undo**. The floating add button goes: a
labelled **Add** in the header (and add actions inside sections).

**B6 · Trips (Home).** The next or current trip as a destination cover (name, country, dates,
countdown, route from its transport legs — text only, no images); other upcoming trips and past
trips as compact rows. *New trip* in the header. *Backup & restore* as a labelled row under *Your
data* instead of the database icon.

**B7 · Places.** *Saved* / *In itinerary* switch; Saved grouped by priority (Must / Want / Maybe /
no priority); compact rows with category and address; *Open in Maps* stays on detail. A short
empty state.

**B8 · Expenses.** One expected total at the top, per currency; Bookings / Spending switch below it
without changing that total's meaning; Bookings shows *To pay* then *Paid* as compact
right-aligned money rows; the *Refund not specified* note sits next to the total.

**B9 · Notes.** Title, two preview lines, pinned group. (Lists join this tab in C1.)

**B10 · Add / edit.** New item: first a sheet — Travel / Stay / Activity / Food / Task / Other —
then the form with that kind, title first, then date/time/place. Subkind is one optional
picker. Status in words (*In my itinerary* / *Saved idea*; *Cancelled* only on edit). Price,
payment, refund and reminder in folded sections that open by themselves when they hold a value —
nothing populated is ever hidden or dropped. Save stays reachable above the keyboard.

**B11 · Trip documents (N1).** A screen from the header and from Overview: every file and link in
the trip — trip-level and per item, tickets first — each row saying *On this phone*, *Link*, or
*Missing — attach again* (an existence check, not assumed). Opening as today.

---

## 4. Part C — approved additions

One additive **migration 003** for everything in C, so the phone migrates once; **backup format 3**,
with formats 1 and 2 still importing. Nothing existing is rewritten: every new thing is a new table
or a new key inside `details`. Order of work: the schema and the backup first (the part whose
mistakes cost data), each tested in node; then the features one at a time, domain → repository →
screens → emulator.

### 4.1 Migration 003

```sql
travellers        (id, name, sort_order, created_at, updated_at)            -- app level
trip_travellers   (trip_id → trips CASCADE, traveller_id → travellers RESTRICT, sort_order)
item_participants (item_id → trip_items CASCADE, traveller_id → travellers RESTRICT)
lists             (id, trip_id → trips CASCADE | NULL for a reusable list, kind packing|shopping,
                   name, source_list_id, sort_order, created_at, updated_at)
list_items        (id, list_id → lists CASCADE, label, quantity > 0 | NULL, unit, category, note,
                   traveller_id → travellers SET NULL, done_at, sort_order, created_at, updated_at)
templates         (id, name, content JSON, created_at, updated_at)          -- app level
template_uses     (trip_id → trips CASCADE, template_id, applied_at)
```

- **RESTRICT** on a traveller who is in a trip or on an item: a profile cannot be deleted while
  anything uses it; the screen says where it is used. Deleting a trip never deletes a profile.
- `source_list_id` and `template_uses.template_id` are **not** foreign keys: they are provenance
  (which reusable list a copy came from, which template was applied), used only to warn before
  adding the same thing twice. A per-trip backup leaves the reusable list out; a foreign key would
  then refuse the import.
- `done_at` (packed / bought) only ever set on a trip copy's items; a reusable list has no ticks.

### 4.2 Backup format 3

New tables in `backup.json`, all defaulting to `[]` so formats 1 and 2 still parse. Trip-owned
rows (trip_travellers, item_participants, trip lists and their items, template_uses) follow their
trip exactly as items do. App-level rows (travellers, reusable lists and their items, templates)
behave like settings: *Keep mine* inserts only what is missing; *Use the backup's* also updates
rows with the same id (an upsert — never a delete, so RESTRICT cannot bite). Insert order keeps
every foreign key valid at every step: travellers → trips → trip_travellers → items →
participants → notes → expenses → payments → resources → lists → list_items → templates →
template_uses. A per-trip export carries the travellers that trip uses.

### 4.3 C1 · Packing and shopping lists

- **Reusable lists** (app level) under *Lists & templates*, reached from *Your data* on Your trips.
  Presets offered when there are none: *General packing*, *Winter layers*, *Child essentials*,
  *Toiletries to buy*. Each item: label, optional quantity and unit, optional group, optional note.
- **Trip copies**: the Notes tab becomes **Notes & lists** — *Notes · Packing · Shopping*. *Add a
  list* copies a reusable one (new ids, ticks cleared, a warning if that list was copied into the
  trip before) or starts an empty one. Items: add, rename, remove, move up/down, quantity, who it
  is for (a traveller of the trip). Ticking packs or buys; *Packed 8 of 12* counts rows, not
  quantities; ticked rows sink into a folded *Done* group with Undo.
- **Bought is not packed.** A shopping item offers *Add to packing list*, which creates a packing
  item (unticked); nothing happens by itself. Nothing in a list ever becomes an expense.
- *Save as reusable list* from a trip copy creates a new reusable list; overwriting an existing one
  is a separate, confirmed action.
- **Overview** shows *Packing 8 of 12 · Shopping 3 of 5* rows when the trip has lists.

### 4.4 C2 · Travellers and participants

- **Profiles** under *Travellers* (from *Your data*): a name only. Add, rename, delete (refused while
  used, with where).
- **Trip → Travellers**: pick from profiles or add a new one; order kept. The trip form's free-text
  *Travellers* field stays for trips that already have names in it; a trip shows those names until
  each is turned into a profile by an explicit tap (*Use the existing "Evelina"* or *Create a
  profile*). Nothing is ever merged across trips automatically.
- **Item → Who's going** (only when the trip has travellers): tick a subset. None ticked means
  *not specified* — never "everyone" silently. Detail shows *Evelina, Anna* in one line.
- Links are by id, so a renamed profile reads the new name everywhere; prices are not linked to
  profiles (C3), so renaming never changes an amount.

### 4.5 C3 · Price per person

- In *Price & payment*: **Total price** (as today) or **Per person**. Per person shows rate lines —
  label (*Adult*, *Child*, optional), quantity, unit price — with *Add a rate*, and the total
  computed live: *2 × EUR 90.00 + 1 × EUR 60.00 = EUR 240.00*.
- Stored: `details.pricing = { mode: 'perPerson', lines: [{ label, quantity, unitAmount }] }`
  (minor units, Zod-validated), and the computed total in `price_amount` — the one number every
  cost calculation already reads. One domain function computes it; the form never writes a total
  it did not compute. Quantity is a whole number ≥ 1 (a zero line is refused, not dropped); a unit
  price ≥ 0. Switching back to *Total* keeps the total and drops the lines.
- The first line's quantity starts at the number of participants ticked (else the trip's
  travellers); later changes to who is going never change a saved price — the form says *Priced
  for 2, 3 are going* and offers to recount.
- Existing prices stay *Total*; nothing is reinterpreted. A journey's price stays on its first leg.

### 4.6 C4 · Itinerary PDF

- **Trip → Share itinerary as PDF** (Overview header menu): switches for what goes in — notes,
  booking references, traveller names, tasks, packing & shopping lists, costs — names and
  references **off** by default; passports do not exist yet, and nothing private is in it unless
  switched on. *Create PDF* renders on the phone, offline (`expo-print`, the system's Chromium
  print), saves it as `Lapland-itinerary-2026-10-13-0942.pdf` and opens the share sheet.
- Content: cover (destination, dates, travellers if chosen, generated-at), day by day with local
  times and zones (both ends of a journey), stays and transport summary, optional appendices.
  Page numbers; a day or a journey is not split across pages where it fits on one.
- The HTML is built by a pure, tested domain function (`itineraryHtml`) from the same selectors
  the screens use; everything user-typed is escaped. Attachments are named, never linked: a
  recipient cannot open the sender's files.

### 4.7 C5 · Trip templates

- A template is one validated JSON document: tasks (title, notes, day offset from the trip start or
  none, time of day or none), notes (title, body, pinned) and lists (kind, name, items).
- **Save as template** (trip's menu): choose which tasks, notes and lists; bookings, prices,
  references and files are never in it, and the screen says so.
- **Use a template**: on *New trip* (applied right after the trip is created) and from a trip's
  menu, with a preview of what will be added and a warning if this template was applied to this
  trip before. Applying copies with new ids; ticks and *done* reset; a task 2 days before the
  start lands 2 days before the new start, in the new trip's zone; an undated task stays undated.
- Templates live under *Lists & templates*; rename, delete. Deleting a template leaves trips alone.

### 4.8 Not built, with reasons

- **Passports** — needs an encryption-at-rest and key-recovery decision, and a backup decision
  whose failure mode is losing the documents or leaking them. The review itself scopes it
  separately, after profiles. Profiles (C2) are built so documents can hang off them later.
- **In-app feedback** — needs a server endpoint; the app has none by design (CLAUDE.md §7) and the
  review calls it future work.
- **Estimated shopping prices** — optional in the review; left out so lists stay lists.

---

## 5. Decisions taken in this run

Listed for the owner to go through. Each says what was chosen and why.

| # | Decision | Why |
|---|---|---|
| FB-1 | A zero-priced booking shows no payment pill and is not in the cost lists | Owes nothing; fewer pills, as the review asks |
| FB-2 | `1.234` / `1,234` alone are refused, not guessed | Either reading is plausible; a wrong guess is a silent ×1000 |
| FB-3 | A zone is *automatic* while it equals its city's zone — inferred, not stored | No migration; a manual choice is never overridden |
| FB-4 | Now's tab is labelled *Overview*; the route stays | The review's label; no navigation rewrite |
| FB-5 | The floating add button is replaced by a labelled header action | The review: no add control over content |
| FB-6 | One migration (003) for all of Part C | The phone migrates once, as with 002 |
| FB-7 | Passports and in-app feedback deferred | See §4 |
| FB-8 | The Timeline rail has an *All days* stop as well as each day | Reviewing the whole trip before it starts is still one tap; cheap, since it is the old view |
| FB-9 | *Your base tonight*: the confirmed stay checked into on or before today and checked out after it; overlapping stays → the one begun last; undated stays never | The review asked for overlap and undated rules to be decided |
| FB-10 | A new item starts *In my itinerary* (confirmed); only *Save a place* on Places starts an idea | The prototype's form defaults to the itinerary; ideas have their own entry point now. Before: everything but a task started as an idea |
| FB-11 | Travellers are app-level profiles with a name only; a profile used by a trip or item cannot be deleted | The review: no required birth date or passport; RESTRICT means a deletion can never quietly empty a booking's participants |
| FB-12 | Names already typed in a trip's Travellers field stay as they are, until turned into profiles one tap at a time | The review: keep old names readable and never merge across trips automatically |
| FB-13 | Participants link to profiles by id; prices are not linked to profiles | A rename reads everywhere; no amount can change because a profile did |
| FB-14 | Per-person rates live in `details.pricing`; the computed total goes in `price_amount`; a zero-quantity line is refused | No new column; every cost calculation keeps reading one number; nothing is dropped silently |
| FB-15 | Reusable lists and trip copies share one table (`trip_id` NULL = reusable); ticks only on trip copies | Copy is a plain insert; a master can never be "packed" |
| FB-16 | Templates are one validated JSON document each | Always read and applied whole; nothing queries inside one |
| FB-17 | The Notes tab becomes *Notes & lists*, five tabs kept | The review: keep five tabs |
| FB-18 | Itinerary PDF through `expo-print` (on the phone, offline); names and references off by default | The review: explicit choices for anything personal |
| FB-19 | `source_list_id` and `template_uses.template_id` are provenance, not foreign keys | A per-trip backup leaves the reusable list out; a foreign key would refuse the import |
| FB-20 | Changing the phone's text size could restart the app's database connection while the old one held a lock; opening now waits instead of failing | Found on the emulator during B |
| FB-21 | Undo after ticking a task or list item stays for 8 seconds (5 was the first choice) | Reading the toast and reaching for it took longer than 5 s in testing |
| FB-22 | The PDF: notes on by default; tasks only in a *To do* section at the end, never inside the days; documents named, never attached; made in the cache and shared, not kept | Notes are what a printed plan is for; tasks are preparation, not the itinerary; attaching tickets would put the most private files in a document meant to be passed around; a snapshot can be made again |
| FB-23 | *Share as PDF*, *Use a template* and *Save as template* sit with *Edit trip* in the Overview's *More* menu | Occasional actions on the whole trip; the header keeps search and add |
