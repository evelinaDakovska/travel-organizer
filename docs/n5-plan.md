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

⚠️ **Decision 1 — splitting's columns are already in this migration.** `paid_by`, `split` and the
`payments` table are created now but unused, so the later splitting work needs **no second
database change** on the phone. Alternative: add them later in migration 003 (also additive).

⚠️ **Decision 2 — receipts reuse the attachments table** (a receipt is an attachment filed under
the trip and naming its expense). This avoids rebuilding the attachments table, which would be
the riskiest kind of change. Consequence: every query listing *trip documents* must leave
receipts out — done and tested.

## Step 2 — Make the database update itself safer

| | |
|---|---|
| **What** | The app recorded the database version *after* the change, in a separate step. Killed in between, the next start would re-run the change and fail. Now both commit together. |
| **Tests** | The "fails half-way changes nothing" test runs the same batch the app runs. |
| **Status** | ⚠️ `92b2161` — not in the spec; found while writing step 1. **Decision 3: keep this fix?** |

## Step 3 — Backups carry expenses

| | |
|---|---|
| **What** | Backup format 2: expenses, payments and receipts are exported and restored. A backup made by 0.2.0 (format 1) still imports. |
| **Tests** | Restore into an empty app is byte-for-byte; a format-1 backup imports; a new test **fails if any table is ever left out of the backup** (it caught exactly this during the work). |
| **Status** | ✅ `92b2161`. On the emulator: export after adding an expense with a receipt counted the receipt (29 files). |
| 🔎 **Gap A** | The import confirmation ("Adds 2 trips, 41 items, 4 notes and 28 saved files") does not mention expenses. **Proposed: add them.** |
| 🔎 **Gap B** | Restoring a backup *with expenses* was tested in code, not on the emulator (the emulator cannot save the exported zip anywhere). |

## Step 4 — The rules (pure functions, `src/domain/spending.ts`)

Categories and their names, the form's validation, the title (label, or category when empty),
the next expense's currency (the last one used on the trip, else EUR), grouping by day, totals
per currency and per category, and the trip total (bookings + spending).

**Status:** ✅ `63d0edb` — 23 tests.

🔎 **Gap C — naming.** `domain/expenses.ts` (booking costs, from U6) and `domain/spending.ts`
(the new expenses) are easy to confuse. **Proposed: rename `expenses.ts` → `bookingCosts.ts`**,
a mechanical rename with no behaviour change.

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
| ⚠️ **Decision 4** | Receipts picked on a new expense are copied into the app at once; if the form is closed without saving, those copies are deleted at the next app start. |
| 🔎 **Gap D** | **The camera was not tested** — neither the permission question nor taking a photo. Needs the emulator's camera, or the phone. |
| 🔎 Note | Sharing from other apps uses the same `attachFile` — unchanged in behaviour, but re-test one share on the phone. |

## Step 7 — Screens

- **Expenses tab** (Now · Timeline · Places · **Expenses** · Notes): trip total (bookings +
  spending), then **Spending | Bookings**. ✅ seen on the emulator.
- **Spending:** category bars, then each expense by day. ✅
- **Bookings:** the U9 list (To pay, Paid). ✅ moved; the U9 page is removed.
- **+** on the Expenses tab adds an expense. ✅
- **Expense form** in the agreed order; receipts section. ✅
- **Editing an expense:** same form, receipts, Delete. ⬜ not yet tapped through on the emulator.
- The Expenses card left Now. ✅

⚠️ **Decision 5 — the tappable card from U9 (0.2.1) was removed again**: Bookings is now a view
in the tab, so the card leads nowhere. 0.2.1 never reached the phone.

⚠️ **Decision 6 — new screens chosen on the way:** a trip total card above the views; an
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

1. Decisions 1–6: yes or no.
2. Gap A (import message names expenses) and Gap C (rename) — small, each with tests.
3. Gap D (camera) and editing/deleting an expense — tap through on the emulator.
4. Step 9 (documentation), after its plan is agreed.
5. A fresh rehearsal on the final build.
