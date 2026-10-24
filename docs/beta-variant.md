# Travel Organizer Beta — a separate app beside Stable

Written 2026-10-24 (owner's approval of Stage 2, after Checkpoint A). **Status: implemented on
`phase-3d1`; not built, not installed.** Building and installing each wait for the owner's explicit
go-ahead (Checkpoint B).

## 1. Why

The owner's phone runs **Stable 0.7.2** (versionCode 12, schema inferred 5) holding a real trip
(`status.md` *Stable on the owner's phone*). The full feature set (0.21.x, schema 14) needs real-device
testing, but updating Stable would run migrations 006–014 on the real data — which waits until after
the trip (CLAUDE.md §7). So the new version is installed as a **second, independent app** that cannot
see or change Stable, and is tested there with synthetic data only.

## 2. Identity

| | Stable (unchanged) | Beta |
|---|---|---|
| Application id | `com.evelinadakovska.travelorganizer` | `com.evelinadakovska.travelorganizer.beta` |
| Launcher name | Travel Organizer | **Travel Organizer Beta** |
| Icon | the book | the book with a red **BETA** banner (`assets/beta/`, made by `scripts/make-beta-icons.mjs`) |
| Link scheme | `travelorganizer` | `travelorganizer-beta` |
| Dev-client scheme | `exp+travel-organizer` | `exp+travel-organizer-beta` (from the slug) |
| Android cloud backup | `allowBackup="true"` (not changed) | `allowBackup="false"` |
| Signing | the release key, `638dc686…` | **never the release key**: a Beta keystore if `TRAVEL_ORGANIZER_BETA_*` Gradle properties exist, else the debug key |
| Debuggable | no | **yes** — so Beta's synthetic sandbox can be checked with `run-as` |
| Version | from `app.json` | the same `version` / `versionCode` (separate package, so they do not interact) |

## 3. How it is built

- **`app.json` stays the stable app and is never edited for Beta.** `app.config.js` returns it
  unchanged unless `APP_VARIANT=beta`; any other value is an error, not a fallback.
- With `APP_VARIANT=beta`, `app.config.js` derives Beta from `app.json` (and refuses if `app.json` is
  not the stable package), swapping `plugins/withReleaseSigning` for `plugins/withBetaSigning`.
- `plugins/withBetaSigning.js` writes Beta signing into the generated `build.gradle`, makes release
  debuggable, never mentions the stable keystore properties, refuses a project still configured for
  the stable key, and adds a Gradle check that **fails the build unless `applicationId` is the Beta
  id**.
- **`scripts/build-beta.mjs` is the only supported way to build Beta.** It sets `APP_VARIANT=beta`
  itself, runs `expo prebuild --platform android --clean --no-install`, `gradlew assembleRelease`,
  then reads the APK with `aapt2` and `apksigner` and **rejects it** (renamed `*.REJECTED.apk`, exit 1)
  unless the package is Beta, the label is *Travel Organizer Beta*, and it is not signed with the
  stable key. An accepted APK is copied to `~/.travel-organizer/travel-organizer-beta-<version>.apk`.
- Afterwards `android/` is a Beta project. **A stable build must start with
  `npx expo prebuild --platform android --clean`**; without `--clean`, `withReleaseSigning` fails on a
  Beta project instead of producing anything.
- No migration, no change to the database or any app code: a separate application id already gives a
  separate sandbox.

## 4. Isolation audit (what could be shared, and why it is not)

| Area | Finding |
|---|---|
| Application id / sandbox | Different id → different `/data/user/0/<id>/`, which Android keeps private per app |
| SQLite | `expo-sqlite` opens `travel-organizer.db` by bare name inside the app's own files dir; no path names a package (tested) |
| Attachments, cache, temp | `Paths.document` / `Paths.cache` are per-app; stored paths are relative (`media/…`) |
| Content / file providers | Every authority in a native module is `${applicationId}.…` (tested over all node_modules manifests): `FileSystemFileProvider`, `SharingFileProvider`, `ImagePickerFileProvider`, clipboard |
| Deep links | Beta answers only `travelorganizer-beta://` and `exp+travel-organizer-beta://`; Stable keeps `travelorganizer://`. No app code hardcodes a scheme (tested) — expo-router reads it from the config |
| Share sheet | Both apps take the same shares (`text/*`, `image/*`, PDF), each under its own name and icon. Pick *Travel Organizer Beta* deliberately |
| Notifications | Channels, alarms and notification ids belong to the posting package; Beta's show *Travel Organizer Beta* |
| Shared prefs / native storage | Per package |
| Android Auto Backup | Off for Beta; Stable unchanged |
| Exports / imports | Leave the app only through the share sheet or the system file picker, where the person chooses |
| Signing | Different key, so an APK with the stable id but Beta's key could never install as an update of Stable |
| Users | Install with `--user 0`; Work profile (10) and Secure Folder (150) untouched |

## 5. Tests

`src/config/betaVariant.test.ts` (27 tests). They check:

- Stable resolves to `app.json` unchanged, and the stable signing still uses the stable keystore.
- An unknown variant is refused.
- Beta's id, label and icons differ from Stable's, and the icon files exist.
- Beta's schemes are valid and its slug differs. It receives the same shares, has `allowBackup: false`,
  and only the signing plugin is swapped.
- Beta signing:
  - never reads the stable keystore;
  - is debuggable;
  - carries the Gradle id guard;
  - is idempotent, and refuses a project still set up for Stable.
- Every provider authority is derived from `${applicationId}`.
- The database name is bare, and app code names no package, sandbox path or scheme.
- The guards (`scripts/beta-guard.js`):
  - parse `aapt2`, `apksigner` and `dumpsys` output;
  - accept Beta;
  - refuse an APK with the stable package, label or key, or one they cannot read;
  - build the install command;
  - detect any change to Stable.
- No script uninstalls, clears, or installs any package other than Beta.

## 6. Build and install procedure (each step needs the owner's go-ahead)

**Build** (on this machine; regenerates the gitignored `android/`):

```bash
node scripts/build-beta.mjs
```

**Before installing**, on the phone (owner): unlock it; turn Samsung **Auto Blocker** off for the
install; be ready to allow the install if Play Protect asks (Beta is signed with a non-store key).

**Check without installing** (all checks, prints the exact commands):

```bash
node scripts/install-beta.mjs --serial R5GL22FE9QY --apk ~/.travel-organizer/travel-organizer-beta-0.21.0.apk --dry-run
```

**Install:**

```bash
node scripts/install-beta.mjs --serial R5GL22FE9QY --apk ~/.travel-organizer/travel-organizer-beta-0.21.0.apk
```

`install-beta.mjs` does the following:

1. It needs the named device to be connected and authorised.
2. It re-checks the APK: Beta package and label, not the stable key.
3. It records Stable's `dumpsys package` state (version, update and install times, signature hash, code
   path, users).
4. It refuses if Beta is already installed, unless `--replace` is given (which updates Beta only).
5. It pushes the APK to `/data/local/tmp/` and runs exactly
   `pm install -R --user 0 --pkg com.evelinadakovska.travelorganizer.beta <apk>`:
   - `--pkg` makes Android itself refuse any other package;
   - `-R` refuses to replace an installed app;
   - `--user 0` keeps the install to the personal profile. Without `--user`, `pm install` installs for
     every user on the device.
6. It removes the pushed file.
7. It re-reads Stable and stops with a warning if anything about it changed. It checks that Beta is
   installed for user 0 and for no other user.

**After installing** (read-only or Beta-only):

```bash
adb -s R5GL22FE9QY shell dumpsys package com.evelinadakovska.travelorganizer | grep -E "versionCode|lastUpdateTime|signatures"
adb -s R5GL22FE9QY shell am start -n com.evelinadakovska.travelorganizer.beta/.MainActivity
# Beta's schema version (bytes 60–63 of its own database header, big-endian) — must be 14 (0000000e):
adb -s R5GL22FE9QY exec-out run-as com.evelinadakovska.travelorganizer.beta dd if=files/SQLite/travel-organizer.db bs=1 skip=60 count=4 | xxd
```

The owner turns Auto Blocker back on afterwards. **Never** `adb install -r` with an APK path that is
not Beta's, never `uninstall`, never `pm clear`, and never `run-as` the stable package.

## 7. Remaining risks

- **Beta is debuggable**, so any computer authorised for USB debugging can read Beta's sandbox. Keep
  Beta to synthetic data, and do not move real trips into it.
- **Beta has no protection from its own updates.** It is signed with the debug key unless a Beta
  keystore is made (not done: no new key was generated). Anyone with the public debug key could sign
  an "update" of Beta. That matters only for Beta's own synthetic data.
- **`android/` is left as a Beta project after a Beta build.** A stable build needs `prebuild --clean`.
  Without it, the stable signing plugin fails loudly; it does not silently build Beta.
- **Install UI on the phone:** Auto Blocker and Play Protect prompts need the owner's hands. How the
  Work profile's policies react to a user-0 sideload is not yet observed; the script checks the
  result per user afterwards.
- **The share sheet shows both apps.** Choosing the wrong one is a human error, though only into
  Stable's normal share flow, which saves nothing without confirmation.
- **Verification is partly indirect.** The Beta build and its merged manifest are checked from the APK
  after the build (`aapt2`). This document's prebuild check covered the generated manifest and Gradle
  file only.
