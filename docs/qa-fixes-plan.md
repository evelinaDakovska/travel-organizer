# Fix plan — D-01 and D-03 from the Beta phone QA

Written 2026-10-25, after the real-device QA of Travel Organizer Beta 0.21.0 on the owner's Samsung
(evidence: `%USERPROFILE%\Pictures\TravelOrganizer-0.21.0-beta-phone-qa\QA-MATRIX.md`).
**Status: proposed — waits for the owner's approval. No code is written yet.**

Both fixes are code-only: no migration, no change to the database, the backup format or the signing.

## D-01 · P1 · Edit trip silently removes the trip's travellers

### What happens
`app/trip/[tripId]/edit.tsx` renders `TripForm` as soon as the **trip** query is ready. The **members**
query (`listTripTravellers`) usually resolves a moment later. `TripForm` copies
`defaultTravellerIds` into `useState` once, when it first renders (`src/features/trips/TripForm.tsx:41-43`),
so the members that arrive later are never ticked. Saving then calls `updateTripWithMembers`, which
removes every member who is not ticked (`leaveTrip`, which also drops their item participation).
On the phone: members shown unticked in 11 of 12 openings; saving a notes change removed both
travellers of a trip. A member with money records is refused instead (error shown, nothing saved).

**Stable 0.7.2 has the same code** (`065d6bb`), where `removeTripTraveller` deletes membership and
participation.

### Fix
1. `edit.tsx`: treat the screen as loading until **both** queries are ready —
   `queryView(tripQuery)` *and* `queryView(membersQuery)` — and only then render `TripForm`. The form then
   mounts with the real member ids. (A failed members query shows the same "could not load" state as a
   failed trip query, never an empty selection.)
2. No change to `TripForm`'s `useState`: re-seeding it from props later would throw away what the person
   has ticked or unticked meanwhile.
3. No change to `updateTripWithMembers`: unticking everyone on purpose is a valid edit.

### Tests
The project has no UI tests by design (CLAUDE.md §8). So:
- a small pure helper in `src/hooks/queryView.ts` that says whether a query has *loaded* — `'ready'` or
  `'empty'` (a trip with no travellers is loaded too); `'loading'` and `'failed'` are not — unit-tested
  and used by `edit.tsx` for the members query;
- **manual, repeated:** open Edit trip 12 times on the emulator and on Beta (same device and trips as the
  QA) — members ticked every time; save a notes change — the members are kept (database check).

## D-03 · P2 · After a cold start, a share (or a tapped reminder) is hidden under the trip in progress

### What happens
At start-up `ShareLanding` (`app/_layout.tsx`) pushes `/share`. Then Home's trips query resolves and
`app/index.tsx:55-60` pushes the single active trip **on top** of the share screen. The share screen has
already cleared the share by then (`app/share.tsx:58`), so "is a share pending?" is no longer a reliable
signal. Reproduced 2/2 on the phone. The same race applies to a **reminder tapped while the app is
closed** (`src/notifications/useReminders.ts:52` pushes the item). **Stable 0.7.2 has the same auto-open
code.**

### Fix
In `app/index.tsx`, open the active trip only if Home is still the screen on top when the trips arrive:
`const navigation = useNavigation()` (expo-router), and in the effect, if `!navigation.isFocused()`,
mark it handled (`openedActiveTrip = true`) and do nothing. Whatever was opened first — a share, a
reminder, a link — stays on top. If the trips arrive first, the trip opens and a later share still lands on
top of it, as today.

The decision goes into a pure function, `shouldOpenActiveTrip({ alreadyOpened, homeFocused, trips })`
next to `singleActiveTrip` in `src/domain/itinerary.ts`, with unit tests (not focused → no; already opened →
no; no single active trip → no; otherwise → that trip).

### Tests
- Unit tests above.
- **Manual on a release build** (the dev client cannot be cold-started by a share, CLAUDE.md finding 8):
  with a trip in progress, force-stop, share a Maps link → the share screen is on top (repeat 3×);
  cold-start from a tapped reminder → the item is on top; a plain launch still opens the trip in progress.

## Delivery

1. Implement both on `phase-3d1` as **0.21.1** (versionCode 34), with the tests; full suite and `tsc`.
2. Emulator check, then **owner approval to build and install Beta 0.21.1** over Beta 0.21.0
   (`install-beta.mjs --replace`; Beta only, user 0). Re-run the manual checks above on the phone.
3. Update `status.md`, the QA matrix, and `user-guide.md` if wording changes.

## The owner's Stable app (0.7.2) — a decision for the owner

Both defects are in the app holding the real trip. Options:

- **A — guidance only (recommended for now).** Until the post-trip upgrade: in Edit trip, check that
  the travellers are ticked before Save; after sharing to a closed app during a trip, press Back once
  to find the share screen. No install on the primary phone before the trip, as agreed.
- **B — a Stable hotfix**, branched from `5f7f013` (0.7.2) with only these two fixes: schema stays 5,
  no migration, release key, a versionCode above 12 (and every later build above it). It is still an
  install over the real data, so it needs: the authentic 0.7.2 APK (the copy pulled on 2026-10-24 should be
  kept in `%USERPROFILE%\.travel-organizer\` first), an in-place upgrade rehearsal on an emulator, and the
  owner's explicit go-ahead — under the rule, only if the owner judges it risk-free.

## Not in this plan

D-02, D-04, D-05 and the observations O-01…O-08 (all P3) — listed in the QA matrix; to be planned
separately if wanted.

---

# Part 2 — every remaining finding (owner, 2026-10-25: "fix all the findings")

Scope: everything found since the phone was first connected on 2026-10-24, so the rest of the Beta
phone QA (D-02, D-05, O-01…O-13) and the code findings of the release-readiness audit (F-01…F-19).
Items that cannot be fixed in code (the owner's keystore copy, decisions, tests needing another phone)
are listed with what is needed instead. Delivered as **0.21.2** (versionCode 35) on `phase-3d1`.
No migration and no change to stored data. Stable stays untouched (Option A).

## Fixes in the app

| ID | Fix |
|---|---|
| D-02 | Adding a traveller whose name is already saved asks first ("There is already Anna Test. Add another person with the same name?"): a warning, never a block |
| O-07 / O-09 | Where profiles share a name, each gets a hint telling them apart: the trips it is on, or "Not on a trip yet" (Edit trip / New trip *Travelling with*, Travellers screen) |
| D-05 | The itinerary PDF is retried once when the printer fails, and a failed (empty) print file is deleted |
| O-01 | The end zone of a journey is not named when it is the trip's own zone, matching the start |
| O-02 | Editing a cost's amount while a *charged* amount is recorded says so beside it: "The charged amount was entered for EUR 450.00 — check it still matches" |
| O-03 | Saving a cost with a missing field shows the problem in a message instead of an error off-screen |
| O-04 | *Use in a trip* shows trip dates as everywhere else ("18–23 Dec 2026"), not ISO |
| O-05 | The day map calls a rental car's start *Pick up* (and its end *Drop off*), as the Timeline does |
| O-06 | The PDF's booking-cost line no longer reads "EUR 1850.00 in EUR." |
| O-08 | Exports (backups, trip files, PDFs, calendar and activity files, viewer copies) are removed from the cache at start-up once older than a day |
| O-10 | Timeline times never break inside the number at large font sizes |
| O-11 / O-12 | At large font sizes: the tab labels and header actions stop growing past a readable cap, the Overview subtitle and the *Add new traveller* button wrap instead of truncating, and Overview's zone line stacks above *Full itinerary* |
| O-13 | Backup gets **Save to this phone** beside *Export everything*: the system's *save to folder* screen (Downloads, any folder), so a backup can be kept on the phone or a USB/SD card without a cloud app |

## Fixes from the audit

| ID | Fix |
|---|---|
| F-01 | A runner-level test: a populated schema-5 and schema-6 database (every table with rows) through the real `migrate()` to 14 on a file database; every row kept, `integrity_check` and `foreign_key_check` clean, and the schema equal to a fresh database's |
| F-02 | A database that cannot open or update no longer crashes on every launch: a screen says the data is unchanged, shows the error to report, and offers *Try again* |
| F-03 | A stable release build without the release keystore properties fails, instead of silently signing with the public debug key (an explicit `TRAVEL_ORGANIZER_ALLOW_DEBUG_SIGNING` property allows it for a throwaway build) |
| F-14 | The migration connection gets `foreign_keys` and a `busy_timeout`, like the main one |
| F-17 | Permissions the app never uses (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`) are blocked from the release manifest, after checking which the built APK declares |
| F-11 / F-18 | The user guide and stale docs are brought up to date with what is now known |

## Not fixable in code — what is needed instead

| ID | What |
|---|---|
| F-04 | The owner confirms an off-machine copy of the release keystore and its passwords |
| F-05 | The owner decides whether the husband's phone may hold a copy of the real trip; until then synthetic only |
| F-06 | Done on Beta on the owner's phone (2026-10-25, restore matched every count and file); a restore into a fresh install is for the husband's phone |
| F-07 | The upgrade is one-way by design; the runbook (backup first, keep it) goes into the user guide |
| F-08 | Stable has `allowBackup="true"`. Turning it off changes what Android restores after a reinstall: a decision for the owner, for the post-trip upgrade |
| F-09 | Backups are built in memory. Fine at today's sizes (a 100 MB+ file was read in chunks); a streaming rewrite is a larger change, to plan if backups grow |
| F-10, F-12, F-13 | Need other files or devices: a real 0.13.0 backup, real calendar apps, release lookups were checked on the phone (G8) — the calendar import on the husband's phone |
| F-15, F-16, F-19 | Release tags from now on; SQLite skew needs no change; a copied trip getting new calendar UIDs is by design (it is a different trip) |
