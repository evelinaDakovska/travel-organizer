# Session handoff

For a Claude session that starts with no memory of this project. It explains **what we are
building, how it is built, what was decided and why, how to work on it, and what bites**.

It does **not** hold status — `docs/status.md` does, and it wins on any disagreement. Nothing here
is a substitute for `CLAUDE.md` (the authoritative summary) or `docs/technical-reference.md` (the
single source of truth for schema, time, files, queries). Read in this order:

1. `CLAUDE.md` — product, terminology, conventions, "findings already paid for"
2. `docs/status.md` — what is done, what is next, the open questions
3. this file — how the work actually goes, and the traps
4. `docs/technical-reference.md` — when you touch schema, time, files, queries, native
5. `docs/decision-log.md` — why, and what was rejected (D1–D24)
6. `docs/windows-handoff.md` — machine setup, release build, Windows specifics

Last verified: **2026-10-10**, commit `1190cbd`, clean tree, **366 tests**, typecheck clean.

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

**Explicitly not building** (do not drift into these): AI features, itinerary generation, flight or
hotel search, booking APIs, Gmail integration, Google Calendar, cloud backend, accounts, sync,
collaboration, weather, currency conversion, embedded maps, automatic booking parsing.

---

## 2. Where things stand

Every planned task is done: **C1–C5** (core), **V1** (visual foundation), **S1–S8** (surface).
Milestones **M0–M8** complete; **M9** complete apart from two reminder checks on the phone.

The app is **in real use**: release build 0.1.0, signed with the owner's private key, installed on
the Galaxy on 2026-09-18, and QA'd end to end there. It needs neither this laptop nor Metro.

**Next up: N1–N4** in `docs/status.md` — four features approved on 2026-09-18 after the owner asked
what Notion does well, not started:

| | Feature | First decision to make |
|---|---|---|
| **N1** | All of a trip's documents in one list | Entry point: header icon or a link on Now — **not** a fifth tab (D20) |
| **N2** | Checklists inside notes | Whether ticked lines sink to the bottom |
| **N3** | Start a trip from a previous one | Exactly what is copied |
| **N4** | Search across all trips | — |

Suggested order N1, N2, N4, N3. Each has scope, hooks into existing code, and open decisions
written out in `docs/status.md` → *N — next features*.

**Still open on the phone** (the owner chose to stop testing notifications that evening):
the expo-notifications memory-pressure patch observed firing, and a reminder after a long idle
period. Both in `docs/status.md` → *Final phone QA*.

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

**One `trip_items` table.** Five tables total: `trips`, `trip_items`, `trip_notes`, `resources`,
`settings`. Kind-specific extras live in a Zod-validated `details` JSON column, pinned to transport
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

**Four trip tabs, no Bookings tab (D20).** Now · Timeline · Places · Notes, with the add button
floating above the bar. Trip facts and trip documents sit at the bottom of Now. `SELECT_BOOKINGS`
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
npm test                    # 366 tests, ~2s
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
- **After a native build, if the dev client sits on a white screen**, time
  `curl localhost:8081/status`. Metro twice took 14s+ to answer and only recovered after a restart;
  stop the Gradle daemons (`android/gradlew --stop`) and restart Metro.
- **Emulator hanging at boot** with *OpenGL Core Profile not supported*: start it with
  `emulator -avd Pixel_10_Pro -gpu swiftshader_indirect`.
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
- Two memory files record the above: `feedback_task_loop` and `feedback_real_device_qa`.

A privacy constraint from the project's origin still matters: the repo is on a **personal** GitHub
account with a repo-local personal git identity. Keep it that way, and keep secrets (keystore,
passwords, real bookings) out of the repo.

---

## 10. If you are starting N1 tomorrow

1. Read `docs/status.md` → *N — next features* for the scope and the open decision.
2. `npm test` and `npx tsc --noEmit` to confirm a clean baseline (366 tests at the time of writing).
3. Put the decision to the owner (entry point for the documents list), with a recommendation.
4. Build the pure part first in `src/domain/` with tests, then the screen, then run it on the
   emulator with `node scripts/sample-backup.mjs` data.
5. Commit, push, tick it in `docs/status.md`.
6. When the owner next connects the phone, install the release build (§6) and look at it there.
