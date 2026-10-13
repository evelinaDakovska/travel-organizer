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
with formats 1 and 2 still importing. Each feature: domain + tests, SQL in node, screens, emulator.
Detailed design is written here before each step is built.

**C1 · Packing and shopping lists** — reusable lists (app level, *Lists & templates*) and trip
copies (Notes tab becomes *Notes & lists*). Copy = new ids, checks reset. Packed and bought are
distinct. Progress *Packed 8 of 12*. No automatic expenses.

**C2 · Travellers and participants** — app-level traveller profiles (a name, nothing else
required), trip membership, an optional participant subset per item. The existing
`trips.travellers` text stays readable and is never merged across trips automatically.

**C3 · Price per person** — *Total* / *Per person* in the price section; per-person keeps rate
lines (label × quantity × unit price) in `details.pricing`, Zod-validated, with the total
computed by one domain function and written to `price_amount`. Existing prices stay *Total*.

**C4 · Itinerary PDF** — `expo-print` (an Expo module: HTML → PDF on device, offline). A preview
screen with section switches; names and booking references off unless chosen; never passports.
HTML built by a pure domain function from the same selectors the screens use.

**C5 · Trip templates** — *Use a template* when creating a trip, *Save as template* from a trip:
tasks (dates as offsets from the start), notes and lists. Never bookings, prices, references or
files.

**Deferred, with reasons (§5):** passports (needs an encryption and backup decision whose failure
mode is losing the documents) and the in-app feedback form (needs a server; the app has none by
design, and the review itself calls it future work).

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
