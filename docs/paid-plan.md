# Paid plan — F7: paid or not, at a glance

> **Archived — done.** This plan is complete and kept as a record of how the work went. What is done and what is next lives only in [`status.md`](status.md).

The owner's idea, 2026-10-12: *"be able to easily distinguish what is paid and what is not from
the Now and Timeline etc views"*. The owner asked for research, a detailed plan, a review of the
plan, then the build without waiting for a go. **Status: done** — built, tested, rehearsed, and on
the owner's phone in 0.5.1 since 2026-10-12 (`docs/status.md` → F7).

Ships with N6, R1–R11 and F1–F6 as **0.5.1** (0.5.0 was rehearsed but never installed; the phone
still has 0.3.0, so 0.5.1 is rehearsed as an update over 0.3.0).

## Data safety

**Presentation only.** `trip_items.is_paid` exists since migration 001 and the item form has set it
since M3. Nothing here changes the schema, the backup format, stored data, a query or native
configuration. No new dependency (the two glyphs below are already imported in `Icon.tsx`).

---

## What exists today

- `is_paid` (0/1) on every item; the form's *Paid / Not paid yet* choice is shown **whether or not
  there is a price**, so an item can be *Paid* with no amount ("paid, amount not noted").
- Item detail says *Paid* / *Not paid yet* under *Price* — only when there is a price.
- `ItemRow` (Places, search, journey legs, Bookings, *No date yet*) prints the price in its bottom
  line, `textMuted` when paid and `warning` (stone gold) when not. Gold is also the *Confirmed*
  tag's colour, so the difference is nearly invisible — and colour is the only cue (fails WCAG 1.4.1).
- `EntryCard` (Now, Timeline) and `TaskRow` (Now's tasks) show nothing about money.
- A journey created with connections (U7) carries its price and *Paid* on the **first leg only**,
  so expenses count it once. The other legs have no price and `isPaid = false`.
- Expenses → Bookings already lists *To pay* then *Paid*.

## Research

How established apps and guidelines show a state like this on a card:

1. **A text label, plus an icon, plus colour — never colour alone.** WCAG 1.4.1 (*Use of Color*);
   the same rule F1 followed for kinds. Banking and invoicing apps (invoice lists in Stripe,
   QuickBooks, Wave) use a short pill: *Paid* / *Due* / *Overdue*.
2. **The same place on every card.** A status the eye must hunt for is not glanceable. This app
   already has a status pill at the top left of every card (*Confirmed*, *Idea*); a second pill
   beside it is where the eye already goes.
3. **Emphasise the exception.** Most bookings on a real trip are paid. The one that needs action —
   pay at the hotel desk, pay the guide in cash — should stand out; *Paid* should be quiet. A
   travel booking app's "Pay at property" badge is the louder one for the same reason.
4. **Say nothing when nothing is known.** A free walking tour or a museum with no price is not
   "to pay". Showing *Not paid* on every unpriced item would be noise, and false.
5. **Keep it short.** The top row also holds the time, which matters more on a travel day. A
   one- or two-word label; the amount is one tap away on item detail and in Expenses.

## Decisions

**D1 — When an item gets a pill.** Only **confirmed** items (`status = 'confirmed'`):

| Item | Pill |
|---|---|
| `isPaid` | **Paid** — with or without a price |
| a price, not `isPaid` | **To pay** |
| no price, not `isPaid` | none — nothing known |

Ideas: none (their price is an estimate; nothing is owed yet). Cancelled: none (refund is a
different question, and they are dimmed and off Now/Timeline anyway).

**D2 — A journey's legs share the first leg's state.** On screens that have the trip's items (Now,
Timeline, item detail's *Rest of this journey*), a confirmed leg with no price and not `isPaid`
takes the state of a confirmed leg of the same `details.journeyId` that has one. So all three legs
of a paid flight read *Paid*, not just the first. A leg with its own price or *Paid* keeps its own.
If the legs disagree (one *Paid*, one *To pay*), an unpriced leg takes **To pay** — the state that
needs action wins. Screens that list items from several places (Places, search, Bookings, *Attach
to an item*) show each item's own state; that is acceptable — they are not where a traveller looks
for the next leg.

**D3 — Look.** A pill beside the status pill, same `Tag` shape, with an icon:
- **To pay** — `danger` tone (soft red fill, red text) with the `wallet` glyph. The loud one.
- **Paid** — `neutral` tone (soft grey fill) with the `check` glyph. The quiet one.
Text + icon + colour, so it works in greyscale and for colour-blind eyes. Both tones' text roles
are already held to contrast by `roles.test.ts`.

**D4 — Where.** `EntryCard` (Now, Timeline — every card including check-out ends, since pay-at-
checkout is common), `ItemRow` (all its screens), `TaskRow` (a task like "pay the deposit" with a
price), and the item detail header beside its status. ItemRow's price line keeps the amount but
drops the gold colour (the pill carries the meaning now).

**D5 — Layout safety.** The top row becomes `[status][payment] … time`. The time is the most
important text there and must never be cut: the row wraps (`flexWrap`), so on a narrow card the
time drops to its own line rather than being truncated.

**Not doing:** a filter (*show only to pay*) — Expenses → Bookings already is that list; a
*Mark as paid* button on the card — editing stays on the item's form; the amount in the pill
(D5's width; the amount is on the item and in Expenses).

## Steps

### Step 1 — Domain: `paymentStatus` and `paymentStatuses`
`src/domain/bookingCosts.ts` (cost logic already lives there):
- `type PaymentStatus = 'paid' | 'toPay'`
- `paymentStatus(item): PaymentStatus | null` — D1.
- `paymentStatuses(items): Map<string, PaymentStatus>` — D1 for each, then D2 for unpriced legs.

**Tests** (`bookingCosts.test.ts`): paid with price; paid without price; price not paid; neither →
null; idea with price → null; cancelled paid → null; journey: three legs, first paid → all paid;
first to pay → all to pay; a leg with its own price keeps it; mixed states → to pay; an unpriced
leg whose only priced mate is cancelled → nothing; legs of different journeys do not mix; a lone
item without journeyId unaffected.

### Step 2 — `Tag` takes an icon; `PaymentTag`
- `Tag` gains optional `icon?: IconName`, drawn at the tag's text size in the tag's text colour.
- `src/ui/components/PaymentTag.tsx`: `{ status: PaymentStatus | null }` → the D3 pill or nothing.
  Accessibility label *Paid* / *To pay*.

### Step 3 — Cards
- `EntryCard`: optional `payment?: PaymentStatus | null` prop; pill in the top row; row wraps (D5).
- `ItemRow`: optional `payment` prop, defaulting to `paymentStatus(item)`; same top row; the price
  line in `textMuted` regardless.
- `TaskRow`: optional `payment` prop; the pill under the title next to the date.
- Item detail: the pill beside the kind line's status, computed with `paymentStatuses([item, …legs])`;
  *Rest of this journey* rows get the same map.

### Step 4 — Screens pass the journey-aware map
Now and Timeline compute `paymentStatuses(items)` once (`useMemo`) and pass each card its entry.
Timeline's *No date yet* `ItemRow`s get it too.

### Step 5 — Verify on the emulator (dev build, sample data)
The sample trips have paid bookings. Set one to *Not paid yet* and one free item; check Now,
Timeline, Places, search, item detail, a journey's legs, light and dark mode, and the longest top
row (*Fri 20 Nov · 09:20 · Sofia time* with *Confirmed* and *To pay*) on the 1280-px emulator.

### Step 6 — Docs, commit, version
`status.md` (F7 row and its *what was built / how verified*), `user-guide.md` (the pills),
`decision-log.md` (D29: the rule above), version **0.5.1**, versionCode **8**. Commit, push.

### Step 7 — Release build and the update rehearsal (for the phone)
Exactly the §11.3 recipe: fresh **0.3.0** (the APK on the phone) on the emulator → sample backup →
one expense with a PDF receipt → snapshot (both timelines, trip documents, expense totals, alarms,
export summary) → `install -r` 0.5.1 → first-install time unchanged, no crash, everything identical
apart from the intended changes (ticket buttons R6, trip band F3, the new pills). Then stop: the
phone needs the owner (fresh Drive backup, connect, `install -r`, never uninstall).

---

## Review of this plan (before building)

Read back against the code and the product rules:

1. **Is "no price, not paid → nothing" right?** Yes: every item saved before had `isPaid` default
   false, so any other rule would light up every free item as *To pay*. Checked: `item/new.tsx`
   initialises `isPaid: false`.
2. **Can *Paid* without a price happen?** Yes — the form shows the choice without a price. D1 covers
   it; without that row a user who ticked *Paid* and never typed an amount would see nothing.
3. **D2 risk: wrong inheritance.** Inheritance only fills a leg with **no** state of its own, only
   from **confirmed** mates of the **same** `journeyId`, and only on display. It cannot change what
   Expenses counts (those use `countsAsSpent`, untouched). Tests cover mixing and cancellation.
4. **Is red too alarming?** It is the one state that asks for action, and the owner asked to *easily*
   tell them apart. `danger` is already used for missing files, which are also "act on this". If it
   reads as an error on the screen, the fallback is `outline` with the danger colour — checked in
   step 5 with a screenshot, not guessed.
5. **Top-row overflow** is the real layout risk — D5 makes it wrap instead of truncating the time,
   and step 5 checks the longest real string.
6. **Places' ideas** get no pill: correct, an idea's price is a budget.
7. **TaskRow** is on Now only; tasks on the Timeline are EntryCards and get the pill there. Covered.
8. **Search lists cancelled items** — no pill there by D1. Covered.
9. **Nothing native, nothing stored** — the update is as safe as 0.5.0's; the rehearsal is still
   repeated because the APK changes.
10. **Missing from the first draft, added:** item detail's own header (step 3) — otherwise the page
    you open from a *To pay* card does not repeat it at the top; and the Timeline's *No date yet*
    rows (step 4).
