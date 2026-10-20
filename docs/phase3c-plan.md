# Phase 3C — Adult/child pricing: implementation plan

Written 2026-10-20 against `63b9021` (0.12.0, versionCode 19, schema `user_version` 6, backup
format 6). Scope and constraints: the owner's decisions in `docs/phase3-plan.md` §18.1, the schema
check in §19, and the owner's answers to §19.2 (recorded below as P-1…P-4). The owner asked for
this plan and for the implementation in the same message; the plan is written first so it can be
reviewed against what is built.

Target release: **0.13.0, versionCode 20**. **No SQLite migration** (`user_version` stays 6).
**Backup/archive row format 6 → 7.**

## 1. The owner's answers to §19.2

| # | Decision |
|---|---|
| P-1 | Raise the backup/archive format **6 → 7**; the SQLite schema version is unchanged. Older apps must reject format-7 files rather than lose pricing metadata. The new app still restores formats 1–6. Verify it for full backups **and** single-trip ZIPs, round trips and older-app rejection. 3D-1's format number is decided when its changes are approved, not assumed here |
| P-2 | Extras are marked **`extra: true`**. Extras are things or services, not people: they never count towards the priced people, and *Price for who's going* never changes their quantity. Quantities stay whole numbers ≥ 1 |
| P-3 | A fixed group price is a **dedicated group line with quantity 1**, alongside optional extras, semantically distinct from an extra, with an explicit backward-compatible representation (proposed in §2). With lines, the total equals the sum of the lines. Legacy total-only prices stay as they are; nothing historical is converted |
| P-4 | **Unpaid:** the suggestion shows the existing and proposed total and applies only after explicit confirmation. **Paid:** the proposed calculation can be viewed, but no Apply is offered, because *Paid* does not record the amount paid. Manually editing a paid booking's total shows a warning explaining this. Paid status, the total and who is going never change without explicit confirmation of a permitted change |

Also confirmed: flight/hotel search, booking APIs and the Google Wallet API stay *Explicitly
excluded*; in-app AI itinerary generation stays *Discovery*. Zero-decimal currencies stay in Phase 4,
and 3C introduces no new currency-formatting regression.

## 2. Pricing-line representation

Unchanged home: `trip_items.details.pricing`, JSON. Unchanged envelope: `{ mode: 'perPerson',
lines: [...] }` — `mode` keeps its old literal (now meaning *a breakdown*), so an untouched old
breakdown is byte-identical and still valid.

```ts
type RateLine = {
  label?: string;          // free text, ≤ 40 — as today
  quantity: number;        // whole, ≥ 1 — as today
  unitAmount: number;      // minor units, ≥ 0 (0 = free) — as today
  for?: 'adult' | 'child' | 'any';  // NEW, person lines only; absent = not set (legacy meaning)
  group?: true;            // NEW: a fixed price for a group; quantity must be 1
  extra?: true;            // NEW: a thing or service (sled hire), not people
};
```

| Line type | Marked by | Quantity means | `for` | Counts as priced people | *Price for who's going* |
|---|---|---|---|---|---|
| **Person rate** | neither flag | people | optional: Adult / Child / Anyone; absent = not set | yes | may change its quantity (§4) |
| **Group price** | `group: true` | always **1** | not allowed | no | never touched |
| **Extra** | `extra: true` | units | not allowed | no | never touched |

Validation (`rateLineSchema`, Zod, on every save):
- `group` and `extra` are never both set;
- a group line has quantity exactly 1 (two family tickets are two group lines);
- `for` is refused on a group or extra line;
- `group`/`extra` accept only `true` (absence, not `false`, is the person-line form, so old lines
  and new person lines look the same);
- the existing rules stand: ≥ 1 line, whole quantity ≥ 1, `unitAmount` integer ≥ 0, total equals
  `price_amount` (`pricingMatches`).

**Why flags, not a `type` field:** absence of both flags is exactly today's line, so every existing
breakdown keeps its meaning with no conversion; the owner approved `extra: true`, and `group: true`
mirrors it. **Why not a label:** labels stay free text and are never parsed — a legacy line
labelled *Adult* is shown as *not set* until the person tags it.

Mixes allowed: person lines only (today); group line(s) + extras; person lines + extras; group +
person lines (rare, allowed); extras only. A breakdown with no line of any kind is refused, as today.

## 3. Calculation and rounding

- **Total** = Σ `quantity × unitAmount` over **all** lines, in minor units. Integer multiplication
  only; no division, so **no rounding exists**. A total that is not a safe integer is refused (as
  today, `pricingTotal` → null).
- **Priced people** (`pricedFor`) = Σ quantity over **person** lines only.
- Free lines (`unitAmount = 0`) add 0 and are shown as *free*.
- Currency: unchanged — one currency per item, `formatMoney` as today. No new formatting path.

## 4. *Price for who's going* (user-invoked)

Pure function `priceForWhosGoing(lines, going)` in `src/domain/pricing.ts`; `going` is the
classifications of the people ticked in the form. It **suggests** new lines; the form changes only
on the person's confirmation.

Mapping: **adults** → the Adult line, else the Anyone line; **children** → the Child line, else the
Anyone line; **not specified** → the Anyone line only (never assumed adult). A single untagged
person line, with no tagged person lines beside it, acts as *Anyone* (today's *Price for N*).

Results:

| Situation | Result |
|---|---|
| Nobody ticked | not offered |
| No person lines (group and/or extras only) | not offered: *The group price covers the group* |
| Two lines for the same audience, or untagged lines beside others | not offered: *Tag each rate Adult, Child or Anyone…* (no guessing which line) |
| Someone going has no line to go on (e.g. a child, no Child or Anyone line) | not offered, with who is missing: *1 child going has no rate — add a Child or Anyone rate* |
| Proposal equals the current lines | *Priced for who's going* — nothing to apply |
| Otherwise | proposal: person-line quantities set to their counts; a person line whose count is 0 is **removed** and listed as removed; group and extra lines kept exactly; proposed total |

Showing it: when a breakdown exists and people are ticked, the price section shows *Priced for 3;
4 are going* (person lines only) or the proposal's difference, and a **Price for who's going**
button. It opens an inline panel: the current lines and total, the proposed lines and total, and
removed lines.
- **Not paid:** **Apply** and **Keep current**. Apply writes the proposed lines and total into the
  form (still unsaved; the item's Save is the second explicit step).
- **Paid** (the item is saved as paid, or *Paid* is selected in the form): the calculation only,
  with *This booking is marked Paid. The app does not record how much was paid, so a new total is
  not applied for you. Change the rates yourself if the price really changed.* — **no Apply**.

Editing who is going never changes a price, a line or *Paid* (as today, 3B).

Starting a breakdown (*Total price* → *Breakdown*) on an item with no lines suggests lines from who
is going, as today, now **tagged**: *Adult* lines `for: 'adult'`, *Child* `for: 'child'`, people
not specified (or nobody ticked) one untitled `for: 'any'` line. Prices are never invented (as
today: no unit price is filled).

## 5. Paid-booking protection on a manual edit

When the item was **saved as paid** and the total in the form differs from the saved total, the
price section shows, under the total: *Marked paid. The app keeps no record of the amount paid, so
this new price will count as paid too. Paid stays as it is unless you change it.* The save is not
blocked (a corrected typo is legitimate). *Paid* is never changed by any price action.

## 6. Legacy total-only prices

A price with no `details.pricing` is unchanged: shown, counted and exported exactly as today, and
never converted to lines. Switching such an item to *Breakdown* is a manual edit (with §5's warning
if paid); switching back restores the previous total, as today.

## 7. The form (`PriceSection`)

- Toggle *Total price* / *Breakdown* (was *Per person*).
- Each line card shows its type: person rates have **For: Adult · Child · Anyone** chips (clearable
  — cleared = not set), the label, price and a stepper; a **group price** card has a label and a
  price, no stepper (quantity 1); an **extra** card has a label, price and a stepper counting
  units.
- Add actions: **Add a rate** · **Add a group price** · **Add an extra**. A line's type is fixed when
  added; remove and re-add to change it.
- Ideas (`status = 'idea'`): the price field is labelled *Estimated price*, the section summary
  says *Estimate*.
- Every draft line carries `for` / `group` / `extra`; a pure `pricingFromDraft` (domain) writes them
  back, so editing one line never drops another line's metadata.

## 8. Display

- `pricingText` (item detail and PDF): person lines `2 × EUR 90.00 Adult`, label first, else the
  audience (*Adult*, *Child*; *Anyone* shows nothing extra); free lines `1 × free Child`; group
  lines `Family ticket EUR 120.00` (*Group price* when no label); extras `Extra: 2 × EUR 20.00
  Sled`; then `= total`.
- **Estimate on ideas:** item detail labels an idea's price *Estimated price* with *Estimate*
  instead of *Paid / Not paid yet*; `ItemRow` shows *Estimate* under an idea's amount where amounts
  are shown (Places still shows none). Expenses and totals are unchanged (ideas never count).
- **PDF:** the costs appendix still lists confirmed items' breakdowns only, now through the new
  `pricingText`; nothing about ideas, payers or people is added.

## 9. Persistence, metadata preservation, backups

| Path | 3C behaviour |
|---|---|
| SQLite | `details` JSON as today; **no migration**, `user_version` 6 |
| Item save / edit | lines round-trip through `pricingOf` (schema extended) and `pricingFromDraft` |
| Change of kind | `detailsForKind` keeps `pricing` (test added with tagged, group and extra lines) |
| Journey | the whole breakdown on the first leg (test added) |
| Full backup | rows copied as text; **`EXPORT_FORMAT_VERSION` = 7**; formats 1–7 restore; 8+ refused |
| Trip ZIP (2B) | `rowFormat` = 7 (the same constant); archives with `rowFormat` > 7 refused; 1–6 import |
| Older app (0.12.0) | refuses format 7 (*"This backup is from a newer version (format 7)"*) and a trip ZIP with `rowFormat` 7 (*"…exported by a newer version of the app…"*) — the existing checks, verified on the emulator |
| AI activities JSON (2C), Plan with AI (2D) | unchanged: totals only, no lines |

## 10. Tests

**Unit (`npm test`):**
- `pricing.test.ts`: schema (flags, group quantity 1, `for` refused on group/extra, both flags
  refused, `false` refused, legacy lines valid); `pricedFor` excludes group/extra; `pricingTotal`
  with free, group, extras; `pricingText` every line type; `suggestPricingLines` tags;
  `pricingFromDraft` round trip keeps every key; `priceForWhosGoing` — every row of §4's table,
  family 2 adults + 1 child, several children, unspecified never adult, untagged single line,
  extras' and group lines' quantities never changed, zero-count line removed, unchanged proposal,
  overflow.
- `tripItem.test.ts`: an item with tagged/group/extra lines saves; a mismatched total refused.
- `journey.test.ts`, `detailsForKind`: metadata kept.
- `export.test.ts` / `backup.queries.test.ts`: written format 7; format 6 (and 1–5) accepted;
  format 8 refused; a backup with tagged lines round-trips byte-identical `details`.
- `tripArchive.test.ts`: `rowFormat` 7 written, 8 refused, 6 accepted; metadata survives export →
  import with remapped ids.
- `itineraryHtml.test.ts`: the PDF line text.
- Regression: the existing `bookingCosts`, `spending`, `export`, `tripArchive`, `activityFormat`,
  `planningContext` suites pass unchanged (totals and paid state of existing bookings identical).

**Emulator E2E** (`TO_2B_Test`, debug-signed debuggable build, synthetic data, DB diffs):

| # | Scenario | Expect |
|---|---|---|
| E1 | Legacy total-only booking, edit and save without touching the price | `details`, total, paid byte-identical |
| E2 | Legacy untagged breakdown (Adult/Child labels), open and save | unchanged; chips show *not set* |
| E3 | Tag lines Adult/Child, add a free Child line, save | JSON has `for`; total correct; detail text |
| E4 | Group price + 2 extras | total = sum; *priced for* ignores them; detail text |
| E5 | 2 adults + 1 child going, unpaid, *Price for who's going* → panel → Apply → Save | old/new totals shown; saved as proposed |
| E6 | Same on a paid booking | calculation shown, no Apply; nothing changes |
| E7 | Paid booking, change the total by hand | warning shown; Paid kept after save |
| E8 | Change who is going | no price change |
| E9 | Change kind activity → food with tagged lines | lines kept |
| E10 | Idea with a price | *Estimated price* / *Estimate* in form, detail, row; not in Expenses |
| E11 | Full backup → restore; trip ZIP export → import as a new trip | metadata identical |
| E12 | PDF export | breakdown text |
| E13 | Expenses tab totals before/after the upgrade | identical |
| E14 | Small screen 360 dp, dark mode, font 1.3/2.0 on the price section | readable, no overlap |

**Upgrade and older-app rejection** (`Pixel_10_Pro`, release-signed 0.12.0 with synthetic data):
before: capture Expenses and priced items, export a format-6 backup; try importing a **format-7**
backup and a **rowFormat-7** trip ZIP produced by the 3C test build → both **refused**, nothing
written; `install -r` the signed 0.13.0 release; after: same screens identical, legacy prices
unchanged, the format-6 backup's trip ZIP and backup both readable by 0.13.0.

## 11. Docs and release

`technical-reference.md` (pricing section, backup format 7), `decision-log.md` D39,
`user-guide.md` (pricing), `status.md` P3·3C, `product-status.md`, `phase3-plan.md` pointer,
`MASTER_ROADMAP.md` §4/§5/§6, session handoff §11. Version 0.13.0 / versionCode 20.

## 12. Explicitly not in 3C

Payments, payers, deposits, splits, responsibility, balances (3D/3E); currency conversion and
zero-decimal currencies (Phase 4); per-line prices in the 2C activities JSON; any change to
`is_paid` semantics; any SQLite migration.

## 13. As built (0.13.0, 2026-10-20)

Built as planned; **no SQLite migration** (`user_version` 6), backup/archive format **7**.

| Area | Files |
|---|---|
| Domain | `src/domain/pricing.ts` (`rateLineSchema` with `for`/`group`/`extra`, `lineType`, `pricingFromDraft`, `lineText`, `pricedFor` person-only, tagged `suggestPricingLines`, `priceForWhosGoing`); `src/domain/export.ts` (`EXPORT_FORMAT_VERSION` 7) |
| Form | `src/features/items/PriceSection.tsx` (Breakdown, line types, *For* chips, three add actions, suggestion panel, paid rules, *Estimated price*); `ItemForm.tsx` passes the saved price and paid state |
| Display | `app/item/[itemId]/index.tsx` (*Estimated price* / *Estimate* on ideas); `src/ui/components/ItemRow.tsx` (*Estimate* under an idea's amount) |
| Tests | 1189 (36 new): pricing, item save, change of kind, journey, PDF text, backup round trip (format 7 written, 6 read), trip-archive round trip on real SQLite (rowFormat 7 written, 6 read) |

**Deviations from §10.**
- **No debuggable test build.** The temporary debug-signed debuggable build used in earlier phases was
  blocked by this session's safety classifier, so the E2E ran on the **release** build only (on
  `Pixel_10_Pro`, over 0.12.0). Stored JSON was checked through what the screens can only show if
  the keys are stored, and by the Node round-trip tests; no database was pulled.
- **E11/E12 on the device:** the exported backup could not be saved locally from the emulator's
  share sheet (no file target), and the PDF was not exported there; both are covered by tests.
- **One fix found by E14:** at font 2.0 the *Priced for…* caption was squeezed beside its button;
  it is now stacked above it.

E2E log and screenshots: `%USERPROFILE%\Pictures\TravelOrganizer-0.13.0-3C-e2e\E2E-LOG.md`.
