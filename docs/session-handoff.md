# Session handoff

For a Claude session that starts with no memory of this project. It explains **what we are
building, how it is built, what was decided and why, how to work on it, and what bites**.

It does **not** hold status — `docs/status.md` does, and it wins on any disagreement. Nothing here
is a substitute for `CLAUDE.md` (the authoritative summary) or `docs/technical-reference.md` (the
single source of truth for schema, time, files, queries). Read in this order:

1. `CLAUDE.md` — product, terminology, conventions, "findings already paid for"
2. `docs/status.md` — what is done, what is next, the open questions; `docs/roadmap.md` — the
   phases ahead (overview); **`docs/MASTER_ROADMAP.md` — the long-term product roadmap**, with each
   phase's requirements and gates and the rules that must not drift (§18)
3. this file — how the work actually goes, and the traps
4. `docs/technical-reference.md` — when you touch schema, time, files, queries, native
5. `docs/decision-log.md` — why, and what was rejected (D1–D37)
6. `docs/windows-handoff.md` — machine setup, release build, Windows specifics

Last verified: **2026-10-20**, after 0.12.0 (Phase 3B) — **1153 tests**, typecheck clean.

> **Starting fresh? Jump to §11 first** — it is the exact point the last session stopped, what is
> waiting on the owner, and the next steps in order.

---

## 1. What this is, in one page

A personal, **Android-only, local-first** app that holds everything already decided or booked for a
trip: tickets, boarding passes, hotel confirmations, PDFs, reservation references, links, saved
places, notes. One user: the owner, who travels with a Galaxy S26 Ultra.

It is **not** a planner, recommender, search engine or booking service. It organises information
that already exists.

The scenario every decision serves:

> *"I am travelling, possibly stressed, possibly without internet. I need to know what happens next
> and find the relevant ticket within seconds."*

**The asymmetry:** writing happens at home, on wifi, weeks ahead, and may be a boring form. Reading
happens abroad, stressed, offline, in seconds, and may not be. Spend complexity on the read side.

**The corollary that ranks the work:** the app is a filing cabinet whose most valuable content is
**binary files it does not own**. The PDF is the product; everything else is metadata to find it.
File handling and offline access outrank the timeline.

**Explicitly not building** (do not drift into these): AI features in the app, itinerary
generation, flight or hotel search, booking APIs, Gmail integration, cloud backend, accounts, sync,
collaboration, weather, automatic booking parsing. Since 2026-10-19 the roadmap does bring in an
AI-written JSON import, currency conversion, a day map, undated trips and an `.ics` export — each
only when its phase is asked for (D32).

---

## 2. Where things stand

**Status lives in `docs/status.md` only** — the version on the phone, what is done, what is next.
It used to be repeated here and drifted (this section still said 0.2.0 was on the phone after
0.3.0 was). §11 below says where the last session stopped.

Stable facts: the APKs are kept in `%USERPROFILE%\.travel-organizer\`
(`travel-organizer-<version>.apk`); rebuild before installing if any code changed since. The
phone checks still open are in `docs/status.md` → *Final phone QA*.

---

## 3. How the code is organised

```
app/              expo-router routes ONLY — thin, no logic
src/db/           client, migrations, and SQL constants (queries.ts)
src/domain/       PURE TS. No React, no SQLite, no Expo. All the testable logic
src/repositories/ SQL execution. SQL lives here and in db/queries.ts, nowhere else
src/files/        file import, path resolution, GC sweep
src/notifications/ reminders: permission, channel, reconcile with the database
src/hooks/        useLiveQuery, useNow
src/ui/           theme (palette → roles → tokens) and shared components
src/features/     screen-level composition per feature
```

**The rule that matters: `src/domain/` imports nothing native.** That is what lets the real logic
run under `npm test` in plain Node with no mocking and no emulator. If a domain module seems to
need an Expo import, the design is wrong — split it so the decision is pure and the I/O is a thin
caller. Examples to copy: `domain/reminders.ts` decides *what* should be scheduled and
`notifications/reminders.ts` only talks to Android; `domain/archive.ts` builds the backup bytes and
`files/backupFiles.ts` only moves them.

**Conventions that are enforced in review:**
- Hand-written, append-only migrations. Never edit a shipped migration; add one. `PRAGMA
  user_version` tracks the version, `foreign_keys = ON` on every connection, `journal_mode = WAL`
  once at creation.
- UUIDs from `expo-crypto`, never autoincrement. Timestamps are TEXT ISO. Money is INTEGER minor
  units, never REAL.
- Zod at every boundary: forms, the `details` JSON column, share-intent payloads, backup files.
- No premature abstraction. Two call sites is not a pattern.
- Comments say *why*, not *what*. Match the density already in the file.

---

## 4. The decisions that shape everything

Rationale and rejected options are in `docs/decision-log.md`; this is the short list a new session
needs before touching code.

**"Place" is a state, not a type (D1-era).** Two independent axes: `kind` (transport, stay,
activity, food, task, other) and `status` (idea, confirmed, cancelled). A café you might visit is
`kind='food', status='idea'`. Places, Bookings and Timeline are three queries over one table, and
promoting a place to a plan is a single `UPDATE`.

**One `trip_items` table.** Seven tables: `trips`, `trip_items`, `trip_notes`, `resources`,
`settings`, and `expenses` + `payments` from migration 002 (an expense is not a TripItem, D25). Kind-specific extras live in a Zod-validated `details` JSON column, pinned to transport
(from, to, carrier, number, seat) and permissive elsewhere.

**Time: store wall-clock + IANA zone, derive the instant.** Never store a bare UTC instant for a
user-facing time. A flight leaving Sofia at 06:10 must read 06:10 wherever the phone is. So
`start_local` + `start_tz` + `start_precision`, with `start_utc` written by the repository layer as
a **sort key only**. Day grouping uses `substr(start_local,1,10)`, never UTC. This rule caused two
bugs found on the phone (see §8) — respect it in every new screen.

**Resources: one table, two behaviours.** `kind='file'` (an owned blob with a lifecycle) and
`kind='link'` (a string to open). `wallet`/`maps`/`website` are `subtype`, presentation only.
`confirmation_code` lives on the item, not as a resource: it is wanted in the header without a
join, and its affordance is copy, not open.

**File paths are relative, never absolute.** Store `media/<uuid>.pdf`; join to `Paths.document` at
read time. An absolute sandbox path breaks silently after a reinstall — discovered abroad is the
nightmare case. Files are named by id so two `ticket.pdf` cannot collide.

**Orphaned files are collected, not deleted inline.** SQLite cascades rows, not files. A GC sweep
runs on app start: anything in `media/` no `resources.stored_path` points at is deleted. Crash-safe
and self-healing. **Never pass a failed read into the sweep** — an empty reference list means
"delete everything".

**SQLite is the source of truth. No global store.** No Redux, Zustand or TanStack Query. The real
need is "re-render when the DB changes", met by `useLiveQuery` over
`addDatabaseChangeListener`. Never mirror rows into memory.

**Five trip tabs, no Bookings tab (D20, D25).** Now · Timeline · Places · Expenses · Notes, with the
add button floating above the bar (it adds an expense on Expenses). Trip facts and trip documents sit at the bottom of Now. `SELECT_BOOKINGS`
still exists and is tested, with no screen using it.

**A confirmed item is cancelled before it can be deleted (D21).** Its tickets may be the only
copies. Delete is offered for ideas and cancelled items; a confirmed item offers *Mark as
cancelled*, with the rule stated on the screen.

**Cancelled items are hidden from Timeline and Now, but stay searchable (D3, D22).** The row is
kept deliberately: the cancellation confirmation is attached to it.

**Reminders by kind, reconciled not tracked (D23).** Travel 3h before, a stay on the morning of
check-in (09:00 local, or at check-in if earlier), activity/food/other 1h before, a task at its
time, a date-only item at 09:00 — all in the item's own zone. One on/off switch per item, stored as
`details.reminder = 'off'` so no migration was needed. Android's scheduled set is **reconciled**
against the database on launch and after any change to `trip_items` or `trips`, so none of the six
places that write items needs reminder code.

**Sideloaded, signed with a private key (D24).** Release builds are signed with a keystore that
lives outside the repo; the generated project would otherwise use React Native's public debug key,
which would let anyone sign an "update" that inherits the app's data.

**Backup is one zip for everything (C5/S5).** `backup.json` plus `media/`, packed with `fflate`.
Import plans first (`planImport`) and applies in one transaction, writing files before rows.

---

## 5. Native and platform specifics

**A custom dev client is mandatory** (`expo prebuild` + `expo run:android`). Expo Go cannot run
this app: `expo-share-intent` and the date picker are native. `/android` and `/ios` are generated
and **not committed**.

**Two patch-package patches, applied by `postinstall`:**
- `patches/expo-share-intent+8.0.1.patch` — the library crashed the whole app when a share pointed
  at a URI it could not read (`getFileInfo` reads the first row of an empty cursor). Both entry
  points are wrapped so it raises the library's `onError` instead; `app/_layout.tsx` turns that into
  *Could not read what was shared*.
- `patches/expo-notifications+57.0.20.patch` — when an alarm fires, expo relays through two more
  broadcasts (trigger → receive → present) and the app sits idle between them. On the phone, a
  minute after a reboot, Android's low-memory killer ended it in that gap and the reminder was never
  shown. The patch presents the notification inside the alarm's own receiver whenever the app is not
  in the foreground; in the foreground the relay is kept so the JS handler still decides.

**⚠ Expo modules ship prebuilt.** Patching one does nothing unless `package.json` lists it under
`expo.autolinking.android.buildFromSource` (today: `expo-notifications`). Verify a patched module
really compiled: the build log must contain `:expo-notifications:compileReleaseKotlin`.

**`USE_EXACT_ALARM`** is declared in `app.json`. Without it Android gives each alarm a delivery
window that grows with lead time (2 minutes on a 3-minute test). It is granted at install on
Android 13+. Play Store policy restricts it to alarm/calendar apps, which does not apply to a
sideloaded personal app — revisit only if this ever goes to the Play Store.

**Share intent filters** (`app.json`): `text/*`, `image/*`, `application/pdf`, singly and multiple;
`disableIOS: true`. Not `*/*`, which would put the app in the share sheet for everything. On
Android the library copies shared files into the app cache before JS sees them, so the "copy
immediately" requirement is already met; the app imports from that path on save.

**`plugins/withReleaseSigning.js`** injects the release signing config into the generated Gradle
project, reading the keystore from Gradle properties outside the repo and falling back to the debug
key when they are absent, so a fresh clone still builds.

---

## 6. The machine and the commands

Repo: **`C:\dev\travel-organizer`** — *not* under `Desktop\repos`. The NDK's ninja enforces a
260-character path limit regardless of `LongPathsEnabled`, and CMake counts the absolute path twice.
Moving the repo to `C:\dev` is what fixed the first Windows build.

```bash
npm install                 # postinstall applies the patches
npm test                    # 1119 tests, ~3s
npx tsc --noEmit            # must be clean
npx expo prebuild --platform android      # after any app.json or native change
# EXPO_NO_GIT_STATUS=1 when the tree is dirty, or prebuild stops on a prompt
```

**Dev build (emulator):** Metro in its own terminal, then the build naming the device:
```bash
tail -f /dev/null | EXPO_NO_DEPENDENCY_VALIDATION=1 npx expo start --dev-client
EXPO_NO_DEPENDENCY_VALIDATION=1 npx expo run:android --device Pixel_10_Pro --no-bundler
adb reverse tcp:8081 tcp:8081    # then open the dev client with url=http://localhost:8081
```
Do **not** use `CI=1` — it ignores the running emulator and quits.

**Release build (what the owner installs):**
```bash
cd android && ./gradlew assembleRelease     # ~9 min cold, ~1–3 min when only JS changed
adb -s <serial> install -r --user 0 android/app/build/outputs/apk/release/app-release.apk
```
~115 MB, all ABIs. Keystore and passwords: `%USERPROFILE%\.travel-organizer\release.jks` and
`%USERPROFILE%\.gradle\gradle.properties`. Certificate SHA-256 `63:8D:C6:86:…:52:35:E7`; check any
APK with `apksigner verify --print-certs`. **The owner was told to back these up** — losing them
means the next version can only be installed by uninstalling, which deletes the data.

**Test data:** `node scripts/sample-backup.mjs` writes `sample-backup.zip` (gitignored) — the two
fixture trips from the plan, Milan and Lapland, 41 items and 28 generated PDFs, all invented. Push
it to the device's Downloads and load it through *Import a backup*. Never use real bookings.

**Formatting:** the repo has **no prettier config**, and files were not written by prettier. Its
defaults use double quotes and will reformat whole files. If you must run it, match the house
style: `--single-quote --print-width 100 --bracket-same-line --trailing-comma all`, and only on
files you actually changed.

---

## 7. Driving a device (this is how the QA actually gets done)

Claude drives the emulator and, when the owner connects it, the phone, through `adb`. Keep helper
scripts in the **scratchpad**, never in the repo. Three are enough:

- `ui.sh` — `uiautomator dump` piped through a tiny node parser into `text @ x,y` and
  `[content-desc] @ x,y` lines. This is how you "see" the screen cheaply.
- `tap.sh "<exact text>" [n]` — find that node and tap its centre, with retries.
- `shot.sh <name>` — `adb exec-out screencap -p` into a PNG you can Read.

Hard-won details:
- **`export MSYS_NO_PATHCONV=1`** in Git Bash, or adb device paths get mangled into Windows paths.
- **Always `adb -s <serial>`** when both an emulator and the phone are attached.
- **The navigation bar eats taps.** uiautomator reports nodes underneath it (y ≳ 2150 on a
  1080×2340 phone). Scroll first, and refuse to tap anything below that line — a stray tap hits
  Home or Recents and the app loses the screen.
- **A tapped text field moves the dialog.** Material time pickers jump when the keyboard opens: tap
  the field, re-dump, then type. Use the picker's *Switch to text input mode* rather than the clock.
- **`tap.sh "X" 2` counts both the text node and its content-desc**, so "the second one" is usually
  not the second control. Prefer unique text, or coordinates from a fresh dump.
- **Testing a file share from adb is not representative:** `--grant-read-uri-permission` does not
  cover the `STREAM` extra, so the app genuinely cannot read the file. Share from the Files app (or
  Gmail/Photos) instead, which grants it properly. The crash that exposed the share-intent bug came
  from exactly this.
- **The dev client cannot be cold-started by a share** — its launcher fails on `ACTION_SEND`
  (`Set.addAll` on null) before app code runs. Test that path on a release build.
- **The dev client's floating Tools button covers the Edit button** (top right, ~1154,282 on the
  emulator). Turn it off: dev menu → *Tools button*.
- **Typing tests go through the on-screen keys.** `adb input text` and chained keyevents pass
  through Gboard's composing text; the currency bug only showed its real shape with key taps.
- **The new-expense form focuses Amount**, so the keyboard covers the receipt buttons. Close it
  first (`KEYCODE_BACK`).
- **After a native build, if the dev client sits on a white screen**, time
  `curl localhost:8081/status`. Metro twice took 14s+ to answer and only recovered after a restart;
  stop the Gradle daemons (`android/gradlew --stop`) and restart Metro.
- **Emulator hanging at boot** with *OpenGL Core Profile not supported*: start it with
  `emulator -avd Pixel_10_Pro -gpu swiftshader_indirect`.
- **Moving the emulator's clock** (to test Now or the Timeline during a trip): the image refuses
  `date` and `adb root`, but `adb shell settings put global auto_time 0` then
  `adb shell cmd alarm set-time <epoch ms>` works. Send the app to the background and back
  (`monkey -p <pkg> 1`) to pick up the new time. **Do not reload the JS while the clock is moved** —
  the dev client sat on a white screen until the clock was set back (`auto_time 1`). Cold-start
  with the real clock, then move it.
- **Fast Refresh after editing a module everything imports** (`useLiveQuery`) re-mounted the
  database provider and showed *database is locked*. Development only; a cold start clears it.
- **Making a read fail on purpose** (R4) or a shared file fail to copy (R5): a temporary
  `__DEV__`-only switch, driven by time windows rather than edited at runtime (see above), and
  removed before the commit — grep for it.
- **Image pickers on the dev client** (camera and gallery) fail with *Attempting to launch an
  unregistered ActivityResultLauncher*: the dev launcher replaces the activity expo-image-picker
  registered its launchers with. Not an app bug — the release build opens both. Test pickers on a
  release build.
- Useful probes: `adb shell dumpsys alarm | grep -A3 <pkg>` (look for `window=0
  exactAllowReason=policy_permission`), `adb shell dumpsys notification --noredact`,
  `adb shell cmd connectivity airplane-mode enable|disable`,
  `adb shell cmd alarm set-timezone Asia/Tokyo`, `adb shell am force-stop <pkg>`.

**On the owner's phone, two rules:**
1. **Minimise phone → laptop data flow.** No `adb pull` of personal files; the release build refuses
   `run-as` anyway. Do not screenshot their inbox, gallery or home screen; filter UI dumps to the
   lines you need. Push your own test files (a generated PDF, screenshots of the app) and delete
   them afterwards.
2. **Anything involving their accounts is theirs to tap.** Gmail in particular: ask them to share an
   attachment, then inspect what the app received.

Samsung specifics: **Auto Blocker** (Settings → Security and privacy) blocks sideloading and ADB —
it must be off to install, and should go back on afterwards. Developer options → **Stay awake**
keeps the screen on while driving the UI over USB.

---

## 8. Bugs found on a real device that tests did not catch

Worth knowing, because they show the class of mistake this app is prone to.

- **A journey's end had no zone label.** Item detail showed *until … 16:50* for a flight landing in
  Sofia on a Vienna trip — an hour out. Start and end now each carry their own zone through
  `withZone`. The time model was right; the **rendering** dropped the context.
- **The trip card printed the IANA id** (*Europe/Vienna*) instead of *Vienna time*.
- **Reminders could vanish under memory pressure** (see §5). A reminder that fires but is never
  shown is worse than no reminder: nothing in the app looks broken.
- **A stale live query after import.** `applyImport` used `withExclusiveTransactionAsync`, which
  writes through a second connection the change listener never hears, so Home still said "No trips
  yet" after a successful restore. Use `withTransactionAsync`.
- **A restored phone never asked for notification permission**, because the prompt only followed an
  item save. Import now asks when the restored trips have upcoming reminders.

The pattern: the pure logic was fine in all five; the failures were in **wiring, platform behaviour
and presentation**. Test the domain in Node, but prove the feature on a device.

---

## 9. How the owner works

The owner is a frontend developer (~1 year professional React Native), reviews all the code, and
prefers direct technical discussion — no explaining basic React.

- **The task loop:** implement → `npm test` and a manual pass on the emulator → fix what is broken →
  commit → push → next task, without stopping to ask between tasks. Pushing to the personal GitHub
  remote is pre-authorised for task commits.
- **Stop for genuine product decisions.** Explain the trade-off, recommend one option, wait. Small
  implementation details are yours to decide.
- **Device work is batched.** Build as far as the emulator allows; collect what needs the phone into
  one checklist and do it in a single session when they connect it.
- **A task is not done until it is committed and ticked in `docs/status.md`.** That file survives a
  compacted context; the conversation does not.
- Commits: a real subject line, a body that says what changed and *why*, and the attribution lines
  the session's system reminder specifies.
- **Plan first (owner's rule, 2026-10-11).** For anything non-trivial, write a detailed
  step-by-step plan — steps, files, data changes, tests per step, every decision it implies — show
  it, get a yes, then build against it. N5a skipped this and had to be audited afterwards
  (`docs/n5-plan.md`); the owner asked that it never happen again.
- **Data safety above everything.** The owner's words: *"its very very important not to delete or
  lose anything of the already added data"*. Anything that touches stored data gets: tests on
  data shaped like theirs, an update rehearsal on the emulator from the exact version on the phone,
  a fresh Drive backup by the owner first, and `adb install -r` — **never uninstall**.
- **Be careful with claims.** Twice this session a claim was too strong (a "verified" that was not
  yet, and a price bug "on your phone" that was only reproduced with `adb input`). Say what was
  actually checked, where.
- Memory files: `feedback_task_loop`, `feedback_real_device_qa`, `feedback_plan_first`.

A privacy constraint from the project's origin still matters: the repo is on a **personal** GitHub
account with a repo-local personal git identity. Keep it that way, and keep secrets (keystore,
passwords, real bookings) out of the repo.

---

## 10. If you are starting N1 tomorrow

Not before N5a is on the phone and the documentation is written (§11). Then:

1. Read `docs/status.md` → *N — next features* for the scope and the open decision.
2. `npm test` and `npx tsc --noEmit` to confirm a clean baseline.
3. **Write the step-by-step plan** and put it, with the decision (entry point for the documents
   list) and a recommendation, to the owner.
4. Build the pure part first in `src/domain/` with tests, then the screen, then run it on the
   emulator with `node scripts/sample-backup.mjs` data.
5. Commit, push, tick it in `docs/status.md`.

---

## 11. Where the last session stopped (2026-10-19) — read this first

### 11.0000000000 Latest (2026-10-20, later still) — 3C built as 0.13.0

- **3C (adult/child pricing) built and verified on emulators** on the owner's instruction:
  `docs/phase3c-plan.md` (plan, the owner's answers P-1…P-4, as built), D39. No migration; backup
  and trip-archive format **7**; 0.12.0 refuses format-7 files (verified). APK
  `%USERPROFILE%\.travel-organizer\travel-organizer-0.13.0.apk`, **on no phone**. E2E log:
  `%USERPROFILE%\Pictures\TravelOrganizer-0.13.0-3C-e2e\E2E-LOG.md`.
- **`Pixel_10_Pro` now holds release 0.13.0** (over 0.12.0), plus two synthetic *3C Pricing
  Lapland* trips and their three travellers. `TO_2B_Test` still holds debug-signed 0.12.0.
- **The debug-signed debuggable build was blocked this session** by the auto-mode safety
  classifier; E2E ran on the release build. If DB pulls are needed again, ask the owner to allow
  that build step first.
- **Next:** independent review of 3B and 3C; 3D-1 only when asked, after its open questions
  (`phase3-plan.md` §18.2: whole-trip deletion with money records, the unlink/archive workflow,
  the three money-record definitions).

### 11.000000000 Earlier (2026-10-20, late night) — the owner's answers, documentation only

- **The owner answered `MASTER_ROADMAP.md` §21** (D38): a secondary beta phone only in an
  approved session, synthetic data only (master §3.1); five status words in CLAUDE.md §7 and
  master §1.1/§17; 3C quantities stay whole; 3C scope confirmed (`phase3-plan.md` §18.1);
  feedback deployment is its own pre-beta task (`status.md` *B1*); 3D-1: a booking with linked
  money is not deleted, links need the same currency (§18.2).
- **3C schema check** (`phase3-plan.md` §19): no migration; four design questions for the owner
  before the 3C plan — backup-format bump, how an extra is marked, group total + extras, the
  suggestion on a paid booking. No code, build or device was touched.
- **Next:** wait for the answers; then a written 3C plan for approval. Not 3C code.

### 11.00000000 Earlier (2026-10-20, night) — documentation only

- **`docs/MASTER_ROADMAP.md` added**: the owner's long-term product roadmap. It was cross-checked
  against the repository, and factual corrections are marked **[Repo check]**. The points that
  need the owner are listed in **§21**: physical testing timing, CLAUDE.md §7 compared with the
  discovery backlog, partial quantities, 3C scope, and the feedback form.
- `docs/roadmap.md` is now a short overview that links to it. No code, migration, build or device
  was touched.
- **Next:** an independent review of 3B (`991994e`) in a separate conversation, then 3C planning,
  **only when the owner asks**.

### 11.0000000 Earlier (2026-10-20, evening)

- **Phase 3 approved in five stages** (3B → 3C → 3D-1 → 3D-2 → 3E), each only when the owner asks.
  The owner's decisions are `docs/phase3-plan.md` §15 — read them before any Phase 3 work: payers
  default to *Not recorded*, payments and expenses link to a booking (one cost, never doubled), no
  real backup is inspected until a phone install is separately approved, migration 007 is tested on
  synthetic databases with odd values in the unused `paid_by`/`split`/`payments`.
- **3B built as 0.12.0** (who is going; no migration; D37, technical reference §20) and verified end
  to end — `%USERPROFILE%\Pictures\TravelOrganizer-0.12.0-3B-e2e\E2E-LOG.md`. APK
  `%USERPROFILE%/.travel-organizer/travel-organizer-0.12.0.apk`, **not on any phone**. **3C waits
  for approval.**
- **Debuggable test builds must be debug-signed.** The `E2E-INJECT` edit replaces the release
  `signingConfig` line with `signingConfig signingConfigs.debug` *and* adds `debuggable true`.
  Adding only `debuggable true` produces a debuggable APK signed with the **release key** — one that
  would install over a real release; it was built once by mistake this session, refused by the
  emulator (signature mismatch with the debug-signed test install), and deleted unused.
- E2E helpers in the session scratchpad worth recreating: `open-trip.sh` (relaunch → Home → a
  trip), `type.sh`, `check-backup.js` (a full backup's `backup.json` vs a pulled database, table by
  table). A file `adb push`ed into Downloads shows in the picker only after
  `adb shell content call --method scan_volume --uri content://media --arg external_primary`.
  `uiautomator` reports a half-hidden row's centre, which can land on a button below a scroll
  area — scroll first.

### 11.000000 Latest (2026-10-20, later)

- **2D built as 0.11.0** (Plan with AI; no migration, no writes; D36, technical reference §19) and
  verified end to end — `%USERPROFILE%\Pictures\TravelOrganizer-0.11.0-2D-e2e\E2E-LOG.md`. APK
  `%USERPROFILE%/.travel-organizer/travel-organizer-0.11.0.apk`, **not on any phone**. **Phase 2 is
  complete; Phase 3 waits for the owner.**
- How exactness was proven, worth reusing: pull the debuggable build's database, rebuild the
  expected text off-device with the app's own SQL strings, row parsers and pure builder
  (`tsx`, importing only `src/db/queries` and `src/domain` — the repositories pull in React Native),
  and `cmp` it with the preview node's text from the UI dump (`&#10;` = newline). Copy: paste into a
  note's field (`KEYCODE_PASTE` 279) and read it back, then close unsaved. Share: the system share
  sheet shows the full text.
- The app now **opens straight into a trip that is under way** (single active trip) — synthetic
  one-day trips dated today make every launch land there; tap Back for Home.
- `TO_2B_Test`: debuggable 0.11.0 with the synthetic 2D trips; `Pixel_10_Pro`: release 0.11.0 over
  0.10.0. Both shut down.

### 11.00000 Earlier (2026-10-20)

- **2C built as 0.10.0** (AI activity import, selective export; no migration; D35, technical
  reference §18, public format `docs/ai-activities-format.md`) and verified end to end — matrix and
  screenshots in `%USERPROFILE%\Pictures\TravelOrganizer-0.10.0-2C-e2e\E2E-LOG.md`. APK
  `%USERPROFILE%/.travel-organizer/travel-organizer-0.10.0.apk`, **not on any phone**.
- **A shared hook changed:** `useLiveQuery` now waits for 50 ms of quiet after change events. If a
  screen ever seems a beat late after an edit, that is why; if it is ever *stale*, that is a bug.
- E2E tips that cost time: adb-pushed files appear in the picker only after
  `adb shell content call --method scan_volume --uri content://media --arg external_primary`;
  uiautomator writes attribute values containing `"` in single quotes (parse both); a release-type
  build still logs `console.warn` to logcat (`ReactNativeJS`), handy for temporary timings; a font
  scale change recreates the activity, so the next Back may leave the app.
- `TO_2B_Test` holds the debuggable 0.10.0 with synthetic data; `Pixel_10_Pro` the release 0.10.0
  over 0.9.0. Both shut down.
- **2D waits for the owner's approval.**

### 11.0000 Earlier (2026-10-19)

- **Latest: 2B built as 0.9.0** (single-trip export/import, no migration, D34, technical reference
  §17) and verified end to end — matrix and screenshots in
  `%USERPROFILE%\Pictures\TravelOrganizer-0.9.0-2B-e2e`. APK
  `%USERPROFILE%/.travel-organizer/travel-organizer-0.9.0.apk`, **not on any phone**.
- A second emulator, **`TO_2B_Test`**, exists for isolated E2E (fresh, synthetic data, a debuggable
  build so `run-as` can read the app's storage). To make that build: temporarily set the release
  buildType to the debug signing config and `debuggable true` in the generated
  `android/app/build.gradle`, build, copy the APK, restore the file — never commit or ship it.
  `Pixel_10_Pro` holds the real release 0.9.0 over 0.8.0 with synthetic data.
- **2C waits for the owner's approval.**

- **Later the same day: 2B-0 built as 0.8.0** (Me + several people per list item; migration 006,
  backup format 6, D33) and rehearsed on the emulator as an update over 0.7.4 with synthetic
  format-5 data — details in status.md *P*. APK:
  `%USERPROFILE%/.travel-organizer/travel-organizer-0.8.0.apk`. **Not on any phone.** When it goes
  to the owner's phone (which holds 0.7.1 or later — confirm), it brings migrations 006 and
  whatever it skips over: rehearse from that exact APK first, fresh Drive backup, `install -r` only.
- The emulator now holds 0.8.0 with test data only (Vienna Beta Test, P1 Test…, Rehearsal Lapland,
  Old Backup Rome; Me = the fixture's "Evelina"). Its Downloads also hold two older zips this
  session did not create (`phone_backup_test.zip`, `travel-organizer-backup-2026-10-11.zip`) that
  may be copies of real data — left unopened; the owner should decide whether to delete them.
- **2B waits for the owner's approval** of `docs/phase2-plan.md` §10.

- **0.7.0 → 0.7.3 were built on 2026-10-13 → 10-16** (directions, adult/child travellers with
  migrations 004/005 and backup format 5, Overview by stage, Quick Expense with receipt photos,
  the feedback form switched off, the new icon). Summary and commits: `docs/status.md` →
  *0.7.x*; rationale D31. Those sessions kept no notes here; this entry closes the gap.
- **0.7.3 is the first friends-only beta** (`release/TravelOrganizer-0.7.3-beta.apk`), tested by
  friends on a smaller Android phone. **The owner's phone holds 0.7.1 or later — the exact version
  is not recorded.** Find out (ask; with permission, `dumpsys package`) before building the next
  update rehearsal, which must start from that exact APK.
- **The roadmap (`docs/roadmap.md`, D32)** replaces the N list: Phases 1–8, one at a time, each
  only when the owner asks. **Phase 1 (UI & navigation) is done as 0.7.4** (status.md → *P*),
  verified on the emulator and archived as `%USERPROFILE%/.travel-organizer/travel-organizer-0.7.4.apk`;
  not installed on any phone. Phase 2 waits for the owner.
- **On this laptop:** a real phone backup in `backups/` (gitignored). CLAUDE.md §9 says the laptop
  is not a safe store; the copy that counts is the owner's Drive one.
- The owner's data-safety rules were restated with the roadmap: never uninstall or clear the app on
  the primary Samsung phone, never install there without explicit permission, never change the
  application id or the signing key, never touch production data; verify on the emulator or the
  beta phone.


### 11.000 Earlier (2026-10-13)

- **0.6.0 is built and rehearsed, not on the phone.** The owner's design review of 0.5.1 —
  `docs/fieldbook-plan.md`: fixes A1–A7, the Fieldbook redesign B1–B11, additions C1–C5 (lists,
  travellers, a price per person, the itinerary PDF, templates) in one additive migration 003 and
  backup format 3. Run end to end without stopping, at the owner's request; **every decision taken
  is FB-1…FB-23 in that plan, for the owner to go through.** Review and QA: status.md, FB section.
- APK: `%USERPROFILE%\.travel-organizer\travel-organizer-0.6.0.apk`. To install: a fresh Drive
  backup first, then `install -r` as always — never uninstall.
- The emulator holds release 0.6.0 with the sample data (rehearsed over 0.5.1). Deferred, with
  reasons in the plan §4.8: passports, in-app feedback, estimated shopping prices.

### 11.00 Earlier (2026-10-12)

- **0.5.1 is on the phone (2026-10-12)** — installed with `install -r` over 0.3.0 after a fresh Drive
  backup; data kept, no crash, the owner checked their trip: fine. It carries N6, R1–R11, F1–F6 and
  **F7** (paid or not, as a pill on every confirmed item — `docs/paid-plan.md`, D29). Details in
  status.md, *0.5.1 on the phone* under F. The emulator (shut down) holds release 0.5.1 with the
  sample data; nothing is running.
- **Next:** N5b (splitting, from `docs/expenses-spec.md`) or N1–N4 — the owner picks; **plan
  first**. Still open on the phone when wanted: a camera receipt and *Final phone QA* in status.md.
- *History below — the bullets of the earlier 2026-10-12 session, before the install.*

- **Built and committed:** N6, **R1–R11** (`docs/review-plan.md`, decisions D27) and **F1–F6**
  (`docs/feedback-plan.md`, decisions D28). Each has its *what was built / how it was verified*
  note in `docs/status.md`.
- **End-to-end pass done on the emulator** (status.md, under F): one bug found and fixed
  (`legDefaultDate`); the image pickers fail **only on the dev client** (§7).
- **0.5.0 is built and rehearsed** over 0.3.0 with sample data and an expense receipt: everything
  kept. APK: `%USERPROFILE%\.travel-organizer\travel-organizer-0.5.0.apk`. **0.4.0 was never
  installed; the phone still has 0.3.0.**
- **Next: the phone.** The owner makes a fresh Drive backup, connects the phone (Auto Blocker off,
  USB debugging on), then `adb -s R5GL22FE9QY install -r --user 0 <apk>` — never uninstall. Launch,
  check no crash, the owner checks their trip; then the open *Final phone QA* items (a reminder
  while locked, the memory-pressure fix, the time-zone change, the Lapland legs' zones — N6's notice
  now offers the fix on each flight). USB debugging off, Auto Blocker on afterwards.
- **Paused here on purpose (2026-10-12):** the owner chose to update the phone later. Nothing is
  running — the emulator, Metro, Gradle daemons and the adb server were all stopped; the working
  tree is clean and pushed (575 tests, typecheck clean). *(Since done: 0.5.1 is on the phone.)* The next session then started at *Next: the
  phone* above; nothing needs rebuilding — the APK is already built and rehearsed.
- **The emulator** (`Pixel_10_Pro`, shut down) holds release 0.5.0 with the sample trips (from the
  rehearsal). For dev work, uninstall it and `npx expo run:android` again; start Metro with
  `npx expo start --dev-client` and open the dev client via `localhost` if it shows a white screen
  (§7).

### 11.1 What happened, in order

1. **U8 done.** The owner exported a backup to Drive. Import was proven first: on the emulator a
   fresh 0.2.0 restored the sample backup with both timelines identical; on the phone, *Import* with
   **Keep mine** on the real Drive zip read it whole and changed nothing. Then 0.2.0 was installed
   over 0.1.0 (`adb install -r --user 0`), launched, no crash.
2. **A wrong price on the phone.** The owner saw *Flight to Munich* at **EUR 92326.00**, entered as
   993.26. Not explained: `formatMoney` and every price display are unchanged since M2, no
   migration ran, only *Edit → Save* writes a price, and the owner did not edit it after the
   update. They fixed it by hand and think it may have been their own typing. **Recorded in
   `docs/status.md` as one to watch: if a price is ever wrong again, compare with the latest Drive
   backup before anyone retypes it.** Also: the U1 "×100" price bug was only reproduced with
   `adb input text`; on a real keyboard 0.1.0 may have been fine — that claim is unproven.
3. **U9 (0.2.1):** the Expenses card on Now opened a list page. Built, never installed — then
   superseded by N5a, which removed it again.
4. **N5 specified** with the owner (`docs/expenses-spec.md`), after researching Splitwise, Tricount,
   Splid and the usual settle-up method (greedy, at most people − 1 payments). Decisions: Expenses
   is a **tab**; inside it **Spending · Bookings** (and **Settle up** with N5b), switched by
   tapping, not swiping; **bookings take part in the split**; **unequal split = an amount per
   person only**, behind a toggle; **currencies settled separately, never converted**; the
   category list as written; renaming a traveller need not follow through. The owner's own trip
   is family and does not split.
5. **N5a built** (expenses without splitting) — the owner asked for it **before** their trip, on
   condition of no risk to the data. Commits `92b2161` (migration, backup), `63d0edb` (rules, queries), `b5fe911` (screens),
   `0452d3e` (the after-the-fact plan, version 0.3.0).
6. **The plan-first lesson.** The owner pointed out that N5a was built without a step-by-step plan.
   `docs/n5-plan.md` is that plan written afterwards, each step audited against the build,
   followed by a fresh review of all 47 changed files.

### 11.2 N5a, what exists

- **Migration 002** (`src/db/migrations/002-expenses.ts`): tables `expenses` and `payments`, and
  `resources.expense_id`. Purely additive. Includes N5b's `paid_by`, `split` and `payments` so the
  phone needs one migration only (**Decision 1, awaiting the owner**).
- **The migration runner** now writes `PRAGMA user_version` in the same transaction as the
  migration (`migrationBatch` in `src/db/migrations/index.ts`). Before, a kill between the two
  would re-run the migration and fail on `CREATE TABLE` (**Decision 3**).
- **Backup format 2**: `expenses` and `payments` exported/restored; format 1 (0.2.0) still imports
  (defaults in the Zod schema); a test fails if any table is missing from `EXPORT_COLUMNS`.
- **Receipts** are `resources` rows with `trip_id` = the expense's trip **and** `expense_id`
  (keeps the one-owner CHECK, no table rebuild — **Decision 2**). `ResourceOwner` has a third scope,
  `expense`. `SELECT_RESOURCES_FOR_TRIP` excludes receipts; `INSERT_RECEIPT` takes the trip id from
  the expense; the GC sweep keeps receipt files via `SELECT_ALL_STORED_PATHS`.
- **Domain** `src/domain/spending.ts`: categories, `expenseInputSchema`, `expenseTitle`,
  `nextCurrency`, `expensesByDay`, `spendingTotals`, `tripTotals`. (The older *booking costs*
  module, once `src/domain/expenses.ts`, is `bookingCosts.ts` since Gap C.)
- **Repositories** `src/repositories/expenses.ts`: list, get, create (with receipts, one
  transaction), update (never touches `paid_by`/`split`), delete, `countReceipts`.
- **attach.ts** reorganised around three pickers (`file`, `photo`, `camera`); `pickAndImport`
  copies files in without a row, for a new expense's pending receipts (**Decision 4**).
  Sharing from other apps now copies with `importAsInput` and writes in one transaction (R5). The CAMERA permission was
  already in the merged manifest (from expo-image-picker) — **no native change**.
- **Screens:** the Expenses tab `app/trip/[tripId]/(tabs)/expenses.tsx` (trip total card, then
  Spending | Bookings); `app/expense/new.tsx` and `app/expense/[expenseId].tsx`; components in
  `src/features/expenses/`; `AmountInput`/`CurrencyInput` moved to `src/ui/components/MoneyInputs.tsx`
  and shared with the item form; the + button adds an expense on the Expenses tab
  (`useSegments`); the card left Now; the U9 page is deleted; category icons in `Icon.tsx`.
- Version **0.3.0**, versionCode **4** (`app.json` and `android/app/build.gradle` — `android/` is
  gitignored, so bump both by hand after prebuild).

### 11.3 How it was verified

- **494 tests**, typecheck clean.
- **The update rehearsal** on the emulator, exactly as it will go on the phone: fresh 0.2.0 (the
  APK from `%USERPROFILE%\.travel-organizer`) → sample backup → *Flight home* reminder set to *No
  reminder* → captured both timelines, alarms (26), trip documents, export summary → **0.3.0
  installed with `install -r`**. Result: first-install time unchanged, no crash, both timelines
  identical (the new tab's label appears in the dump — filter `^Expenses$`), reminder still *Off*,
  alarms 26, both trip documents listed, a PDF opened in airplane mode, export "2 trips and 28
  saved files".
- **The tab on the emulator:** added *K-Market*, Groceries, 12.50 EUR with a PDF receipt via + File
  → trip total EUR 1692.50 (bookings 1680 + spending 12.50), the category bar, the paperclip on
  the row; the receipt is **not** under Trip documents; export now "29 saved files".

### 11.0 Update from the second session (2026-10-11) — read this before 11.4 and 11.5

- **Decisions 1–6 answered:** yes to 1, 2, 3, 5 and 6. **D4 changed:** a new expense's unsaved
  receipt copies are now deleted at once (on × and when the form closes unsaved); the sweep stays
  the fallback. `02f76d4`.
- **Gap A done** (`d69afa1`) and **Gap C done** (`0aac413`, `domain/expenses.ts` is now
  `bookingCosts.ts`). All pushed.
- The plan for these, and a step-by-step review of how it went, is at the end of
  `docs/n5-plan.md` (*Follow-up*).
- **Gap D done, plus a regression pass** against 0.2.0: no regression. Two bugs fixed on the way:
  camera receipts were labelled with a UUID (`8ee84d8`), and currency fields snapped back to EUR
  when cleared, an old bug (`05e0c29`). Details at the end of `docs/n5-plan.md`.
- **Gap B done** (owner chose: copy the export out of the dev build's cache into Downloads, import
  it). Restore and replace both correct, Gap A's wording seen on a device. The owner's **real**
  phone backup (format 1) was checked for structure only: 0.3.0 parses it, and migration 002 run
  on its 31 rows leaves every one identical. Details at the end of `docs/n5-plan.md`.
- **Step 6 done: the final rehearsal ran on the owner's real backup** (allowed for testing only;
  kept out of the repo, in the scratchpad and on the emulator). The 0.3.0 APK in
  `%USERPROFILE%\.travel-organizer` is the final build (`05e0c29`). Everything identical after the
  update; sharing from Files works on the release build. Details at the end of `docs/n5-plan.md`.
- **Found in the real data:** no item has its own zone, so legs from or to Germany on the Lapland
  trip are an hour out in countdown/Up next (the screen shows the times as typed). Told the owner;
  they can set the zones on the phone.
- **Step 5 done: the documentation.** `docs/user-guide.md` (new, outline approved by the owner),
  `technical-reference.md` (migration 002, receipts, the attach pipeline, backup format 2, §13
  Expenses), `decision-log.md` (D25, N5's decisions as answered; D20 amended).
- **Step 7 done: 0.3.0 is on the phone** (installed with `install -r`, data kept, manual test
  passed; `docs/n5-plan.md` step 10). N5a is ticked. Left to the owner: a camera receipt, the
  Lapland flight zones, USB debugging off and Auto Blocker on.
- **Open with the owner:** how to fix the zones (they edit four times, or Claude does it on the
  connected phone), and the plan to avoid it in future (a zone suggested from a leg's city).
- The owner's far-future idea, **shared trips**, is written up in `docs/ideas.md`.
- **N6 built (0.3.1), not yet on the phone:** a journey's zone filled from its city with a hint, a
  tappable zone chip, old flights flagged with a one-tap fix (D26, `docs/n6-plan.md`). Rehearsed
  as an update over 0.3.0 on the owner's real data. **It goes to the phone with the next changes** (owner's
  call, 2026-10-11), not on its own. When installing: `install -r`, then a short check: the four flights (the owner may have fixed them by
  hand already, so the notices may be gone) and a zone chip in Edit.
- The emulator now holds the owner's real data on release 0.3.1 (one flight fixed by the test).
- **Next after that: N5b** (splitting, plan first from `docs/expenses-spec.md`), or N1–N4.
- **The emulator holds the owner's real data** (0.3.0 release, plus two test expenses and one
  shared test PDF), and `real-backup.zip` sits in its Downloads. Wipe it when it is no longer
  needed (`adb uninstall`, remove the zip).
- The owner's real backup sits in `C:\Users\Acer\Downloads`. The laptop is not a safe store
  (CLAUDE.md §9); the owner was reminded the copy in Drive is the one that counts.
- **The emulator now runs the dev build** (release 0.3.0 was uninstalled there, sample data
  only): the sample backup plus one *Groceries 7.20 EUR* expense with a PDF receipt. Good for
  Gap D. For the final rehearsal, reinstall 0.2.0 as §11.3 describes.
- **Work in `C:dev	ravel-organizer`.** `C:UsersAcerDesktopepos	ravel-organizer` is
  a second clone with no `node_modules`. A session may open there; don't build or test in it.

### 11.4 Waiting on the owner — ask these first ✅ answered (see 11.0)

From `docs/n5-plan.md` (the owner has the list; get a yes/no on each):

1. Splitting's columns and `payments` already in migration 002. *Recommended: yes.*
2. Receipts as attachments naming their expense. *Recommended: yes.*
3. Keep the migration-runner fix. *Recommended: yes.*
4. Pending receipts on a new expense are copied in at once; a closed form's copies are swept at
   the next start.
5. The U9 tappable card removed again.
6. Small screen choices: the trip total card; a label-less expense titled by its category; the
   delete warning counts receipts; receipts do not offer *Also attach to an item*.

### 11.5 Next steps, in order (each needs the owner's yes where marked)

1. ~~Decisions 1–6 above.~~ ✅
2. ✅ *(done, see 11.0)* **Gap A** — the import confirmation should name expenses (`summariseImportPlan` in
   `src/domain/archive.ts`, with a test). **Gap C** — rename `domain/expenses.ts` →
   `bookingCosts.ts`. Small; plan them in two lines and do them.
3. **Gap D** — tap through on the emulator: the camera (permission prompt, a photo, the
   *Open Settings* path when denied), **editing** an expense, **deleting** one with receipts,
   removing a pending receipt.
4. **Gap B** — restoring a backup *with expenses* on a device. The emulator's share sheet has no
   "save to Files" target and no Google account; options: sign the emulator into a test Google
   account and use Drive, or add a debug-only path. Ask the owner which.
5. **Documentation** — the owner asked for both, detailed, covering old and new:
   - a **user guide** (every screen and feature, how to back up and restore, what to do before a
     trip), and
   - the **technical docs** brought up to date (`technical-reference.md`: schema incl. migration
     002, backup format 2, receipts, the attach pipeline, the Expenses tab; `decision-log.md`: N5's
     decisions).
   **Show the owner a plan for the docs before writing them.**
6. Rebuild the release APK, **repeat the update rehearsal** on the final build (§11.3 recipe).
7. **The phone:** the owner makes a fresh Drive backup → connects (Auto Blocker off, USB debugging
   on, "Transfer files") → `adb -s R5GL22FE9QY install -r --user 0 <apk>` → launch, check no crash
   → owner checks trips, files, reminders, adds one expense with a camera receipt → USB debugging
   off, Auto Blocker on. Tick U/N5a in `docs/status.md`.
8. Then **N5b** (splitting), plan first, from `docs/expenses-spec.md`.

### 11.6 Also offered, still unanswered

- **Gmail:** a *Find in Gmail* button that copies the booking code and opens Gmail (Gmail cannot
  share a whole email and no app can open one specific email). Needs `expo-clipboard` (a new
  native dependency). The reliable path today: Gmail → ⋮ → *Print* → *Save as PDF* → attach.

### 11.7 Practicalities for the next session

- The phone's serial is **R5GL22FE9QY** (SM-S948B). The emulator is `emulator-5554`
  (`Pixel_10_Pro`, 1280×2856). It currently has **0.3.0 with the sample data plus one test
  expense** — reinstall from 0.2.0 for any new rehearsal.
- The scratchpad helper scripts do not survive the session. Recreate them (§7): `ui.js` parses a
  uiautomator dump into `text @ x,y` / `[content-desc] @ x,y`; `tap.sh` taps by exact text and
  **refuses y > 2700** on this emulator (the nav bar); `timeline.sh` dumps the open timeline 45
  times with **slow** swipes (`input swipe 640 2100 640 1300 1200` — fast ones skip rows),
  filtering the tab labels (**add `Expenses` to that filter now**), de-duplicated with
  `awk '!seen[$0]++'`.
- Editing files: several files are **CRLF**. Edit them with the Edit tool, or with a node script
  that normalises to LF, replaces, and restores CRLF. Avoid shell heredocs containing backticks
  or `${}` — they broke twice.
- Counting alarms: `adb shell dumpsys alarm | grep -c <package>` — compare before/after with the
  same command; the absolute number means little.
