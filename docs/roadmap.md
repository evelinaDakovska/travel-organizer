# Roadmap

The owner's development roadmap, agreed **2026-10-19** after the first friends-only beta (0.7.3)
was tested on a second, smaller Android phone. Phases are done **in order, one at a time**, and a
phase starts only when the owner asks for it — finishing one is not permission to begin the next.

Status of each phase lives in [`status.md`](status.md) (section *P*); this file is the scope.
Rationale for the change of direction: [`decision-log.md`](decision-log.md) D32.

| Phase | Scope | State |
|---|---|---|
| **1** | UI & navigation: trip context in tab headers, active bottom tab, *Notes & lists* label on small phones, bottom-sheet corners | **done — 0.7.4**, on the emulator; awaiting review |
| **2** | Single-trip import/export and AI JSON import | **2A plan written** ([`phase2-plan.md`](phase2-plan.md)); **2B-0 done — 0.8.0** (Me, several people per list item); **2B done — 0.9.0** (single-trip export/import); 2C–2D wait for approval |
| **3** | Travellers, pricing and shared expenses | not started |
| **4** | Currency conversion | not started |
| **5** | Full-day map | not started |
| **6** | Trips without fixed dates | not started |
| **7** | Google Maps place import | not started |
| **8** | Google Calendar export (.ics) | not started |

**Data safety holds for every phase** (owner's rules, unchanged): never uninstall the app from the
owner's primary Samsung phone, never clear its data, never touch real trips or the production
database, never change the application id or the signing key, never install on the primary phone
without explicit permission. Verify on the emulator or the separate beta phone. Any migration is
explained and agreed before it is written.

---

## Phase 1 — UI & navigation improvements

1. Trip context in internal tab headers: the destination clearly visible (high-contrast,
   semibold, smaller than the tab title), dates secondary. Overview keeps its treatment.
2. A clear active state on the trip's bottom tab bar: accent icon, semibold label and a restrained
   indicator — never colour alone; height unchanged; accessible selected state.
3. *Notes & lists* never wraps on a small phone: one line for every label, icons aligned, the bar's
   height constant; a short label (*Notes*) only where the full one cannot fit.
4. One clean rounded top edge on every bottom sheet — no double corners.

No schema change.

## Phase 2B-0 — "Me" and several people per list item (prerequisite, done in 0.8.0)

A persistent "Me" — one traveller profile marked as the person using the app, linked to an existing
profile or created, added to existing trips only after a confirmed preview, ticked on every new
trip — and packing/shopping items for any number of people. Migration 006, backup format 6. D33.

## Phase 2 — Single-trip import/export & AI JSON import

- Export and import one trip independently of the full backup, optionally with its attachments,
  as a portable zip.
- Import activities into an existing trip from structured JSON.
- Export an AI-friendly JSON schema/template to give ChatGPT or another assistant, and an optional
  sanitised trip-planning context so it can generate compatible activities.
- Validate incoming data; show a preview; detect possible duplicates; choose which activities to
  import.
- Add-only by default, never overwriting automatically; atomic import with safe rollback.

The point of the phase: plan a trip with an AI assistant and import its itinerary directly. The
app itself still has no AI features — it reads a file.

Groundwork already in the code: `filterTablesForTrip` (`src/domain/export.ts`) builds a backup of
one trip in the existing format.

## Phase 3 — Travellers, pricing & shared expenses

- All trip travellers selected by default on a new activity; add or remove per activity.
- Adult and child unit prices, totals from the selected participants.
- Adding a traveller to a trip with activities: an optional *Add to existing activities* toggle,
  off by default.
- Per trip, which adult is financially responsible for each child, overridable per expense.
- *Paid by* on Quick Expenses and relevant bookings.
- Splitting: equally, custom amounts, or adult/child pricing. *Who owes whom* / *Settle up*, partial
  and complete settlements.
- Participation, expense responsibility and actual payment kept strictly apart.
- No silent recalculation of historical or already-paid booking amounts.

Supersedes N5b. Groundwork: migration 002 already holds `expenses.paid_by`, `expenses.split` and
the `payments` table; migration 004 holds adult/child classification; `docs/expenses-spec.md` is
the earlier spec.

## Phase 4 — Currency conversion

A primary (reporting) currency per trip; expenses kept in their original currency and converted
for reporting; the original amount, currency and the rate used preserved; balances correct across
currencies; explicit rounding and historical-rate rules.

Reverses the earlier rule *"currencies are never converted"* (status.md U, D25) — see D32.

## Phase 5 — Full-day map

A map of every geolocated activity and place on a selected day, markers in Timeline order, the
base/accommodation handled, directions or the day's route in Google Maps where supported, items
without coordinates handled gracefully.

## Phase 6 — Trips without fixed dates

Trips with no start/end dates (*Dates not set*), undated activities and/or relative trip days, safe
conversion to a dated trip. No fabricated dates; no unintended change to existing dated trips.
Today `trips.start_date` / `end_date` are `NOT NULL`, so this phase will need a migration —
planned and agreed first.

## Phase 7 — Google Maps place import

One place from a Google Maps shared link; investigate safe options for many saved places; no Google
sign-in unless clearly justified; validate locations and avoid duplicates. (Share-to-app already
turns a Maps share into a link titled with the place — S7.)

## Phase 8 — Google Calendar export

Selected activities or the itinerary as an `.ics` file for Google Calendar, Apple Calendar and
Outlook, with correct dates, times, zones and all-day events. No mandatory Google sign-in.

## Deferred / future

- **Email confirmation import.** The standalone Gmail search proof of concept was verified outside
  this repository; integrating its Gmail-specific native approach is deliberately postponed in
  favour of something universal (forwarding, shared files, `.eml` attachments). Not integrated.
- Cloud accounts and synchronisation; shared trips and collaborative editing; local-first sync.
- iOS.
- Google Play public release.
