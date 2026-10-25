# Next session — handoff (written 2026-10-24: every roadmap phase built and approved)

Read `CLAUDE.md` first, then this file. It says where the work stands, what is waiting for the owner,
and how to pick up the next task. The detailed history is in `docs/session-handoff.md` §11 and
`docs/status.md`.

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
