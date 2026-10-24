# Travel Organizer — Master Product & Engineering Roadmap

**Document status:** Product-owner planning baseline, 20 October 2026  
**Repository:** https://github.com/evelinaDakovska/travel-organizer  
**Last reported release:** v0.12.0, versionCode 19, commit `991994e` (Phase 3B)  
**Verification status:** This document consolidates owner decisions, previous planning and coding-agent reports. It is **not** an independent source-code audit. Verify all implementation claims against the repository before relying on them.  
**Repository cross-check:** Claude compared this document with the repository at `991994e` and its docs on 20 October 2026. Factual corrections are marked **[Repo check]**. Product requirements were not changed, and no future plan was removed. Points that need an owner decision are listed in §21. This check was done by the coding agent. It is not an independent review.  
**Owner decisions on §21:** given 20 October 2026 and recorded in §21, in the sections they affect, in `docs/phase3-plan.md` §18–§19, and in decision-log D38.

> **Document hierarchy:** This is the long-range product and delivery roadmap. `docs/phase3-plan.md` contains the detailed financial architecture; `CLAUDE.md`, the technical reference, decision log, status, and session handoff describe implementation specifics. When these conflict, inspect current code, identify the conflict, and ask the owner before silently changing product intent. Do not overwrite historical decisions or fabricate verification.

## 1. Product vision and boundaries

Travel Organizer is a practical, **offline-first travel companion** for keeping trips, activities, transport, accommodation, places, tickets, documents, costs, travellers, preparation lists and notes in one place. The primary value is finding accurate trip information quickly while travelling, including when connectivity is poor. It is not initially a booking marketplace, social network, automatic booking agent, or AI chatbot.

**Primary user journey:** create a trip → add travellers → add flights/trains/stays/activities/places → attach documents and confirmations → organise by day → prepare lists → navigate and view plans offline → understand costs → share/export a safe copy. The app should make both detailed pre-planning and quick on-trip access pleasant.

**Current platform:** Android, React Native / Expo, TypeScript, SQLite and local attachment storage. **Production application ID:** `com.evelinadakovska.travelorganizer`. Visual identity: restrained deep teal (`#13616b` light, `#78d0d8` dark), clear hierarchy, readable compact rows, consistent iconography and labelled Add actions. Current trip tabs: Overview, Timeline, Places, Expenses, Notes & lists.

**Distribution ambition:** initially free friends-only Android testing; potentially free Google Play launch later. No monetisation is required now. Cloud accounts, Firebase, collaboration, iOS and AI APIs are **possible future products**, not dependencies for the existing local-first roadmap. Do not assume a backend is approved.

### 1.1 Status vocabulary (owner, 20 October 2026)

Every feature or idea named in these documents has exactly one of these statuses. **"Not building now" never means "never building."**

| Status | Meaning |
|---|---|
| **Implemented** | Already present in the application. |
| **Approved/planned** | Included in this roadmap. Only the **current** phase is authorised for implementation. |
| **Deferred** | Potentially wanted later, but not part of the current development scope. |
| **Discovery** | Needs product research and a separate owner decision before it can be planned. |
| **Explicitly excluded** | Intentionally not part of the product, unless the owner reverses that decision. |

Ideas are never removed just to make documents consistent; they move between statuses. `CLAUDE.md` §7 uses the same vocabulary, and §17 below marks each backlog item Deferred or Discovery.

## 2. Collaboration and evidence protocol

- **Owner:** decides product behavior, approves each stage, controls real-device access and releases.
- **Coding agent (Claude):** reads the current repo/docs, writes plans, implements, runs automated/emulator tests, documents results, commits and pushes after authorization.
- **ChatGPT:** product/architecture reviewer and English-prompt author; after each coding-agent completion report, **attempts to inspect the actual commit/diff** and critical surrounding code before recommending acceptance or the next phase. If remote access fails, request a diff/ZIP; distinguish reported from independently verified results.
- **Source of truth:** repository code for implemented behavior; owner-approved decisions for desired behavior; reproducible tests for evidence; reports are claims until checked.
- **Per-stage cadence:** inspect state → design/decision approval when needed → implementation → unit/integration/typecheck → synthetic emulator E2E → in-place upgrade rehearsal → docs update → commit/push → independent review → approval to proceed.
- Do not combine unapproved phases or present a passed unit test as physical-device validation.

## 3. Non-negotiable data safety and privacy

1. The primary Samsung phone contains irreplaceable real trip information. **No physical-phone install, uninstall, clear data, debug reset, real-data testing, signing/application-ID change, or migration on it without explicit owner permission.** Physical acceptance testing on the primary phone is deferred until the planned feature phases are finished, unless the owner changes that decision.
   - **Secondary beta phone (owner, 20 October 2026):** a separate secondary Android phone may be used for controlled beta testing before the feature phases are finished, but **only in a testing session the owner has explicitly approved**. This permits *planning* early beta testing. It does not permit installing anything now. In such a session: synthetic data only; no access to or installation on the primary Samsung phone; no personal trip backups or production data; verify the application ID, signing, APK source and upgrade behaviour; never uninstall or clear data without explicit approval. Emulators stay the default testing environment.
   - **How physical testing is split (owner, 23 October 2026):** phones come last, only after the work is done, independently reviewed and tested on emulators. Then:
     - **the owner's primary phone** (the real trip) gets **only risk-free changes until the trip has passed**. The real data is always defended. The risky changes (migrations and the like) go onto it **after the trip, not before**;
     - **the secondary phone** (the owner's husband's, no real data) tests **all changes**, including migrations and anything not risk-free.

     Each install still needs the owner's explicit go-ahead.
2. Use **synthetic fixtures on Android emulators** for development and destructive tests. Avoid opening or altering unidentified archive files, even on emulators.
3. Preserve existing trip IDs, participants, travellers, prices, payment semantics, receipts, attachments and document references unless the owner explicitly changes them.
4. Prefer additive SQLite migrations, versioned backups and transactional writes. Rehearse upgrade/restore on synthetic databases representing older schema and backup formats. A backup is not proven safe until a restore is tested.
5. Historical paid booking amounts must never be silently recalculated or reinterpreted; never invent a payer, payment, booking confirmation, financial responsibility or traveller classification.
6. AI workflows must be user-controlled and privacy-first. Do not upload private trip data automatically. Show the **exact content** before Copy/Share; use explicit allowlists.
7. Release APKs must preserve production signing and application identity. Never package personal databases, test secrets or production credentials.
8. Distinguish **cost**, **attendance**, **payer**, **financial beneficiary/responsible person**, **payment**, and **settlement**.
9. Do not sum unlike currencies as though equivalent; conversion is Phase 4.
10. Destructive actions require understandable scope, confirmation and recovery strategy where practical.

## 4. Current baseline and historical phases

The following milestones are **reported complete by Claude**, not independently verified in this document. Version/commit values are useful review anchors.

| Milestone | Reported release / commit | Reported deliverables | Remaining verification |
|---|---|---|---|
| Early product foundations | Before v0.7.4 | Local trips, Overview/Timeline/Places/Expenses/Notes & lists; stays, transport, files, notes, lists, PDFs, directions, templates; reusable traveller profiles. **[Repo check]** This period also includes v0.7.2, which added Quick Expense with receipt photos and the in-app feedback form (built, switched off; see §16.2). v0.7.3 (`ba749a2`) was the first friends-only beta, tested by friends on a second, smaller Android phone. | Independent code audit; physical acceptance deferred |
| Phase 1 UI/navigation | v0.7.4 / `c127331` | Teal navigation refinements, tab/header/sheet fixes | Physical UX |
| Phase 2A architecture audit | `78e1c1e` | Backup/import and AI workflow design, privacy and migration risks | Reconcile with current implementation |
| Phase 2B-0 identity/lists | v0.8.0 / `71e3fc3` / migration 006 | Local persistent Me linked to traveller, multi-person packing/shopping recipients, backup format 6 | Physical UX |
| Phase 2B single-trip archive | v0.9.0 / `abd36ae` | ZIP export/import with previews, checksums, ID remapping, explicit traveller mapping, transaction/recovery and malicious-file defenses | Real-world transfer, physical UX |
| Phase 2C AI activity exchange | v0.10.0 / `dc83ee7` | Versioned public JSON format, selective import/export, duplicate preview, privacy restrictions, post-import review | Large-list UX, TalkBack by ear, physical UX |
| Phase 2D Plan with AI | v0.11.0 / `0bdca7c` | Read-only planning context with exact preview, optional stay/traveller counts, Copy/Share, privacy allowlist | Real ChatGPT paste flow, physical UX |
| Phase 3A financial audit | `docs/phase3-plan.md` | Current schema and behavior, five-stage financial proposal, data-safety invariants | Verify audit against actual code |
| Phase 3B traveller participation | v0.12.0 / `991994e` | New manual plans/saved places default all trip travellers; edit preserves saved selection; optional unticked bulk assignment when person joins; no schema migration | Legacy typed-name conversion edge case; independent diff review; physical UX |
| Phase 3C adult/child pricing | v0.13.0 (`docs/phase3c-plan.md`) | Rates for Adult/Child/Anyone, free lines, group prices, extras; user-invoked *Price for who's going* (no Apply on paid bookings); paid-price warning; *Estimate* on ideas; backup/archive format 7; no schema migration | Independent diff review; physical UX |

**Reported current schema:** version 6. **Reported latest tests:** 1,153 passing and clean TypeScript typecheck at v0.12.0. These are agent-reported numbers, not tests run by ChatGPT.

**Review state (owner, 2026-10-23):** everything built through 0.16.2 has passed the owner's review: Phase 1, 2B-0 to 2D, and 3B to 3E. What the table lists as *physical UX* and real-world checks is still open, and is done on the phone after the owner's trip. On `phase-3d1` the schema is 11 and there are 1,624 tests.

### 4.1 Existing UX and semantics to preserve

- Overview supports upcoming/ongoing/past trips and quick access to stays, transport, travellers, lists, documents and notes.
- Timeline uses Day 1/Day 2/etc and All days, handles dates/timezones and undated items within dated trips, and has directions to/from places.
- Places browsing should not expose financial badges; finance belongs in details/Expenses.
- Directions display **FROM above TO**, with a clickable origin row, and can open Google Maps.
- Reusable shopping/packing lists are copied into trips; completion states and removal scope remain distinct.
- Booking cancellation is not a synonym for removing a to-do or checklist item.
- Existing prices are stored totals, with optional per-person pricing lines; participant changes do not silently reprice bookings.
- A `planned` activity means **in the itinerary**, not necessarily confirmed, booked or paid. Ideas and planned activities must remain distinct. **[Repo check]** In the database this is `status = 'confirmed'`, shown in the app as *In my itinerary*. The word `planned` is used by the 2C activities JSON format (`src/domain/activityFormat.ts`). The stored statuses are `idea`, `confirmed` and `cancelled`.
- AI-imported activities currently have **no participants selected**, intentionally unchanged by 3B. Manually created plans and saved places default current trip members; to-dos default nobody. Share-imported items and to-do templates also retain no-participant defaults.
- New trip members are **not retroactively added** to existing activities; optional “Also add … to” lists eligible plans/places, all unchecked, excluding to-dos and cancelled plans.
- Local Me is a traveller identity link, not a separate duplicated person and not an automatic financial payer.

## 5. Roadmap overview and dependency graph

**Current gate (2026-10-23):** Phase 3 is closed. 3B–3E are built and reviewed, and every exit check is in §6–§9. The one item still open is the signed release rehearsal of 0.13.0 → 0.16.x before the phone install, after the owner's trip. Phase 4 and *B1* start only when the owner asks.

```text
Completed (reported): Foundations → Phase 1 → Phase 2A → 2B-0 → 2B → 2C → 2D → 3A → 3B → 3C → 3D-1
(0.14.0, migration 007, on the branch `phase-3d1`; `docs/phase3d1-plan.md`) → 3D-2 (0.15.0,
migration 008, same branch; `docs/phase3d2-plan.md`) → 3E (0.16.0, migration 009, same branch;
`docs/phase3e-plan.md`; review corrections 0.16.1, migration 010, and 0.16.2, migration 011); no phone install until after the owner's trip
                                                              ↓
Next:                          0.16.x to the phone after the trip (each step approved); Phase 4 only when asked
                                   ↓                 ↓                 ↓                     ↓
Later:                          Phase 4 Currency ──────────────────────────────────────────────┘
Independent UI tracks:          Phase 5 Route Map; Phase 6 Undated Trips; Phase 7 Maps Import; Phase 8 ICS
Pre-release:                    Feedback deployment + security check → integrated regression → controlled phone acceptance → friends beta → Play readiness
Deferred / discovery:           Gmail, passports, sync/accounts, automatic booking extraction, AI API, weather, iOS (§17)
```

Numbering 3B–3E follows the **approved Phase 3 audit**, not a promise of exact calendar dates. Each phase has an explicit exit gate.

## 6. Phase 3C — Adult/Child Pricing [DONE — v0.13.0; REVIEWED; AWAITING PHYSICAL VERIFICATION]

As built: `docs/phase3c-plan.md` (the owner's answers P-1…P-4, the representation, tests and the emulator E2E). The requirements below are kept as written.

### 6.1 Goal

Make mixed-group activity pricing clear without rewriting historic bookings or conflating a total with a per-person rate. Build on existing total-price and pricing-line UI/domain functions, especially `suggestPricingLines`.

### 6.2 Product requirements

- Support an optional pricing-line applicability classification: **Adult / Child / Anyone**, while retaining free-text labels and existing unit-price/quantity fields.
- Keep an explicit **fixed group total** workflow; do not force every booking into per-person pricing.
- Allow adult/child unit prices, including free child admission, and show quantities and calculated subtotals where the existing model supports them.
- Respect **Not specified** traveller classifications: do not assume Adult, and do not fabricate prices from membership.
- Preserve stored `price_amount` as the authoritative existing total unless the user explicitly confirms a new total. Existing price lines must continue to reconcile with the total under documented rules.
- Participant changes must **not** silently recalculate totals, paid status or historical price lines; suggestions are non-destructive and user-invoked.
- Distinguish a planning **estimate** from a real payment/confirmed booking. Existing boolean Paid is not proof of a payer or payment history.
- Use currency-specific minor units/rounding safely; no FX conversion yet.
- Handle no participants, one traveller, mixed adult/child, multiple children, zero/free lines, partial quantities, missing classifications, manually overridden totals and unusual currencies. **[Repo check]** Today a rate line's quantity must be a whole number of at least 1. A line with quantity 0 is refused, while a unit price of 0 (free) is allowed (`src/domain/pricing.ts`).
- **"Partial quantities" (owner, 20 October 2026): not fractional quantities.** Pricing quantities stay positive whole numbers (1 or more). A group that is only partly attending, or only partly priced, is represented by **separate pricing lines with whole quantities**, never by fractional people. No fractional quantities and no database change for this.
- **Scope confirmed by the owner (20 October 2026):**
  - a **user-invoked "Price for who's going"** calculation/suggestion;
  - **Adult / Child / Anyone** classification on pricing lines;
  - **free pricing lines**, including free child admission;
  - **optional extras** as separate pricing lines;
  - an **"Estimate"** label for prices on ideas.
- **Constraints with that scope (owner):** existing totals stay authoritative until explicitly changed; suggestions never silently overwrite prices; editing participants never recalculates the total; historical and paid booking values are preserved; an estimate is never confused with a confirmed booking or a payment; fixed group totals stay supported; no fractional quantities; new pricing metadata is never silently discarded by backup, restore, ZIP import/export or PDF export.
- **[Repo check]** The 3A audit's proposal: lines stored in `details.pricing.lines` gain an optional `for: 'adult' | 'child' | 'any'`. A missing value keeps the old free-label meaning. On that basis the plan expects 3C to need **no migration** (`docs/phase3-plan.md` §7, §12). §6.3 still requires this to be verified before coding.
- UI should progressively disclose advanced pricing, keeping ordinary activity creation simple.

### 6.3 Architecture audit required before coding

Inspect the actual SQLite columns, pricing-line domain functions, validation, forms, expense selectors, PDF, backups, single-trip ZIP, AI activity JSON and templates. Determine whether Adult/Child/Anyone metadata can live in existing fields **without lossy label parsing**. If a migration is actually needed, stop for owner approval; do not claim no migration merely because the initial roadmap anticipated one.

**Result (20 October 2026, `docs/phase3-plan.md` §19):** the metadata fits in the existing `trip_items.details` JSON, which full backups and trip archives already carry as an unparsed string, so **no SQLite migration is needed**. The check found no lossy workaround in the storage. It did find four questions to settle in the 3C plan before coding: how an older app treats the new metadata (a backup-format bump is recommended), how an extra is marked, a group total combined with extras, and applying a suggestion to a booking already marked paid.

### 6.4 Acceptance criteria

- Synthetic historical paid and unpaid bookings retain identical totals/status after an in-place upgrade and after participant changes.
- New rate classification and unit/quantity calculation are correct; explicit total reconciliation catches discrepancies rather than silently mutating totals.
- Every supported export/restore path preserves new pricing metadata or documents an explicitly approved compatibility strategy; no silent loss.
- Expenses and PDF totals remain correct and no new duplicate-cost path is introduced.
- Unit tests, TypeScript check, detailed emulator E2E, dark/small/large-font UX and signed release upgrade all pass.
- Commit, docs and evidence reviewed independently before Phase 3D-1.

**Exit check (2026-10-23): met.** Built as 0.13.0 (`docs/phase3c-plan.md`). Node: 1189 tests at the time, covering pricing, reconciliation, PDF text and the format-7 backup and rowFormat-7 archive round trips (which also read 6). Emulator E2E with a release update over 0.12.0, historical rows unchanged, and 360 dp / font 2.0 / dark: `%USERPROFILE%\Pictures\TravelOrganizer-0.13.0-3C-e2e\E2E-LOG.md`. The owner reviewed 3B and 3C (2026-10-21) before 3D-1 began. The plan records two deviations: no debuggable build (stored JSON was checked through the screens and the Node round trips), and the backup and PDF exports were covered by tests rather than on the device.

### 6.5 Explicit non-goals

No payer ledger, deposits, responsibility assignment, debt balance, currency conversion or automatic repricing of historic records.

## 7. Phase 3D-1 — Money Records, Deposits and Booking Links [DONE — v0.14.0; REVIEWED; AWAITING PHYSICAL VERIFICATION]

### 7.1 Goal

Represent actual payments independently of booking price. One €250 booking with €100 deposit and €150 final payment must remain **one €250 cost and €250 paid**, not €500 of costs.

### 7.2 Current limitations identified in Phase 3 audit (reported)

- `price_amount` is the stored total; `paid` is only boolean.
- Existing paid booking price edits can silently change the amount treated as paid.
- Booking costs are derived from activities; Quick Expenses are separate and can double count a booking if manually repeated.
- Legacy `paid_by`, `split` and name-based `payments` fields exist but are reportedly unused. Do **not** assume real historical values are empty.

### 7.3 Proposed model and constraints

- Introduce additive **schema migration 007** only after reviewing the exact SQL in `docs/phase3-plan.md` and obtaining approval. Audit proposes **three new tables and one new column**; the exact names/DDL must be read from the plan/code, not invented here. **[Repo check]** `docs/phase3-plan.md` §8 proposes:
  - three tables: `cost_payments`, `cost_shares` and `settlements`;
  - one column: `trip_travellers.responsible_id`.

  §17 of the plan, written after the owner's linking decision, also proposes a nullable `expenses.trip_item_id`, still "to be confirmed". As drafted, migration 007 is therefore three tables and up to **two** new columns. All of it is unwritten and unapproved.
- Track explicit payment amount, currency, payer traveller ID (nullable/unknown), payment date and booking/expense relationship; deposits and instalments are separate payment records against one underlying cost.
- Support a deliberate link between a booking and a related expense/payment, avoiding double counting; for unlinked suspected duplicates, show a warning without automatic merging.
- New expense payer defaults to **Not recorded**. A last-used payer may be suggested, never silently committed.
- Preserve legacy Paid as **“Paid — not recorded by whom”** where there is no recorded payer/ledger. Do not fabricate a payment transaction or paid amount without an approved reconciliation rule.
- Keep unused legacy fields/tables intact; avoid rewriting old data.
- Specify rules for payment amount > total, zero amount, different currency, deleting linked records, missing payer, booking edits after payment, and legacy paid flags **before coding**.
- Clarify source-of-truth and aggregation: booking cost + associated payment records must not be added as separate costs; define whether Quick Expense represents a standalone cost or a payment linked to a booking.
- **Required before implementation (owner, 20 October 2026):** a written distinction between a **standalone expense**, a **payment against a booking** and a **linked expense**. A booking and its payment records are never counted as separate costs.
- **Deleting a booking that has linked financial records (owner):** never cascade-delete payments, expenses or settlements. Ordinary deletion of such a booking is **blocked**, with an explanation. A later explicit resolution workflow preserves financial history, for example unlinking a standalone expense, or archiving/cancelling the booking while keeping its financial relationships. A booking payment is never silently turned into an independent expense, and a payment is never orphaned. The exact archive/unlink UI and the source-of-truth rules are proposed and approved before 3D-1 is implemented. **[Repo check]** The draft DDL in `docs/phase3-plan.md` §8 has `ON DELETE CASCADE` from `cost_payments` to `trip_items`/`expenses`; it must change before migration 007 is written (§18 there). The owner confirmed that this cascade is **rejected**: the schema and deletion behaviour are redesigned before migration 007 is approved.
- **Unresolved 3D-1 design question (owner):** what deleting a **whole trip** that holds linked financial records does. Recorded in `docs/phase3-plan.md` §18.2; decided in the 3D-1 proposal.
- **Linked records in different currencies (owner):** no automatic conversion and no adding of different currencies. In 3D-1, a linked booking payment must use the booking's currency; if the currencies differ, the link is blocked with a clear explanation and the records stay separate. No exchange rate is invented, and neither amount changes. Multi-currency reconciliation belongs to Phase 4 or a separately approved extension.

### 7.4 Backups, imports and migration

- Version full backups and single-trip archives to include new records and stable traveller-ID remapping. Older versions must restore with their original meaning and no invented money records.
- Test migration from schema 6 on **synthetic legacy databases**, including non-null, unexpected values in unused fields and partially populated historic records. Test interrupted migration, idempotent startup, restore, orphan references and atomicity.
- Do not inspect or request a real personal backup now. A separate owner-authorised isolated-copy rehearsal may be planned before physical installation.

### 7.5 Exit criteria

Financial invariants and aggregation tests pass, €250=€100+€150 example passes, historical rows survive, synthetic v0.12+/3C in-place upgrade passes, archive/full-backup round trips pass, and no physical device touched.

**Exit check (2026-10-23): met.** Built as 0.14.0 on `phase-3d1` (`docs/phase3d1-plan.md` §9–§11). Node: 1251 tests at the time, covering migration 007 over synthetic v6 databases with legacy values, aggregation (a property test included), the €250 = €100 + €150 example, refused writes leaving the database unchanged, backup format 8 (and 1–7) and archive rowFormat 8. Emulator: 6 → 7 on a debug-signed build with every old row identical, and a release `install -r` over 0.13.0. Log: `%USERPROFILE%\Pictures\TravelOrganizer-0.14.0-3D1-e2e\E2E-LOG.md`. A corrective pass followed the independent review (§11.1). No physical device was touched.

## 8. Phase 3D-2 — Financial Responsibility and Splits [DONE — v0.15.0; REVIEWED; AWAITING PHYSICAL VERIFICATION]

### 8.1 Goal

Represent who benefits from a cost, who owes the share and which adult covers a child's share, **without confusing attendance and liability**.

### 8.2 Requirements

- Per-trip responsible adult for each Child; per-cost override.
- If responsibility is absent, the child's share is **unallocated**, not silently charged to a guessed adult or represented as a child's personal debt.
- Participants need not equal beneficiaries, payers or cost sharers. A payer can be a nonparticipant; an activity can have no participants.
- Support explicit equal, custom amount and/or proportional splits only after deciding which modes fit the current UI. Do not infer them automatically from participant counts.
- Allocated shares must reconcile exactly to the intended cost total, with leftover minor units distributed in a documented deterministic order.
- Traveller removal must not erase financial history. If references exist, block destructive removal and offer an understandable safe resolution path; never force history deletion or silent reassignment.
- Preserve explicit overrides and historical responsibility if trip membership/classification changes later; decide snapshot-versus-live behavior before coding.
- Handle multiple children, absent adults, shared responsibility, someone joining/leaving, multiple currencies, and expenses without participants.
- Carried over from the 2026-10-19 roadmap: split modes are equally, custom amounts, or **by adult/child pricing**; *Paid by* on Quick Expenses and relevant bookings (3D-1).

### 8.3 Exit criteria

End-to-end synthetic family scenarios, orphan protection, exact reconciliation, backups/archives and regression tests pass. UI clearly distinguishes **going**, **paid by**, and **covered by**.

**Exit check (2026-10-23): met.** Built as 0.15.0 on `phase-3d1` (`docs/phase3d2-plan.md` §10–§12). Node: 1347 tests at the time, covering split exactness (a property test: Σ shares = total for 1–12 people), *Covered by*, refused leaves and orphan protection, migration 008, and backup format 9 / archive rowFormat 9. Emulator: synthetic family scenarios, 7 → 8 with every old row identical, and the phone's path, release 0.13.0 → 0.15.0. Logs: `…-0.15.0-3D2-e2e` and `…-0.15.0-3D2-final-e2e`. Two corrective passes followed the independent review, and the review of `a44dd6d` passed (2026-10-22).

## 9. Phase 3E — Balances and Settlements [DONE — v0.16.0–0.16.2; REVIEWED; AWAITING PHYSICAL VERIFICATION]

### 9.1 Goal

Show understandable financial positions: amount paid, amount owed, net balance and actual settle-up transfers, without storing fragile derived balances.

### 9.2 Requirements

- Derive balances from costs, allocations, payments and settlements **on demand**; do not store computed balance as independent truth.
- Settlement records reference traveller **IDs**, not display names; leave legacy name-based payment table untouched.
- Distinguish money paid to a vendor from transfers between travellers; a settlement is not an extra trip cost.
- Show unresolved/unallocated amounts explicitly; no invented payer, debt or settlement.
- Avoid duplicate counting when a booking is linked to an expense or paid in instalments.
- Define treatment of legacy paid-but-payer-unknown bookings (likely excluded from person-level balances until attributed, while still represented in trip cost/paid summary).
- Handle rounding, multiple payers, overpayments, missing payer, same-name travellers, removed travellers and different currencies.
- Refunds and negative adjustments are **out of Phase 3** unless separately approved; document limitations rather than silently treating them as normal positive costs.
- PDF may show aggregate **paid of total**; names and personal balances require a new opt-in and privacy-safe defaults.
- Carried over from the 2026-10-19 roadmap: *Who owes whom* / *Settle up*, with both **partial and complete** settlements.

### 9.3 Exit criteria

Reconciled totals in every test fixture, no duplicated cost, no false debtor, settlements don't alter trip cost, readable per-person explanation, archive/backup coverage, regression and emulator upgrade pass.

**Exit check (2026-10-23): met, with one rehearsal still open.** Built as 0.16.0, plus the review corrections 0.16.1 and 0.16.2, on `phase-3d1` (`docs/phase3e-plan.md` §10, §13–§15).
- **Node:** 1624 tests in 81 suites. Σ net = 0 per currency (property test). A booking, its payments and a linked expense count once. No person shows a non-zero net without a record in that currency. Settlements leave `tripExpenses`, `spendingTotals`, `tripTotals`, `paymentSummary` and the PDF unchanged. A person's working is shown line by line. Backup formats 10–12 and archive rowFormats 10–12 round-trip. Migrations 009–011 run over synthetic data, as 6 → 11 too.
- **Emulator:** release 0.13.0 → 0.16.0 (migrations 007–009 in one start-up). Debug-signed 8 → 9, 9 → 10 and 10 → 11, with every table identical.
- **Review:** the owner's independent review of 0.16.2 passed (2026-10-23).
- **Still open:** a **signed release** in-place upgrade to 0.16.1/0.16.2 (0.13.0 → 0.16.2, migrations 007–011 in one start-up, §19). No release APK exists for either version. The rehearsal belongs to the first step of bringing 0.16.x to the phone, after the owner's trip, and needs its own approval.

## 10. Phase 4 — Multi-currency Integrity and Conversion [BUILT — v0.17.0 on `phase-3d1`; AWAITING INDEPENDENT REVIEW]

As built: `docs/phase4-plan.md` (decisions P4-1…P4-8 taken in the owner's one-run instruction of 23 October 2026, listed for review), D45, technical reference §24. The scope below is kept as written.

### Goal

Support trips containing multiple original currencies without misleading combined totals.

### Scope

- Preserve every original transaction currency and amount permanently; never overwrite original with converted value.
- Define a trip/reporting base currency separately from transaction currency.
- Distinguish **original amounts**, **estimated conversions**, **locked/manual exchange rates** and **unknown rate**.
- Choose rate provenance, effective date and offline behavior before introducing external APIs. No silent online requests or paid service.
- Handle partial payments at different dates/rates, deposits, currency minor units (including zero-decimal currencies), rounding, refunds if introduced later and reports/PDF.
- Show per-currency subtotals when no trusted rate is available; never sum € + £ as a single number.
- Keep historical transaction records and financial balance meaning stable through migration/export/import.

**Gate:** Depends on a stable Phase 3 financial ledger. Requires separate plan, migration review if needed, synthetic tests and owner approval.

**Scope check (23 October 2026):**
- **Originals preserved:** nothing is overwritten. Migration 012 only adds; 11 → 12 on the emulator
  left 21/21 tables identical.
- **Reporting currency:** `trips.report_currency`.
- **Original, estimate, locked and unknown are distinct:**
  - an original amount shows *as recorded*;
  - an estimate is marked *≈* with its rate and date;
  - a *charged* amount is locked;
  - a currency with no rate is *not included*, named.
- **Rate provenance:** typed in, with a date. No online request.
- **Partial payments at different rates:** per-record charged amounts.
- **Zero-decimal currencies:** shown without *.00*; a converted total rounds to whole units.
- **Rounding:** exact BigInt arithmetic, half away from zero.
- **PDF:** one converted bookings line.
- **Per-currency subtotals:** always shown; € + £ is summed only through a stated rate.
- **Balances:** they stay per currency, so their meaning is unchanged.
- **Export and import:** backup 13 and archive 13 round-trip.
- **Not done:** three-decimal currencies keep the hundredths limit, refunds are still out, and there
  is no signed release upgrade yet (no APK, by the rules).

## 11. Phase 5 — Day Route Map [BUILT — v0.18.0 on `phase-3d1`; AWAITING INDEPENDENT REVIEW]

As built: `docs/phase5-plan.md` (decisions P5-1…P5-6 for review), D47, technical reference §25. The scope below is kept as written.

### Goal

Provide an optional map of a day's relevant stops and travel connections, complementing—not replacing—the existing Timeline and Google Maps directions.

### Scope

- Show geocoded places and relevant start/end bases for selected day; All days behavior must be explicitly designed.
- Handle arrival/departure endpoints, accommodation, overnight travel, undated items, duplicate coordinates, places without coordinates and timezone boundaries.
- Differentiate **pins/straight-line visualization** from **actual road/transit routing**; never imply straight lines are drivable routes.
- Avoid invented travel durations or distances; online routing requires user action/connection and clear fallback.
- Allow opening external Google Maps directions, using existing FROM/TO ordering and mode/origin semantics.
- Consider offline maps limitation, tile-provider licensing/cost, performance, accessibility and battery use.
- Map must not alter itinerary order or stored places merely by viewing.
- Carried over from the 2026-10-19 roadmap: markers in Timeline order; the base/accommodation handled; directions, or the day's route in Google Maps where supported; items without coordinates handled gracefully.

**Gate:** Map/provider architecture, privacy/cost decision and synthetic route E2E before implementation.

**Scope check (23 October 2026):**
- **Provider:** decided P5-1, an offline drawing. No tiles, key, cost or network; a tiled layer is
  left to the owner.
- **Places and bases:** geocoded places and the start and end bases of the day are shown. All days
  is designed as one day at a time (P5-4).
- **Edge cases handled:**
  - arrival and departure endpoints, overnight travel and accommodation;
  - undated and place-less plans, listed apart;
  - duplicate coordinates, as one pin with both numbers;
  - places without coordinates, named *not on the drawing*;
  - time zones, through the local day.
- **Straight lines** are labelled *not the way*. No durations or distances are invented, and routing
  happens in Google Maps by the person's tap.
- **Directions:** Google Maps opens with the stops in Timeline order. The existing A → B connectors
  are unchanged.
- **Read-only:** viewing changes nothing.
- **Not done:** a tiled map, and offline street maps.

## 12. Phase 6 — Trips Without Fixed Dates [BUILT — v0.19.0 on `phase-3d1`; AWAITING INDEPENDENT REVIEW]

As built: `docs/phase6-plan.md` (decisions P6-1…P6-13 for review), D48, technical reference §26.
Migration 014 rebuilds `trips` with nullable dates; backup/archive format 15. The scope below is kept
as written.

### Goal

Allow wishlist/future trips without committed start/end dates, while preserving current dated-trip behavior.

### Scope

- Distinguish undated trip, partially dated trip and fully dated trip; decide whether partial dates are supported.
- Define Home ordering and upcoming/past/ongoing semantics for undated trips.
- Adapt Timeline (day tabs, All days, date assignment), accommodation nights, transport, reminders and Overview.
- Clarify relative day planning (Day 1/Day 2) vs actual calendar dates; avoid inventing dates or timezones.
- Support later scheduling without losing items, IDs, documents, costs or participants.
- Update templates, PDFs, trip ZIP, full backups, AI planning context and imports.
- Revisit Phase 2D's previously N/A undated-trip E2E case.
- **[Repo check]** `trips.start_date` and `trips.end_date` are `NOT NULL` today, so this phase needs a schema migration. Under the data-safety rules, that migration is planned and approved before it is written.
- Carried over from the 2026-10-19 roadmap: shown as *Dates not set*; undated activities and/or relative trip days; safe conversion to a dated trip; no fabricated dates; no unintended change to existing dated trips.

**Gate:** Schema/API impact assessment and comprehensive dated-trip regression tests.

## 13. Phase 7 — Import From Google Maps Share Links [BUILT — v0.20.0 on `phase-3d1`; AWAITING INDEPENDENT REVIEW]

As built: `docs/phase7-plan.md` (decisions P7-1…P7-8 for review), D49, technical reference §27. No
migration. The scope below is kept as written.

### Goal

Save a shared place from Google Maps into the correct trip with minimal manual entry.

### Scope

- Android share intent/deep-link handling, supported Maps URL forms and safe fallback to manual paste.
- Parse only supported public place information; avoid relying on brittle undocumented APIs or hidden web scraping.
- User chooses trip and whether to save as place/idea; preview name, coordinates, address (if available) and URL before saving.
- Handle short links, redirects, offline state, unsupported links, duplicate saved places, malicious URLs, multiple trips and privacy.
- Do not automatically book, navigate or import private Google account data.
- Reuse Phase 2C duplicate/preview design where appropriate; preserve provenance of user-provided links.
- **[Repo check]** Some of this already exists. Share-to-app (S7, `expo-share-intent`, patched) saves a Google Maps share as a **link** resource, titled with the place name. It does not yet create a saved place with coordinates. The Android share-intent handling already exists, and its cold start was verified on a release build. The dev client cannot be cold-started by a share (CLAUDE.md finding 8).
- Carried over from the 2026-10-19 roadmap: investigate safe options for importing **many** saved places; no Google sign-in unless clearly justified; validate locations.

**Gate:** Verify actual Android intents and supported URL behavior on emulator; physical acceptance later.

## 14. Phase 8 — ICS Calendar Export [BUILT — v0.21.0 on `phase-3d1`; AWAITING INDEPENDENT REVIEW]

As built: `docs/phase8-plan.md` (decisions P8-1…P8-8 for review), D50, technical reference §28. No
migration. Checked with Mozilla `ical.js` in tests. Not yet imported into a real calendar app (needs a
phone). The scope below is kept as written.

### Goal

Export selected trip plans as a standard `.ics` file that calendar apps can import, without creating a sync service.

### Scope

- Select entire trip, days or activities; clearly distinguish one-time export from two-way calendar sync.
- Include only scheduled items with valid dates/times; decide date-only and all-day event behavior.
- Correct RFC 5545 escaping, UTF-8, timezone identifiers, overnight journeys, DST transitions, stable UID policy and event updates.
- Protect privacy: exclude booking codes, notes, documents, traveller identities and private URLs by default; preview options.
- Support local Share/Save and compatible import into common calendar apps; do not claim Google Calendar API integration.
- Avoid creating duplicate calendar entries on repeat export where possible through stable identifiers, but document calendar-app variability.
- Carried over from the 2026-10-19 roadmap: target Google Calendar, Apple Calendar and Outlook; no mandatory Google sign-in.

**Gate:** Standards-based parser tests and emulator share/open checks.

## 15. Cross-cutting quality and technical debt [CONTINUOUS]

### Reliability and data integrity

- Automated tests for all domain rules, SQLite migrations, transactions, foreign-key integrity, restore and import/export round trips.
- Stress tests: large trips, hundreds of activities, thousands of list items, large attachments, low storage, interrupted writes, process death, restart and repeated taps.
- Preserve app identity/signing across release upgrades; capture synthetic DB before/after to identify unintended changes.
- Review backup version compatibility whenever schema or file semantics change.
- Keep migration 007 isolated from pricing UI work until separately approved.

### UX and accessibility

- Android small-screen 360dp, dark mode, font scales 1.3/2.0, keyboard overlays, TalkBack by ear, three-button navigation and landscape (where supported).
- Reduce overloaded screens; keep everyday tasks simple, advanced financial controls progressive.
- Validate empty/error/offline/loading states and clear recovery messaging.
- Test long Bulgarian/English labels, Unicode traveller names, duplicate names and long trip titles.

### Security and privacy

- Local files and documents should not leak via temporary shared-file URIs or logging.
- AI context and JSON exports use explicit privacy boundaries; never export passport/payment data by accident.
- Sanitize imported ZIP/JSON paths, sizes, nesting and malicious payloads; avoid zip bombs and prototype pollution.
- Avoid embedding secrets or production API credentials in the APK.
- Consider future encryption, document retention and device-loss recovery before introducing passports or cloud accounts.

### Performance

- Monitor shared `useLiveQuery` debounce introduced during Phase 2C; confirm normal edits/deletes appear promptly without excessive redraw.
- Large import previews currently render all rows; consider virtualization if real-world usage justifies it.
- Profile PDF generation, route maps, attachment loading and complex financial summaries on modest Android devices.

### Documentation

- Keep `docs/status.md` / product status accurate and distinguish **implemented**, **emulator verified**, **independently reviewed**, **awaiting physical verification**, **deferred**.
- Each phase must update roadmap, technical reference, decision log, user guide and handoff as relevant.
- Preserve historical decisions rather than rewriting the past. Link implementation commits and test evidence.

## 16. Beta release and distribution track [AFTER FEATURE ROADMAP OR OWNER-APPROVED REPRIORITIZATION]

### 16.1 Integrated acceptance

- Independent code review of recent phases and data-safety hotspots.
- Synthetic full-backup restore and single-trip transfer across versions.
- In-place signed release upgrade on emulator through relevant migration chain.
- Test offline availability of documents and all core trip screens.
- Resolve blocking UX, crash, duplicate-cost, traveller and data-loss issues.
- Only with owner approval: create and verify backup, rehearse on isolated copy, install in place on primary phone, then run non-destructive real-trip acceptance. Do not delete/recreate real trips.

### 16.2 In-app feedback (separately proposed) — **[Repo check] built in v0.7.2, switched off**

**[Repo check]** The form exists in the code (`c1d439a`, `f884fa6`; `app/feedback.tsx`, `src/repositories/feedbackDraft.ts`, `src/services/feedback.ts`, `server/feedback-worker/`). It is hidden behind `FEATURE_FEEDBACK_ENABLED`, which defaults to **off**. When the flag is off, every entry point is hidden and `/feedback` redirects to Home (D31, `docs/product-status.md` §2).

The Cloudflare Worker and its email key are **not deployed**, so in practice nothing can be sent. The code matches the requirements below: the draft persists, the message is cleared only after the server accepts it, the name is kept, and no trip data is sent.

The recorded verification is automated tests and local draft persistence (`docs/product-status.md` §2). With no worker deployed, it has never sent a real message.

Owner previously requested a minimal form for friends to jot observations, close/reopen and send once ready:
- **Name** (optional) and **Message** (required); single app-wide persistent draft.
- Save locally while typing, across app restarts; clear message **only after confirmed server acceptance**; retain name.
- No external mail composer or `mailto:`. No automatic trip data or documents attached.
- Fixed owner-controlled email recipient; secure HTTPS endpoint/service, server-side secrets, validation, rate limits, abuse/spend controls and idempotent retries.
- Do not deploy paid/public infrastructure or send test mail without owner authorization. If backend is not approved, do not fake a successful Send.

**Timing (owner, 20 October 2026):** the form is enabled, and its email worker deployed, **before the first APK is distributed to friends for testing** — not during Phase 3C. Until then the form stays disabled.

**Pre-beta task: feedback deployment and security verification** (separate task, `docs/status.md` *B1*; approved/planned, not authorised yet). It covers:
- a secure HTTPS endpoint;
- secrets held on the server only;
- input validation and rate limiting;
- abuse protection and cost limits;
- no personal trip data included automatically;
- the draft persists and is cleared only after the server confirms acceptance;
- real end-to-end delivery verification, with the owner's explicit approval.

No infrastructure is deployed and no test email is sent until the owner approves that task.

### 16.3 Friends-only APK

**[Repo check]** One friends-only beta has already been distributed (v0.7.3, `release/TravelOrganizer-0.7.3-beta.apk`, gitignored), and its feedback became Phase 1. This section covers the next beta round.

- Stable signed APK with clean initial data, install/upgrade instructions and clear tester scope.
- No personal trip content, production credentials or secrets bundled.
- Consent/privacy disclosure appropriate to any feedback diagnostics.
- Versioning, crash reporting choice, feedback triage and rollback/restore procedure.
- Track defects separately from feature ideas.

### 16.4 Public Google Play readiness (future decision)

- Product positioning, screenshots, store listing, privacy policy, data safety declarations, accessibility, support/contact channel.
- Android target SDK, Play policies, app signing, update strategy and release testing.
- Decide whether free offline-only app is sufficient before committing to account/backend complexity.
- Do not publish without explicit owner approval.

## 17. Longer-term backlog [DEFERRED OR DISCOVERY — NOT COMMITTED]

These are possibilities, not approved implementation work. Reassess value, complexity, privacy and cost before prioritising. Each item carries a status from §1.1; none is excluded, and moving one to Approved/planned is the owner's decision. *(Statuses assigned by the coding agent from the wording below, 20 October 2026; the owner may move any of them.)*

1. **[Discovery] Gmail confirmation lookup:** A separate PoC reportedly opened Gmail search for a booking reference, not guaranteed exact-message deep links. Avoid promising universal direct email linking. Gmail-only search may be useful, but is brittle; universal provider integration needs separate design. **[Repo check]** The 2026-10-19 roadmap records the proof of concept as verified **outside this repository** and not integrated. Its Gmail-specific native approach was postponed in favour of something universal: forwarding, shared files, or `.eml` attachments.
2. **[Discovery] Universal booking import:** Parse shared emails/PDFs into reviewable draft bookings with provenance, confidence, duplicate detection and zero automatic mutation; account permissions and privacy require separate approval.
3. **[Discovery] Passport/traveller identity vault:** High sensitivity; require encryption, device security, key recovery, sharing/export controls and legal/privacy review before collecting data.
4. **[Discovery] Shared trips, accounts and multi-device sync:** Identity, conflict resolution, offline edits, permissions, end-to-end encryption considerations, account deletion and migration from local-only storage. No Firebase commitment yet.
5. **[Discovery] Peer-to-peer local sharing:** Discovery only; complexity of conflict resolution and data exposure may outweigh benefit.
6. **[Deferred] iOS release:** Platform audit for file sharing, SQLite, notifications, deep links, maps, PDF, in-app purchases (if ever), signing and QA.
7. **[Discovery] Automatic trip email linking and document extraction:** Only with explicit access scopes and per-import review.
8. **[Discovery] AI API integration:** Not needed for existing manual Copy/Share/JSON workflow; would introduce ongoing cost, privacy and prompt-injection issues.
9. **[Deferred] Shopping-list estimated prices:** Distinguish preparation estimates from actual expenses.
10. **[Deferred] Full itinerary templates:** Current template scope is primarily reusable tasks, notes and lists; richer day-by-day templates need separate decisions.
11. **[Deferred] Business model / monetisation:** Not a current requirement; revisit after user feedback.
12. **[Discovery] Notification/reminder improvements and aurora/weather/travel monitoring:** Separate opt-in, source accuracy and network/privacy decisions.

## 18. Product rules and decisions that must not drift

- No merging travellers based solely on matching names.
- Never silently classify Not specified as Adult.
- Me is a persistent link to a traveller profile, not a duplicate identity.
- No automatic addition of newly joined traveller to existing plans.
- AI-imported activities have no participants in the current behavior; revisit only with explicit product approval.
- Activity `planned` ≠ booked, paid or confirmed.
- Price suggestions never silently overwrite saved totals.
- An expense and a booking referring to the same real cost must not be counted twice; explicit linking is the target architecture.
- New expense payer defaults to Not recorded.
- Child financial responsibility is assigned to an adult when explicitly configured; otherwise remains unallocated.
- Payment ≠ expense; settlement ≠ expense.
- No silent automatic currency conversion.
- Pricing quantities are whole numbers of at least 1; a partly attending group is separate lines, never fractional people.
- A booking with linked financial records is never cascade-deleted with them; deletion is blocked until an explicit resolution.
- A linked booking payment uses the booking's currency (until Phase 4); a different currency blocks the link.
- "Not building now" never means "never building" (§1.1).
- Personal financial data in PDF/export remains opt-in where approved.
- AI planning exports exclude sensitive fields by default and show exact preview.
- User explicitly controls real-device testing, release distribution and infrastructure spending.

## 19. Phase completion checklist (repeat for every stage)

**Before implementation**
- [ ] Verify branch, remote head, working tree, latest docs and schema.
- [ ] Read the relevant phase plan and trace impacted code paths.
- [ ] Record unresolved product decisions and obtain approval.
- [ ] Define migration/backup compatibility and synthetic fixtures if relevant.

**Implementation**
- [ ] Keep changes within the approved stage.
- [ ] No silent data mutation or unrelated feature rewrites.
- [ ] Unit/domain/repository tests and TypeScript checks.
- [ ] Synthetic emulator E2E, failure injection where applicable, crash/restart, repeated taps and offline cases.
- [ ] Small screen, dark mode, large font and accessible labels.
- [ ] In-place signed release upgrade from preceding version on synthetic data.
- [ ] Compare DB snapshots and verify intended vs unintended changes.
- [ ] Regression checks: trip ZIP, full backups, PDFs, AI import/export, Plan with AI, lists and travellers as applicable.

**Completion report**
- [ ] Version/versionCode, exact commit SHA and changed files.
- [ ] Behavior summary and deliberate deviations from plan.
- [ ] Test counts, E2E PASS/FAIL/NOT TESTED matrix and evidence paths.
- [ ] Schema/migration and backup-format changes or explicit none.
- [ ] Data-preservation evidence, limitations and unresolved risks.
- [ ] Docs updated and commit pushed only after verification.
- [ ] Stop at phase boundary; await owner approval.
- [ ] ChatGPT independently attempts commit/diff review and records what was actually checked.

## 20. Immediate next actions

*Updated 2026-10-23: Phase 3 is closed (§6–§9 exit checks).*

1. **After the owner's trip, bring 0.16.x to the phone.** Each step needs its own approval:
   - build a signed release;
   - rehearse 0.13.0 → 0.16.x on an emulator over synthetic data, with database snapshots compared;
   - the owner exports a backup;
   - merge `phase-3d1` into `main`;
   - install on the phone.
2. **Phase 4** (§10), only when the owner asks. It needs its own plan, a decision on where exchange rates come from, and a migration review.
3. **Later:** independently plan Phases 5–8; do not pre-approve unspecified implementation details.
4. **Before friends beta:** the feedback deployment and security task (§16.2, *B1*), then controlled testing on the secondary phone in an owner-approved session (§3.1), distribution and privacy requirements.

## 21. Open points from the repository cross-check (20 October 2026) [ANSWERED BY THE OWNER, 20 OCTOBER 2026]

None of these was resolved by choosing an interpretation. The owner answered all six (five below, plus the 3D-1 linking questions); the answers are applied in the sections named and in decision-log D38. The original questions are kept below for history.

| # | Owner's answer | Applied in |
|---|---|---|
| 1 | A separate **secondary** Android phone may be used for controlled beta testing before the feature phases end, only in a session the owner explicitly approves; synthetic data only; never the primary phone. Permission to plan, not to install. | §3.1, §20 |
| 2 | Reconcile with the five-status vocabulary (Implemented, Approved/planned, Deferred, Discovery, Explicitly excluded). "Not building now" ≠ "never building"; Gmail, accounts/sync, AI integrations and weather are kept as Deferred or Discovery; no idea removed. | §1.1, §17, `CLAUDE.md` §7 |
| 3 | Not fractional. Quantities stay whole numbers ≥ 1; partly attending groups are separate lines. No database change. | §6.2 |
| 4 | Scope confirmed: Price for who's going (user-invoked), Adult/Child/Anyone, free lines, optional extras as separate lines, Estimate on ideas — with the constraints in §6.2. Verify the schema first; stop if a migration is needed. | §6.2, §6.3, `phase3-plan.md` §19 |
| 5 | Enable the form and deploy the worker **before the first friends APK**, not in 3C; a separate pre-beta deployment and security task. Nothing deployed and no test email now. | §16.2, `status.md` *B1* |
| 6 | 3D-1: deleting a booking with linked financial records is blocked (no cascade, no silent conversion, no orphan), resolved by a future explicit workflow; linked payments must share the booking's currency (no conversion); the three money records are defined before implementation. | §7.3, `phase3-plan.md` §18 |

*Original questions:*

1. **When physical-device testing happens.** §3.1 defers physical acceptance until the planned feature phases are finished. That rule is new, and no earlier document records it.
   - The 2026-10-19 `docs/roadmap.md`, and the handoff entry for that day, said to verify "on the emulator or the separate beta phone".
   - Since the start of Phase 3, the owner's instructions forbid connecting **any** physical device.
   - The concise `docs/roadmap.md` now follows those instructions: no physical device without explicit permission. Confirm whether the beta phone may be used again before the feature phases end.
2. **"Explicitly not building" in `CLAUDE.md` §7 compared with §17 here.** CLAUDE.md lists these as not being built: AI features in the app, Gmail integration, cloud backend, accounts, collaboration, weather, and automatic booking parsing. §17 here keeps most of them as **uncommitted discovery** items: AI API, Gmail lookup, sync and accounts, shared trips, aurora/weather monitoring, and booking import. Both documents treat them as unapproved, so nothing conflicts today. CLAUDE.md is unchanged; if one of these is ever approved, CLAUDE.md §7 changes with it.
3. **"Partial quantities" in 3C (§6.2).** Pricing lines accept whole quantities of at least 1. Fractional quantities would be new behaviour, and the 3C plan must ask about them.
4. **3C name and scope.** The 3A audit (`docs/phase3-plan.md` §9, §12) includes these in 3C:
   - **Price for who's going**: fills quantities from classifications, counting unspecified people as *Anyone*;
   - free and extra lines;
   - an *Estimate* label for ideas.

   §6 here neither lists nor excludes them. Confirm them in the 3C design.
5. **Feedback form timing (§16.2).** The form is built but switched off. Deploying the Worker means outside infrastructure and an email-service key, which needs the owner's approval. When to do it is still open, as §16.2 says.

---

### Maintenance instructions for future coding agents

This document is a **living product roadmap**, not a command to implement everything. Update the milestone table, next gate, dependencies and accepted decisions after each approved phase. Preserve distinctions among *reported*, *verified in code*, *tested on emulator*, and *tested on physical device*. Link to the detailed phase plan rather than duplicating exact SQL or implementation internals that may change. Do not quietly reinterpret owner decisions; propose and document amendments. When a phase is complete, update the roadmap in the same commit as the implementation, and stop for the next approval.
