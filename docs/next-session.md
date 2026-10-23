# Next session — handoff (written 2026-10-23, after Phase 3 was closed)

Read `CLAUDE.md` first, then this file. It says where the work stands, what is waiting for the owner,
and how to pick up the next task. The detailed history is in `docs/session-handoff.md` §11 and
`docs/status.md`.

## 1. Where things stand

| | |
|---|---|
| **Branch with the work** | `phase-3d1`, the 0.16.3 commit "Close Phase 3" (pushed to the personal GitHub remote) |
| **`main`** | `46d256a` — 0.13.0, schema 6, backup format 7. **What the owner's phone runs.** |
| **`phase-3d1` app** | **0.16.3**, versionCode 26 (a header fix; no schema or format change) |
| **Database schema** | 11 (migrations 007–011 exist only on `phase-3d1`) |
| **Backup / trip archive format** | 12 / row format 12 |
| **Tests** | 1626 Node tests in 81 suites, `npx tsc --noEmit` clean |
| **Phase 3 (3B → 3E)** | **Closed (2026-10-23).** Everything through 0.16.2 passed the owner's review, and the exit checks are in `MASTER_ROADMAP.md` §6.4, §7.5, §8.3 and §9.3. One item is open: the signed release rehearsal 0.13.0 → 0.16.x. |
| **Phone** | Untouched. Holds a real trip on 0.13.0. |
| **Release APK** | None built for 0.16.1, 0.16.2 or 0.16.3. The newest release APK is 0.16.0, at `%USERPROFILE%\.travel-organizer\`, and it predates the corrections. |

### What 0.16.x added after 0.16.0 (all reviewed)

- **0.16.1**
  - **P2:** settlement and expense input is validated again in the repository (`validInput`).
  - **P1:** in a currency with settlements, an unsplit cost must be split or *kept outside* on
    purpose. This adds migration 010 (`unsplit_confirmations`) and plan §14.2.
  - **Follow-up:** a financial edit ends a confirmation for good, even when undone (plan §14.4).
- **0.16.2 — settlement review holds**, migration 011 (`settlement_reviews`), plan §15, D44.
  - A shared cost leaving a currency with settlements is refused until the person continues.
  - After that, the currency's suggestions are held until *Settlements still stand*.
  - Every money write goes through `src/repositories/moneyWrites.ts` (`moneyBefore` /
    `afterMoneyWrite`). **A new write path that changes a cost's money must call it.**

## 2. The rules that still bind (owner, verbatim where quoted)

- **Physical testing comes last, and is split (owner, 2026-10-23).** Phones only after the work is
  done, independently reviewed and tested on emulators. Then:
  - **the owner's primary phone** (real trip, real data) gets **only risk-free changes until the trip
    has passed** ("we always defend the real data"). The risky changes go onto it **after the trip,
    not before**;
  - **the husband's phone** (the secondary phone, no real data) tests **all changes**.

  Each install still needs the owner's go-ahead (master roadmap §3.1).

- "I have real data … those changes should be separated from main." **Do not merge `phase-3d1`
  into `main`** until the owner says so; the plan is after the owner's trip.
- **The primary Samsung phone:**
  - "Do not touch my primary Samsung phone."
  - Never install on it, connect to it, uninstall from it, or clear its data.
  - Never `adb pull` personal files.
- "Do not access, import, modify or migrate my real trip data or personal backups."
- **Synthetic data, emulators only.**
- **Signing, ids and the backend:** never change the signing key or the application id; never
  deploy backend infrastructure.
- **Release APK:** do not build one without separate approval.
- **Phases:** do not start a new phase until the owner asks for it. Finishing one is not permission to
  start the next.
- **Migrations:** never edit 001–011; add a new one, and only after explaining it and getting
  approval.
- **Plan first:** for non-trivial work, a written plan the owner approves before any code.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pushing task
  commits to the personal remote is pre-authorised.

## 3. Next tasks — none is started; each waits for the owner to ask

In the likely order. Ask which one, rather than choosing.

1. **Bring 0.16.x to the phones, after the trip.** Every step needs the owner's go-ahead.
   0.16.x carries migrations 007–011, so it is **not** a risk-free change. It goes to **the husband's
   phone first**. The primary phone gets it **only after the trip has passed**.
   1. Build a **signed release** 0.16.x (needs approval). *Note:* this session's safety classifier
      blocked switching `buildTypes.release` to the debug key (the §4 recipe). Ask the owner before
      relying on that recipe again; a plain `assembleDebug` dev build works for UI checks.
   2. Rehearse on an emulator: in-place release upgrade **0.13.0 → 0.16.x** over synthetic data
      (migrations 007–011 in one start-up), with database snapshots compared before and after. This
      is the master roadmap §19 checklist item still open for 0.16.1–0.16.3.
   3. Install on the husband's phone (synthetic data) and test everything there.
   4. For the primary phone, **after the trip**: the owner exports a backup first, then merge
      `phase-3d1` into `main` and install only when the owner explicitly allows it.
2. ~~Close Phase 3~~ — **done 2026-10-23** (0.16.3).
3. **Phase 4 — multi-currency integrity and conversion** (master roadmap §10). Not started. It needs
   its own plan, a decision on where exchange rates come from, a migration review, and the owner's
   approval. It reverses the earlier "never convert" rule (D25 → D32), so the 3E balances (one per
   currency, never added together) are its starting point.
4. **B1 — the feedback worker** deployment and security check, before any friends APK (master
   roadmap §16.2). Off behind `FEATURE_FEEDBACK_ENABLED`.
5. **Small known items**, not scheduled:
   - ~~*Expense / s* at 360 dp and font 2.0~~ — fixed in 0.16.3: when a title would break inside a
     word, `ScreenHeader` moves the actions to their own row above it (`breaksInsideWord`).
   - Seen in that check, not changed: at 360 dp / font 2.0 the trip line and dates beside the
     header actions are cut short (*Lapland, F…*, *20–24 Nov …*) on Timeline, Places and Notes & lists.
   - Phone-QA leftovers in `docs/status.md` *Final phone QA*.
   - Accepted limits of 3E: plan §14.3 item 5 as superseded by §15, and §15.7 items 3 and 5.

## 4. How the work was verified — recipes, since the helper scripts were temporary

The emulator helpers (`dev.sh`, `pull.sh`, `ui.js`, `dbdiff.js`, `make-trips.ts`, `make-holds.ts`)
were in a session scratchpad and are probably gone. The essentials:

- **AVD:** `TO_2B_Test`, at `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd TO_2B_Test
  -no-snapshot-save`. Since 2026-10-23 it holds the **debug variant** of 0.16.3 (`assembleDebug`, needs Metro: `npx expo
  start --dev-client --offline` plus `adb reverse tcp:8081 tcp:8081`), over the same synthetic trips (*3E Family*, *3E Hotel
  deposit*, *3E Review holds*, …). Check `adb devices` first: only `emulator-5554` may be listed.
- **Debug-signed test build:** in `android/app/build.gradle` (gitignored), in `buildTypes.release`:
  1. Replace the `signingConfig …` line with `signingConfig signingConfigs.debug // E2E-INJECT`.
  2. Add `debuggable true // E2E-INJECT`.
  3. Run `cd android && ./gradlew assembleRelease`.
  4. Verify the signer with `apksigner verify --print-certs`: it must be *Android Debug*
     (`fac61745…`).
  5. Restore the file afterwards: 0 `E2E-INJECT` lines, versionCode 25 / 0.16.2.

  Adding only `debuggable true` gives a debuggable APK signed with the **release** key. Never do
  that.
- **Database before and after:** `adb -s emulator-5554 exec-out run-as com.evelinadakovska.travelorganizer
  cat files/SQLite/travel-organizer.db > x.db` (and the `-wal` file). Compare table by table with
  better-sqlite3 (`SELECT * … ORDER BY rowid` per table), and check `PRAGMA integrity_check` and
  `foreign_key_check`.
- **Synthetic trips:** build them with the app's own `buildTripArchive` + `packTripArchive`
  (`src/domain/tripArchive.ts`). Run under Node with `@babel/preset-typescript`, `adb push` to
  `/sdcard/Download`, then use *Backup & restore › Import a trip*.
- **UI driving:** `uiautomator dump` plus `input tap`. Alert buttons read in capitals (*DELETE*,
  *CONTINUE*). At font 2.0, Home is long: search for a trip downward, with short swipes.
- **Display checks:** `wm density 569` (360 dp on the 1280 px AVD), `settings put system font_scale
  2.0`, `cmd uimode night yes`. Reset all three afterwards.
- **Typed routes:** a new route file needs `.expo/types/router.d.ts` regenerated. Start
  `npx expo start --offline` briefly, then stop it.
- **Bash heredocs containing backticks fail** in this environment. Write scripts with the Write tool.
- 0.16.3 header check: `%USERPROFILE%\Pictures\TravelOrganizer-0.16.3-header-e2e\E2E-LOG.md`.
- Evidence from the last rounds: `%USERPROFILE%\Pictures\TravelOrganizer-0.16.1-review-e2e\` and
  `…-0.16.2-holds-e2e\` (`E2E-LOG.md` and screenshots).

## 5. Where to read more

| For | Read |
|---|---|
| 3E design, corrections and as-built | `docs/phase3e-plan.md` §13–§15 |
| Why | `docs/decision-log.md` D42–D44 |
| Schema, queries, formats | `docs/technical-reference.md` §23, §23.1, §23.2 |
| Task-by-task state | `docs/status.md` (wins if anything disagrees) |
| The long-term plan and exit gates | `docs/MASTER_ROADMAP.md` (§9 3E, §10 Phase 4, §19 checklist) |
| How the owner works, the machine | `docs/session-handoff.md` §6–§9 |
