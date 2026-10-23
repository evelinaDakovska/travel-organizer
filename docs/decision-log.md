# Decision log

**Why** things were decided. No authoritative detail — for schema, model and conventions see
`docs/technical-reference.md`, which wins on any disagreement.

Each entry records the decision, the alternatives rejected, and the reasoning. Written so a future
session can tell a considered choice from an accident.

---

## D1 — "Place" is a state, not a type

**Decision:** `place` does not exist as a `kind`. Two axes: `kind` (what it is) and `status`
(how committed). The Places tab is `WHERE status = 'idea'`.

**The brief proposed** `place` as a sibling of `transport`/`stay`/`activity`/`food`.

**Why that was wrong:** the brief's own examples contradict it. A recommended café is semantically
**food**; a viewpoint is **activity**; a vintage shop is **other**. What makes them "Places" is not
their category — it is that they are **not yet committed to**. Meanwhile the Duomo Fast Track is an
activity, *is* a place (address, coordinates, opens in Maps), *and* is booked.

The boundary the brief drew is not where the domain's seam is. The seam is commitment.

**Consequences:** resolves the brief's TripItem-vs-Place question and its booking-status question
simultaneously; makes "some activities booked, others merely planned" a one-column difference; and
collapses three planned milestones into one.

---

## D2 — One `trip_items` table, not a separate `places` table

**Decision:** option A from the brief — one table.

**Considered:** a separate `places` table. Genuine arguments for it: different lifecycle, no dates,
different query patterns, no nullable date columns on something that never has dates.

**Why one table won:**

1. **Promotion.** The brief explicitly wants a saved place to later gain a date. One table:
   `UPDATE trip_items SET start_local = …`. Two tables: DELETE + INSERT + re-point every attached
   resource, and the id changes, breaking any notification referencing it. Decisive.
2. **Resources attach to both.** A café recommendation has a website; a booked restaurant has a
   confirmation. Two tables forces a polymorphic FK on `resources` — the exact complexity a split
   was supposed to avoid.
3. **Search and a future trip-map need the union.** Booked activities have coordinates too. Two
   tables means `UNION` forever.

**Explicitly not decided on "fewer tables is tidier."** The brief warned against forcing genuinely
different concepts together for elegance; this is the opposite case — the concepts are the same.

---

## D3 — Status: three values, not five

**Decision:** `idea` | `confirmed` | `cancelled`.

**The brief floated** `idea` / `planned` / `booked` / `cancelled` / `completed`.

**Rejected:**
- `planned` vs `idea` — a distinction that will not be reliably maintained in practice.
- `completed` as a status — derivable for a booking (`end_utc < now`).

**`cancelled` earns its place for one concrete reason:** when something is cancelled you still need
the cancellation confirmation PDF. Deleting the item destroys the evidence. So it is kept, hidden
from Timeline and Now, greyed in lists.

**`completed_at` was later added for tasks only** (see D9), because for a task "done" depends on
the user acting, not on time passing. That is the one place the concept is not derivable.

---

## D4 — Time: wall-clock + IANA zone, derived instant

**Decision:** store `start_local` + `start_tz` + `start_precision`; derive `start_utc` as a sort key.

**Rejected:** storing a UTC instant (the obvious default).

**Why:** a flight departing Sofia at 06:10 (UTC+3) would render as 05:10 once the phone switches to
Italian time on landing. Every zone crossing would make the itinerary lie. The same bug moves a
date-only hotel check-in to the wrong day. For a travel app this is not an edge case — it is the
normal case.

**Why `start_utc` is stored rather than computed on read:** ordering and "what's next" then happen
in SQL instead of by loading every row into JS. It is a denormalised cache, written only by the
repository layer.

**Why `start_precision` is stored rather than inferred from string length:** `T00:00` is a real
time and must stay distinguishable from "date known, time unknown". That is user intent, not a
formatting detail.

**Accepted limitation:** IANA database changes can stale the cached instants. Negligible for trips
booked months ahead; a recompute function fixes it if it ever matters.

---

## D5 — Resources: one table, two behaviours

**Decision:** one `resources` table, `kind ∈ {file, link}`, with a cosmetic `subtype`.

**The brief floated** splitting into `Attachment` / `Link` / `Reference`, and a seven-value type
enum.

**Rejected, because those are not three things:**
- `url`, `wallet`, `maps` are all *a URL with a different icon* — that is presentation, so it
  became `subtype`.
- `email` has no meaning until Gmail import exists. Today an "email" is either a saved PDF (file)
  or a link. **Dropped.**
- `bookingReference` is not an attachment at all — it is a scalar property of the booking, wanted in
  the item header without a join, and its affordance is *copy*, not *open*. **Moved onto the item
  as `confirmation_code`.**

What remains is genuinely two behaviours: an owned blob with a lifecycle, and a string to open.
They share parent, label, ordering, list rendering and delete flow. Splitting them would double
every query for a difference of four nullable columns.

---

## D6 — File paths are relative

**Decision:** store `media/<uuid>.pdf`, join to `Paths.document` at read time.

**Why:** the app sandbox path is **not stable across reinstalls**. The brief correctly warned
against persisting the *external* URI, but the sharper trap is persisting the app's *own* absolute
path — every ticket then silently fails after a reinstall, discovered while abroad.

---

## D7 — Orphaned files are garbage-collected, not deleted inline

**Decision:** a GC sweep on app start deletes media files not referenced by any resource row.

**Rejected:** delete-rows-then-unlink-files in a transaction. SQLite cascades rows but knows
nothing about disk, so the two can diverge if the app dies mid-delete.

**Why GC wins:** crash-safe, ~20 lines, and self-healing regardless of how an orphan arose.

---

## D8 — Items are not confined to the trip's date range

**Decision:** no constraint tying item dates to `trip.start_date`/`end_date`. Now/Next is driven by
items, not trip dates.

**Why:** flight check-in opens 24h before departure and "book the restaurant" is weeks earlier.
Both must surface in Now. Constraining item dates to the trip window would make the feature
impossible.

---

## D9 — `kind = 'task'` plus `completed_at`

**Decision:** tasks are TripItems, not a separate concept.

**Why:** a task is dated, belongs to a trip, appears in Timeline and Now, and fires notifications —
all things `trip_items` already does. The only thing it needs beyond that is a done state that time
cannot derive. One extra `kind` value and one nullable column.

---

## D10 — `subkind`, not `TransportDetails`

**Decision:** one nullable `subkind` column.

**Rejected:** the brief's structured `TransportDetails` type with `mode`, `terminal`, `gate`, `seat`.

**Why:** `subkind` turned out to solve two problems at once — distinguishing café from restaurant,
*and* replacing transport mode entirely (`flight`/`train`/`bus`/`ferry`/`car` are just subkinds).

**`gate` and `terminal` were dropped outright** as stale by design: the gate changes 40 minutes
before boarding, will never be hand-updated, and the attached boarding pass is authoritative.

**On why we cannot auto-update them like Google Wallet does:** Wallet updates because the *airline
pushes* changes into Google's pass API. It is the airline doing the updating, not Wallet reading
anything. With no airline feed that is not reproducible, and scraping airline sites is fragile and
ToS-hostile. So Wallet is the live pass and this app is the index — we store the Wallet link *and*
a link to the airline's manage-booking page.

**`seat` was kept** in `details`: assigned at booking and stable, unlike the gate.

---

## D11 — Notes are their own table

**Decision:** a `trip_notes` table, not a single trip-level text field and not `trip_items`.

**The brief** listed Notes as one of four trip views but described one text field.

**Why a separate table:** the owner wants many titled notes per trip. Notes have no date, status,
priority or location — forcing them into `trip_items` would be exactly the over-abstraction the
brief warned against. Distinct from `trip_items.notes`, which remains a per-item annotation.

---

## D12 — No global state store

**Decision:** SQLite is the source of truth. A ~40-line `useLiveQuery` hook over
`addDatabaseChangeListener` covers re-render-on-change.

**Rejected:** Redux Toolkit, Zustand, TanStack Query.

**Why:** there is no server, so no cache-invalidation problem and nothing for TanStack Query to do.
The only real need is "re-render when the DB changes". Copying rows into a global store is what the
brief explicitly warned against.

---

## D13 — Raw SQL, not an ORM

**Decision:** hand-written migrations and raw SQL with Zod row parsers.

**Considered seriously:** Drizzle ORM — typed queries, real migration tooling, an official
expo-sqlite integration.

**Why raw SQL won:** the brief asked for explicit migrations and no magical schema synchronisation.
`drizzle-kit generate` is exactly the kind of generated-migration flow that was ruled out. The
tradeoff is real and Drizzle remains a reasonable future change if hand-written SQL becomes a drag.

---

## D14 — Search is `LIKE`, not FTS5

**Decision:** `LIKE '%q%'` across title, notes, location and confirmation code.

**Why:** a personal trip has fewer than 100 items. FTS5 is ceremony at that scale. Revisit if it
ever feels slow, which it will not.

---

## D15 — Backup: manual export, Auto Backup as backstop

**Decision:** a `.zip` export/import as the real mechanism; Android Auto Backup enabled but not
relied on. Scheduled at **M6**, before notifications and share-to-app.

**Why this was raised at all:** the brief ruled out cloud, accounts and sync, and never asked for
export. The consequence was that a lost or reset phone would destroy every trip and every imported
ticket with no copy anywhere. That was a gap, not a decision.

**Why Auto Backup is not the plan:** size-capped, only runs on wifi + charging + idle, and only
restores during new-device setup.

**Why M6 rather than late:** the app becomes trip-ready at M5, so backup must exist before the
first real trip depends on it.

---

## D16 — Development build from M1

**Decision:** `expo prebuild` + custom dev client from the first milestone.

**Rejected:** Expo Go until share-to-app at M8.

**Why:** `expo-share-intent` contains native code and cannot run in Expo Go, so a dev client is
needed eventually regardless. Building eight milestones in Expo Go and meeting the native shell at
M8 invites a late pile-up of surprises. Iteration speed is identical once built — only adding
native dependencies requires a rebuild.

---

## D17 — Risk front-loaded in the milestone order

**Decision:** files move from M5 to M3; the two API spikes run in M1; export moves to M6.

**Why:** the highest-uncertainty items are the ones that could force a redesign —
`getContentUriAsync` on the new expo-file-system API, and `date-fns/tz` on Hermes. Both gate core
systems (opening documents, the entire time model). Both are ~20 minutes to check. Discovering
either at M4, with four milestones stacked on top, is the bad outcome.

---

## D18 — Repo, machine and data-flow constraints

**Decision:** developed on the IG-owned Jamf-managed Mac; hosted on personal GitHub with a
repo-local personal git identity; emulator as the default test target.

**Why the Mac:** Claude Code access is tied to it, and assistance throughout is a premise of the
project. The personal machine is Windows with no subscription.

**IP-ownership implications were raised and explicitly accepted by the owner. Not to be revisited.**

**What still applies, independent of that judgement:**
- The laptop can be wiped remotely and is reclaimed on offboarding, so personal GitHub is the only
  off-device copy.
- Phone→laptop data flow is minimised: emulator by default, never `adb pull` personal files,
  revoke USB debugging authorisations after physical-device sessions.
- **Real travel use runs a release build.** A debuggable build lets an authorised computer read the
  app's private sandbox — the database and every imported PDF — via `adb shell run-as`. A release
  build does not. This is the single most effective mitigation.

---

## D19 — The Organic design, with colour behind semantic roles

**Decision:** adopt the Claude Design handoff in `docs/design/` — the Organic system with a canal-teal
and stone-gold accent, Caprasimo headings over Figtree, pill controls and ~32px cards. Colour lives
in three layers: `src/ui/theme/palette.ts` (raw ramps, the only hex values), `roles.ts` (semantic
roles per scheme) and `useColors()`. Components ask for a role, never a hex or a ramp step.

**Why:** the owner asked that changing the palette be easy. With a role layer a re-theme edits one
file, and `roles.test.ts` checks every role's contrast, so a new palette that makes text unreadable
fails a test instead of shipping.

**Where the implementation departs from the handoff, deliberately:**
- A **dark scheme** is derived from the same ramps; the design is light only and the app follows
  the system setting.
- **Muted text** uses neutral-700, not the design's text-at-55%: that measures 3.6:1 on cream, below
  the 4.5:1 body text needs, and muted text carries dates and places.
- **Icons** are Lucide through `react-native-svg`, behind a map of semantic names in `Icon.tsx`, so
  changing the icon set is one file.
- **Fonts** load at start-up from `@expo-google-fonts`, bundled with the app, so they need no network.

---

## D20 — Four trip tabs; no Bookings tab

**Decision:** a trip is **Now · Timeline · Places · Notes** as bottom tabs with a floating add button.
Search is a header action. Trip info and Trip documents sit at the bottom of Now.

**Rejected:** the planned Bookings tab.

**Why:** the Timeline already shows every confirmed, dated item; Bookings repeated it grouped by kind.
Four tabs reach comfortably one-handed on a tall phone. `SELECT_BOOKINGS` stays, tested, with no
screen using it yet.

*Amended by D25 (2026-10-11): a fifth tab, **Expenses**, between Places and Notes.*

---

## D21 — A confirmed item is cancelled before it can be deleted

**Decision:** Delete is offered for ideas and cancelled items. A confirmed item offers Cancel instead.

**Why:** a booked item holds the tickets, and those files may be the only copies. One mis-tap should
not destroy them. Cancelling first keeps the documents (D3) and makes a deletion deliberate. The
cost is two steps to remove a confirmed item entered by mistake.

---

## D22 — Where the handoff disagreed with the model, the model won

**Decision:** the handoff is followed for look and structure, not where it contradicts earlier
decisions. The owner confirmed each of these:
- **Cancelled items stay off the Timeline and Now** (D3). The prototype showed them dimmed in place.
- **A dated idea stays on its day**, tagged Idea. The prototype left all ideas off the Timeline.
- **The item form keeps `MomentField`.** The prototype's trip-day select and free-text time cannot
  express a time zone, a date-only moment or a day outside the trip (D4, D8).
- **Up-next cards keep the Open-ticket control.** The prototype omitted it, and finding the ticket in
  seconds is the scenario the app exists for.

---

## D23 — Reminders by kind, reconciled rather than tracked

**Decision:** the default lead time depends on the kind of item: 3 hours before travel, the morning
of a check-in, 1 hour before an activity or meal, and a task at its own time. Each item can switch
its reminder off, but there is no custom time per item. Android's scheduled set is reconciled
against the database, rather than scheduled from every place that writes an item. The app holds
`USE_EXACT_ALARM`.

**Why:** a single lead time fits a coffee and a flight equally badly. One on/off switch covers the
real need (“don't remind me about this one”) without a new column. A time per item can come later
from `details` with no migration. Items are written from six places and change indirectly too,
through a trip zone change or an import. Reconciling from one listener makes a missed call site
impossible. Inexact alarms can arrive very late for reminders scheduled days ahead. `USE_EXACT_ALARM`
fixes that, and the Play policy that restricts it doesn't apply to a sideloaded app.

**Rejected:** a single default lead time in settings (open question 4, option 2); a custom time per
item; asking for the notification permission at launch.

---

## D24 — Sideloaded, signed with a private key

**Decision:** the app is installed as a release APK signed with a keystore that is generated on the
build machine and kept outside the repo. It is not published on any store. `plugins/withReleaseSigning.js`
wires the key into the regenerated `android/` project and falls back to the debug key when it is absent.

**Why:** the generated project signs release builds with React Native's debug key. That key is
public, so anyone could sign an APK that Android would accept as an update to this app, and the
update would inherit the database and every stored PDF. A private key closes that. A store listing
would add review, a developer account and policy constraints (see `USE_EXACT_ALARM`, D23) for an app
with one user.

**Cost:** the keystore must be backed up. Losing it means the next version can only be installed by
uninstalling, which deletes the data unless a backup was exported first.

---

## D25 — Expenses (N5): a tab, its own table, one migration for all of N5

Specified with the owner on 2026-10-11 (`docs/expenses-spec.md`), after looking at Splitwise,
Tricount and Splid. N5a (no splitting) was built first, at the owner's request before their trip.
It was built without a plan agreed beforehand; `docs/n5-plan.md` is that plan written afterwards
and audited. Decisions 1–6 below were put to the owner and answered the same day.

**Decision — a fifth tab.** *Expenses*, with **Spending · Bookings** inside it (and *Settle up*
with N5b), switched by tapping, not swiping. Amends D20. **Rejected:** a card on Now that opens a
page (U9, 0.2.1, never installed). Expenses are looked at often during a trip and deserve a
place of their own. **Decision 5:** the card on Now was removed again. *Owner: yes.*

**Decision — spending is its own table, not a TripItem.** An expense has no time, place, status
or reminder. In `trip_items` it would need filtering out of every timeline, Now, Places and search
query. **Booking costs stay on the items** (U6) and are derived, so a price is never entered twice.

**Decision 1 — N5b's columns ship in migration 002.** `paid_by`, `split` and `payments` are created
now, unused. **Rejected:** adding them in a migration 003. **Why:** every migration is a moment of
risk on the phone; one additive migration for the whole feature halves it. Unused columns cost
nothing. *Owner: yes.*

**Decision 2 — receipts are resources.** A receipt is a `resources` row carrying the expense's
`trip_id` and an `expense_id`. **Rejected:** a `receipts` table, or making `trip_id` nullable for a
third owner. The first duplicates the whole file lifecycle (import, open, sweep, backup); the
second needs a table rebuild, the riskiest migration there is. **Cost:** every query reading
resources by trip must decide about receipts (technical reference §3). *Owner: yes.*

**Decision 3 — a migration and its `user_version` commit together.** Found while writing 002: the
version was written after the migration, so a kill in between would re-run it and fail on
`CREATE TABLE` at every start. *Owner: keep it.*

**Decision 4 — receipts on a new expense are copied in at once, and deleted at once if
abandoned.** **Rejected:** copying only on Save (slower Save, a source URI that may no longer be
readable, a partial-failure path). As built first, abandoned copies waited for the start-up
sweep. *Owner: change it* — they now go at once, and the sweep is only the fallback.

**Decision 6 — screen choices made while building.** A trip total card above the views; an
expense without a label is titled by its category; deleting an expense says how many receipts go
with it; a receipt does not offer *Also attach to an item*. *Owner: yes.*

**Decision — currencies are settled separately, never converted** (from the spec). No exchange
rates, which would need the internet and go stale. Every total is a list per currency.

**Decision — unequal splits are an amount per person only** (N5b, from the spec). **Rejected:**
shares and percentages. The owner's own trips are family and do not split; one simple model is
enough.

**Decision — bookings take part in the split** (N5b, from the spec). A hotel paid by one person is
the biggest thing to settle; leaving it out would make the split wrong.

---

## D26 — A journey's zone is filled from its city, with a line saying so

Found in the owner's real data (2026-10-11): no item had a zone of its own, so four flight times in
Munich and Frankfurt were read in Helsinki time, an hour out, with nothing on screen to show it.

**Decision:** when a leg's From or To is a city the zone search knows, and its clock differs from
the trip's, the form **fills** that time's zone and says so under it (*Munich is on a different
clock, so this time is in Berlin time.* · *Use Helsinki time*). The zone control became a visible
chip. A flight saved without zones is **flagged** on its detail page with a one-tap fix. Opening it
in Edit shows the fill; nothing is written until Save. Undo pins the trip's zone so the hint stays
gone. Transport only. The owner chose the fill and the one-tap hint together, and the flag.

**Rejected:** a hint that only asks (one more tap on every leg, and easy to skip); flagging only,
with no fill (fixes the past, not the future); guessing from stays' and activities' free-text
places (too unreliable to read a city from); fuzzy city matching. A wrong guess would look
deliberate, which is worse than the original problem.

**Not automatic booking parsing** (CLAUDE.md §7): it reads only text the user typed into a field
labelled From or To, and shows what it did.

---

## D27 — After the review: what Now shows, partial shares, unknown refunds

An independent review (2026-10-11) found that Now drops an event the moment it starts and a
date-only plan at midnight, that a share could be saved in part with no clear message, and that a
cancellation with refundability not set silently counts as zero. The plan is
`docs/review-plan.md`; these are the owner's answers to its decisions.

**Now has sections, not one list.** *Happening now*, *Today, no fixed time*, *Maybe today*, then
*Up next* — one pure `nowSections`, with `upNext` left as it was. The scenario is "slightly late
and need the ticket": a list of only what is still to come hides exactly the thing you are late
for.

- *Happening now* holds confirmed, timed items that are not tasks or stays. **15 minutes after an
  event's end** it still shows, read as *Ended 11:15*: the address of where you just were is
  still wanted. With **no end, 60 minutes** after the start — long enough for arriving late, short
  enough not to linger. An overnight journey is happening from departure to arrival and its
  *Arrives* entry is not repeated. **Stays are excluded**: a hotel card for five days would push
  everything else down, and during a stay its *Check out* is already in Up next.
- "Today" for a date-only item is **the date in the item's own zone**. A technical midnight sort
  key must not decide what is visible. Confirmed plans and **dated ideas** both show, in separate
  groups, so a maybe never reads as a plan. Tasks stay in *Open tasks*.

**A share keeps what worked** (the review's option B, chosen over all-or-nothing). A file that
copied in is not thrown away because another failed; instead the app says, explicitly and
before anything else, how many were saved, which were not, and to share again into the existing
item — so a retry adds to it rather than creating a second one. If nothing copied, nothing is
written. The item and its rows are still written in one transaction.

**Unknown refunds stay out of the total, but are shown.** Totals mean the expected cost of the
trip, and U6's rule is kept; what changes is that a cancellation with refundability not set is
named as *not counted* instead of disappearing.

**N6 kept as built (D26).** The review asked not to infer zones silently; the owner judged the
fill visible enough — it says so under the time, undoes in one tap, and writes only on Save.

**Rejected:** changing `upNext` itself (Up next keeps meaning "still to come"); a refund
lifecycle; a stored "primary attachment" (R6 uses `subtype='ticket'`, no migration).

---

## D28 — After showing the app: icons, a + that says what, the trip on top

A senior frontend developer saw the app on 2026-10-11 (plan: `docs/feedback-plan.md`).

**Kinds are told apart by icon, not colour.** One icon per item — the subkind's (a plane, a train,
a museum) or the kind's — in the same soft accent tile on every card. A colour per kind would be a
rainbow of ten on one screen, would have to be learned, and fails WCAG 1.4.1 on its own. The map
is typed against every kind and subkind, so none can be missing.

**The + shows what it adds**: a receipt on Expenses, a notebook on Notes (which now adds a note,
not a trip item), each with a small + so it still reads as "add". The duplicate *New note* button
went: one primary action per screen.

**The trip stays on top of Now** in a band outside the list — destination, dates, *Day 2 of 5*,
the zone, who is going — at the owner's request, knowing it pushes *Happening now* down by two
lines. Done tasks are behind *Show done*, folded by default.

**Empty is not shown** on detail pages: no *When* without a date, no help box in an empty *Tickets
& links* (its add buttons stay — they are how you attach). *Reminder: Off* stays: it is a choice.

**An expense has a detail page**, with Edit at the top and **Delete on the detail page**, as on an
item — on the form, deleting would have gone back to a page whose expense was gone.

**Picture attachments show themselves** in the list's circle, decoded at that size.

**Rejected:** a coloured border or colour per kind; an extended + with a text label (wider than
the tab bar leaves room for, and the icon plus the screen reader label say it); hiding *Reminder:
Off*.


## D29 — Paid or not, at a glance (F7)

The owner's idea, 2026-10-12 (plan: `docs/paid-plan.md`): tell what is paid from Now and the
Timeline without opening anything. `is_paid` existed since migration 001; this is display only.

**A second pill beside the status, on confirmed items only.** *To pay* (danger tone, a wallet)
when there is a price and it is not paid; *Paid* (neutral, a tick) when marked paid, with or
without a price. Nothing when neither is known — every free item has `is_paid = 0`, so "not
paid" cannot mean "owed". Ideas (a price is a budget) and cancellations (a refund question) never
show one. Text, icon and colour, so colour is never the only cue (WCAG 1.4.1, as D28).

**The exception is the loud one.** Most bookings on a trip are paid; the one to act on — pay at
the desk, pay the guide — is red. *Paid* is quiet grey.

**A journey's legs share the first leg's state** (U7 puts price and *Paid* there only), on the
screens that hold the trip's items: Now, Timeline, item detail. If legs disagree, *To pay* wins.
Display only — the totals still count `countsAsSpent`, untouched.

**The time is never cut for it:** the card's top row wraps instead.

**Rejected:** the amount inside the pill (too wide beside the time; it is on the item and in
Expenses); a *show only to pay* filter (Expenses → Bookings is that list); a coloured card border
(colour alone, and a second visual language next to the pills).

## D30 — The Fieldbook review (0.6.0): fixes first, a calmer design, additions in one migration

The owner's design review of 0.5.1, 2026-10-13 (plan and every decision: `docs/fieldbook-plan.md`,
FB-1…FB-23). Run end to end at the owner's request, with the decisions listed for them to go
through afterwards rather than asked one by one.

**Correctness before looks (A1–A7).** Several findings were the app saying something untrue — a
free booking listed as owed, an amount read as a different number, a failed read shown as *missing*,
an export that could mix two moments. These shipped first, each with a test that fails on the old
code.

**One visual language, one face (B).** Caprasimo and the warm Organic palette gave way to Fieldbook:
cool neutrals, one action blue, attention and success roles, Figtree only. The contrast test
(`roles.test.ts`) still guards every text role. The model did not change; the screens did.

**Everything new in one additive migration (C).** Travellers, lists and templates are seven new
tables in migration 003, and a price per person lives in `details` with its total in the column the
cost code already reads, so the phone migrates once and no existing row is touched (FB-6, FB-14).
Anything that names a person or a booking reference stays out of a shared PDF unless switched on
(FB-18).

**Deferred:** passports (they need encryption at rest, which this app does not have), in-app
feedback, and estimated prices on shopping items.

## D31 — 0.7.x: directions, adult/child travellers, and a friends-only beta

Built 2026-10-13 → 10-16 after 0.6.0, mostly from the owner's own use on the phone. Detail in
`docs/status.md` (section *0.7.x*) and `docs/product-status.md`.

**Directions hand off to Google Maps (0.7.0, `docs/directions-plan.md`).** An A → B link
(`https://www.google.com/maps/dir/?api=1…`) built by a pure function, from the Timeline's
connector rows, item detail and Overview. No API key, no location permission, no embedded map:
Google Maps resolves *current location* itself. The rejected alternative — an embedded map — costs
bundle size, a key and offline tiles, for little a trip needs (still true; a full-day map is now
roadmap Phase 5, D32).

**Adult / child is a classification, not an age (migrations 004, 005; backup formats 4 and 5).**
A profile has a default (`adult`, `child`, `unspecified`), copied into the trip and overridable
there, because the same child can travel on an adult ticket. No birth dates are stored. A typed
name from an older trip, once converted to a profile, is remembered on the trip
(`trips.converted_travellers`) so it never reappears as unconverted, even after the profile is
renamed. Both migrations are additive columns with defaults; no existing row changes meaning.

**A friends-only beta (0.7.3).** The app is now also sideloaded onto friends' phones. It stays
local-first: each tester's data lives only on their phone. The signing key, application id and
data-safety rules are unchanged.

**One small backend, switched off.** The in-app feedback form posts to a Cloudflare Worker
(`server/feedback-worker/`) that emails the owner through Resend — the one exception to "no
backend" (CLAUDE.md §7). It sends the message, an optional name, the app build and the Android
version; never trip data. It is **off** (`FEATURE_FEEDBACK_ENABLED`, read from
`EXPO_PUBLIC_FEATURE_FEEDBACK_ENABLED` at build time) until the worker and its key are deployed;
every entry point hides and `/feedback` redirects to Home.

## D32 — The roadmap after the beta (2026-10-19)

After friends tested 0.7.3 on a second, smaller phone, the owner set eight phases
(`docs/roadmap.md`), done in order and each only when asked for.

**What it reverses, on purpose:**
- *Currencies are never converted* (U6, D25) → Phase 4 converts to a trip's reporting currency,
  keeping the original amount, currency and the rate used — so nothing recorded is lost.
- *No embedded maps* → Phase 5, a full-day map.
- *No Google Calendar* → Phase 8, an `.ics` file; still no Google sign-in.
- *Trip dates are mandatory* (CLAUDE.md §4) → Phase 6, trips without dates; a migration, agreed
  before it is written.
- *No AI features* is **kept for the app**: Phase 2 imports a JSON file an AI assistant wrote,
  validated and previewed like any untrusted input. The app calls no AI service.

**What it settles:** N5b (splitting) is replaced by Phase 3, which adds who is financially
responsible for a child and keeps participation, responsibility and payment apart. Gmail
integration stays out; a universal email import (forwarding, `.eml`) is future work.

## D33 — "Me" and several people per list item (2B-0, 0.8.0)

The beta showed two gaps: the person using the app was often not one of the trip's travellers, so
they could not put a shopping item "for" themselves; and an item could be for one person only.

**Me is a mark on a profile, not a second kind of person.** One `settings` key,
`me_traveller_id`, names an existing traveller profile. Rejected: a `travellers.is_me` column
(a migration, and "only one" would need a partial unique index), and a separate "user" table (a
parallel traveller system, and an early guess at accounts). A setting holds one value by
construction, is restored with a full backup, and is *not* part of a future single-trip archive,
so an imported trip can never make someone else "Me". It is deliberately not an account id or a
trip owner: those arrive with accounts and shared trips, and will be separate (CLAUDE.md §4).

**Linking, not inserting.** The user may already be a profile under their own name, so Me is
chosen from the existing profiles first, created only if absent. Existing trips are offered, never
changed: a confirmed step adds Me as a trip **member** only — booking participants, prices,
expenses, payments, documents and lists stay as they are. New trips start with Me ticked. The Me
profile cannot be deleted until another is chosen.

**Recipients in their own table (migration 006).** `list_item_recipients(list_item_id,
traveller_id)`, both CASCADE, primary key on the pair — normalised, referentially checked, no
duplicates. Rejected: a JSON array in `list_items` (no foreign keys, so a deleted profile would
leave dangling ids) and reusing `traveller_id` (one person). The migration copies every existing
`traveller_id` into the table and leaves the column untouched (legacy, unread), so nothing saved is
lost and a restore of an old backup does the same copy (`upgradeDocument`). Backup format 6.

**Same meaning on every list.** Packing and shopping, trip and reusable lists all mean "for whom".
A reusable list names saved profiles (never trip-specific rows); copying a list, *Save as reusable*
and *Add to packing list* carry the people with the item. *Everyone* is a display summary only —
every current trip traveller chosen — and is never stored: someone joining the trip later is not
added to old items. Recipients never change a quantity or a price.

## D34 — Single-trip export/import (2B, 0.9.0)

Plan: `docs/phase2-plan.md` (2A), answered by the 2B brief; as built: technical reference §17.

**A trip archive is not a backup.** Its own document names (`manifest.json` + `trip.json`, never
`backup.json`) and `kind`, so each importer refuses the other's file with a message saying where
it goes. Import only ever **adds a new trip**: every id is new, every file gets a new name, nothing
on the phone is updated, merged or overwritten. The full backup and restore are unchanged.

**Same rows, new layout.** `trip.json` carries the backup's raw row shapes (row format 6) through the
backup's own Zod schemas, so there is one definition of every table; the manifest carries what must
be checked before believing them — format and schema versions, the source trip, every file with
size and SHA-256, and whether the archive is partial.

**Untrusted input, checked in order.** The zip's directory (names, repeats, count, declared sizes)
before anything is inflated — fflate then never inflates past a declared size, so a zip bomb is
refused unexpanded; the manifest before the data; the data's checksum before its rows; every
reference inside the archive before any write. A file that arrives damaged does not refuse the
whole trip, but the import asks before going on without it.

**Travellers are mapped, never merged.** New profiles by default; a profile here is linked only by
an explicit choice, with same-name profiles offered (and told apart by their trips), never assumed.
Me is never carried and never changed.

**Atomic where it can be, compensated where it cannot.** Files first under new names, each read back
and hashed; then every row in one transaction; on any failure the transaction rolls back and the
written files are deleted; a kill between the two leaves only unreferenced files, which the launch
sweep removes (verified on the emulator, D34 E2E log). After the commit, rows and files are checked
against the plan and a shortfall is reported, never repaired by deleting.

**Provenance without a migration.** `settings.trip_imports` records `{exportId, sourceTripId,
tripId}` per import, so a repeat is recognised by the export, by the trip, or by the original being
on the phone — never by name. Importing again makes another independent copy after a warning.
`templateUses` keep their template id (provenance, as in the full backup); `source_list_id` and the
legacy `list_items.traveller_id` are cleared. Instants are rebuilt from the trip's zone without
touching `updated_at`.

## D35 — AI activity import and selective export (2C, 0.10.0)

Plan, decisions and refinements: `docs/phase2c-plan.md` §9–§10 (approved 2026-10-19); as built:
technical reference §18; public format: `docs/ai-activities-format.md`.

**A public format, not a database dump.** An assistant must be able to write it from one page, so
it names activities, never tables, ids or files, and is versioned on its own (`format` +
`version`). Version 1 is frozen; anything new is version 2. The app keeps reading old versions and
refuses newer ones whole — never a half-understood file.

**The form's rules, not new ones.** Every activity becomes the same `TripItemInput` a form produces
and passes the same `tripItemInputSchema`, so an import cannot create an item the app could not
have created by hand. Unknown fields are reported and skipped (an assistant adding something extra
should not lose the rest); structure and security problems refuse the whole file.

**Statuses mean what the app means.** *idea* and *planned* (= confirmed, *In my itinerary*); no
default is ever stronger than *idea*. *booked*, *confirmed* and *cancelled* make an activity
invalid with a reason rather than being mapped to something they did not say. Imported items are
never paid, have no booking reference and no participants; a planned price shows as an unpaid
booking cost and the preview says so (owner's refinement).

**Duplicates are suggested, never decided.** Title alone is not enough unless neither side has a
date; a different day, a different time, or clearly different places mean a different plan; the
same place at the same time is a duplicate whatever the titles. Duplicates start unticked, say why,
and can be ticked. Nothing is merged or overwritten.

**No Undo; a review list instead** (owner's refinement). Deleting a batch would be the one
destructive step in an add-only feature; the done screen lists the new items, each opened and
edited or deleted on its own screen.

**Export writes only what the format can say.** To-dos and cancelled plans are not offered (they
would arrive as live plans); wallet, ticket and confirmation links never leave (their addresses can
carry a booking); every exported activity is re-read by the importer, so every file re-imports.

**Live queries wait for a pause** (found in E2E). One change event per row made every mounted query
re-read and re-render during a batch write, which slowed the batch itself to 43 s for 300 rows —
minutes with more screens open. `useLiveQuery` now waits for 50 ms of quiet (at most 10 s) and
queues one read at most; every change is still followed by a read. Rejected: suspending listeners
during an import (a global switch every batch writer would have to remember), and virtualising the
preview alone (it did not touch the cause).

## D36 — Plan with AI: the planning context (2D, 0.11.0)

Plan, decisions and the owner's refinements: `docs/phase2d-plan.md` §10–§11; as built: technical
reference §19.

**Text for people and assistants, not a format.** 2A sketched JSON, but nothing parses the context
back: an assistant reads it, and so does the person in the preview. Markdown is read well by both.
The importable direction stays 2C's JSON; the context ends with a compact description of it so a
reply can go straight into Import activities — the full schema stays on that screen.

**An allowlist at the source.** One mapper copies the planning fields of an item; the repository
reads only the trip, its items and its travellers' classifications (the SQL does not even select
names). Notes, files, links, expenses, lists and Me are never read, so no later code can leak
them. Rejected: serialising rows and deleting fields — one forgotten field and it leaks.

**Titles are needed and are free text, so: scrub, show, and say so.** Booking references stored in
the trip, emails, links, phone-like and long digit runs are taken out of titles and place names —
best effort, tuned not to damage dates, times, road or flight numbers. The screen says above the
exact preview that titles may contain personal information (owner's refinement); Copy and Share use
exactly the previewed string. The person's own typed request is theirs and goes in verbatim.

**Optional means off, and once.** Where we stay and who is travelling are off by default. A stay
is the overnight base, so with the switch on it is listed once as the nights it covers — never in
the daily itinerary, never with an address (owner's refinement). Travellers are counts by the trip's
own adult/child classification, never names.

**Read-only by construction.** Nothing is written — not even the choices — and nothing is sent:
the person copies or shares.

## D37 — Phase 3 stages, and 3B: who is going (0.12.0)

Audit, the owner's decisions and the 3B design: `docs/phase3-plan.md` (§15 decisions, §16 3B as
built, §17 linking money to bookings, for 3D-1); technical reference §20.

**Five stages, each on its own.** Participation (3B) and pricing by audience (3C) need no
migration; money records (3D-1) bring the one additive migration 007; splits and responsibility
(3D-2) and balances (3E) build on it. Splitting the money work keeps each stage reviewable and
leaves the migration in one place. Each stage ships, is verified, and the next waits for approval.

**Everyone ticked on a new plan, nobody added to old ones.** The owner's ask: a new plan or saved
place made by hand starts with every current trip member ticked — in practice the family goes
together, and unticking is one tap. A to-do starts with nobody (people do not *go* to a to-do).
Joining a trip never touches existing items: the *Also add … to* list offers them all **unticked**,
because silently adding a newcomer to past bookings would rewrite history, and once money depends on
participation it would move money too. Rejected: one *add to all upcoming* switch (one tap rewrites
many rows the person did not look at).

**Only the item form changes.** AI import (2C), items made from something shared in, and to-do
templates keep *not specified*: 3B must not change 2C, and those paths have no *Who's going* to
review. Making them consistent is recorded as a future product decision.

**Edit keeps what was saved.** The form starts from the saved set (filtered to current members);
the new-item default never applies to an edit, and a member who joined later is not added.

**Removal unchanged for now.** Leaving a trip still removes that person's participation in it, as
the confirmation says; re-adding restores nothing and offers the items again. Once money records
exist (3D), removing someone who has them is refused and resolved by a safe flow, never by deleting
history or moving it silently (owner, §15 *9*).

## D38 — Answers on the roadmap cross-check: beta phone, status words, 3C scope, 3D-1 links

The owner's answers to `docs/MASTER_ROADMAP.md` §21 (2026-10-20). Detail: master §1.1, §3.1, §6.2,
§7.3, §16.2, §17; `docs/phase3-plan.md` §18 (decisions) and §19 (3C schema check).

**A secondary phone, but only in an approved session.** Emulators stay the default. A separate
secondary Android phone may be used for controlled beta testing before the feature phases end, so
real-device problems surface earlier than the end of the roadmap. Each session needs the owner's
explicit approval, and the primary phone, real backups and production data stay out of it. The
answer allows *planning* such testing, not installing anything.

**Five status words, so "not now" stops reading as "never".** CLAUDE.md §7's "explicitly not
building" list and the backlog both treated AI, Gmail, accounts and weather as unapproved, but one
read as permanent and the other as maybe. Implemented / Approved/planned / Deferred / Discovery /
Explicitly excluded separates *not in scope now* from *not part of the product*, and only the
current phase is ever authorised. Future possibilities are kept as Deferred or Discovery rather than
deleted to make the documents agree.

**Whole quantities only.** "Partial quantities" meant groups only partly attending or partly priced,
which separate lines with whole quantities already express. Fractional people would weaken every
count that reads `quantity` and would need a schema change for no gain.

**3C scope confirmed, with the totals kept authoritative.** *Price for who's going* is a suggestion
the person invokes, never a recalculation triggered by editing who is going: a price is a fact
about what was booked, and history must not move because a list of names did. Free lines, extras,
Adult/Child/Anyone and an *Estimate* label on ideas were confirmed; the schema check (phase3-plan
§19) found they fit in `details` JSON with no migration.

**A booking with money attached is not deleted, and money is not converted.** Cascading a deletion
to payments would erase financial history; silently turning a booking payment into a standalone
expense would change what it means. So deletion is blocked with an explanation, and an explicit
resolution workflow (unlink, or archive/cancel keeping the links) is designed and approved before
3D-1. This rejects the §17 proposal that linked expenses become unlinked spending. A linked payment
must be in the booking's currency until Phase 4: adding or converting across currencies needs a
rate, and inventing one would make a total lie.

**Feedback before the friends beta, not inside 3C.** The form is useful only once friends test, and
deploying it means real infrastructure and a mail key, so it becomes its own pre-beta task with a
security checklist and a real delivery test the owner approves.

## D39 — 3C: who a price is for, group prices, extras (0.13.0)

Plan and as-built record: `docs/phase3c-plan.md`; the owner's answers P-1…P-4 there.

**Flags on the line, not a new type field.** A line with no `for`, `group` or `extra` is exactly a
line from before 3C, so no old breakdown needs converting and none changes meaning. `extra: true`
was the owner's choice; `group: true` mirrors it, with quantity fixed at 1 so a group price can
never be mistaken for people. Labels stay free text and are never read for meaning: a legacy line
called *Adult* is not set until someone says it is.

**`mode` keeps its old literal.** Renaming `'perPerson'` would have made every saved breakdown
invalid to the older schema and forced a conversion. It now simply means "a breakdown".

**The suggestion refuses to guess.** *Price for who's going* maps adults, children and people not
specified onto rates by audience, never treats someone unspecified as an adult, leaves group prices
and extras alone, and gives up with a reason rather than choosing between two rates for the same
people. It writes nothing until **Apply**, and the item's Save is a second step.

**No Apply on a paid booking.** `is_paid` says *paid*, not *how much*. Applying a new total to a
paid booking would silently change what the app reports as paid, so the calculation is shown but
not applied; a hand edit of a paid booking's price warns instead. Payment amounts arrive with 3D-1.

**Backup format 7 without a migration.** The rows are unchanged, but 0.12.0 would accept the new
keys in a format-6 file and drop them on its next edit. Raising the format makes an older app refuse
instead (verified on the emulator, both for a full backup and a trip ZIP). The format for 3D-1 is
decided with its own changes.

## D40 — 3D-1: money records linked to bookings (0.14.0, migration 007)

Plan, the owner's answers and the as-built record: `docs/phase3d1-plan.md`.

**Three records, one cost.** A standalone expense is spending; a payment against a booking and an
expense linked to a booking are both *paid towards* that booking and never spending. The booking's
price is its only cost. Two ways to record paying for a booking exist because an expense already
logged (perhaps with its receipt) must stop being counted twice without being deleted or converted.

**NO ACTION, not CASCADE or RESTRICT.** CASCADE would delete money history with a booking (rejected,
L-1). RESTRICT is checked during a trip's cascade, so a whole-trip deletion would succeed or fail
depending on SQLite's internal order. NO ACTION is checked at the end of the statement: a booking
alone cannot be deleted, a trip and everything in it can. The repositories refuse first, with the
reason; the constraint is the last word.

**The *Paid* switch wins** (owner, 2026-10-21). `is_paid` keeps meaning *fully paid*; records describe
the known part and the rest reads *not recorded by whom*. Letting records win would turn a booking
marked *Paid* back into *To pay* the moment a deposit was recorded. Nothing ever writes `is_paid`
except the person's switch.

**Whole-trip deletion allowed, named** (owner, 2026-10-21). Expenses already went with a trip; blocking
it would make a finished trip undeletable without removing every record by hand.

**No archive state.** *Cancelled* already keeps a booking and its records; the resolution workflow is
cancel instead, unlink an expense, or delete a payment — each explicit.

**Only 3D-1's schema in 007.** Shares, settlements and the responsible adult get their own migration
when designed; the drafted `cost_shares` had the same cascade problem, and no schema ships unapproved.

**Built on a branch.** The owner approved the migration only without risk to the real data. Building on
the emulator cannot touch the phone, but installing cannot be risk-free (a failed migration would
leave the data intact and the app unopenable until a fix; no rollback without an uninstall). So 3D-1
is on `phase-3d1`, `main` stays releasable at 0.13.0, and the phone install waits until after the trip.

## D41 — 3D-2: who a cost is for, and who covers a child (0.15.0, migration 008)

Plan, the owner's answers and the as-built record: `docs/phase3d2-plan.md`.

**Two modes, told apart by the rows.** Equally (`amount` NULL: computed from the current cost, largest
remainder by the split's order) and by amounts (must add up when saved, never rescaled). No stored
mode that could disagree with the rows; weights deferred (owner, Q1). *Fill from prices* writes
amounts the person edits — a fill, not a third mode.

**Live where the person set a rule, fixed where they typed a number** (owner, Q2): an equal split
follows a new price and the trip's *Covered by*; a split by amounts and a per-cost override stay as
saved and show when they no longer add up.

**Membership in the database.** Every person in `cost_shares` and `trip_cover` is referenced through
`trip_travellers(trip_id, traveller_id)`. 3D-1's payer check lives in the repository; here SQLite itself
refuses anyone off the trip, and NO ACTION blocks leaving alone while a whole-trip delete still works.
A new table rather than a column on `trip_travellers`: ALTER cannot add a composite key, and
rebuilding a table that holds real data is the riskier migration.

**One or more adults per child** (owner, Q3), equally; a one-adult override per cost. Only someone who
is an adult on the trip now covers; a reclassified adult is skipped rather than leaving a child
covering a child. *Not specified* is never treated as a child.

**A split goes with its cost** (owner, Q4): it is part of the cost, not money that moved. Payments still
block deleting a booking (3D-1).

**Leaving a trip is resolved record by record.** No *move everything to someone else*: each payment,
share and override is opened and changed by the person; then the removal goes ahead as before. A
default cover is a setting and goes with the person, named in the confirmation.

**Built on `phase-3d1`** (owner, 2026-10-21): both stages wait for the trip together; the phone's
install runs 007 and 008 in one start-up, so that path was rehearsed (release 0.13.0 → 0.15.0).

## D42 — 3E: balances and settlements (0.16.0, migration 009)

Plan, the owner's answers (§11.1, §12.1) and the as-built record: `docs/phase3e-plan.md`.

**Only complete costs enter a balance** (owner, Q1). A cost counts when it is spent, split, the split
adds up, every child is covered, every payment has a payer and the payments are exactly the cost.
Counting a part payment would mean guessing how it divides between the people who share the cost;
every other cost waits, named, with what is recorded on it, so a deposit never disappears (A).

**Unsplit costs stay out and never block** (owner, Q2). Not split means nobody said whose it is; treating
it as the payer's own would turn *unknown* into a decision. It is shown collapsed, because a family
trip that never splits should not look broken.

**No suggestions while a shared cost waits** (owner, §12.1 option a). A settlement recorded before its
cost is complete would otherwise produce a false debtor (Ben pays half the deposit; the hotel still
waits; the app tells Ana to pay Ben). The nets are still shown, as *Balances so far*, worded without
*owes*. Per currency, never across currencies.

**A settlement is a fact, not a cost** (owner, Q4). Over-settling is allowed after a warning that shows
the resulting balances; a currency with no costs is flagged and gets no suggestion (B). The one hard
refusal is a settlement that leaves the receiving child owing (invariant D). Later edits that push a
child below zero are flagged and change no record (E).

**Same database pattern as `cost_shares`.** Both people reference `trip_travellers(trip_id,
traveller_id)`: SQLite refuses anyone off the trip, NO ACTION keeps someone with a settlement on the
trip, a whole-trip delete still removes everything in one statement. Nothing else deletes a
settlement: it is never linked to a booking or an expense (C).

**Derived, never stored** (invariant J): `tripBalances` runs on every read over the records, so an edit
anywhere — a price, a split, a cover — is reflected at once and no stored balance can disagree.

**Built on `phase-3d1`** (owner, 2026-10-22): a migration is a risk to the phone's real data by
definition, so 3E waits with 3D-1 and 3D-2 for the trip; the phone's install runs 007, 008 and 009 in
one start-up, and that path was rehearsed on an emulator.

## D43 — Unsplit costs reviewed per cost where settlements exist (0.16.1, migration 010)

Plan and as-built record: `docs/phase3e-plan.md` §14. Raised by the independent review of 3D-1 → 3E
(P1); decided by the owner, 2026-10-23.

**The problem.** A settlement is a fact between two people, never linked to a cost (D42). When the
cost it paid for leaves the balances — its split removed — the settlement still counts, and with other
complete costs in the currency the app can suggest a transfer nobody owes. The app cannot tell a split
removed by mistake from a cost meant to stay unsplit.

**The decision: ask, per cost, once.** In a currency with settlements, an unsplit cost holds
suggestions back until someone splits it or confirms *keep it outside*. Without settlements nothing
changes: unsplit costs still never block (D42). Rejected: blocking on every unsplit cost (a family that
never splits would never see a suggestion); linking settlements to costs (a settlement often squares
several costs at once); deleting or moving settlements (money history is never changed by itself).

**A confirmation is about the cost as it was reviewed.** It stores the cost's financial fingerprint and
applies only while the cost still reads the same, so every financial edit is caught in one place — no
invalidation calls spread through the repositories. A split is the exception that must end it for
good (split → settle → unsplit is the very scenario), so the database deletes the confirmation on any
write to the cost's split, by trigger. It is checked again inside the write transaction: a screen
showing an older version of the cost cannot confirm the newer one.

**Its own table, not a field.** A confirmation is not a split, a share or a payment, and must never
look like one; one row per cost, deleted with the cost, carried by backups and trip archives (format
11), remapped with the cost on import.

**Amended after the follow-up review (2026-10-23, plan §14.4): a financial edit ends it for good.**
Matching the fingerprint alone let a cost changed and changed back find its old confirmation valid
again; the owner's rule is that a financial edit needs a fresh one. Each write that can change a
cost's money now calls one helper, `endChangedConfirmations`, inside its transaction, which deletes
any confirmation its cost no longer matches — so a stored confirmation always matches. The
fingerprint stays the single definition of *financial*. Rejected: SQL triggers per money table (a
new migration, and the fingerprint restated in SQL — two definitions that could drift); deletes
written out in each repository (the same rule copied nine times).

## D44 — Settlement review holds when a shared cost leaves a settled currency (0.16.2, migration 011)

Plan and as-built record: `docs/phase3e-plan.md` §15. The owner chose option B of §14.4 on
2026-10-23, after the follow-up review.

**The problem.** A settlement is money that changed hands, never linked to a cost (D42). Deleting a
shared cost, or moving it to another currency, after a settlement leaves the settlement counting
against what is left. The app may then suggest the opposite transfer (*Ana pays Ben 5* after a
deleted taxi), or ask for the same money twice across two currencies. The app cannot tell a mistaken
deletion from a correction.

**The decision: ask first, then hold until reviewed.**
- The write that would take a shared cost out of a currency with settlements is refused until the
  person is told and continues.
- Continued, the currency is held, with no suggestions, until someone says the settlements still
  stand. They are reviewed together, per currency, never one by one. The app cannot know which
  settlement paid for what, so asking per settlement would invite a guess.
- Settlements are never changed. Correcting one is done on the settlement itself.

**Why the warning is a repository refusal.** One rule, in the place every write already passes
through (§14.4's `afterMoneyWrite`), compares the balances before and after inside the write's
transaction. The screens do not predict anything. A screen that forgets to ask shows the refusal and
saves nothing, rather than holding silently or not at all.

**Why waiting and to-review costs count, not only complete ones.**
- §12.1 allows a settlement before a cost is complete.
- The existing refusals mean most removable shared costs are *waiting*: a booking with payments
  cannot be deleted or change currency.
- A cost could otherwise be emptied or unsplit first and deleted afterwards. That is two steps, and
  the same risk.

A cost kept outside on purpose does not count: the person already said it is outside.

**An event per change, not a flag.** Each change is its own row, acknowledged together by exactly
the ids the review screen showed, inside a transaction. A later change is a new open row, so an
earlier acknowledgement never covers it; and a stale screen is refused. Rows name the cost as text
(title, amount), never by reference, so a deleted cost does not have to exist. Acknowledged rows stay
as the record.

**Rejected:**
- Warning only (option A): nothing would remain once the warning was dismissed.
- A derived over-settlement check (option C): wrong in ordinary use, and it misses partial cases.
- Holding the destination currency of a move: nothing left it.
- Deleting or reversing settlements: money history is never changed by itself.

## D45 — Phase 4: a reporting currency, typed-in rates, charged amounts (0.17.0, migration 012)

The owner asked for Phase 4 to be planned and built in one run (2026-10-23), so the decisions below
were taken without stopping. Each is listed in `docs/phase4-plan.md` §11 for review.

**The converted figure is an addition, never a replacement.** Every amount keeps its currency. A trip
with a reporting currency shows one converted total, marked *≈* whenever a typed-in rate made any part
of it, above the per-currency totals *as recorded*. A currency with no rate is named as *not
included*, never guessed and never counted as zero. That is D32's reversal of *never convert*, with
the original kept.

**Rates are typed in, per trip (P4-1, P4-2).** There is no rate service: master §10 says "No silent
online requests or paid service", and there is no backend. One rate per currency per trip, with its
date. A rate service is *Discovery*.

**Charged amounts make the history exact.** A payment made at a different date and rate is recorded by
what the card was actually charged in the reporting currency. That amount is locked and never
re-estimated. This covers deposits paid at one rate and balances paid at another, without a table of
daily rates.

**Balances stay per currency (P4-3).** A debt in USD is settled in USD; converting it would change who
owes what each time a rate moved. Settle up is untouched.

**A rate remembers its base (P4-5).** When the reporting currency changes, a rate set against the old
one is kept and shown, but not applied. Never reinterpreting a recorded value outranks convenience.

**Exactness (P4-6, P4-7).** A rate is exact decimal text, and the arithmetic is BigInt, so money never
touches a float. Zero-decimal currencies change in display only. Storage stays hundredths, because
changing what stored yen amounts mean would be a migration of meaning.

**Rejected:**
- an online rate API, or built-in rates (stale and silent);
- converting balances or every list;
- deleting rates when the base changes;
- REAL or scaled-integer rates;
- a table rebuild for cross-column CHECKs (D25's rule on the riskiest migration).

## D46 — Phase 4 review corrections: rates per pair, partial totals (0.17.1, migration 013)

An independent review of 0.17.0 found three things.

**P1: a rate is a pair.** 012 keyed a rate by currency, so a rate to a new reporting currency replaced
the rate to the old one. That broke P4-5 after one switch.
- 012 is never edited, and SQLite cannot re-key a table in place. So rates moved to a new table keyed
  by `(trip, currency, base)`, every row copied.
- The old table is kept, frozen. A rebuild would have been shorter, and is the riskiest kind of
  migration (D25).

**P2: partial is said in words.** A total that leaves a currency out was shown like a complete one
whenever no estimate was involved. Being estimated (≈) and being complete are now separate signals,
and the heading names the state.
- *No EUR total yet* replaces a figure when nothing could be counted, so an unknown is never shown as
  0.00.

**P3: charged amounts are records, not conversions.** A charged amount keeps the currency it was
recorded in, and counts only while that currency reports.
- Chaining it through a rate would put an estimate on top of a fact.
- Relabelling it would rewrite history.
- The screens now say when one is not counted.
