# Product Status & Feature Matrix

> **The feature-level view** — what a user can do, and where each feature was verified.
> Last updated: 2026-10-20.
> Task-level status, how each piece was built and verified, and which version is where live in
> [`status.md`](status.md); where the two disagree, `status.md` wins. What comes next is
> [`roadmap.md`](roadmap.md).

---

## 1. Status Categories & Summary

| Status Category | Definition & Verification Stage |
|---|---|
| **Implemented** | Built, unit-tested, and verified on physical hardware by the owner during actual trip use. (Most core features have been explored by the owner and appear good; edge cases remain subject to real-world travel conditions). |
| **Implemented, awaiting physical-phone verification** | Fully implemented, unit-tested, and verified on the Android emulator (`Pixel_10_Pro`), but awaiting physical phone verification by the product owner. |
| **Implemented, feature-flagged OFF for beta** | Fully built, persistence and tests verified, but temporarily disabled via centralized flag (`FEATURE_FEEDBACK_ENABLED = false`) pending backend infrastructure configuration. |
| **In progress** | Active development items. |
| **Deferred** | Explicitly out of scope for the upcoming friends-only test release; evaluated and postponed with clear rationales. |
| **Future Scope** | Long-term roadmap items not required for private or friends-only testing. |

---

## 2. Feature Status Breakdown

### Implemented (Verified on Phone in Actual Use)
*The owner has actively used these capabilities on a physical Android device; general behavior is verified sound, though not every conceivable edge case has been encountered.*

- **Trip Management**:
  - Mandatory start and end dates with `default_tz` timezone handling.
  - Home screen grouping: Upcoming trips (sorted by start date) and Past trips (sorted descending).
  - Trip creation, editing, and deletion.
- **TripItems (The "Filing Cabinet")**:
  - Transports (flights, trains, buses, car rentals, ferries), accommodations (hotels, apartments), activities, food/drink, and notes.
  - Attachment of offline documents (PDF tickets, boarding passes, booking confirmations, images, camera captures) stored locally in the app filesystem with automatic garbage collection.
- **Timeline & Schedule**:
  - Day-by-day chronological itinerary grouping.
  - Intelligent check-in / check-out calculation and stay intervals.
- **Search & Filter**:
  - Global in-trip keyword search across items, notes, resources, and custom fields.
- **Notes & Fieldbook Lists**:
  - General trip notes, packing lists, checklist items with toggleable completion status.
  - Fieldbook redesign (warm typography, clear hierarchy, badge classifications).
- **Offline Reliability & Backup (M6)**:
  - Full ZIP export and import of all SQLite database tables and referenced binary files (`files/storage.ts`).
  - Standalone data resilience without remote backend lock-in.
- **Local Reminders (M7)**:
  - Scheduled Android notification triggers for dated departure/activity times.
- **Android Share Intent (M8)**:
  - Inbound receiving of PDFs, images, and URLs shared from external apps (browsers, email clients, WhatsApp) directly into trips.
- **Paid / Not Paid Tracking**:
  - Marking items as paid or unpaid, currency selection, and total cost tracking per currency.
- **Places Browsing View (Financial Privacy)**:
  - Removed prices, payment totals, and paid/unpaid badges from list rows in the Places tab (`showFinancials={false}` in `ItemRow`).
  - Retained place/activity name, location, scheduled date/time, idea vs. scheduled status, and Google Maps directions link.
  - Financial details remain strictly accessible inside item details and the Expenses tab.
  - Verified on Samsung Galaxy S26 Ultra in actual use.
- **Traveller Profile Multi-Select Picker**:
  - Replaced free-text entry in New Trip and Edit Trip with a reusable traveller profile picker.
  - Shows traveller classification badges: `Adult`, `Child`, or `Not specified`.
  - Distinguishes travellers sharing the same name by unique UUIDs.
  - Allows inline "Add new traveller" creation without abandoning trip flow.
  - Persists memberships via atomic snapshots in `trip_travellers` without modifying legacy free-text fields.
  - Verified on Samsung Galaxy S26 Ultra in actual use.
- **Ongoing-Trip Overview Experience**:
  - Dynamic stage adaptation:
    - **Upcoming**: Countdown days, departure highlights, trip preparation notes.
    - **Ongoing**:
      - **Now / Up next**: Prominently highlights the currently active event or next scheduled departure. Isolates multi-day hotel stays into the stay card so they never obscure upcoming flights or transfers.
      - **Your stay**: Dedicated accommodation tracking (checked in, check-in today, next stay, or overnight transport) with one-tap directions and attached confirmations.
      - Direct "+ Add expense" quick action reachable immediately at the top of Overview.
    - **Past**: Calm summary showing total places visited and total expenditure breakdown by currency, removing misleading future countdowns.
  - Verified on Samsung Galaxy S26 Ultra in actual use.
- **Per-Item Travellers Assignment**:
  - Assign specific traveller profiles to individual TripItems (`item_participants`).
  - Distinguishes profiles with identical names via classification indicators.
  - Verified on Samsung Galaxy S26 Ultra in actual use.

---

### Also built in 0.7.x — verification on the phone not recorded

- **Directions to Google Maps (0.7.0)**: from the Timeline's connector rows, *How to get there* on
  item detail and *Directions* on Overview; from current location, the previous stop, the day's
  stay or a saved place; no API key, no location permission. Covered by tests and the emulator.
- **Adult / child travellers (0.7.1)**: a classification on each profile, overridable per trip;
  per-person pricing lines suggested from it. Migrations 004 and 005, backup format 5.

---

### Built in 0.14.0 (roadmap 3D-1) — on the branch `phase-3d1`, verified on emulators, not on a phone

Not on any phone until after the owner's trip (owner, 2026-10-21): it brings migration 007.

- **Payments on a booking**: *Add a payment* records an amount (starting at what is left), who paid
  (*Not recorded* unless picked; the last payer is offered, never chosen) and a date. A deposit and
  the balance are two payments; the booking shows *Paid EUR 100 of 250 · To pay EUR 150*.
- **One cost per booking**: a booking costs its price once; its payments and linked expenses are
  never spending. A EUR 250 booking paid as 100 + 150 is EUR 250, paid in full.
- **An expense can pay for a booking** (*For a booking*), and can be unlinked again. A new expense
  whose amount matches a booking's price or balance asks *Is this a payment for …?* — never merged
  by itself. An expense can name who paid.
- **Old *Paid* is kept**: a booking marked *Paid* with nothing recorded reads *Paid — not recorded by
  whom*; with some records, the rest is *not recorded by whom*. Nothing is invented.
- **Money history is never deleted by accident**: a booking with payments cannot be deleted (cancel
  it, or remove the payments first); a payer cannot be removed from the trip; deleting a whole trip
  names the payments and expenses it removes. A payment must be in the booking's currency.
- **Backup format 8**: 0.13.0 refuses backups and trip files from 0.14.0; 0.14.0 reads all older ones.

### Built in 0.13.0 (roadmap 3C) — verified on emulators, not yet on a phone

- **Price breakdowns by audience**: a rate can be **for** an Adult, a Child or Anyone; a rate of 0
  is free; a **group price** (one fixed price, e.g. a family ticket) and **extras** (things, not
  people, e.g. sled hire) sit beside the rates. The total is always the sum of the lines.
- **Price for who's going**: offered when the rates do not match who is ticked; shows the price now
  and the suggested price, and changes nothing until **Apply**. Not offered for a booking marked
  paid (the calculation is still shown), and changing a paid booking's price warns that *Paid* would
  cover the new price too. Changing who is going never changes a price.
- **Estimate**: a saved place's price is labelled an estimate. Nothing about it is counted as spent.
- **Backup format 7**: backups and trip files from 0.13.0 are refused by 0.12.0 rather than losing
  the new price details; 0.13.0 still reads every older backup and trip file. No database migration.

### Built in 0.12.0 (roadmap 3B) — verified on emulators, not yet on a phone

- **Who's going, by default**: a new plan or saved place starts with everyone on the trip ticked
  (a to-do with nobody); editing keeps who was ticked. Activities imported from a file still start
  with nobody.
- **Someone joins a trip**: *Also add … to* lists the trip's plans and saved places, all unticked —
  nothing is added unless ticked; also later from the traveller's row. Prices and payments never
  change. Travellers with the same name are told apart by their trips.

### Built in 0.11.0 (roadmap 2D) — verified on emulators, not yet on a phone

- **Plan with AI** (Overview → More): the trip as text to paste into ChatGPT or another assistant —
  what to help with, what is planned day by day, ideas, optionally where you stay and how many are
  going. You see exactly what will be shared before you copy or share it. Names, booking
  references, prices, notes, addresses, documents and links are never included.

### Built in 0.10.0 (roadmap 2C) — verified on emulators, not yet on a phone

- **Import activities** (Overview → More): add ideas and plans from a JSON file — e.g. written by
  ChatGPT with the instructions the app copies — after a preview that shows every activity, what is
  invalid and why, possible duplicates, and fields it will not import. Only ticked activities are
  added, all at once or not at all; then a list to review them. Never paid, never a booking.
- **Export activities** (Overview → More): chosen ideas and plans as a file in the same format —
  without booking references, people, documents, payments or ids. Re-imports into any trip.
- **The format** is public and documented (`docs/ai-activities-format.md`, JSON Schema in
  `docs/schema/`).

### Built in 0.9.0 (roadmap 2B) — verified on emulators, not yet on a phone

- **Export trip** (Overview → More): one trip as a file — complete, or without attachments (then
  marked partial) — to import on another phone. Never contains other trips, settings or "Me".
- **Import a trip** (Backup & restore): added as a new, independent trip after a preview; travellers
  become new profiles unless linked by choice; a repeat import is recognised and warned about;
  damaged or hostile files are refused or named before anything is written.

### Built in 0.8.0 (roadmap 2B-0) — verified on the emulator, not yet on a phone

- **Me**: one traveller profile marked as you on this phone — linked to an existing profile or
  added; ticked on every new trip; offered as *Evelina (Me)*; added to older trips only after a
  confirmed choice, as a member only (bookings, prices, expenses and lists untouched).
- **Several people per packing/shopping item**, with *For Evelina, Misho* / *For Everyone*, and
  *Add new traveller* (or link a saved one) from the item. Old single assignments carried over
  (migration 006); old backups restore the same way (backup format 6).

### Built in 0.7.4 (roadmap Phase 1) — verified on the emulator, not yet on a phone

- **Trip context on every inner tab**: the trip's name and destination above *Timeline*, *Places*,
  *Expenses* and *Notes & lists*, the dates below.
- **A clear active tab**: accent bar, accent icon and semibold label.
- **Tab labels on one line** on small phones and large text; *Notes & lists* shortens to *Notes* in
  the bar only where it cannot fit.
- **Bottom sheets**: one clean rounded top edge; text fields stay above the keyboard.

---

### Implemented, Prepared for Friends-Only Beta (v0.7.3)
*Fully implemented, covered by automated test suite (895 tests across 54 suites), typecheck clean, verified end-to-end on clean emulator install (`Pixel_10_Pro`, <= 4 GB RAM) and ready for friends-only test distribution.*

1. **Official App Icon (Design B — Travel Journal)**:
   - Officially selected and approved Design B: deep teal notebook with mountain illustration, warm orange sun, mustard elastic band, and cream `#FBF6EB` background.
   - Generated full suite of Android adaptive icon assets:
     - Foreground: Isolated notebook silhouette with smooth anti-aliased transparency, scaled to 230 px within the 432 px canvas to guarantee full fit inside the 66.6% (72 dp) circular and squircle safe zones without clipping or awkward margins.
     - Background: Full-bleed `#FBF6EB` cream background canvas and color resource.
     - Monochrome: High-contrast white silhouette on transparent canvas for Android 13+ Material You themed icons.
     - Legacy: Generated all density mipmaps (`mdpi` through `xxxhdpi`) for standard and round launcher icons.
   - Tested on Android launcher with adaptive circular mask and Samsung One UI masking.
2. **Quick Expense Entry with Receipt Photos**:
   - Fast modal/bottom-sheet accessible directly from Overview without navigating to the Expenses tab.
   - Supports optional receipt image capture (`Take photo` via device camera) and gallery selection (`Choose photo` via system photo picker).
   - In-sheet image preview thumbnail and instant remove action.
   - Uncommitted receipts are automatically cleaned up if the sheet is dismissed or closed without saving.
   - Saved atomically via `createExpense(db, tripId, input, receipts)`.
   - Stored in persistent app document storage (`storageDirectory`), associated with `expense_id`, accessible from Expense Details, and backed up in standard ZIP exports.
   - Deletion of expenses cascades to associated receipt files.
3. **Spending Calculations & Accounting Verification**:
   - Automated tests and verification confirming that newly saved quick expenses appear under the correct trip.
   - Ordinary spending totals update cleanly without altering or double-counting booking costs (`src/domain/spending.ts` vs `src/domain/bookingCosts.ts`).
   - Attaching receipt photos does not alter financial totals or currency handling.
4. **Offline Export & Low-Memory Performance**:
   - Offline itinerary PDF generation and share sheet integration verified.
   - Complete ZIP backup export verified.
   - Cold startup, smooth navigation, and low-memory performance verified on Android 16 emulator configured with <= 4 GB RAM.

---

### Implemented, Feature-Flagged OFF for Friends-Only Beta
*Fully implemented, persistent local drafts verified, worker code and automated tests passing, but temporarily disabled via centralized flag (`FEATURE_FEEDBACK_ENABLED = false`) pending backend worker deployment and Resend API key setup.*

- **In-App Feedback Notebook**:
  - **Status**: Implemented, tested, and feature-flagged OFF (`FEATURE_FEEDBACK_ENABLED = false` in `src/config/features.ts`).
  - **Behavior when disabled**:
    - Home screen: "Your data → Feedback" row is hidden without leaving empty rows.
    - Home screen empty-state: "Feedback" button is hidden.
    - Trip Overview: "More (···) → Feedback" sheet item is hidden via `getTripMoreActions()`.
    - Route `/feedback`: Guarded; direct navigation or intent triggers a safe `<Redirect href="/" />` to Home.
  - **Preserved implementation**:
    - Form UI (`app/feedback.tsx`) with Name (optional) and Message (required, bounded to 5,000 characters).
    - Local draft persistence (`src/repositories/feedbackDraft.ts`) saving debounced drafts to app document storage (`feedback_draft.json`) isolated from trip backups.
    - Direct delivery client (`src/services/feedback.ts`) with 15s timeout, idempotency key header, and draft preservation on failure.
    - Serverless backend worker (`server/feedback-worker/`) with Resend API integration, fixed recipient `evelina.dakovska@gmail.com`, 24h KV deduplication, and rate limiting.
    - Diagnostics notice informing testers that app build and Android OS version accompany submissions without collecting any trip contents, bookings, notes, or receipts.

---

### Deferred
*Explicitly excluded from the current friends-only test build after evaluation.*

- **Day-Wide Map View** — now on the roadmap as **Phase 5** (D32):
  - *Rationale for leaving it out of the beta*: Individual items already feature one-tap A→B Google Maps directions via geo-coordinates or formatted addresses. A full integrated interactive map adds significant bundle size, API key exposure risks, and complex offline tile-caching overhead.
- **Passports & Sensitive Traveller Documents**:
  - *Rationale*: Storing passport numbers, scans, and national IDs introduces high data privacy and security risks. The app deliberately remains an offline itinerary and booking document holder.
- **Estimated Shopping Prices**:
  - *Rationale*: Wishlist/shopping estimates add bookkeeping friction. Only actual spent amounts belong in Expenses.
- **Reusable Booked Itineraries in Trip Templates**:
  - *Rationale*: Trip templates currently cover tasks, packing lists, checklists, and general notes. Templatising full dated bookings (flights, trains, hotels) requires date-shifting logic that is fragile and rarely reused verbatim.

---

### Clarifications & Proof-of-Concepts (Not Production)

- **Gmail Integration**:
  - *Current Status*: A standalone Gmail search proof of concept, verified **outside this repository** (nothing of it is in the repo).
  - *Boundary*: **Not integrated into the production app**, deliberately; a universal email import (forwarding, shared files, `.eml`) is future work (`MASTER_ROADMAP.md` §17, discovery backlog). Does not run on user devices. Real booking search, OAuth consent, and multi-account mailbox scraping require extensive owner testing and security reviews before any app-level consideration.

---

### Roadmap (2026-10-19)

Phases 1–8 in [`roadmap.md`](roadmap.md), done in order, each only when the owner asks: (1) UI &
navigation fixes from the beta, (2) single-trip import/export and AI JSON import, (3) travellers,
pricing and shared expenses, (4) currency conversion, (5) a full-day map, (6) trips without fixed
dates, (7) Google Maps place import, (8) an `.ics` calendar export.

### Future Scope (Post-Friends Testing)

- **Public App Store Release**:
  - Friends-only test is conducted via direct APK side-loading. Google Play Console, privacy policy hosting, data safety declarations, and target API bumps are future milestones.
- **User Accounts & Cloud Sync**:
  - The app remains strictly local-first with offline SQLite and manual ZIP backups. Multi-device sync, cloud databases, and authentication are post-v1 considerations.

---

## 3. Related Documentation & Status Links

- [`status.md`](status.md): Task-level status (C, S, U, N, R, F, FB, 0.7.x, P1–P8) — wins on any disagreement.
- [`roadmap.md`](roadmap.md): Phases 1–8.
- [`CLAUDE.md`](../CLAUDE.md): Core architectural invariants, time model, and conventions.
- [`technical-reference.md`](technical-reference.md): Database schema and technical contracts.
- [`plan.md`](plan.md): Milestone roadmap (M0–M9). *(Note: Milestone descriptions reflect initial project sequencing; refer to this document for current feature status).*
- [`fieldbook-plan.md`](fieldbook-plan.md): Completed Fieldbook design review (v0.6.0).
- [`paid-plan.md`](paid-plan.md): Completed payment status implementation (v0.5.1).
- [`feedback-plan.md`](feedback-plan.md): Superseded initial feedback design (v0.5.0); refer to Section 2 above for the current In-App Feedback Notebook architecture.
