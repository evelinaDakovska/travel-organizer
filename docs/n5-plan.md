# N5a — Expenses without splitting: the step-by-step plan, and an audit against it

**Why this file exists.** N5a was built from the spec (`expenses-spec.md`) without a step-by-step
plan agreed first. This is that plan written after the fact, each step checked against what was
actually built (2026-10-11), so nothing skipped by not planning goes unnoticed. From now on the
plan comes first (owner's rule).

Status: ✅ done as planned · ⚠️ done, but decided on the way — **needs the owner's yes** ·
⬜ not done yet · 🔎 found by the audit.

---

## Step 1 — The database change (migration 002)

| | |
|---|---|
| **What** | New `expenses` table (category, label, amount in cents, currency, date, description). New `payments` table. New empty column `resources.expense_id` so a file can be a receipt. |
| **Data safety** | Purely additive: nothing existing is rewritten, moved or deleted. |
| **Tests** | A version-1 database holding one of everything is upgraded; every existing row is compared before/after and is identical. A migration that fails half-way changes nothing. Integrity and foreign-key checks pass. |
| **Status** | ✅ `92b2161` — 3 + 3 tests in `002-expenses.test.ts`. |

✅ **Decision 1 — splitting's columns are already in this migration.** *Owner: yes (2026-10-11).* `paid_by`, `split` and the
`payments` table are created now but unused, so the later splitting work needs **no second
database change** on the phone. Alternative: add them later in migration 003 (also additive).

✅ **Decision 2 — receipts reuse the attachments table** *Owner: yes (2026-10-11).* (a receipt is an attachment filed under
the trip and naming its expense). This avoids rebuilding the attachments table, which would be
the riskiest kind of change. Consequence: every query listing *trip documents* must leave
receipts out — done and tested.

## Step 2 — Make the database update itself safer

| | |
|---|---|
| **What** | The app recorded the database version *after* the change, in a separate step. Killed in between, the next start would re-run the change and fail. Now both commit together. |
| **Tests** | The "fails half-way changes nothing" test runs the same batch the app runs. |
| **Status** | ✅ `92b2161` — not in the spec; found while writing step 1. **Decision 3: owner said keep (2026-10-11).** |

## Step 3 — Backups carry expenses

| | |
|---|---|
| **What** | Backup format 2: expenses, payments and receipts are exported and restored. A backup made by 0.2.0 (format 1) still imports. |
| **Tests** | Restore into an empty app is byte-for-byte; a format-1 backup imports; a new test **fails if any table is ever left out of the backup** (it caught exactly this during the work). |
| **Status** | ✅ `92b2161`. On the emulator: export after adding an expense with a receipt counted the receipt (29 files). |
| 🔎 **Gap A** | The import confirmation ("Adds 2 trips, 41 items, 4 notes and 28 saved files") does not mention expenses. ✅ **Done, `d69afa1`** — see the follow-up below. |
| 🔎 **Gap B** | Restoring a backup *with expenses* was tested in code, not on the emulator (the emulator cannot save the exported zip anywhere). |

## Step 4 — The rules (pure functions, `src/domain/spending.ts`)

Categories and their names, the form's validation, the title (label, or category when empty),
the next expense's currency (the last one used on the trip, else EUR), grouping by day, totals
per currency and per category, and the trip total (bookings + spending).

**Status:** ✅ `63d0edb` — 23 tests.

🔎 **Gap C — naming.** `domain/expenses.ts` (booking costs, from U6) and `domain/spending.ts`
(the new expenses) are easy to confuse. **Proposed: rename `expenses.ts` → `bookingCosts.ts`**,
a mechanical rename with no behaviour change. ✅ **Done, `0aac413`.**

## Step 5 — Queries and repositories

List, get, create (with its receipts in one transaction), update (never touches `paid_by` /
`split`), delete (receipts go with it; their files are collected at the next start). Receipts:
listed per expense, counted per expense for the paperclip, kept out of trip documents, kept by
the file sweep. Deleting a trip now also names its expenses in the warning.

**Status:** ✅ `63d0edb` and `N5 step 3` — 10 SQL tests, plus `countOf` / `listPhrase` tests.

## Step 6 — Attaching files: camera, and receipts on a not-yet-saved expense

| | |
|---|---|
| **What** | `attach.ts` reorganised around three pickers (file, photo, camera). A new expense holds its picked receipts until Save. |
| **Status** | ✅ for file and photo (emulator: a PDF receipt saved with a new expense). |
| ✅ **Decision 4** | Receipts picked on a new expense are copied into the app at once; if the form is closed without saving, those copies are deleted at the next app start. **Owner: change it** — delete them at once. Done, `02f76d4`; see the follow-up below. |
| 🔎 **Gap D** | **The camera was not tested** — neither the permission question nor taking a photo. ✅ **Done on the emulator, 2026-10-11** — see *Gap D and the regression pass* below. |
| 🔎 Note | Sharing from other apps uses the same `attachFile` — unchanged in behaviour, but re-test one share on the phone. |

## Step 7 — Screens

- **Expenses tab** (Now · Timeline · Places · **Expenses** · Notes): trip total (bookings +
  spending), then **Spending | Bookings**. ✅ seen on the emulator.
- **Spending:** category bars, then each expense by day. ✅
- **Bookings:** the U9 list (To pay, Paid). ✅ moved; the U9 page is removed.
- **+** on the Expenses tab adds an expense. ✅
- **Expense form** in the agreed order; receipts section. ✅
- **Editing an expense:** same form, receipts, Delete. ✅ tapped through on the emulator (Gap D, below).
- The Expenses card left Now. ✅

✅ **Decision 5 — the tappable card from U9 (0.2.1) was removed again** *(owner: yes)*: Bookings is now a view
in the tab, so the card leads nowhere. 0.2.1 never reached the phone.

✅ **Decision 6 — new screens chosen on the way** *(owner: yes)*: a trip total card above the views; an
expense with no label shows its category as its title; deleting an expense says how many
receipts go with it; a receipt's page does not offer *Also attach to an item*.

## Step 8 — The update rehearsal (done on the emulator, 2026-10-11)

0.2.0 exactly as on the phone → sample backup restored → a reminder switched off → timelines,
alarms, documents and the backup recorded → **0.3.0 installed over the top** (`install -r`).

| Check | Result |
|---|---|
| Installed as an update, not a reinstall | ✅ first-install time unchanged |
| Crash on first start (the migration runs here) | ✅ none |
| Both timelines | ✅ identical line for line |
| The reminder switched off in 0.2.0 | ✅ still *Off* |
| Alarms | ✅ 26 before, 26 after |
| Trip documents | ✅ both still listed |
| PDF in airplane mode | ✅ opens |
| Backup | ✅ "2 trips and 28 saved files", as before |

## Step 9 — Documentation ⬜

A user guide for the whole app, and the technical reference brought up to date. Plan to be
shown to the owner before writing.

## Step 10 — The phone ⬜

Fresh Drive backup → connect → `adb install -r` (never uninstall) → check trips, files,
reminders → add one expense with a camera receipt → USB debugging off, Auto Blocker on.

---

## To do before the phone, if the owner agrees

1. ~~Decisions 1–6: yes or no.~~ ✅ Answered 2026-10-11: yes to 1, 2, 3, 5, 6; D4 changed.
2. ~~Gap A (import message names expenses) and Gap C (rename) — small, each with tests.~~ ✅ Done.
3. ~~Gap D (camera) and editing/deleting an expense — tap through on the emulator.~~ ✅ Done, with a regression pass.
4. Step 9 (documentation), after its plan is agreed.
5. A fresh rehearsal on the final build.

---

## Follow-up (2026-10-11): D4 changed, Gaps A and C — the plan, and how it went

This time the plan came first. It was shown to the owner and approved ("yes, go ahead") before
any code. Below, each step as planned, then what actually happened, including what differed.

### Step F1: D4, delete abandoned receipt copies at once (`02f76d4`)

**Planned**
- `deleteStoredFile(storedPath)` in `src/files/storage.ts`: `media/` paths only, swallows
  errors.
- × on a pending receipt deletes its copy.
- Leaving the form unsaved (✕, hardware back, any unmount) deletes every pending copy, through
  an unmount cleanup in `app/expense/new.tsx` reading the receipts through a ref.
- Never delete once `createExpense` resolved, never while a save is in flight. A failed save
  rolls back and the form stays open with its receipts.
- The start-up sweep stays as the fallback.
- No new unit test (device I/O). Verified on the emulator by listing `files/media`, which
  needed a dev build and so an uninstall of the release 0.3.0 **on the emulator only**.

**How it went**

| Planned | Result |
|---|---|
| `deleteStoredFile`, media paths only, best effort | ✅ as planned. Returns silently for a path outside `media/`, matching the "best effort" contract rather than throwing like `writeStoredFile`. |
| × deletes the copy | ✅ Emulator: 28 → pick → 29 → × → 28. The deleted name was the new copy; the 28 remaining files matched the sample backup's `media/` list exactly. |
| Unsaved form deletes all pending copies | ✅ ✕ with two receipts: 30 → 28, exactly the originals. Hardware back with one: 29 → 28. |
| Saved receipts are kept | ✅ Saved *Groceries 7.20 EUR* with a PDF: the file stayed (29). It also survived a force-stop and relaunch, so the sweep sees the row. |
| Sweep as the fallback | ✅ **Added to the plan while testing:** pick, then force-stop (no unmount runs): 30 after the kill, 29 after relaunch. The sweep collected only the abandoned copy; the saved receipt was still there. |
| Failed save leaves the form usable | ⚠️ **Refined while building.** As planned, a flag set at the start of a save blocks the cleanup. But a save that threw would then block it forever, leaving copies for the sweep. So the flag resets when `createExpense` throws (the transaction rolled back, so no row points at the files). **Not tested on a device:** a failed insert cannot be provoked from the UI. |
| Uninstall only on the emulator | ✅ The emulator now runs the **dev build** with the sample data plus the *Groceries* expense. The next update rehearsal starts from a fresh 0.2.0 anyway. |

**Known, accepted:** if the screen closes while a picker is still open, files that land after the
unmount have no form to delete them and are left for the sweep. They are not lost data, just a
copy that lives until the next start.

### Step F2: Gap A, the import confirmation names expenses (`d69afa1`)

**Planned:** "Adds 2 trips, 41 items, 3 notes, 4 expenses and 29 saved files"; the expenses clause
only when there are some, so a 0.2.0 backup reads as today; receipts already count as saved files.
Tests: with expenses they are named; without, today's wording.

**How it went:** ✅ as planned. The new test covers a fresh restore (3 expenses, 3 files including
a receipt) and a merge that skips a trip: its expenses are not counted, because `planImport`
already leaves them out. The five existing tests (no expenses) pin the old wording unchanged.
⬜ **Not seen on a device:** that needs a backup with expenses restored on a device, which is
exactly Gap B. On the emulator the sample backup's dialog still read *"Adds 2 trips, 41 items, 4
notes and 28 saved files."* (no expenses, old wording), as expected.

### Step F3: Gap C, rename `domain/expenses.ts` → `bookingCosts.ts` (`0aac413`)

**Planned:** `git mv` the module and its test, update the 5 importers and any doc references.

**How it went:** ✅ Imports only; git records both files as renames. Differences from the plan:
- Six import lines, not five: the test file imports the module too. Its import passed 100
  characters and was wrapped.
- One forward-looking doc line fixed: `expenses-spec.md` (N5b) said "`expenses.ts` additions";
  it now says `spending.ts`. **Historical mentions were left as written** (U9 in `status.md`,
  the gap note above, the handoff's account of the last session).
- Emulator smoke test: the Bookings view (5 items, Paid EUR 1680.00) and an item's price on its
  detail page render.

### Process, and what bit

- **Two working copies.** The session opened in `C:UsersAcerDesktopepos	ravel-organizer`,
  which has no `node_modules` (`jest` not found). The real working copy is
  `C:dev	ravel-organizer` (handoff §6), at the same commit. All work was done there.
- **A stale Metro** from the previous session held port 8081 and the dev client hung on
  *Loading from 192.168.0.4:8081*. Killing it, restarting Metro, then `adb reverse` and opening
  `url=http://localhost:8081` fixed it, as handoff §7 describes.
- **The new-expense form focuses Amount on open**, and the number pad covers the receipt buttons.
  Two taps meant for *+ File* typed "−" into Amount instead. This only affected the test; worth
  remembering when driving the form (close the keyboard first). No product change proposed.
- Each step: `npm test` + `tsc`, commit, push. **495 tests** (one new), typecheck clean. All
  three commits pushed to `origin/main`.

---

## Gap D and the regression pass (2026-10-11)

The owner said go ahead with Gap D and asked to **make sure today's work caused no regressions**.
Everything ran on the emulator's **dev build** with the sample backup.

### Gap D: the tap-through

| Check | Result |
|---|---|
| + Camera, permission **refused** | ✅ *The camera is not allowed. Allow the camera for this app in Settings.* with *Not now / Open Settings*. |
| *Open Settings* | ✅ Opens the app's info page. Granted from there (Permissions → Camera), back to the app. |
| + Camera, **allowed**, on an existing expense | ✅ Emulator camera → shutter → Done; the photo is attached at once (media 29 → 30). |
| The photo's label | ❌ → ✅ **Bug:** labelled with a UUID (`30450f8b-…`), the camera's generated file name. **Fixed** in `8ee84d8` (`defaultFileLabel` treats a bare UUID like a media-store id, with a test); a camera receipt now reads *Photo*. |
| + Camera on a **new** expense, saved | ✅ Pending receipt reads *Photo*; saved; the paperclip shows on the row; the file is kept. |
| A receipt's page | ✅ No *Also attach to an item* (D6). |
| Opening a receipt | ✅ The PDF opens in the viewer. |
| **Editing** an expense | ✅ 7.20 Groceries → 9.80 Transport "Bus": row, category bar and trip total (EUR 1689.80) all follow. |
| **Deleting** an expense with 2 receipts | ✅ *Delete Bus? Its 2 receipts go too.* → gone, total back to EUR 1680.00. Both files swept at the next start, leaving exactly the 28 sample files. |
| Removing a pending receipt | ✅ Done earlier the same day (D4 test 1). |
| Another currency | ✅ HUF 3000 on an expense: totalled separately from EUR, never converted. |

### The regression pass

**Method.** I read the code diff from 0.2.0 (`550d500`, the build on the phone) to now, minus the
new expense code, and checked on the emulator every existing behaviour it touches. **Static
review:** every query reading `resources` by trip either leaves receipts out
(`SELECT_RESOURCES_FOR_TRIP`), or joins through items (`SELECT_ITEM_RESOURCES_FOR_TRIP`), or
should count them (`COUNT_TRIP_CONTENTS`: deleting a trip takes its receipts). Search does not
read `resources`. `attach.ts` keeps the same pickers and options for items and trips.
`AmountInput`/`CurrencyInput` moved over unchanged. No timeline, itinerary or time code changed.

| # | Existing behaviour touched by N5a | Result |
|---|---|---|
| R1 | **Now**: no Expenses card, trip documents, their buttons | ✅ No card; only the 2 trip documents (the camera receipt is **not** listed); File / Photo / Link. |
| R2 | **+** on Now, Timeline, Places, Notes | ✅ Opens *Add to trip* on all four; only Expenses adds an expense. |
| R3 | **Item price** (moved to `MoneyInputs`) | ✅ 12.50 saved as 12.50, not ×100. Edit opens with 12.50 and the currency. ⚠️ Found the currency bug below. |
| R4 | **Attaching to an item** (`attach.ts` reorganised) | ✅ + File → listed → opens in the PDF viewer; File / Photo / Link (no Camera) on items. |
| R5 | **A trip document's page** | ✅ *Also attach to an item* still offered (hidden only for receipts). |
| R6 | **Delete-trip warning** (now names expenses) | ✅ *24 items, 2 expenses and 18 saved files*, matching the sample (23 + 1 items; 16 + 2 files). Cancelled. |
| R7 | **Backup export** | ✅ *Backed up 2 trips and 30 saved files* = the files in `media/`. Share sheet cancelled. |
| R8 | **Timeline** | ✅ Renders; no timeline code changed since 0.2.0; compared line by line in the 0.3.0 rehearsal. |
| R9 | **Search** | ✅ Finds items and notes; no receipts appear. |
| — | **Sharing from another app** (`attachFile`), reminders, the update itself | ⬜ Release-build only: the dev client cannot be started by a share. Covered by the **final rehearsal** on the rebuilt APK (§11.5 step 6). |

**No regression found.** One **old** bug surfaced, now fixed:

❌ → ✅ **Currency fields could not be cleared and retyped** (`05e0c29`). Deleting "EUR" put "EUR"
straight back, and typing CHF did nothing. Cause: `CurrencyInput` reported an empty field as
`undefined`, and react-hook-form 7.87 shows a field's **default** while its value is `undefined`
(`useWatch` → `get(formValues, name, defaultValue)`). The keyboard then composed onto the
restored text and `maxLength=3` dropped the rest. **0.2.0 had the same code** in the item form, so
it is not a regression, but it also affected the new expense form and would have blocked changing
the currency abroad. The fix keeps the text in the input, as `AmountInput` already did. Checked
with the **on-screen keyboard**, not `adb input`: EUR → CHF on a new item (saved CHF 12.50); edit
opens with 12.50 CHF; an emptied currency now shows *Pick a currency* under an **empty** field
(before, the error sat under a field that read EUR); EUR → HUF on a new expense.

**Tests:** 496 (one new, for the label), typecheck clean. Commits `8ee84d8`, `05e0c29`, pushed.

**Practicalities found on the way** (also in the handoff):
- The dev client's floating **Tools** button sits on top of every screen's *Edit* button; a tap
  there opens the dev menu. Turn it off in the dev menu (*Tools button*).
- `adb input text` and chained `keyevent`s go through Gboard's composing text and can mislead.
  For anything about typing, tap the on-screen keys.
