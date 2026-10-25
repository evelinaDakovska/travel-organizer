# Next session — handoff (written 2026-10-24: every roadmap phase built and approved; §0 added 2026-10-25)

Read `CLAUDE.md` first, then this file. It says where the work stands, what is waiting for the owner,
and how to pick up the next task. The detailed history is in `docs/session-handoff.md` §11 and
`docs/status.md`.

## 0. RESUME HERE (2026-10-25): finish 0.21.2, then write the big summary

The owner's request, in progress (2026-10-25):

> "fix all the findings. then write one big detailed summary of all the things tested on my phone and
> what was found and what you fixed. everything that occurred after first connecting the phone
> yesterday. the calendar import we will try on my husband's phone? if needed we can do it on mine"

That request is the approval for the plan in **`docs/qa-fixes-plan.md` Part 2** (committed `85e051b`). Work it top to bottom. Plan-first is satisfied for these items; anything that
turns out bigger than the plan says goes back to the owner.

### 0.1 Already done and pushed (`9553b82`)

These are untested on a device, but the unit tests and `tsc` pass (1816 tests, 92 suites).

- **D-02** Adding a traveller whose name is already saved asks first:
  - the question is `src/features/travellers/confirmNamesake.ts`, and the check is `namesakeOf` in `src/domain/traveller.ts`;
  - it applies on the Travellers screen and in the trip form's *Add new traveller* sheet (`TravellerPicker`).
- **O-07 / O-09** Same-name profiles get a hint (`namesakeHint`, "Adult · On QA Nordic Family (2)"):
  - in the trip form's *Travelling with* (the new `hintFor` prop on `TravellerPicker`, fed by `travellerTripNames`);
  - on the Travellers screen.
- **D-05** The itinerary PDF is retried once, and empty print files in `cache/Print` are deleted (`src/files/itineraryPdf.ts`).
- **O-08** Exports more than a day old are deleted from the cache at launch:
  - the rule is `isStaleExport` in `src/domain/resource.ts`, with tests;
  - the sweep is `sweepOldExports` in `src/files/storage.ts`, called from `useMediaSweep`;
  - it covers the cache root plus `itinerary/`, `open/` and `Print/`, and never `media/`.
- **O-04** *Use in a trip* shows `formatDateRange`, not ISO dates (`app/list/[listId].tsx`).

### 0.2 Still to do, in this order (the plan has the intended fix for each)

1. **Version bump:** `app.json` → **0.21.2**, versionCode **35**. Not done yet.
2. **O-05** On the day map, a rental car's start reads *Departure*.
   - `stopRoleText` in `src/domain/dayRoute.ts:312` maps by role only.
   - Roles are assigned at `dayRoute.ts:78/84` (`'departure'`/`'arrival'`).
   - Fix: pass the subkind, or add `pick-up`/`drop-off` roles for `subkind === 'car'`, to match `entryRoleLabel` in `itinerary.ts`. The caller is `app/trip/[tripId]/day-map.tsx:216`. Add a test.
3. **O-01** A journey's arrival is labelled by a place ("Rovaniemi time") although its zone is the trip's own (Helsinki).
   - Look at `entryZoneLabel` (`src/domain/itinerary.ts`) and the Timeline/Overview callers.
   - Hide the label when the override equals the trip's `default_tz`. Evidence: screenshot `G2-18`.
4. **O-06** The PDF's booking costs read "EUR 1850.00 in EUR." Fix in `src/domain/itineraryHtml.ts:~245`, with its test.
5. **O-02** When a cost's amount changes while a *charged* amount is recorded, say so beside it (`ChargedField`, `ExpenseForm`, `PaymentForm`).
6. **O-03** "Pick a category" (`spending.ts:111`) is shown off-screen. On a failed submit, show the first error in an `Alert`, or scroll to it (`ExpenseForm`).
7. **O-10** At the largest font, the Timeline time column breaks "10:00" into "10:0" / "0".
   - Keep it on one line: `numberOfLines={1}` + `adjustsFontSizeToFit`, or a column that grows with `fontScale`.
   - Screenshot: `R4-font-03-timeline.png` in the QA folder.
8. **O-11 / O-12** At the largest font:
   - cap the tab labels with `maxFontSizeMultiplier` (`TripTabBar`);
   - let the Overview subtitle wrap to 2 lines;
   - let the `Button` label wrap (`+ Add new traveller`);
   - on Overview, stack "Sofia time · Anna Test" above *Full itinerary* when `useWindowDimensions().fontScale > 1.3`.
   - Screenshots: `R4-font-01…07`.
9. **O-13** *Save to this phone* on the Backup screen: write the zip through the Storage Access Framework, into a folder the person picks.
   - **Verify the API first** (expo-file-system SDK 57: `Directory.pickDirectoryAsync()` + `createFile`, or the legacy `StorageAccessFramework`).
   - Test on the emulator, which has DocumentsUI.
10. **F-01** A runner-level migration test.
    - Populated schema-5 and schema-6 databases, with **every** table filled, go through the real `migrate()` (`src/db/client.ts`) on a file database up to 14.
    - Check: rows kept, `integrity_check` / `foreign_key_check` clean, and `sqlite_master` equal to a fresh `migrate()` from 0.
    - Fixtures: `src/db/testing/phoneShaped.ts` (`fillLikeAPhone` lacks resources, notes, participants, lists, recipients, templates). Existing tests: `src/db/migrations/014-undated-trips.test.ts`.
11. **F-02** A database that fails to open or migrate must not crash on every launch.
    - `app/_layout.tsx` uses `SQLiteProvider onInit={migrate} useSuspense` and has no error handling.
    - Add an error screen ("Your data is unchanged", the error text, *Try again*): an `ErrorBoundary` around the provider, or the provider's `onError` (check `expo-sqlite`'s types).
    - Test it on the emulator by forcing a throw in a dev build.
12. **F-03** `plugins/withReleaseSigning.js` must fail a release task when `TRAVEL_ORGANIZER_STORE_FILE` is absent, unless `TRAVEL_ORGANIZER_ALLOW_DEBUG_SIGNING` is set.
    - Use a `gradle.taskGraph.whenReady` check.
    - Beta is unaffected: `app.config.js` swaps in `withBetaSigning`.
    - Unit-test `applySigning` (see `src/config/betaVariant.test.ts`).
    - **Do not change the key, the alias or the application id.**
13. **F-14** Give the migration connection (`withExclusiveTransactionAsync`'s second connection, `src/db/client.ts`) `foreign_keys` and `busy_timeout`. Check first that it doesn't break 014, which runs with foreign keys off.
14. **F-17** Read the release APK's permissions (`aapt dump permissions` on `%USERPROFILE%\.travel-organizer\travel-organizer-beta-0.21.1.apk`).
    - Block the unused ones (`RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`) with `android.blockedPermissions` in `app.json`.
    - Keep `CAMERA` if *+ Photo* uses it.
15. **F-11 / F-18** Update `docs/user-guide.md` (Beta, the two Stable workarounds, the backup advice and *Save to this phone*, offline behaviour), `docs/product-status.md` and `status.md` (a *QA-2* row).
16. **Then** the full suite, `tsc`, and an emulator check of the visible changes (`Pixel_10_Pro`, debug client over Metro). Commit and push.
17. **Then ask the owner** for approval to build and install **Beta 0.21.2** on the owner's phone with `scripts/build-beta.mjs` and `scripts/install-beta.mjs --replace`, as in §1 of `docs/beta-variant.md`. Re-check the visible fixes there, including large font: the owner sets it and puts it back.

### 0.3 Then the big summary the owner asked for

Write one detailed summary of **everything since the phone was first connected (2026-10-24)**. Publish
it as an artifact (it's for the owner to read and keep), and keep a copy at
`docs/phone-qa-report-2026-10.md`. Sources:

- **The QA matrix:** `%USERPROFILE%\Pictures\TravelOrganizer-0.21.0-beta-phone-qa\QA-MATRIX.md`. It covers 144 checks in groups 1–13, the 0.21.1 re-test, the owner-assisted checks, D-01…D-05 and O-01…O-13.
- **The audit:** the release-readiness audit, F-01…F-19, now in the repo at `docs/release-readiness-audit-2026-10-24.md`.
- **The screenshots and action log:** in the same Pictures folder (`G<n>-…png`, `R1…R4-…png`, `qa-actions.log`). The driver scripts are in its `tools\`.
- **Git and the docs:**
  - `git log a7ba95a^..HEAD`: the Beta variant, installPlan, build-beta, 0.21.1, 0.21.2;
  - `docs/qa-fixes-plan.md`, `docs/beta-variant.md`, `status.md` *QA-1*.
- **Facts to include:**
  - the device: SM-S948B, Android 17, users 0/10/150;
  - Stable is 0.7.2 / 12, untouched throughout, and re-verified at every checkpoint (signature 42566377, last update 2026-10-16 20:45:20);
  - Beta builds: 0.21.0 (`f168414b…`) and 0.21.1 (`9e14fd40…`), both installed to user 0 only;
  - the owner chose Option A for Stable: guidance only before the trip;
  - finances all matched;
  - the defects and observations, each with its status: fixed in 0.21.1, fixed in 0.21.2, owner decision, or deferred.
- **Deferred to the husband's phone:**
  - the **calendar import** (G9-07). The owner said it may be done on the owner's phone if needed, but only with a **test calendar**, never into the real calendar without asking;
  - a restore into a freshly reinstalled Beta (G11-08);
  - the 0.7.2 → 0.21.x upgrade rehearsal.

### 0.4 Phone-testing notes (how the QA was driven)

- **ADB** is at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`. The phone's serial is `R5GL22FE9QY`. Samsung Auto Blocker must be off.
- **The QA driver** is `qa.mjs`; it refuses to act while any app other than Beta or a system dialog is in front. It and its helpers (`pulldb.sh`, `q.js`, `d01phone.sh`, and `qa-emu.mjs` for the emulator) are in `…\Pictures\TravelOrganizer-0.21.0-beta-phone-qa\tools\`, current as of 2026-10-25. Their paths point at the old session's scratchpad: change `EVIDENCE` / `D` to the new session's scratchpad or the QA folder before use.
- **Never screenshot or dump a share sheet, a file picker, the notification shade or the PDF viewer.** They show the owner's contacts, files and accounts. The owner does the picking.
- **For a cold start from a reminder,** use `am kill`, never `force-stop`: a force-stop cancels the alarms.
- **Before any device-setting change,** record the original. The originals: font_scale 1.0, density 450 (no override), airplane off, accessibility = the antivirus service only. Dark mode: custom_schedule 22:00–07:00.

## 1. Where things stand

| | |
|---|---|
| **Branch with the work** | `phase-3d1`, pushed to the personal GitHub remote (`origin`). Not merged. |
| **`main`** | `46d256a` — 0.13.0, schema 6, backup format 7. **Not** what the owner's phone runs (see *Phone*). |
| **`phase-3d1` app** | **0.21.1**, versionCode 34 (QA fixes D-01, D-03; `status.md` *QA-1*) |
| **Database schema** | 14 (migrations 007–014 exist only on `phase-3d1`; 014 rebuilds `trips`) |
| **Backup / trip archive format** | 15 / row format 15 |
| **Tests** | 1811 Node tests in 92 suites, `npx tsc --noEmit` clean |
| **Roadmap Phases 1–8** | **All built and approved by the owner.** Phases 1–3 by 2026-10-23; Phases 4–8, with their review corrections (0.17.1, 0.18.1), on **2026-10-24**. No roadmap phase is left to build. |
| **Verified on** | Emulators only, with synthetic data. **Nothing from 0.14.0 onwards has been on a phone.** |
| **Phone** | **Stable is 0.7.2, versionCode 12** (`5f7f013`), read on the device on 2026-10-24 — not 0.13.0 as earlier docs said. Schema **inferred 5** (0.7.2 ships 001–005; the database was not read). Backup format 5; no single-trip export (that came in 0.9.0). Untouched. Holds a real trip. Detail: `status.md` *Stable on the owner's phone*. |
| **Beta** | `com.evelinadakovska.travelorganizer.beta`, *Travel Organizer Beta*, a separate app beside Stable (`docs/beta-variant.md`). **Beta 0.21.1 is installed on the owner's phone** (user 0 only, synthetic data; APK `%USERPROFILE%\.travel-organizer\travel-organizer-beta-0.21.1.apk`, SHA-256 `9e14fd40…d440b`). It is QA'd there: 0.21.0 on 2026-10-24/25 (matrix in `%USERPROFILE%\Pictures\TravelOrganizer-0.21.0-beta-phone-qa\`), and the 0.21.1 fixes on 2026-10-25. |
| **Release APK** | None built for 0.16.1–0.21.0. The newest release APK is 0.16.0, at `%USERPROFILE%\.travel-organizer\`; it is out of date. |

### What each approved phase added (detail in its plan, the decision log and `status.md`)

| Phase | Version | What | Data change |
|---|---|---|---|
| 4 | 0.17.0, 0.17.1 | Currency conversion: a reporting currency, typed-in rates per currency pair, *charged* amounts; balances stay per currency (`phase4-plan.md`, D45, D46) | Migrations 012, 013; format 13 → 14 |
| 5 | 0.18.0, 0.18.1 | The day map: an offline drawing of each day's stops, a Google Maps hand-off, a *Coordinates* field (`phase5-plan.md`, D47) | None |
| 6 | 0.19.0 | Trips without dates, stored as NULL (`phase6-plan.md`, D48) | Migration 014 rebuilds `trips` with foreign keys off; format 15 |
| 7 | 0.20.0 | A shared Google Maps link becomes a saved place; one `HEAD` request on a tap reads a short link's redirect (`phase7-plan.md`, D49) | None |
| 8 | 0.21.0 | *Add to calendar*: an `.ics` file with exact `VTIMEZONE`s, stable UIDs, private by default (`phase8-plan.md`, D50) | None |

### Not yet verified anywhere — left for the phone tests

- **Phase 8:** importing the `.ics` file into a real calendar app (Google Calendar, Apple Calendar,
  Outlook). Google Calendar on the emulator needs an account, and none may be signed in.
- **Phase 7:** a cold start of the app by a share. The dev client cannot be cold-started by a share
  (CLAUDE.md finding 8); it needs a release build.
- **The upgrade path:** **0.7.2 → 0.21.x** as a signed release, running migrations **006–014** in one
  start-up (the phone is on 0.7.2, schema 5 inferred). Each migration was checked on the emulator on
  its own, never all at once. The rehearsal starts from the authentic 0.7.2 APK, whose certificate was
  verified on 2026-10-24 (`status.md` *Stable on the owner's phone*).

## 2. The rules that still bind (owner, verbatim where quoted)

Approving the phases did **not** lift any of these.

- **Physical testing comes last, and is split (owner, 2026-10-23).** Phones only after the work is
  done, independently reviewed and tested on emulators, which is now the case. Then:
  - **the owner's primary phone** (real trip, real data) gets **only risk-free changes until the trip
    has passed** ("we always defend the real data"). The risky changes go onto it **after the trip,
    not before**;
  - **the husband's phone** (the secondary phone, no real data) tests **all changes**.

  Each install still needs the owner's go-ahead (master roadmap §3.1).
- **Beta exception (owner, 2026-10-24), strict scope:** on the primary phone, read-only inspection
  and — each time with the owner's explicit go-ahead — installing and testing the separate
  **`com.evelinadakovska.travelorganizer.beta`** app with synthetic data, for **user 0 only**. It
  does **not** permit updating, reinstalling, migrating, clearing, uninstalling or otherwise touching
  Stable (`com.evelinadakovska.travelorganizer`), nor touching the Work profile (user 10) or Secure
  Folder (user 150). Procedure: `docs/beta-variant.md`.
- "I have real data … those changes should be separated from main." **Do not merge `phase-3d1`
  into `main`** until the owner says so; the plan is after the owner's trip.
- **The primary Samsung phone** (except the Beta exception above):
  - "Do not touch my primary Samsung phone."
  - Never install on it, connect to it, uninstall from it, or clear its data.
  - Never `adb pull` personal files.
- "Do not access, import, modify or migrate my real trip data or personal backups."
- **Synthetic data, emulators only**, unless the owner approves a session on the husband's phone.
- **Signing, ids and the backend:** never change the signing key or the application id; never
  deploy backend infrastructure.
- **Release APK:** do not build one without separate approval.
- **No Google account** may be signed in on an emulator.
- **New work:** nothing starts until the owner asks for it. Finishing one task is not permission to
  start the next.
- **Migrations:** never edit 001–014; add a new one, and only after explaining it and getting
  approval.
- **Plan first:** for non-trivial work, a written plan the owner approves before any code.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pushing task
  commits to the personal remote is pre-authorised.

## 3. Next tasks — none is started; each waits for the owner to ask

Ask which one, rather than choosing.

1. **Bring 0.21.x to the phones.** Every step needs the owner's go-ahead. 0.21.x carries migrations
   007–014 (014 rebuilds `trips`), so as a whole it is **not** a risk-free change.
   1. Build a **signed release** 0.21.x (needs approval). *Note:* the safety classifier blocked
      switching `buildTypes.release` to the debug key (the §4 recipe). Ask the owner before relying
      on that recipe again; a plain `assembleDebug` dev build works for UI checks.
   2. Rehearse on an emulator: an in-place release upgrade **0.7.2 → 0.21.x** over synthetic data
      (migrations **006–014** in one start-up), with database snapshots compared before and after. This
      is the open master roadmap §19 checklist item. Start from the authentic 0.7.2 APK (certificate
      `638dc686…`, verified on the device 2026-10-24).
   3. Install on **the husband's phone** (synthetic data) and test everything there, including the
      items in §1 *Not yet verified anywhere*.
   4. **The primary phone, after the trip:** the owner exports a backup first. Then merge
      `phase-3d1` into `main`, and install only when the owner explicitly allows it.

   **Before the trip, the primary phone may get only risk-free changes.** Nothing on `phase-3d1` is
   ready to go there as-is. A risk-free update of Stable would be a separate build carrying only
   changes that touch no stored data — and note the phone is on 0.7.2, so even `main` (0.13.0) would
   run migration 006. The separate Beta app (Beta exception, §2) is how the new features are tested
   on that phone instead. If the owner wants one, plan it first: list
   the candidate changes and why each is risk-free.
2. **B1 — the feedback worker** deployment and security check, before any friends APK (master
   roadmap §16.2). Off behind `FEATURE_FEEDBACK_ENABLED`. Deploying needs the owner's approval.
3. **Small known items**, not scheduled:
   - Phone-QA leftovers in `docs/status.md` *Final phone QA*.
   - Accepted limits of 3E: `phase3e-plan.md` §14.3 item 5 as superseded by §15, and §15.7 items 3
     and 5.
   - Phase 8 limits: no reminders (`VALARM`), and to-dos are not exported (`phase8-plan.md` §4).
4. **Beyond the roadmap:** the *Deferred* and *Discovery* items in CLAUDE.md §7 and
   `MASTER_ROADMAP.md` §17. None is authorised; each needs the owner's decision first.

## 4. How the work was verified — recipes, since the helper scripts were temporary

The emulator helpers were in a session scratchpad and are probably gone. The essentials:

- **AVD:** `TO_2B_Test`, at `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd TO_2B_Test
  -no-snapshot-save`. It holds the **debug variant** of 0.21.0, which needs Metro: `npx expo start
  --dev-client --offline` plus `adb reverse tcp:8081 tcp:8081`. Relaunch the dev client with
  `exp+travel-organizer://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Check
  `adb devices` first: only `emulator-5554` may be listed. A stale Metro may hold port 8081; stop it
  with PowerShell `Stop-Process`.
- **Synthetic trips on it:** *E2E Lapland* (with *Arktikum*, *Кладбище финка* and *Breakfast at the
  cafe*), *P6 Japan someday* (undated), *3E Family*, *3E Hotel deposit*, *3E Review holds*, and others.
- **Debug-signed test build:** in `android/app/build.gradle` (gitignored), in `buildTypes.release`:
  1. Replace the `signingConfig …` line with `signingConfig signingConfigs.debug // E2E-INJECT`.
  2. Add `debuggable true // E2E-INJECT`.
  3. Run `cd android && ./gradlew assembleRelease`.
  4. Verify the signer with `apksigner verify --print-certs`: it must be *Android Debug*
     (`fac61745…`).
  5. Restore the file afterwards: 0 `E2E-INJECT` lines.

  Adding only `debuggable true` gives a debuggable APK signed with the **release** key. Never do
  that. See the classifier note in §3 item 1.1.
- **Database before and after:** `adb -s emulator-5554 exec-out run-as com.evelinadakovska.travelorganizer
  cat files/SQLite/travel-organizer.db > x.db` (and the `-wal` file). Compare table by table with
  better-sqlite3 (`SELECT * … ORDER BY rowid` per table), and check `PRAGMA integrity_check` and
  `foreign_key_check`.
- **Rehearsing a migration after Metro already applied it:** rebuild the older schema from the pulled
  database (drop what the migration added, set `user_version`), put it back with `run-as cp`, and
  start the app.
- **Synthetic trips:** build them with the app's own `buildTripArchive` + `packTripArchive`
  (`src/domain/tripArchive.ts`). Run under Node with `@babel/preset-typescript` and
  `NODE_PATH=C:/dev/travel-organizer/node_modules`, `adb push` to `/sdcard/Download`, then use
  *Backup & restore › Import a trip*.
- **UI driving:** `uiautomator dump` plus `input tap`. Alert buttons read in capitals (*DELETE*,
  *CONTINUE*). At font 2.0, Home is long: search for a trip downward, with short swipes. The dev
  menu's *Tools button* switch hides the floating gear that covers *Add*.
- **Display checks:** `wm density 569` (360 dp on the 1280 px AVD), `settings put system font_scale
  2.0`, `cmd uimode night yes`. Reset all three afterwards.
- **Typed routes:** a new route file needs `.expo/types/router.d.ts` regenerated. Start
  `npx expo start --offline` briefly, then stop it.
- **Shell quirks:** Bash heredocs containing backticks fail; write scripts with the Write tool. With
  `MSYS_NO_PATHCONV=1` set, give node Windows-style paths (`C:/Users/...`).
- **Sharing from Google Maps (Phase 7):** open a place with `am start -a VIEW -d "'geo:0,0?q=…'" -p
  com.google.android.apps.maps`, tap *Share*, then *Travel Organizer*, with the dev client already
  running.
- **The calendar file (Phase 8):** it is in the app's cache (`run-as … cat cache/<trip>-calendar.ics`).
- **Deep links** do not route in the dev client; use the Timeline's *Map* or Overview › More.
- **Evidence, one folder per round** under `%USERPROFILE%\Pictures\`, each with an `E2E-LOG.md`:
  `TravelOrganizer-0.21.0-P8-e2e`, `…-0.20.0-P7-e2e`, `…-0.19.0-P6-e2e`, `…-0.18.1-P5-review-e2e`,
  `…-0.18.0-P5-e2e`, `…-0.17.0-P4-e2e`, `…-0.16.3-header-e2e`, `…-0.16.2-holds-e2e`,
  `…-0.16.1-review-e2e`.

## 5. Where to read more

| For | Read |
|---|---|
| Task-by-task state | `docs/status.md` (wins if anything disagrees) |
| What a tester can use, and where it was verified | `docs/product-status.md` |
| Each phase's decisions and as-built | `docs/phase4-plan.md` … `docs/phase8-plan.md` |
| Why | `docs/decision-log.md` D45–D50 |
| Schema, queries, formats | `docs/technical-reference.md` §23–§28 |
| The long-term plan, exit gates, the release checklist | `docs/MASTER_ROADMAP.md` (§10–§14 Phases 4–8, §16 beta, §19 checklist) |
| How the owner works, the machine | `docs/session-handoff.md` §6–§9 |
