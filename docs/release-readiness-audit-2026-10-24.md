# Travel Organizer — Pre-release readiness audit (read-only)

Date: 2026-10-24 · Branch audited: `phase-3d1` @ `0ebf6b2` · Auditor: Claude (read-only session)

Evidence labels: **[V]** verified in this session from code, git or a command · **[R]** reported in the
project's docs or E2E logs, not re-checked · **[I]** inferred from code, not executed · **[NT]** not yet
tested anywhere.

---

## A. Verified repository baseline

| Fact | Value | Evidence |
|---|---|---|
| Current branch / HEAD | `phase-3d1` @ `0ebf6b2` (docs handoff). Last code commit `ba86f82` (Phase 8); `5217b47` is Phase 8 docs | [V] `git rev-parse`, `git log` |
| Remote | `phase-3d1` level with `origin/phase-3d1` | [V] `git status -sb` |
| Working tree | Clean before and after this audit | [V] `git status --short` |
| `main` | `46d256a` (2026-10-21), a docs commit after the 0.13.0 code; app.json `0.13.0`, versionCode **20** | [V] `git show main:app.json` |
| Release tags | **None.** No tag records which commit built the APK on the owner's phone | [V] `git tag` |
| Branch app version | app.json `0.21.0`, versionCode **33**; `android/app/build.gradle` agrees (33 / 0.21.0) | [V] |
| `package.json` version | `0.1.0` (never bumped; cosmetic) | [V] |
| Application ID | `com.evelinadakovska.travelorganizer` on both branches and in the stored 0.13.0 APK | [V] app.json, `aapt2 dump badging` |
| Database schema | `LATEST_VERSION` = 14; 14 migrations registered in order, 1…14, contiguous; only 014 is `rebuildsTables` | [V] `src/db/migrations/index.ts` |
| Full backup format | `EXPORT_FORMAT_VERSION = 15` (main: 7) | [V] `src/domain/export.ts:28`, `main:src/domain/export.ts:21` |
| Trip archive | Layout `TRIP_ARCHIVE_VERSION = 1`, row format 15, carries `schemaVersion` | [V] `src/domain/tripArchive.ts:32` |
| Tests | **91 suites, 1778 tests, all passed** (jest, 4.8 s) | [V] run this session |
| TypeScript | `tsc --noEmit` exit 0 | [V] run this session |
| Native diff main → branch | **No change** to plugins, permissions, native dependencies or patches. Only `ical.js` (devDependency) added | [V] `git diff main..HEAD -- app.json package.json plugins patches package-lock.json` |
| SQLite on device / in tests | expo-sqlite vendors **3.50.3**; better-sqlite3 in tests runs **3.53.4** | [V] `vendor/sqlite3/sqlite3.h`, `sqlite_version()` |
| Branch size | 179 files, +23,735 / −422 vs main | [V] |

**Discrepancies between docs and code**

1. `docs/product-status.md` still lists "Mandatory start and end dates" (Phase 6 made them optional) and
   presents full backup/restore as verified in phone use. `docs/status.md` *Final phone QA* still has
   "Export a backup **to Drive**, then restore it" **unticked**. Per CLAUDE.md, status.md wins: the
   restore has never been done on a phone.
2. `docs/user-guide.md` says "Written for version 0.6.0"; its *Currencies* section says amounts are never
   converted and conversion is "planned for later" (contradicts Phase 4); it states calendar behaviour
   ("Apple Calendar and Outlook update the events") that has never been tested.
3. `docs/windows-handoff.md` §Release build: the keystore paths are mangled by backslash escapes
   (`%USERPROFILE%.travel-organizerelease.jks`).
4. The handoff says the newest release APK is 0.16.0: [V] true. Stored APKs 0.1.0 … 0.16.0 exist in
   `%USERPROFILE%\.travel-organizer\`.

---

## B. Executive readiness verdict

### CONDITIONAL — FIXES REQUIRED BEFORE REHEARSAL

**What the evidence supports:**

- The migration code is careful and, as far as code review can tell, correct:
  - every migration commits together with its `user_version`;
  - 014 turns foreign keys off outside the transaction on the same connection, checks that they really
    are off, compares `foreign_key_check` before and after, and turns them back on in `finally`;
  - nothing in 007–014 transforms or deletes existing rows.
- No native or permission change since 0.13.0, and the stored release APKs share one signing
  certificate.
- I found no P0 defect that would lose data.

**Why it is not yet "READY":**

1. **The exact upgrade the phone will run has never been executed end to end.** That means a populated
   schema-6 database going through the app's real runner, `migrate()` (007–013 on
   `withExclusiveTransactionAsync`'s second connection, then 014 on the main connection):
   - not in Node: the 6→14 test uses a test helper, not the runner, and compares only two tables;
   - not on an emulator: each migration was rehearsed alone, on debug builds over Metro.
   A Node test closes most of this for minutes of work, before an expensive rehearsal is spent finding
   it (F-01).
2. **A failed migration leaves the app crashing on every launch with no message** (F-02). This is
   acceptable on an emulator but must be fixed before any phone.
3. **Rehearsal preconditions are not in place:**
   - a release-signing guard (F-03);
   - a way to snapshot a non-debuggable release install (§H, prerequisite P-4);
   - owner approvals.

The fixes required before the rehearsal are small: tests plus a build check. The fixes required
before any phone are listed under each finding.

---

## C. Findings by severity

Columns: **Blocks** = R (emulator rehearsal) / Q (real-device QA on husband's phone) / B (friends'
beta) / O (owner phone upgrade).

### P1

**F-01 · P1 · The full 6 → 14 upgrade through the app runner is untested on realistic data**

- **Where:** `src/db/migrations/014-undated-trips.test.ts:97-107`; `src/db/testing/phoneShaped.ts:12-48`;
  `src/db/client.ts:28-39`.
- **Evidence [V]:**
  - The "6 → 14 in one start-up, as on the phone" test calls the test's own `upgradeTo()`, not
    `migrate()`. It compares only `trip_items` and the trip dates.
  - The runner-level tests (`:165`, `:184`, `:208`) all seed at schema **13**.
  - `client.test.ts` runs `migrate()` only on an empty database.
  - The fixture `fillLikeAPhone` has no rows in `resources`, `trip_notes`, `item_participants`, `lists`,
    `list_items`, `list_item_recipients`, `templates` or `template_uses`.
  - Nothing compares the upgraded `sqlite_master` (indexes, triggers) with a fresh schema-14 database.
- **Failure scenario:** a behaviour specific to the runner surfaces only on the phone. Examples: the
  second connection used for 007–013 without `foreign_keys` or `busy_timeout`, or the WAL hand-off
  between that connection and the main one before 014.
- **Impact on data:** probably none, since each step is atomic. But the startup could fail (see F-02).
- **Fix (test-only):**
  - add a runner-level 6→14 test on a file database, with every table populated;
  - snapshot every table plus `sqlite_master`, then check `integrity_check` and `foreign_key_check`;
  - compare the schema with a fresh `migrate()` from 0.
- **Blocks:** R (recommended first), Q, O.

**F-02 · P1 · A failed migration crashes the app on every launch, with no message**

- **Where:** `app/_layout.tsx:44-50`; `node_modules/expo-router/build/useScreens.js:156`.
- **Evidence:**
  - [V] `SQLiteProvider` runs `onInit={migrate}` with `useSuspense`. A rejection is thrown during render.
  - [V] `app/_layout.tsx` exports no `ErrorBoundary`, and expo-router wraps a route only if one is
    exported.
  - [I] In a release build this is an unhandled render error, so the app closes. [NT] on any device.
- **Failure scenario:** on the owner's phone (later) or a friend's phone, 014's
  `foreign_key_check` guard trips, or storage is full. The app closes at every start, so no ticket can
  be opened and no backup can be exported.
- **Impact on data:** the stored data stays at the last committed version (safe, [I]), but it is
  unreachable until a fixed build arrives. 0.13.0 cannot be put back (F-07).
- **Fix:** a root `ErrorBoundary` that says "The update could not finish. Your data is unchanged," gives
  the error text to report, and offers a retry. Optionally, a read-only "copy the database file out"
  escape hatch, with privacy reviewed first.
- **Blocks:** Q, O, B (not R).

**F-03 · P1 · Release signing silently falls back to the public debug key**

- **Where:** `plugins/withReleaseSigning.js` (the `hasProperty(...) ? release : debug` ternary).
- **Evidence:**
  - [V] With the four Gradle properties absent, `assembleRelease` signs with the debug key, with no
    warning.
  - [V] The properties are present on this machine (`~/.gradle/gradle.properties` has
    `TRAVEL_ORGANIZER_STORE_FILE`; values not printed).
  - [V] The stored APKs 0.1.0, 0.13.0 and 0.16.0 all carry cert SHA-256
    `638dc686…b45235e7`, DN `CN=Travel Organizer, O=Personal, C=BG`. This matches the fingerprint in
    windows-handoff.
- **Failure scenario:** a build made in a shell, CI or machine without the properties is debug-signed.
  - On a clean phone (husband's, friends') it installs fine. That later blocks updating them with
    properly signed builds unless they uninstall.
  - On the owner's phone it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, and the obvious "fix",
    uninstalling, deletes every trip.
- **Fix:** make a release build fail when the properties are missing (or require an explicit opt-in for
  debug fallback). Make `apksigner verify --print-certs` plus the fingerprint comparison a mandatory
  step before every install.
- **Blocks:** R (as a checked step), Q, O, B.

**F-04 · P1 · No evidence of an off-machine copy of the release keystore**

- **Where:** `%USERPROFILE%\.travel-organizer\release.jks` (4,348 bytes, 2026-09-18) [V exists].
- **Evidence:** windows-handoff asks for a password-manager or encrypted-drive copy. Whether one exists is
  **UNVERIFIED**.
- **Failure scenario:** the disk dies or the machine is lost. No update can ever be installed over the
  owner's 0.13.0 again; moving to 0.21.x would require uninstalling, which means relying entirely on a
  backup.
- **Fix:** the owner confirms a second copy (keystore plus passwords), stored separately, and tests that
  it opens (the owner runs `keytool -list` on the copy).
- **Blocks:** O, B.

**F-05 · P1 · The proposed "copy of the Lapland trip on the husband's phone" contradicts a recorded rule**

- **Where:** `docs/MASTER_ROADMAP.md:48` (§3.1): secondary phone, "synthetic data only; … no personal
  trip backups or production data"; `CLAUDE.md` §7: "with synthetic data only".
- **Failure scenario:** a QA session copies real bookings, reference codes and documents to a second
  device that also runs risky test builds, and they stay there afterwards.
- **Impact on data:** privacy and exposure, not loss. The trip archive is never a restore, so the owner's
  phone is untouched ([V] `tripArchive.ts` header; `importTripArchive` writes only new ids).
- **Fix:** the owner decides explicitly and the decision is recorded in §3.1. Recommendation:
  - run all QA first on a synthetic Lapland replica (the *E2E Lapland* fixture);
  - import the real copy only for one dedicated check (that a 0.13.0-made archive of the real trip
    opens intact);
  - delete it afterwards, and record that deletion.
- **Blocks:** Q (the plan for that session).

**F-06 · P1 · Backup → Drive → restore has never been done on a physical phone**

- **Where:** `docs/status.md` *Final phone QA*: "[ ] Export a backup **to Drive**, then restore it" [V].
- **Evidence [R]:**
  - Export to the share sheet was done on the phone (2026-09-18).
  - Emulators restored 150 MB and 380 MB backups.
  - The emulator 0.13.0→0.16 runs restored backups.
- **Failure scenario:** the owner's eventual upgrade relies on a backup that cannot be read back, for
  example because Drive mangles or renames the zip, or the phone runs out of memory reading it.
- **Fix:**
  - prove the round trip on the husband's phone with synthetic data, on 0.13.0 and on 0.21.x;
  - verify the owner's own backup without writing (§E.3).
- **Blocks:** O; strongly recommended before B.

### P2

**F-07 · P2 · The upgrade is one-way, and the only rollback is uninstall plus a pre-upgrade backup**

- **Evidence [V]:**
  - versionCode 20 < 33, so Android refuses the downgrade.
  - Even forced, 0.13.0's runner returns early on `user_version >= 6` (`main:src/db/client.ts:27`) and
    would run against a schema it does not know (nullable dates in `trips`).
  - 0.13.0 refuses format-15 backups (`main:src/domain/export.ts:380`) and archives with
    `schemaVersion > 6`.
  - 0.21.x has the same silent "newer schema" behaviour (`client.ts:26`).
- **Impact:** anything entered after the upgrade is lost if rolling back. Recovery means uninstalling
  0.21.x, installing 0.13.0 and restoring the pre-upgrade backup.
- **Fix:**
  - document this recovery in the upgrade runbook;
  - keep the pre-upgrade backup untouched until 0.21.x has been in use for some time;
  - optionally, make the runner refuse a database newer than it knows, with a clear message (future
    builds).
- **Blocks:** O (runbook).

**F-08 · P2 · `android:allowBackup="true"`: Android may copy the database and files to Google's cloud backup**

- **Where:** `android/app/src/main/AndroidManifest.xml:16` [V] (generated; same in 0.13.0 [I]).
- **Failure scenario:**
  - [I, NT] Android Auto Backup uploads app data (a size cap applies) to the phone's Google account.
  - On a reinstall it can silently restore an *older* database and files snapshot before first launch,
    which then migrates.
- **Impact:**
  - contradicts user-guide §6 ("There is no account and no cloud");
  - privacy for beta testers;
  - an unexpected stale-data restore on reinstall.
- **Fix:** an owner decision: `allowBackup=false` (or data-extraction rules) through a config plugin, and
  a disclosure in the guide. Changing the flag does not touch stored data.
- **Blocks:** B.

**F-09 · P2 · Backup export and restore hold the whole archive in memory**

- **Where:** `src/files/backupFiles.ts`: `exportBackup` puts every file in a `Map`, then
  `packBackup` (one buffer); `pickBackup` uses `readFileBytes` on the whole zip [V].
- **Evidence [R]:** 380 MB export and a 150 MB-file round trip on an emulator; none on a phone.
- **Failure:** an out-of-memory abort on a smaller phone with a large trip. Export fails without harm;
  a restore fails with "nothing was changed".
- **Fix:** QA on the smaller phone with a deliberately large synthetic backup. Streaming is a later
  improvement.
- **Blocks:** Q (test), B (document limits).

**F-10 · P2 · Older-format imports are not tested against files actually produced by 0.13.0**

- **Where:** `src/domain/tripArchive.test.ts:280-287` relabels a *current* archive's `rowFormat` to 7…14,
  but its rows still carry every new column. Backup-format tests use hand-built documents [V].
- **Failure:** a 0.13.0-made archive or backup with genuinely absent columns hits a schema-default path
  that is not covered.
- **Fix (test-only):** generate golden fixtures with `main`'s code (a format-7 backup zip and a
  rowFormat-7 trip archive, synthetic), commit them as test data, and import them in Node through
  `planImport` / `planTripImport` + the repositories.
- **Blocks:** Q (before the transfer test).

**F-11 · P2 · The user guide is out of date and makes untested claims**

- **Where:** `docs/user-guide.md` (details in §J).
- **Problems:** stale version line; contradictory *Currencies*; finance sections tagged "not yet on your
  phone"; no Quick Start, screenshots or troubleshooting; unverified calendar behaviour stated as fact.
- **Blocks:** B.

**F-12 · P2 · Calendar compatibility is proven only by a parser**

- **Evidence:** [V] `ics.ts` emits RFC 5545 with per-event TZIDs and a VTIMEZONE of explicit
  observances (no RRULE), `METHOD:PUBLISH` and UID `<item-id>[-start|-end]@travel-organizer.app`.
  [R] Mozilla ical.js parsed the emulator's file correctly. [NT] Google Calendar, Samsung Calendar,
  Outlook, Apple Calendar.
- **Risks:**
  - duplicates on re-import (the guide already admits this for Google);
  - Outlook's handling of many-observance VTIMEZONEs;
  - a timed start with a date-only end produces a zero-length event (by design, P8);
  - the UID domain is not one the project owns (cosmetic);
  - `LOCATION`/`GEO` are on by default, so an imported trip is visible to anyone the calendar is shared
    with.
- **Blocks:** B (claims in the guide), Q (test).

**F-13 · P2 · Phase 7 lookup on a release build and with real redirects is untested**

- **Where:** `src/features/share/lookUpMapsLink.ts` [V].
- **Evidence:**
  - Input is validated as an https `maps.app.goo.gl` / `goo.gl/maps` path.
  - `fetch(HEAD, redirect:'follow', credentials:'omit')` has an 8 s abort.
  - Only the final `response.url` is accepted, through `acceptedRedirect` (https, Google Maps hosts,
    consent wrapper unwrapped).
- **Gaps:**
  - [NT] a cold-start share on a release build;
  - [I, unverified] whether React Native's Android network stack stores Google cookies despite
    `credentials:'omit'` (D49 says "no cookies");
  - intermediate redirect hops are not restricted (only the result is trusted, which is acceptable for
    a HEAD request);
  - [NT] Google answering HEAD differently from GET on real networks (for example a 200 with a
    JavaScript redirect would yield "unreadable").
- **Blocks:** Q.

### P3

- **F-14 · P3 · Migrations 007–013 run without foreign keys or busy timeout on their connection.**
  [V] `withExclusiveTransactionAsync` opens a second connection (`expo-sqlite/src/SQLiteDatabase.ts:181`)
  on which `client.ts` never sets `foreign_keys=ON` or `busy_timeout`. Harmless today: DDL, plus 013
  copying an empty or valid `trip_rates`. A future data-moving migration would run unenforced. Note it
  in the runner, or set both pragmas inside each batch.
- **F-15 · P3 · No release tags.** The exact commit behind the installed 0.13.0 is not recorded.
  Mitigation: rehearse with the **stored** 0.13.0 APK (versionCode 20, same cert) rather than a rebuild,
  and tag releases from now on.
- **F-16 · P3 · SQLite version skew** (3.53.4 in tests, 3.50.3 on device). The rebuild semantics have
  been stable since 3.26, but only the rehearsal proves it on the device library.
- **F-17 · P3 · Release manifest permissions.** It declares `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `CAMERA`
  and the dev-client scheme `exp+travel-organizer` ([V] 0.13.0 APK). These are unchanged since 0.13.0, so
  they do not affect the upgrade. They are a beta privacy question (microphone, overlay).
- **F-18 · P3 · Docs.** `package.json` is at 0.1.0; windows-handoff paths are mangled; product-status
  is stale (see A).
- **F-19 · P3 · Calendar UIDs change with a trip copy.** A trip imported from an archive gets new item
  ids, so its calendar UIDs differ from the original's: two people importing the "same" trip into a
  shared calendar get duplicates. Document it.

---

## D. Migration-by-migration assessment

All of 007–014 run in one start-up when upgrading from 6. Each non-rebuild migration is one
`withExclusiveTransactionAsync` batch, `sql + PRAGMA user_version = N`: atomic, with the version
recorded in the same commit [V]. A kill at any point leaves the database at N−1 or N, and the next
launch continues [I]. None is re-runnable by design (`CREATE TABLE` without `IF NOT EXISTS`); the
version gate makes that safe.

| # | Purpose / tables | Constraints & indexes | FK behaviour | Data transform | Risk |
|---|---|---|---|---|---|
| **007** | `booking_payments`; `expenses.trip_item_id`, `expenses.payer_id` | amount > 0; 5 indexes | trip CASCADE; **item: no action** (a booking with money cannot be deleted alone); payer RESTRICT | None. New columns NULL on old expenses | Low. `ADD COLUMN … REFERENCES` with NULL default is legal with FKs on or off |
| **008** | `cost_shares`, `trip_cover` | XOR item/expense; two partial UNIQUE; composite FK to `trip_travellers(trip_id, traveller_id)`, which is that table's PK ([V] 003) so no "foreign key mismatch" | CASCADE from trip/item/expense; cover CASCADE from membership | None | Low |
| **009** | `settlements` | amount > 0, from ≠ to, composite FKs to membership | trip CASCADE; membership **no action** | None | Low |
| **010** | `unsplit_confirmations` + 3 triggers on `cost_shares` | XOR, partial UNIQUE | CASCADE | None. Triggers fire only on later writes | Low. Triggers do not reference `trips`, so 014's rename is unaffected |
| **011** | `settlement_reviews` | reason/kind CHECKs | trip CASCADE | None | Low |
| **012** | `trips.report_currency` (CHECK), `trip_rates`, `charged_*` on expenses and booking payments | 3-letter uppercase CHECKs | CASCADE | None. All NULL | Low. The column CHECK is carried by 014 |
| **013** | `trip_exchange_rates` keyed by (trip, currency, base); copies `trip_rates` | PK triple | CASCADE | `INSERT … SELECT` from `trip_rates` (empty on 6→14) | Low. `trip_rates` stays, frozen, and is still exported |
| **014** | Rebuild `trips`: nullable dates, `CHECK((start IS NULL) = (end IS NULL))`, `end >= start` | Same 14 columns in the same order [V]; no index or trigger is defined on `trips` in 001–013 [V grep], so none is lost | Children's `REFERENCES trips(id)` resolve to the renamed table [R/V tests at `:109`] | Full copy; ids preserved; nothing dropped | **Medium.** The only structural rebuild; see below |

**014, against the checklist:**

| Check | Finding |
|---|---|
| FK pragma set outside the transaction | **Yes** [V]. `rebuildTables` runs `PRAGMA foreign_keys = OFF` before `withTransactionAsync`; no transaction is open on the main connection at that point, because 007–013 ran on their own connections |
| Intended connection | **Yes** [V]. The pragma, the check, the batch and the post-check all go through `db` (the provider's main connection); `withTransactionAsync` is plain `BEGIN`/`COMMIT` on it |
| FKs actually off | **Checked** [V]: it throws if `PRAGMA foreign_keys` ≠ 0 *before* anything is dropped |
| No concurrent writes | **Yes, by structure** [V/I]. With `useSuspense`, no child of `SQLiteProvider` (media sweep, reminders, screens, share landing) renders until `onInit` resolves; no other code opens the database (grep: only `SQLiteProvider`). `ShareIntentProvider` sits outside but does not touch SQLite |
| IDs and related rows survive | [V] Node, 13→14 through the runner (full snapshot equal). [R] emulator 13→14: 23/23 tables identical, 20 trips, 1,748 items. **6→14 through the runner: not tested** (F-01) |
| Constraints, indexes, triggers preserved | [V] column rules tested (`:87`); there are no `trips` indexes or triggers to lose. A `sqlite_master` comparison with a fresh database is still missing (F-01) |
| Rollback after a failed rebuild | [V] Node test `:208`: a rebuild that loses trips → `broke references` → still 13, FKs on, data identical |
| FKs re-enabled on every exit | [V] `finally { PRAGMA foreign_keys = ON }`. If the process dies, the pragma is per-connection, so the next connection starts with the default and `migrate()` sets ON again |
| Pre-existing violations | [V] Carried over unchanged (JSON comparison of `foreign_key_check` before and after; test `:184`). It does not fix them and does not refuse to start. Sensible |
| A partial upgrade treated as success | **No** [V]. The version is committed only with the batch. A thrown migration propagates out of `onInit`; nothing marks success. The UX of that failure is F-02 |
| Disk full / kill mid-rebuild | [I] The transaction is not committed, so WAL discards it and the data stays at 13. The next launch retries 014. [NT] on a device |

**Path 6 → 14:**
- Logically sound [I].
- Per-migration Node tests from 6 [V].
- Emulator rehearsals of single migrations on debug builds [R].
- **Untested:** the full path through the runner, on release, on a device (F-01, §H).

**Path 13 → 14:** [V] Node, through the runner; [R] emulator. No phone has ever held schemas 7–13 [R],
so this path matters only for emulators.

**Remaining migration risks:**

| Risk | Severity |
|---|---|
| The full-path runner test is missing (F-01) | P1 |
| Crash-loop UX on failure (F-02) | P1 |
| The second-connection pragmas (F-14) | P3 |
| The device SQLite version (F-16) | P3 |
| Real-world data on the owner's phone may hold shapes the fixtures lack (a very old 0.1.0-era row, an orphaned file row). Mitigated: 014 copies every row as it is and tolerates pre-existing FK breaks; the rest only add | P2, inferred |

---

## E. Backup and recovery assessment

### E.1 Proven

- [V code, tests] **Full backup is a consistent snapshot.** `readAllTables` reads everything inside one
  transaction on its own connection (a WAL snapshot).
- [V] **Restore is atomic for rows.** `applyImport` writes in one `withTransactionAsync`, parents
  before children; replace mode deletes each trip (which cascades) and re-inserts inside the same
  transaction.
- [V] **Files go first.** New files are written before the rows, and an existing stored name is never
  overwritten. If the row transaction fails, the new files are orphans and the next launch's sweep
  removes them.
- [V] **Version safety.** A newer format is refused (`formatVersion > 15`); formats 1–14 are upgraded
  in memory (`upgradeDocument`). 0.13.0 refuses format > 7 [V main].
- [V] **A missing file in a backup is reported, not fatal.** Missing files are counted and shown, and
  the row still lands, showing as missing.
- [V] **Trip archive:**
  - always a new trip with new ids, so it never overwrites;
  - size and zip-bomb limits; per-file SHA-256 in the manifest;
  - each file is read back and hashed after writing;
  - the files are deleted if the row transaction fails;
  - after the commit, every table's count is checked against the plan.
- [V] The media sweep is skipped if the reference list fails to load.

### E.2 Not atomic, or unverified

- **Not atomic:** files and the database cannot share a transaction. Partial files can exist until the
  next launch. Acceptable and documented [V].
- **Replace mode** commits the deletion of the old copy's files only through the next sweep. Files
  referenced by the replaced trip but not by the backup are then deleted permanently. This is intended,
  but it is irreversible once the app restarts.
- **Memory-bound** (F-09). [NT] on phones.
- **Disk-full during restore:** [I] files may be partly written, then the transaction fails or never
  starts, and orphans are swept. [NT].
- **Duplicate ids:**
  - in merge mode, a trip already on the phone is skipped as a whole;
  - travellers and templates are upserted by id;
  - a collision in a child id under a *new* trip (only possible with hand-edited files) fails the
    whole transaction, safely.
- **Restore to a clean install:** [R] emulator only. [NT] phone (F-06).
- **Old app with a new backup:** refused cleanly [V], so after the upgrade there is no way back except a
  pre-upgrade backup (F-07).
- **Android Auto Backup** may restore a stale copy on reinstall (F-08) [I].

### E.3 How to know a backup is valid before relying on it

**On the owner's phone (0.13.0) — does not write data, does not need the laptop:**

1. **Backup & restore → Export everything.** Note the message: *"Archive created with N trips and M
   saved files"*, plus any *"X files were already missing"*. M must equal the number of attachments
   you expect.
2. Save the zip to Drive, then confirm in the Drive app that a file with that name and a plausible size
   (several MB per PDF) exists. Optionally download a second copy elsewhere.
3. **Readability check without writing:** choose **Keep mine**, then **Import a backup**, and pick the
   zip *from Drive*. The expected result is *"Everything in this backup is already on this phone, so
   nothing will change."* — shown with no confirmation prompt, because nothing is written (`main:
   src/domain/archive.ts:131-139`). This proves that:
   - the download from Drive works;
   - the zip opens and the format validates;
   - the trip ids match.

   It does **not** prove that the files are intact (the existing trip's files are not compared).
   The picker copies the zip into the app's cache and deletes the copy; the database is not touched.
4. Optionally, export the Lapland **trip archive** (*Overview › More › Export trip › Complete trip*). It
   carries a SHA-256 for every file, so opening it anywhere verifies file integrity in its preview. That
   requires another device, which is subject to F-05.

**Full proof of a backup format** (not of the owner's own file): on the husband's phone or an emulator
with synthetic data:

- export, then restore onto a **clean install**;
- compare the trip, item, note, expense and file counts and open every PDF.

Do this on 0.13.0 and on 0.21.x.

**Never** use the owner's only copy as a test fixture, never `adb pull` it, and keep at least two
copies: Drive, plus one more location.

---

## F. Release signing and Android compatibility

| Item | Status |
|---|---|
| Package ID | `com.evelinadakovska.travelorganizer`, identical on main, the branch, the 0.13.0 APK and the generated Gradle file [V] |
| versionCode | 20 (0.13.0) → 33 (0.21.0): increases monotonically [V]. Every intermediate versionCode was used only on emulators [R] |
| Release signing | Config plugin reads 4 Gradle properties; **falls back to debug when absent** (F-03) [V] |
| Certificate | Stored APKs 0.1.0 / 0.13.0 / 0.16.0: SHA-256 `638dc686bdb7e5e6ce645935c020b5c4e36f14a3937cc0e617831268b45235e7` [V]. **That the APK on the owner's phone carries this certificate is UNVERIFIED.** Inferred from its being installed from this pipeline; checking needs the phone (for example a read-only `adb shell dumpsys package`, or the owner checking the version under Settings › Apps), which needs approval |
| Keystore | Present locally [V]; backup **UNVERIFIED** (F-04); passwords in `~/.gradle/gradle.properties` [V exist] |
| Upgrade keeps data | [I] Same ID, same cert, higher versionCode, installed with `install -r` / package installer, so Android keeps `/data/data/...`. [R] done repeatedly on emulators and once on the phone (0.1.0 → … → 0.13.0) |
| Native/permission changes | None between 0.13.0 and 0.21.0 [V]. Same plugins and patches (`expo-share-intent`, `expo-notifications` built from source) |
| Release vs dev differences | No Metro; Hermes bytecode; not debuggable (no `run-as`); **cold start by a share works only on release** (finding 8); deep links do not route in the dev client, so they are [NT] in release; an unhandled render error crashes rather than showing a red box (F-02) |
| Deep links / intents | [V] manifest: `travelorganizer://` and `exp+travel-organizer://` VIEW; SEND `text/*`, `image/*`, `application/pdf`; SEND_MULTIPLE `image/*`, `application/pdf`; `launchMode=singleTask`. `.ics` is exported only (no intent filter needed) |
| `allowBackup` | true (F-08) |
| `expo-updates` | Present in the manifest but `ENABLED=false` [V]: no over-the-air code path |
| `android/` folder | Gitignored and generated; manifest dated 2026-10-13 [V]. A release must be built after `npx expo prebuild --platform android` so it matches `app.json` (verify versionCode in the badging output) |

**Prerequisites for a safe signed rehearsal:**

1. Owner approval to build.
2. The keystore backup confirmed (F-04).
3. The F-03 guard, or at minimum a manual fingerprint check.
4. A fresh `prebuild`.
5. The `aapt2 dump badging` and permissions output compared with the 0.13.0 APK.
6. An emulator image that allows `adb root` (Google APIs, not Google Play), so a **non-debuggable**
   release install can be snapshotted without changing the signing or debuggable flags. This avoids the
   blocked debug-key recipe entirely.

---

## G. Feature regression matrix

Legend:
- **Auto** = automated tests exist (suite names);
- **Emu** = [R] emulator E2E evidence folder exists (`%USERPROFILE%\Pictures\TravelOrganizer-<ver>-e2e`);
- **Phone** = verified on the owner's phone up to 0.13.0 [R];
- **Needs device** = what still requires real-device QA.

| Feature | Auto | Emu | Phone | Needs device / limitations / regression risk |
|---|---|---|---|---|
| Trip create / edit / delete | trip, trips, migrations (cascade) | ✓ | ✓ (0.1.0) | Delete with money records (refusals, counts) on device |
| Trips without dates (P6) | undatedTrips, 014 tests | ✓ 0.19.0 | — | Home *Dates not set*, later dating; Overview/Timeline with no dates; calendar export skips undated plans |
| Home / Overview / Timeline | timeline, overview, status, dayRail, itinerary | ✓ | ✓ (core) | Narrow screen, font 2.0, dark mode on the husband's phone. Risk: the 0.16.3 header change |
| Day map, coordinates, directions (P5) | dayRoute, directions, mapsLink | ✓ 0.18.x | — | Google Maps hand-off with Maps installed; offline drawing; long days |
| Places & Google Maps share (P7) | mapsLink, share, places | ✓ warm only | Share from Maps on 0.1.0 ✓ | **Cold-start share on release**; lookup on mobile data, Wi-Fi, offline and on a captive portal; duplicate warning; missing coordinates |
| Flights / train / car / stays | tripItem, journey, time, timezones, zoneHints | ✓ | ✓ | Device time-zone change ([ ] in Final phone QA); overnight cross-zone |
| Travellers, adult/child, participants | traveller, participation, travellers, me, listRecipients | ✓ | Partly (0.7.x) | Remove a traveller with money (refusals) |
| Payments, splits, settlements, reviews (3D–3E) | bookingPayments, costShares, balances, settlements, settlementReviews, payments | ✓ 0.14–0.16.3 | — | All, on device. The largest new surface; the accepted limits in phase3e §14–15 |
| Currency conversion (P4) | conversion, tripConversion, rates, spending | ✓ 0.17.x | — | Incomplete totals; rate entry with locale decimal separators |
| Templates | templates, activityTemplate | ✓ | ✓ 0.13 | — |
| Global / trip lists | lists, listRecipients | ✓ | ✓ | — |
| Notes & tasks | note, reminders | ✓ | ✓ | **Reminders after an update** (alarms are re-registered at start; the memory-pressure patch is unverified on the phone) |
| Documents & attachments | resource, storage, resources | ✓ | ✓ | Opening each PDF after the upgrade; camera; large files |
| PDF export | itineraryHtml, itinerary | ✓ | ✓ 0.13 | Undated trips, money sections, Cyrillic |
| Calendar `.ics` (P8) | ics (+ ical.js) | ✓ file only | — | **Every real calendar app** (F-12) |
| AI planning / activity import | activityFormat, activityImport, activityDuplicates, planningContext | ✓ 0.10–0.11 | ✓ 0.13 | — |
| **Gmail confirmation search** | — | — | — | **Not implemented.** Discovery only (MASTER_ROADMAP §17; CLAUDE.md §7). Gmail is supported only as a *share source* for PDFs [R ✓ on the phone] |
| Feedback form | feedback, feedbackDraft, features | ✓ | — | **Off** by `EXPO_PUBLIC_FEATURE_FEEDBACK_ENABLED`, no `.env` present [V]; the route checks the flag [V]; the worker is not deployed (B1). Blocks B |
| Backup / restore | export, archive, backup, backup.queries | ✓ | Export ✓ / **restore ✗** | F-06, F-09 |
| Single-trip transfer | tripArchive, tripImport | ✓ 0.9.0+ | — | A real 0.13.0-made archive into 0.21.x (F-10) |

**Roadmap items not implemented (by design, not regressions):**
- Gmail lookup, accounts and sync, an AI API, weather, a passport vault, iOS (Discovery or Deferred);
- calendar reminders (`VALARM`) and to-dos in `.ics` (Phase 8 limits);
- full itinerary templates (Deferred);
- feedback deployment (B1, pending).

Car rental exists as transport `car` with pick-up and drop-off, not as its own kind [V].

---

## H. Detailed release rehearsal plan (planning only — do not execute)

**Global stop rule:** any unexpected result stops the rehearsal. Nothing is uninstalled or cleared, and
the evidence is kept. Never fall back to a different signing key.

**Environment:**
- a **new** AVD from a *Google APIs* image (allows `adb root`), no Google account, synthetic data only;
- `adb devices` must list only that emulator;
- an evidence folder `%USERPROFILE%\Pictures\TravelOrganizer-0.21.x-upgrade-rehearsal\` with
  `E2E-LOG.md`.

**Step 1 — Install the authentic 0.13.0**
- **Prerequisites:**
  - owner approval;
  - the stored `travel-organizer-0.13.0.apk`;
  - check that its badging shows versionCode 20 and the cert is `638dc686…`;
  - record the APK's SHA-256.
- **Action:** `adb install` on the empty AVD.
- **Accept:**
  - launches;
  - `user_version` = 6 (read with `adb root`);
  - Home is empty.
- **Stop if:** the signer differs, or the install fails.
- **Recovery:** delete the AVD and recreate it.

**Step 2 — Populate synthetic data that looks like the phone's**
- **Prerequisites:** the sample backup from `scripts/sample-backup.mjs` built from **main** (format 7),
  plus manual entries.
- **Must include:**
  - a ≥3-trip Lapland replica with Cyrillic names;
  - flights across zones, an overnight train, a car rental, a multi-day stay;
  - trip-level and item-level files: PDFs, photos, one of ~150 MB;
  - a link resource;
  - notes, pinned notes, tasks with reminders, completed tasks;
  - reusable and trip lists with recipients;
  - templates and their uses;
  - item participants;
  - adult and child travellers, with the *me* setting;
  - legacy expenses with `paid_by`/`split` text, and legacy `payments` rows;
  - a trip in the past;
  - one deliberately missing media file (delete it with `adb root`).
- **Accept:** each feature is visible in 0.13.0, and reminders are scheduled
  (`dumpsys alarm | grep travelorganizer` count recorded).
- **Stop if:** the import fails.

**Step 3 — Before-state snapshot**
- **Action:**
  1. `am force-stop`.
  2. With `adb root`, copy `files/SQLite/travel-organizer.db`, `-wal` and `-shm`, and the whole media
     directory, to the scratchpad. This is synthetic data only.
  3. Record per-table row counts, full ordered row dumps, `sqlite_master`, `integrity_check`,
     `foreign_key_check`, `user_version`, the SHA-256 of every media file, and the alarm count.
  4. In-app **Export everything**, saved off the AVD, as the format-7 reference.
  5. **Save an AVD snapshot `pre-upgrade`** to roll back to.
- **Accept:** `integrity_check` = ok; FK check empty except the planted case, if any; hashes recorded.

**Step 4 — Build the signed 0.21.x**
- **Prerequisites:** owner approval; F-03 guard or manual check; F-04 confirmed; F-01 test green.
- **Action:**
  1. `npx expo prebuild --platform android`, then `gradlew assembleRelease`.
  2. `apksigner verify --print-certs` must print `638dc686…`.
  3. Badging must show the same package, versionCode > 20 and the expected versionName, with no
     `debuggable`.
  4. The permission list must match the 0.13.0 APK.
  5. Record the APK's SHA-256.
- **Stop if:** any of these differ.

**Step 5 — Upgrade in place**
- **Action:** `adb install -r app-release.apk`. Never `-d`, never uninstall.
- **Accept:** `Success`, with the data directory kept (the media file count is unchanged before first
  launch).
- **Stop if:** `INSTALL_FAILED_*`. Do not "fix" it by uninstalling.

**Step 6 — First launch (007–014 in one start-up)**
- **Action:** `adb logcat` captured from before the launch; cold-launch; time to Home.
- **Accept:**
  - Home shows every trip;
  - no crash;
  - `user_version` = 14;
  - `PRAGMA foreign_keys` on the app connection cannot be read directly, so check behaviour: deleting a
    synthetic trip later cascades.
- **Stop if:** a crash, a hang over 30 s, or `user_version` < 14.

**Step 7 — Compare**
- **Accept:**
  - every pre-existing table is row-identical, new columns aside (they have their defaults or NULL);
  - `trips` has the same ids and values;
  - the new tables are empty except `trip_exchange_rates`, also empty;
  - `sqlite_master` equals a fresh 0.21.x install's schema (install on a second clean AVD for
    reference);
  - `integrity_check` ok; `foreign_key_check` identical to before;
  - every media SHA-256 identical and **no file deleted by the sweep**;
  - the alarm count equals the future reminders.
- **Stop if:** any difference that is not explained.

**Step 8 — Functional checks after the upgrade**
- Open every PDF and photo, offline (airplane mode).
- The old trips show correctly in the new UI.
- Add a payment, a split and a settlement on an old trip; set a reporting currency and rate; make one
  trip undated; export `.ics` and a PDF; share a Maps place (cold and warm).
- **Export everything (format 15)** and restore it on a clean 0.21.x AVD; counts and files identical.
- Export a trip archive and import it into a clean AVD.
- **Accept:** all pass; the restore reports 0 missing files except the planted one.

**Step 9 — Failure and recovery (from snapshot `pre-upgrade` each time)**
1. Kill during the first launch: `am force-stop` / `kill -9` at about 0.5, 1 and 2 s, several times.
   Expect `user_version` ∈ {6…14}, a consistent state at each, and the next launch completing to 14
   with identical data.
2. Storage nearly full before the first launch: fill with a dummy file. Expect a failure that changes
   nothing, then success after freeing space. This also shows F-02's UX.
3. Plant a broken pre-existing reference, then upgrade. Expect it carried over and the app to start.
4. Recovery drill: uninstall, install 0.13.0, restore the step-3 format-7 backup. The data is back as
   in step 3 (this proves the F-07 runbook).

**Step 10 — Evidence and verdict**
- `E2E-LOG.md` with the per-step PASS/FAIL, the hashes, the diffs, the logcat excerpts, the APK hashes
  and the signer output.
- The report states which items are **not** proven by an emulator: the phone's SQLite and storage, the
  Samsung battery manager, real Drive, and real calendars.

**Optional:** 9 → 14 using the stored 0.16.0 APK. It matters only if any device ever held 0.14–0.16
[R: none did].

---

## I. Two-phone manual QA plan

### Data safety rules (all sessions)

- **Owner's phone:**
  - no install, no USB connection, no `adb` of any kind, until after the trip and an explicit go-ahead;
  - the only actions are the owner's own, in the app: export a backup, export a trip archive, and the
    no-write preview check (§E.3).
- **Husband's phone:**
  - only in an owner-approved session;
  - synthetic data, unless F-05 is decided otherwise;
  - verify the signer before every install;
  - never uninstall or clear data without approval;
  - no `adb pull` of anything;
  - remove the test data and the app at the end, if the owner asks.
- Every build that is installed has a recorded SHA-256 and signer.

**[B]** = release blocker, **[O]** = optional polish.

### I.1 Emulator release rehearsal

The whole of §H. **[B]**

### I.2 Husband's phone — full-feature session (0.21.x)

1. **[B]** **The upgrade path on real hardware:** install the stored 0.13.0, add synthetic data and
   attachments, export a backup to Drive, upgrade to 0.21.x in place, and check that everything is
   there. A clean install alone does **not** test what the owner's phone will do; this is the most
   valuable addition to the agreed strategy.
2. **[B]** Backup round trip through **real Drive**, on 0.13.0 and on 0.21.x, then a restore after
   reinstalling (F-06, F-09: include one large synthetic backup).
3. **[B]** Trip archive: a 0.13.0-made archive into 0.21.x (synthetic; the real Lapland copy only per
   F-05).
4. **[B]** Google Maps share: warm, **cold (app killed)**, and from the recents screen. Lookup on Wi-Fi,
   mobile data, offline, and a slow network (8 s timeout). Duplicate place, a place without
   coordinates, a long non-short link, a non-Google link.
5. **[B]** Calendar: import the `.ics` into Google Calendar (an account already on the phone) and
   Samsung Calendar; if possible Outlook (mobile or web) and Apple Calendar (any Mac or iPhone in the
   household). Check:
   - zones and summer/winter time (include an event across the late-March or late-October change);
   - all-day plans;
   - a multi-day stay (two events);
   - a car rental;
   - an overnight cross-zone journey;
   - a timed start with a date-only end;
   - re-import after an edit (duplicates or update);
   - the default privacy (no references or notes).
6. **[B]** Reminders: fire while locked and idle for at least an hour (Samsung battery optimisation);
   after a reboot; after the upgrade.
7. **[B]** Offline: airplane mode, cold start, open every PDF and photo, search, Timeline, day map
   (offline drawing).
8. **[B]** Kill and restart: force-stop during an edit form, a backup export, a restore, and an archive
   import. Afterwards nothing is half-written and the next launch is clean.
9. **[B]** Finances end to end: deposits, a split by amounts, children covered, settlements, review
   holds, conversion with an incomplete total.
10. **[B]** Device time-zone change: times do not move.
11. **[O]** Large text (font scale ×2), a narrow screen, dark mode, TalkBack labels on the main actions.
12. **[O]** Error states: a missing file, a corrupt zip, the wrong kind of file in each importer, a
    newer-format file, storage almost full.
13. **[B]** Persistence: data survives an app update (0.21.x → 0.21.x+1 with the same key) and a reboot.

### I.3 Owner's phone — future safe update (after the trip; each step approved)

1. **[B]** The owner exports a full backup and a trip archive, saves both to two places, and runs the
   §E.3 preview check.
2. **[B]** Confirm the build: the same SHA-256 that passed §H and I.2; signer `638dc686…`.
3. **[B]** Install over the existing app (never uninstall). Open it and check the trip, every document
   and the reminders.
4. **[B]** Keep the pre-upgrade backup untouched for at least one more trip (F-07).
5. **[B]** Have the recovery runbook at hand (uninstall, 0.13.0 APK, restore), to be used only if the
   app cannot start.

Before the trip, a "risk-free" update from `main` is **not recommended**: there is no compelling need,
and every install carries some risk.

### I.4 Friends' beta entry criteria

- I.1 and I.2 pass with all [B] items.
- F-02, F-03, F-08 and F-11 are resolved.
- B1 (the feedback worker) is done or explicitly skipped.
- The final user guide exists, with screenshots.
- A privacy note covers: no cloud, but Android backup (F-08); the Maps lookup sends one request; the
  feedback payload; the camera and microphone permissions.
- Distribution and an update procedure for friends (same key, how to update without uninstalling).

---

## J. User guide readiness (`docs/user-guide.md`, 748 lines)

**Wrong or stale:**
- the header says "Written for version 0.6.0";
- *Currencies* (§4) says nothing is converted and that splitting/conversion is "planned for later";
- the finance sections are tacked on at the end, tagged "(0.14.0/0.15.0/0.16.x, not yet on your phone)";
- the calendar re-import behaviour is stated as fact without having been tested;
- §6 says "no cloud", which F-08 contradicts.

**Missing:**
- A **Quick Start** (5 minutes: install, first trip, a booking, attach a ticket, back up).
- **Install and update** for sideloading: Auto Blocker, Play Protect warnings, why never to uninstall,
  and how to check you are updating, not replacing.
- **Finances as one coherent chapter:**
  - prices and paid;
  - payments on bookings;
  - expenses linked to bookings;
  - splitting, covers for children;
  - who owes whom, settlements, review holds;
  - the reporting currency, typed-in rates, *charged* amounts;
  - why balances stay per currency;
  - a worked Lapland example with numbers.
- **Travel documents:** what to attach, offline, missing files, renaming, trip-level documents.
- **Trip import and export:** an archive versus a backup, privacy, linking travellers, repeated
  imports.
- **Google Maps:** sharing a place, what the lookup sends, offline behaviour, coordinates, the day map
  and directions.
- **Calendar export:** what is included, privacy options, behaviour per calendar app (after QA),
  re-export.
- **Undated trips.**
- **Troubleshooting:**
  - a share did nothing;
  - a PDF will not open;
  - reminders do not fire (battery settings);
  - "not a backup this app can read";
  - the backup is too large;
  - the app does not start after an update;
  - the time looks wrong after flying.
- **A screenshot per main screen** (from synthetic data on the husband's phone or an emulator, at
  normal and large text), and a **FAQ / glossary** (place versus booking, idea versus confirmed).

**Plan:**
1. Restructure the guide after I.2 QA, so that screenshots and real-calendar notes reflect verified
   behaviour.
2. Keep the owner guide and a shorter friends guide (Quick Start plus troubleshooting plus privacy).
3. Review it against `product-status.md`, which needs its own refresh (F-18).

---

## K. Prioritised next actions (smallest safe sequence to a friends' beta)

1. The owner reviews this audit and decides F-05 and F-08.
2. **[approval] Test-only work, no app behaviour change:**
   - F-01: the runner-level 6→14 test with full tables and a schema comparison;
   - F-10: golden 0.13.0 fixtures.
3. **[approval] Small code fixes in a 0.21.1:**
   - F-02: a root error boundary;
   - F-03: fail the release build without the signing properties;
   - optionally F-14 (pragmas) and F-08 (`allowBackup`).
   - No migration changes.
4. The owner confirms an off-machine keystore copy (F-04).
5. The owner, on the primary phone, by hand: a full backup plus a trip archive to two places; the §E.3
   preview check. No install.
6. **[approval]** Build the signed 0.21.1 release; verify the signer, badging and permissions.
7. **[approval]** The emulator rehearsal (§H). Fix any findings.
8. **[approval]** The husband's phone session (§I.2), starting with the 0.13.0 → 0.21.1 upgrade
   on synthetic data.
9. Fix QA findings, then a short re-check on both.
10. **[approval]** B1: deploy the feedback worker plus a security check, or decide to ship the beta with
    feedback off.
11. Final user guide plus a friends' guide plus a privacy note (§J).
12. **[approval]** Distribute the friends' beta.
13. After the owner's trip: §I.3 → **[approval]** merge `phase-3d1` into `main`, tag it, and install on
    the owner's phone.

---

## L. Explicit approval gates (each needs its own go-ahead)

1. Any change to the repository: tests (step 2), code fixes (step 3), docs, commits, pushes.
2. Any change to `app.json` / config plugins (`allowBackup`, signing guard).
3. Running `expo prebuild` (rewrites the ignored `android/`) and building any APK or AAB, debug-signed or
   release.
4. Creating or using emulator AVDs for the rehearsal, and using `adb root` on them.
5. Using the release keystore for signing.
6. Each install on the husband's phone, each data import onto it, and in particular **any real-trip
   copy** (F-05).
7. Any connection to the owner's primary phone (even read-only `adb`), and any install on it, which
   comes only after the trip.
8. Merging `phase-3d1` into `main`; creating release tags.
9. Deploying the feedback worker (B1) or turning on `FEATURE_FEEDBACK_ENABLED`.
10. Distributing any APK to friends.
11. Any new migration (none is proposed).
12. Any change to the signing key or the application id (none is proposed; never without the owner).

---

Audit complete. No application files changed, no build created, no device touched. Awaiting owner
review and explicit approval.
