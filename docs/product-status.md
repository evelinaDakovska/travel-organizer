# Product Status & Feature Matrix

> **Current authoritative product reference.**
> Last updated: 2026-10-16.
> This document is the single source of truth for feature readiness, implementation status, and verification stages. Older planning and status documents (`docs/status.md`, `docs/plan.md`, `docs/fieldbook-plan.md`, `docs/feedback-plan.md`, `docs/paid-plan.md`) are linked below with notes on superseded sections.

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

- **Day-Wide Map View**:
  - *Rationale*: Individual items already feature one-tap A→B Google Maps directions via geo-coordinates or formatted addresses. A full integrated interactive map adds significant bundle size, API key exposure risks, and complex offline tile-caching overhead without substantial daily travel value.
- **Passports & Sensitive Traveller Documents**:
  - *Rationale*: Storing passport numbers, scans, and national IDs introduces high data privacy and security risks. The app deliberately remains an offline itinerary and booking document holder.
- **Estimated Shopping Prices**:
  - *Rationale*: Wishlist/shopping estimates add bookkeeping friction. Only actual spent amounts belong in Expenses.
- **Reusable Booked Itineraries in Trip Templates**:
  - *Rationale*: Trip templates currently cover tasks, packing lists, checklists, and general notes. Templatising full dated bookings (flights, trains, hotels) requires date-shifting logic that is fragile and rarely reused verbatim.

---

### Clarifications & Proof-of-Concepts (Not Production)

- **Gmail Integration**:
  - *Current Status*: Isolated Proof-of-Concept (`scripts/gmail-poc/` or isolated tooling only).
  - *Boundary*: **Not integrated into the production app.** Does not run on user devices. Real booking search, OAuth consent, and multi-account mailbox scraping require extensive owner testing and security reviews before any app-level consideration.

---

### Future Scope (Post-Friends Testing)

- **Public App Store Release**:
  - Friends-only test is conducted via direct APK side-loading. Google Play Console, privacy policy hosting, data safety declarations, and target API bumps are future milestones.
- **User Accounts & Cloud Sync**:
  - The app remains strictly local-first with offline SQLite and manual ZIP backups. Multi-device sync, cloud databases, and authentication are post-v1 considerations.

---

## 3. Related Documentation & Status Links

- [`docs/status.md`](docs/status.md): Detailed task-level checklist (C1–C5, S1–S8, U1–U8, N1–N6, R1–R11, FB1–FB11).
- [`CLAUDE.md`](../CLAUDE.md): Core architectural invariants, time model, and conventions.
- [`docs/technical-reference.md`](docs/technical-reference.md): Database schema and technical contracts.
- [`docs/plan.md`](docs/plan.md): Milestone roadmap (M0–M9). *(Note: Milestone descriptions reflect initial project sequencing; refer to this document for current feature status).*
- [`docs/fieldbook-plan.md`](docs/fieldbook-plan.md): Completed Fieldbook design review (v0.6.0).
- [`docs/paid-plan.md`](docs/paid-plan.md): Completed payment status implementation (v0.5.1).
- [`docs/feedback-plan.md`](docs/feedback-plan.md): Superseded initial feedback design (v0.5.0); refer to Section 2 above for the current In-App Feedback Notebook architecture.
