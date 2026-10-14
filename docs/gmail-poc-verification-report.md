# Travel Organizer Corrections & Gmail PoC Verification Report

**Date:** 14 October 2026  
**Target Environments:**
- **Physical Device:** Samsung Galaxy S24 Ultra (`R5GL22FE9QY`, SM-S948B, Android 17 / API 36)
- **Reference Emulator:** `emulator-5554` (Pixel 10 Pro, Android 17 / API 36)
**Production App:** `com.evelinadakovska.travelorganizer` (v0.7.0 / versionCode 10, real trip data 100% preserved)  
**Isolated PoC App:** `com.evelinadakovska.gmailpoc` (v1.0.0-poc / versionCode 1)

---

## Executive Summary

1. **Production Safety & Real Trip Integrity:**
   - Real trip data (`Lapland` and `Milan`, 13 items, 3 notes, 9 PDF document attachments) was **100% preserved**.
   - An off-device backup (`travel-organizer-backup-2026-10-11.zip`) was validated and rehearsed in SQLite migration prior to physical device installation.
   - The production APK was signed with the private keystore (`C:/Users/Acer/.travel-organizer/release.jks`), yielding the identical SHA-256 certificate digest (`63:8D:C6:86:BD:B7:E5:E6:CE:64:59:35:C0:20:B5:C4:E3:6F:14:A3:93:7C:C0:E6:17:83:12:68:B4:52:35:E7`).
   - In-place upgrade via `adb install -r` succeeded seamlessly without uninstall, data wipe, or signature mismatch.
   - Fresh in-app backup export verified on-device: 2 trips and 9 media files intact.
   - All mutations on the physical phone were isolated to a temporary trip (`QA — safe device test`), which was completely deleted after testing.

2. **Directions Corrections Implemented & Verified:**
   - **Route-day hotel selection:** Connector hotel now resolves using the actual timeline connector moment (`activeConnector.day`), correctly attributing an overnight transport's arrival connector to the arrival day rather than departure day.
   - **Item detail endpoint date resolution:** Arrival directions use arrival date (`item.end`), departure directions use departure date (`item.start`).
   - **DirectionsSheet reset stability:** Replaced object-identity tracking with `lastVisibleRef` and request identity (`requestKey` tracking `activeConnector.id` or `item.id:endpoint`). User-selected origin and travel mode persist across timer/clock ticks and parent re-renders. Reopening the sheet or changing endpoints re-initializes to fresh defaults.
   - All 48 test suites (807 tests) passing; zero TypeScript errors. Commits pushed to `origin/main`.

3. **Tightened Gmail PoC Application:**
   - Standalone application with distinct package `com.evelinadakovska.gmailpoc`.
   - **Zero dangerous/unnecessary permissions**; zero OAuth, zero mailbox access, zero telemetry.
   - **Strict HTTPS URL validation:** Only HTTPS scheme and exact host `mail.google.com` permitted; userinfo tricks, custom ports, and lookalike domains strictly rejected.
   - **PII-free diagnostics:** Zero logging of queries, references, URLs, or raw exception strings.
   - **Sandbox isolation verified on Samsung phone:** Standalone UID cannot access `/data/data/com.evelinadakovska.travelorganizer` (`BLOCKED - Permission denied`).
   - Source code mirrored and pushed to `origin/poc/gmail-link` (`9087fbd`).

---

## Part 1: Review Corrections & Commit History

All issues from the review and follow-up corrections are committed to `main` and pushed to GitHub:

| Commit | Description | Files Modified |
| :--- | :--- | :--- |
| **[`248b0ed`](file:///C:/dev/travel-organizer/src/domain/traveller.ts)** | `fix(traveller): preserve unconverted legacy names in trip summary (C1)` | [`src/domain/traveller.ts`](file:///C:/dev/travel-organizer/src/domain/traveller.ts), [`src/domain/traveller.test.ts`](file:///C:/dev/travel-organizer/src/domain/traveller.test.ts) |
| **[`cfe72b8`](file:///C:/dev/travel-organizer/src/domain/overview.ts)** | `fix(overview): sort baseTonight by start instant to respect latest-started stay (C2)` | [`src/domain/overview.ts`](file:///C:/dev/travel-organizer/src/domain/overview.ts), [`src/domain/overview.test.ts`](file:///C:/dev/travel-organizer/src/domain/overview.test.ts) |
| **[`82c9d91`](file:///C:/dev/travel-organizer/src/domain/directions.ts)** | `fix(directions): resolve endpoints with timeline role, allow multi-day stays, and reject invalid origins (D1, D2, D3, D5)` | [`src/domain/directions.ts`](file:///C:/dev/travel-organizer/src/domain/directions.ts), [`src/domain/directions.test.ts`](file:///C:/dev/travel-organizer/src/domain/directions.test.ts) |
| **[`2b458c6`](file:///C:/dev/travel-organizer/src/features/directions/DirectionsSheet.tsx)** | `fix(directions): reset sheet state, support complete saved origins, and resolve route-day hotel (D3, D4, D6, D7)` | [`DirectionsSheet.tsx`](file:///C:/dev/travel-organizer/src/features/directions/DirectionsSheet.tsx), [`timeline.tsx`](file:///C:/dev/travel-organizer/app/trip/%5BtripId%5D/(tabs)/timeline.tsx), [`item/[itemId]/index.tsx`](file:///C:/dev/travel-organizer/app/item/%5BitemId%5D/index.tsx) |
| **[`a65763a`](file:///C:/dev/travel-organizer/src/domain/directions.ts)** | `fix(directions): select route-day hotel by connector/endpoint date and stabilize sheet reset` | [`src/domain/directions.ts`](file:///C:/dev/travel-organizer/src/domain/directions.ts), [`DirectionsSheet.tsx`](file:///C:/dev/travel-organizer/src/features/directions/DirectionsSheet.tsx), [`timeline.tsx`](file:///C:/dev/travel-organizer/app/trip/%5BtripId%5D/(tabs)/timeline.tsx), [`item/[itemId]/index.tsx`](file:///C:/dev/travel-organizer/app/item/%5BitemId%5D/index.tsx), [`directions.test.ts`](file:///C:/dev/travel-organizer/src/domain/directions.test.ts), [`docs/directions-plan.md`](file:///C:/dev/travel-organizer/docs/directions-plan.md) |

### Key Architectural Improvements in `a65763a`:
1. **Connector Day Tracking:** Added `day: string` to `TimelineConnector` interface. `findTimelineConnectors` sets `day = dayKey(curr.moment)` and stable ID `${curr.key}->${next.key}`.
2. **Endpoint Date Helper:** Added `resolveItemDirectionsDay(item, role)`:
   - For `role === 'arrival'` / `'to'`: returns arrival day `dayKey(item.end)` if present, otherwise departure day.
   - For departure: returns departure day `dayKey(item.start)`.
3. **DirectionsSheet Request Stability:**
   - Accepts `requestKey?: string` prop (computed via `computeDirectionsRequestKey(destination, effectiveInitialOrigin)` if omitted).
   - Tracks `lastRequestKeyRef` and `lastVisibleRef`.
   - Selections (`origin`, `mode`, `pickingOrigin`, `showAllPlaces`) reset **only** when `visible` transitions from false to true or when `requestKey` changes.
   - Parent component re-renders (clock ticks, state updates) do NOT reset user selections while the sheet remains open.

---

## Part 2: Isolated Gmail PoC Tightening & Audit

### 1. Delivery & Repository Status
- **Package ID:** `com.evelinadakovska.gmailpoc`
- **Source Code Branch:** `origin/poc/gmail-link` at commit [`9087fbd`](file:///C:/dev/travel-organizer)
- **Local Source Directory:** [`C:\dev\gmail-poc`](file:///C:/dev/gmail-poc)
- **Debug APK Location:** [`C:\dev\gmail-poc\app\build\outputs\apk\debug\app-debug.apk`](file:///C:/dev/gmail-poc/app/build/outputs/apk/debug/app-debug.apk) (6,488,719 bytes)

### 2. Tightened Security Controls
- **Strict Web URL Validation:**
  ```kotlin
  private fun validateGmailWebUrl(raw: String): Boolean {
      val uri = Uri.parse(raw.trim())
      if (!uri.scheme.equals("https", ignoreCase = true)) return false
      if (!uri.userInfo.isNullOrEmpty()) return false
      if (uri.port != -1 && uri.port != 443) return false
      val host = uri.host?.lowercase(Locale.ROOT) ?: return false
      return host == "mail.google.com"
  }
  ```
  Any URL with HTTP, port manipulation, userinfo bypass (`https://evil.com@mail.google.com`), or domain lookalikes is rejected with a user-facing error message without launching the browser.
- **Log & Diagnostic Sanitization:**
  - Zero PII emitted to logcat: Search queries, reservation codes, email addresses, and URLs are never written to Android logcat.
  - In-app diagnostics display generic state indicators (`FAILED_LAUNCH`, `VALIDATION_FAILED`) rather than raw exception strings.
- **Clear UI Limitations Card:**
  - Informs the user that native search finds matching messages but does not jump directly to a single email.
  - Warns that account selection is not guaranteed: multi-account switching must be performed manually in the Gmail app.
  - Notes that web links may require signing in via the default browser.
  - Emphasizes that directory checks test specific paths rather than general device security.

---

## Part 3: Physical Samsung Phone Live QA Verification

**Device:** Samsung Galaxy S24 Ultra (`R5GL22FE9QY`, SM-S948B, One UI 7 / Android 17)

### 1. Signature & In-Place Update
- Built signed release APK (`app-release.apk`, 117,030,794 bytes) with `versionCode 10` and `versionName "0.7.0"`.
- Verified SHA-256 cert fingerprint matches phone: `638dc686bdb7e5e6ce645935c020b5c4e36f14a3937cc0e617831268b45235e7`.
- Executed `adb -s R5GL22FE9QY install -r app-release.apk` -> **Success**.
- `dumpsys package com.evelinadakovska.travelorganizer` confirmed:
  - `versionCode=10 minSdk=26 targetSdk=36`
  - `signatures=PackageSignatures{[42566377]}` (untouched release key)

### 2. Real Data Preservation Check
- Launched updated Travel Organizer on phone.
- Exported in-app backup: Confirmed `Archive created with 2 trips and 9 saved files`.
- Real trips list:
  - `Lapland` (20–24 Nov 2026, 5 days, Rovaniemi) — untouched.
  - `Milan` (19–22 Sep 2026, 4 days) — untouched.
- Read-only navigation into `Lapland`: Overview, next departure, tasks, and attachments intact.

### 3. Temporary QA Trip Lifecycle (`QA — safe device test`)
To verify directions behavior without risking real trips, a temporary trip was created, exercised, and removed:
1. **Creation:** Created trip `QA — safe device test`.
2. **Stay Added:**
   - Title: `Grand Hotel QA`
   - Dates: 14 Oct 2026 – 16 Oct 2026 (multi-day)
   - Address: `Via Roma 10`
3. **Overnight Transport Added:**
   - Title: `Overnight Train`
   - Departure: 14 Oct 2026 at 22:00 from `Milano Centrale`
   - Arrival: 15 Oct 2026 at 06:00 at `Roma Termini`
4. **Item Detail Directions Verification:**
   - Tapped **"To departure: Milano Centrale"**:
     - DirectionsSheet opened with destination `Milano Centrale`.
     - Tapped "Change starting point": `Hotel: Grand Hotel QA, Via Roma 10` offered as an origin choice for 14 Oct.
     - Selected `Grand Hotel QA` and travel mode `Walking`.
     - Waited across multiple render ticks: selection **persisted** without wiping.
   - Tapped **"To arrival: Roma Termini"**:
     - DirectionsSheet opened with destination `Roma Termini`.
     - Request key changed: sheet cleanly reset to default `Current location` and `Any` mode.
5. **Timeline Connector & Route-Day Hotel Verification:**
   - Added next-day activity on 15 Oct: `Colosseum Tour` (15 Oct 2026 at 10:00, `Piazza del Colosseo, Roma`).
   - Inspected Timeline on Day 2 (Thursday 15 Oct):
     - Connector rendered: **"Directions to Colosseum Tour, From Roma Termini"**.
     - Tapped connector: DirectionsSheet opened with TO `Colosseum Tour` and FROM `Roma Termini`.
     - Tapped "Change starting point": `Hotel: Grand Hotel QA, Via Roma 10` was offered as an origin choice because `activeConnector.day` (15 Oct) falls within the stay dates (14–16 Oct).
     - Changed origin to `Grand Hotel QA` and mode to `Transit`.
     - Waited 3 seconds: selections **persisted**.
     - Dismissed and re-opened: sheet re-initialized to connector defaults (`Roma Termini`, `Any`).
6. **Clean Cleanup:**
   - Navigated to Edit Trip -> tapped **"Delete trip"** -> confirmed modal **"DELETE"**.
   - Verified trips list returned to exactly the original 2 real trips (`Lapland` and `Milan`). Zero residual QA data.

### 4. Sandbox Isolation on Physical Phone
- Installed `com.evelinadakovska.gmailpoc` alongside `com.evelinadakovska.travelorganizer`.
- Launched Gmail PoC on `R5GL22FE9QY`.
- Tapped "Check Sandbox Isolation":
  - Verified path `/data/data/com.evelinadakovska.travelorganizer` is **BLOCKED**.
  - Confirmed distinct Linux UIDs prevent cross-app filesystem access.

---

## Part 4: Test Actions Summary

| Action | Physical Phone / Emulator Result | Behavior & Security Observation |
| :--- | :--- | :--- |
| **Action 1: Find in Gmail** | **PASS** | Launches `com.google.android.gm` search intent with query string. No exact message direct link; active account only. |
| **Action 2: Copy reference & open Gmail** | **PASS** | Copies synthetic reference to Android clipboard only upon explicit tap; opens Gmail main activity cleanly. |
| **Action 3: Open Gmail web link** | **PASS** | Strict HTTPS + `mail.google.com` validation. Rejects insecure/spoofed URLs. Opens browser for authenticated view. |
| **Deep-link Test Button** | **REMOVED** | `VIEW_MESSAGE_DEEPLINK` test removed from layout, code, and manifest. |
| **Production App Update** | **PASS** | In-place update (`install -r`) with matching release key. Zero data loss. Real trips preserved. |
| **Route-Day Hotel Selection** | **PASS** | Arrival day connector selects arrival day hotel; item detail resolves arrival vs departure dates accurately. |
| **DirectionsSheet Reset** | **PASS** | Stable request identity preserves selections during open sheet re-renders and re-initializes on new requests. |
