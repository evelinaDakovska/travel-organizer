# Feedback plan — F1–F6

> **Archived — done.** This plan is complete and kept as a record of how the work went. What is done and what is next lives only in [`status.md`](status.md).

Feedback from a senior frontend developer (the owner's husband) after seeing the app, 2026-10-11,
plus two requests from the owner the same evening. Each item was checked against the code and the
emulator first. **Status: done** — all six built, tested end to end on the emulator and rehearsed in 0.5.0; on the phone in **0.5.1** since 2026-10-12. Each step is ticked in `docs/status.md` → *F*.

Ships with N6 and R1–R11 as **0.5.0** (0.4.0 was rehearsed but never installed; the phone still has
0.3.0, so 0.5.0 is rehearsed as an update over 0.3.0).

## Data safety

**No step changes the schema, the backup format, stored data or native configuration.** All six
are presentation. One route moves (F5: the expense form goes to `expense/[expenseId]/edit`); the
old URL becomes the detail page, so every existing link still lands somewhere sensible. No new
dependency: icons come from `lucide-react-native` (already installed — every glyph below was checked
in `node_modules`), thumbnails from React Native's own `Image`.

---

## F1 — Tell the kinds apart at a glance

**Asked:** see whether a card is travel, a stay, an activity, food or a task without reading it;
"not a rainbow of colours".

**Research.** Travel planners (TripIt's plan types, TripLoom, *Trips on a Timeline*) mark each plan
with its type, by icon and/or colour. WCAG 1.4.1 (*Use of Color*) says colour must never be the
only cue — a shape or an icon must carry it; a colour key alone fails. Ten colours on one screen is
also exactly the rainbow the feedback warns against, and a colour has to be learned, an icon does
not (a plane is a flight).

**Decision: one icon per item, by subkind where it has one and by kind otherwise, all in the same
quiet tile — no colour per kind.** The shape does the work; the screen keeps its two-colour palette.

- **The tile:** 40 px rounded square at the left of the card's title, `surfaceSunken` background,
  glyph in `text` colour. The same for every kind. Cancelled items are already dimmed.
- **Where:** `EntryCard` (Now, Timeline), `ItemRow` (Places, search, journey legs, *Attach to an
  item*, Bookings) and the item detail page next to the kind label. `TaskRow` keeps its checkbox:
  there the circle already says "task".
- **Mapping** (`ITEM_ICONS` in `Icon.tsx`, typed `Record<TripItemKind | Subkind, …>`, so a new kind
  or subkind without an icon fails the typecheck):

| Kind (fallback) | Subkinds |
|---|---|
| transport · route | flight plane · train train-front · bus bus · ferry ship · car car · taxi car-taxi-front · transfer van · walk footprints |
| stay · bed-double | hotel hotel · apartment house · hostel bed · guesthouse house · camping tent |
| activity · ticket | museum landmark · gallery frame · tour flag · attraction ferris-wheel · event party-popper · theatre theater · outdoor mountain-snow · spa flower-2 |
| food · utensils | restaurant utensils · cafe coffee · bar wine · bakery croissant · market store |
| task · square-check-big | check-in plane-takeoff · booking calendar-check · document file-text · packing luggage |
| other · shapes | luggage luggage · insurance shield-check · parking square-parking · shopping shopping-bag · viewpoint binoculars |

- **Pure part:** `itemIconKey(kind, subkind)` in `src/domain/tripItem.ts` — the subkind when it is
  valid for the kind, else the kind. Tested.
- **Not done:** a coloured border or a colour per kind (reasons above).

## F2 — The **+** button says what it adds

**Today:** one floating **+** on every trip tab. On Expenses it adds an expense; on Notes it adds a
*trip item*, while a separate *New note* button adds notes.

**Decision:** the button shows **what** it adds, and keeps a small **+** so it still reads as "add".

| Tab | Adds | Icon | Label (screen reader) |
|---|---|---|---|
| Now · Timeline · Places | an item | plus (as now) | Add to trip |
| Expenses | an expense | receipt-text, with a small + badge | Add an expense |
| Notes | **a note** (was an item) | notebook-pen, with a small + badge | Add a note |

- On Notes the duplicate *New note* button goes: the floating button now does that, which is the
  one-primary-action-per-screen rule the FAB exists for (Material guidance). One fewer control.
- **Pure part:** `addActionFor(tab)` → `{ target, icon, label }` beside the layout, tested.

## F3 — *This trip* on top, sticky; seeing done tasks

**Asked:** *This trip* at the top, sticky, a slightly different background like a header, with the
destination and the dates. And a way to see completed tasks.

**The trade-off, answered by the owner:** a band on top pushes *Happening now* down by its height;
kept to two short lines it costs ~70 px, and it stays put while the list scrolls under it.

- **The band** (`TripBand`, outside the `ScrollView`, so it never scrolls away): `surfaceSunken`
  background, full width, under the header.
  - Line 1, strong: **Finland · 20–24 Nov 2026** (destination; the trip's name if none — the header
    already shows the name).
  - Line 2, muted: **Day 2 of 5** during the trip / **In 39 days** before / **Ended** after, then
    **· Helsinki time**, then the travellers if any (*· Evelina, Sample Friend*), one line,
    ellipsised.
- The old *This trip* card at the bottom goes. Its only other content, the trip's notes, stays at
  the bottom under **Trip notes** — only when there are any.
- **Pure part:** `tripPhase(trip, now)` in `src/domain/trip.ts` → *before / during (day n of m) /
  after* with its label, on the device's date like `isTripActive`. Tested at the edges (the day
  before, first day, last day, the day after).
- **Done tasks:** under *Open tasks*, **Show done (3)** expands the completed ones (struck through,
  newest first); tapping a circle there un-ticks it. *Hide done* folds them. Not remembered between
  visits. **Pure part:** `doneTasks(items)` in `itinerary.ts`, tested. `TaskRow` gains a `done` state.
- *Nothing left to do.* shows only when there are no open tasks **and** no done ones.

## F4 — Detail pages hide what is empty

**Checked on the emulator:** item detail already hides empty facts (place, code, number, seat,
price, notes). What is left: **When: No date yet** (an idea, or an undated item), and the empty
**Tickets & links** block — a grey box with a sentence of help — on every item without attachments.

**Decision:**
- **When** is not shown when there is no date.
- **Tickets & links** with nothing in it shows only its heading and the **+ File · + Photo · + Link**
  buttons (they are how you attach, so they stay); the help box goes. `ResourceList`'s `emptyText`
  becomes optional; item detail and the new expense detail pass none. Trip documents on Now keep
  theirs (it explains what trip documents are for).
- **Reminder: Off** stays: it is a choice the owner made, not an empty field.

## F5 — An expense opens a detail page, not the form

**Today:** tapping an expense opens the edit form.

**Decision:** the same pattern as an item: a read-only page, **Edit** at the top right.
- `app/expense/[expenseId]/index.tsx` (new): the amount large, the title (label or category) with the
  category icon, the date, the description if any, and **Receipts** (opening each; adding more here
  too, as on items). **Delete expense** stays on the edit screen, as it is now.
- `app/expense/[expenseId]/edit.tsx`: today's form, moved unchanged; Save goes back to the detail
  page.
- R4's states (loading, failed, missing) on both.

## F6 — A picture attachment shows the picture

**Today:** every attachment row has a round badge with *PDF*, *IMG*, *LINK*…

**Decision:** an image file shows **itself** in that circle — a thumbnail (often called an avatar
or thumbnail) of the stored file — instead of *IMG*. PDFs and links keep their badge.
- React Native's `Image` with the stored file's URI and `resizeMethod="resize"`, so a 12 MP photo is
  decoded at thumbnail size, not full size (memory). If the file is missing or cannot be decoded,
  it falls back to the badge (missing files already turn the badge red).
- Everywhere `ResourceRow` is used: item and expense detail, Trip documents, the open sheets.

---

## Order and testing

| Step | Tests | Emulator |
|---|---|---|
| F4 | — (rendering) | an idea and a task: no *When*, no help box; an item with attachments unchanged |
| F2 | `addActionFor` | each tab's button icon and where it goes; Notes adds a note |
| F3 | `tripPhase`, `doneTasks` | band during / before the trip (clock moved), scrolling under it; Show done / un-tick |
| F1 | `itemIconKey` | every card type on Now, Timeline, Places; typecheck enforces full mapping |
| F5 | — | expense list → detail → Edit → Save → back on detail; delete from edit |
| F6 | — | a photo attachment shows its thumbnail; a PDF still its badge; a missing file red |
| 0.5.0 | full suite | rehearsal over 0.3.0 with an expense and a photo receipt, then the phone |

**No regressions:** after all six, a pass through every screen on the emulator (Home, the five tabs,
item / expense / note / attachment detail and edit, share, backup), comparing against 0.4.0's
behaviour, and the full update rehearsal from the phone's 0.3.0 as for 0.4.0.
