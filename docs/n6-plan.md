# N6 — A journey's time zone from its city: the plan, and how it went

**Why:** the owner's real data (2026-10-11) had no item with a zone of its own, so four flight
times in Munich and Frankfurt were read in Helsinki time: an hour out in the countdown, *Up next*
and reminders, while the screen showed the times as typed. Decision log D26.

The plan was shown to the owner before any code and approved as recommended (decisions A–D). The
owner chose to combine the fill with a one-tap hint, and to add the flag on old items. They also
asked for the zone control to look tappable. They fix their own four times on the phone.

Status: ✅ done as planned · ⚠️ done differently, reason given · ⬜ not done yet.

## Decisions

| | Decided |
|---|---|
| A | *Use Helsinki time* **pins** the trip's zone explicitly, so the hint stays gone |
| B | An existing item opened in Edit shows the fill and hint; saved only on Save |
| C | The detail page shows a notice with a one-tap **Use Berlin time** |
| D | Wording: *"Munich is on a different clock, so this time is in Berlin time."* |
| — | Transport only (From/To); a date without a time gets no hint *(decided while building: it has no clock reading to be wrong)* |

## Step 1 — The rules, pure and tested (`src/domain/zoneHints.ts`) ✅ `6a09622`, `9c2875b`

`zoneForPlace`, `differentClock`, `zoneSuggestion`, `withSuggestedZone`, `withLegZones`,
`zoneHint`, `zoneMismatches`, `withMomentZone`, and their wording. **21 tests**, invented data:
Munich/Frankfurt → Berlin; Sofia on a Helsinki trip → nothing; trailing spaces; *München*;
Australia → nothing; partial names → nothing; London vs UTC differing in July only; a time with a
zone → nothing; the one-tap change keeping everything else, and refusing an arrival before the
departure.

⚠️ The first summer-time test compared Lisbon and London, which never differ, so it proved nothing.
It was replaced before commit.

## Step 2 — The zone control as a chip (`MomentField.tsx`, `Icon.tsx`) ✅ `9c2875b`

🌐 *Helsinki time* ⌄ in the accent colour, with button role, a screen-reader label and an expanded
state. Icons `zone`, `expand`, `warning` added by meaning. The picker's *Use the trip's timezone*
pins instead of clearing when the city would refill it, and is hidden once the trip's zone is set.

## Step 3 — Fill from the city, with the hint ✅ `9c2875b`

⚠️ **Changed from a per-field effect to one pure step per change**: two ends filled in the same
render would each start from the same stale leg, and the second would drop the first.
`withLegZones` runs in `JourneyFields`' single `change`; `ItemForm` has one effect for a single
transport item, which also covers opening an existing one (decision B). Checked that `followStart`
keeps the arrival's own zone when the departure moves.

## Step 4 — Flag old items, one-tap fix (`ZoneNotice.tsx`, item detail) ✅ `9c2875b`

Through `withMomentZone` → the existing `updateTripItem`; no new SQL. A refused change alerts and
points to Edit.

## Step 5 — Verify, document, release

**On the emulator, dev build, with the owner's real backup (testing only):**

| Check | Result |
|---|---|
| The four Munich/Frankfurt times flagged, and nothing else (the train, same clock, is not) | ✅ |
| One tap on *Frankfurt - Sofia* | ✅ *19:45 · Berlin*, notice gone, arrival and reminder untouched |
| Edit on it | ✅ *Berlin time* chip, the hint, *Use Helsinki time*; the arrival in Sofia keeps Helsinki time with no hint |
| *Use Helsinki time* | ✅ Pins; nothing refills it; leaving without saving changes nothing |
| Edit + Save on *Munich - Helsinki* (decision B) | ✅ *08:15 · Berlin*, reminder still *Off* |
| A new journey Sofia → Munich → Helsinki | ✅ Arrival 07:40 in Munich and departure 09:00 from Munich both fill *Berlin time* with the hint; Sofia's undated departure gets nothing; discarded unsaved |

**Release 0.3.1 (versionCode 5)**, built from `9c2875b` + version bump, signed with the release key
(`63:8D:C6:86…52:35:E7`), new code confirmed in the bundle. Kept as
`%USERPROFILE%\.travel-organizer\travel-organizer-0.3.1.apk`.

**Update rehearsal:** fresh 0.3.0 → the owner's backup → timeline recorded (identical to the 0.2.0
baseline) → `install -r` 0.3.1 → first-install time unchanged, no errors, **timeline identical**,
alarms 8 → 8. In the release build: the notice and one-tap fix on *Munich - Helsinki*, and the chips
in Edit.

**Tests:** 517, typecheck clean. **Docs:** user guide (time zones, checklist), technical reference
§4, decision log D26.

⬜ **The phone:** `install -r` 0.3.1 when the owner next connects it. No migration, and nothing is
written to the stored data unless the owner taps a fix or saves.
