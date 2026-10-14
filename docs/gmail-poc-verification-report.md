# Travel Organizer Corrections & Gmail PoC Verification Report

**Date:** 14 October 2026  
**Target Environment:** Emulator `emulator-5554` (Pixel 10 Pro, Android 17 / API 36)  
**Production App:** `com.evelinadakovska.travelorganizer` (v0.7.0, DB untouched)  
**Isolated PoC App:** `com.evelinadakovska.gmailpoc` (v1.0.0-poc)

---

## Part 1: Review Corrections Implementation & Commit Evidence

All 9 issues highlighted in [`travel-organizer-correction-review.md`](file:///C:/Users/Acer/Downloads/travel-organizer-correction-review.md) were investigated, corrected, and verified with 48 passing test suites (800 tests) and zero TypeScript errors (`npx tsc --noEmit`).

### Commits Created on `main` (clean, separated from PoC)
1. **[`248b0ed`](file:///C:/dev/travel-organizer)**: `fix(traveller): preserve unconverted legacy names in trip summary (C1)`
   - File: [`src/domain/traveller.ts`](file:///C:/dev/travel-organizer/src/domain/traveller.ts#L71-L93), [`src/domain/traveller.test.ts`](file:///C:/dev/travel-organizer/src/domain/traveller.test.ts#L52-L86)
   - *Fix:* `tripPeopleLine` now combines linked profile members plus unconverted legacy names deduplicated case-insensitively.
2. **[`cfe72b8`](file:///C:/dev/travel-organizer)**: `fix(overview): sort baseTonight by start instant to respect latest-started stay (C2)`
   - File: [`src/domain/overview.ts`](file:///C:/dev/travel-organizer/src/domain/overview.ts#L85-L98), [`src/domain/overview.test.ts`](file:///C:/dev/travel-organizer/src/domain/overview.test.ts#L89-L113)
   - *Fix:* `baseTonight` sorts by full resolved start instant descending, resolving the issue where alphabetical title won over start time on the same date.
3. **[`82c9d91`](file:///C:/dev/travel-organizer)**: `fix(directions): resolve endpoints with timeline role, allow multi-day stays, and reject invalid origins (D1, D2, D3, D5)`
   - File: [`src/domain/directions.ts`](file:///C:/dev/travel-organizer/src/domain/directions.ts#L94-L275), [`src/domain/directions.test.ts`](file:///C:/dev/travel-organizer/src/domain/directions.test.ts)
   - *D1:* `resolveItemEndpoint(item, role, entryRole)` differentiates arrival (`details.to`) and departure (`details.from`) based on timeline entry role.
   - *D2:* `findTimelineConnectors` exempts multi-day occupancy (stays, car rentals) and arrival milestones (`role: 'end'`) from being suppressed as overlapping events.
   - *D3:* Added `findStayForDay(stays, targetDay)` matching route date with fallback rules; `findTripStays` includes coordinate-only stays.
   - *D5:* `buildGoogleMapsUrl` rejects invalid explicit origins (`origin.type === 'endpoint'`) rather than converting them to current location; enforces 2048-char URL limit and travel modes.
4. **[`2b458c6`](file:///C:/dev/travel-organizer)**: `fix(directions): reset sheet state, support complete saved origins, and resolve route-day hotel (D3, D4, D6, D7)`
   - Files: [`src/features/directions/DirectionsSheet.tsx`](file:///C:/dev/travel-organizer/src/features/directions/DirectionsSheet.tsx), [`timeline.tsx`](file:///C:/dev/travel-organizer/app/trip/%5BtripId%5D/(tabs)/timeline.tsx), [`index.tsx`](file:///C:/dev/travel-organizer/app/trip/%5BtripId%5D/(tabs)/index.tsx), [`index.tsx`](file:///C:/dev/travel-organizer/app/item/%5BitemId%5D/index.tsx)
   - *D3:* Callers resolve the hotel for the specific connector/item day instead of always passing `stays[0]`.
   - *D4:* Deduplicated list of saved places with expandable "Choose another place (N more)" and stable composite keys.
   - *D6:* `useEffect` resets sheet state (`origin`, `mode`, `pickingOrigin`, `showAllPlaces`) whenever a new request opens or visibility changes.
   - *D7:* Accessible radio roles with untruncated labels; `isOpening` guard against concurrent rapid taps; safe Clipboard error handling.

---

## Part 2: Isolated Gmail PoC Application

### 1. Build & Delivery Identity
- **Source Code Location:** [`C:\dev\gmail-poc`](file:///C:/dev/gmail-poc)
- **APK Output Path:** [`C:\dev\gmail-poc\app\build\outputs\apk\debug\app-debug.apk`](file:///C:/dev/gmail-poc/app/build/outputs/apk/debug/app-debug.apk)
- **APK File Size:** 6,488,575 bytes (~6.2 MB)
- **Package ID:** `com.evelinadakovska.gmailpoc` (separate from `com.evelinadakovska.travelorganizer`)
- **Version Code / Name:** `versionCode=1`, `versionName=1.0.0-poc`
- **Compile / Target SDK:** API 35 (Android 15), `minSdk=26` (Android 8.0)
- **Signing Certificate (Debug Keystore):**
  - **SHA-256:** `4C:43:B7:BC:A0:0C:D6:95:12:3F:B5:14:70:21:D2:9B:06:55:80:2E:38:4F:D6:75:89:5C:CA:A6:5B:97:66:0D`
  - **SHA-1:** `0A:0F:78:DE:30:FD:5B:65:E6:10:55:C9:AC:BE:7F:D6:68:04:DC:6F`
  - **Signer DN:** `C=US, O=Android, CN=Android Debug`

### 2. Manifest & Security Audit
- **Permissions Requested:** **ZERO** user-facing permissions.
  - No `GET_ACCOUNTS`, `READ_CONTACTS`, `INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, or accessibility services.
  - Only internal AndroidX receiver permission (`com.evelinadakovska.gmailpoc.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`).
- **No OAuth or Credential Flows:** Zero network libraries, zero token requests.
- **No Diagnostic Uploads / Telemetry:** Logs are stored strictly in memory within the active Activity (`StringBuilder`) and displayed on screen.
- **Privacy Redaction:** Search queries, booking references, and email addresses are NOT emitted to system logcat.

### 3. Sandbox Isolation Verification
Verified via `adb shell` on `emulator-5554`:
```bash
$ adb shell "run-as com.evelinadakovska.gmailpoc ls /data/data/com.evelinadakovska.travelorganizer"
ls: /data/data/com.evelinadakovska.travelorganizer: Permission denied
```
> [!IMPORTANT]
> The Android kernel enforces UID-based process separation (`/data/user/0/com.evelinadakovska.gmailpoc` vs `/data/user/0/com.evelinadakovska.travelorganizer`). The PoC cannot read, write, or modify production Travel Organizer databases or documents.

---

## Part 3: Test Actions & Emulator Verification

| Test Action | Intent / Mechanism | Emulator Result | Behavioral Limitations Observed |
| :--- | :--- | :--- | :--- |
| **Action 1: Find in Gmail** | `Intent(ACTION_SEARCH)` targeting package `com.google.android.gm` with `SearchManager.QUERY` | **PASS** | Opens Gmail search view. Operates on the active account only; does not open single exact message. |
| **Action 2: Copy reference & open Gmail** | Explicit tap -> `ClipboardManager.setPrimaryClip` -> `getLaunchIntentForPackage` | **PASS** | Copies synthetic reference `SYNTH-7890` only upon user tap; launches Gmail smoothly. |
| **Action 3: Open Gmail web link** | `Intent(ACTION_VIEW, Uri.parse(url))` with user-entered URL | **PASS** | Opens default web browser (Chrome); prompts for Google web login. |
| **Undocumented Deep-link** | `VIEW_MESSAGE_DEEPLINK` | **REMOVED** | Removed completely per audit findings. |
| **Cold Start vs Running** | Gmail cold start launch & back button return | **PASS** | Both states launched cleanly and returned to PoC without crashes. |
| **Multiple Accounts** | Account switching within search intent | **UNVERIFIED on emulator** | Emulator has 0 Google accounts configured (`Accounts: 0`). Requires physical phone testing. |

---

## Next Steps for Physical Samsung Phone Review
1. Inspect the isolated APK at [`C:\dev\gmail-poc\app\build\outputs\apk\debug\app-debug.apk`](file:///C:/dev/gmail-poc/app/build/outputs/apk/debug/app-debug.apk).
2. Install alongside Travel Organizer (it will show as a separate app named **"Gmail Link PoC"**).
3. Test with a harmless query (e.g. `SYNTH-7890`).
4. Production Travel Organizer app data will remain 100% untouched.
