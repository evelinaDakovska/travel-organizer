# Handoff: Travel App Prototype (Now / Timeline / Places / Notes)

## Overview
A mobile itinerary app for planning and running a trip. Built around one core idea: items aren't split by category, they're split by **commitment** — an `idea` (not yet booked) vs. `confirmed` (booked) vs. `cancelled`. See `decision-log-source.html` in this bundle for the full reasoning behind every schema and product decision (place-as-status, one items table, time model, resources, etc.) — it should guide the real implementation, not just this UI.

## About the Design Files
The files in this bundle (`travel-app-prototype.html`, `android-frame-reference.jsx`) are **design references built in HTML/React for prototyping only** — not production code to copy directly. The task is to recreate this design in the target codebase's actual environment (per the decision log: Expo / React Native, SQLite, raw SQL — see `docs` references in the log) using its own components, navigation, and data layer.

## Fidelity
**High-fidelity.** Colors, type, spacing, and the four-tab structure are final. Treat exact hex/oklch values, spacing, and copy as source of truth; treat the on-screen device bezel (status bar, gesture nav) as prototype-only chrome — the real app runs in an actual native shell.

## Screens

### 1. Now
- **Purpose:** at-a-glance view of what's coming up and what's outstanding, independent of the trip's date range (per decision log D8 — a task or check-in can surface days before the trip's first day).
- **Layout:** single scrolling column, 16px side padding. Two stacked sections, 18px gap.
- **"Up next"** — section label (11px, uppercase, 0.08em tracking, accent-700), then a vertical stack (10px gap) of item cards. Each card: status tag (top-left) + date/time (top-right, 11px muted), title (17px heading font), location (13px, 80% opacity).
- **"Open tasks"** — same label style. Each row: 22px circular checkbox (1.5px accent border, tap to toggle done) + title (15px) + date/time (12px muted) beside it. Empty state: "Nothing left to do." in muted 13px.
- **Data shown:** next 3 confirmed, dated, non-task items from "today" forward; all incomplete tasks.

### 2. Timeline
- **Purpose:** full itinerary, grouped by day.
- **Layout:** one block per day (20px gap between days). Day label same style as section labels above. Under each: vertical stack of item cards (10px gap), same card style as Now. Cancelled items render at 55% opacity but stay in place (not hidden, not deleted — decision log D3).
- **Data shown:** all items with `status != idea` and a date, grouped by day, in day order.

### 3. Places
- **Purpose:** saved ideas with no commitment yet.
- **Layout:** single vertical stack (10px gap) of cards, no day grouping (places don't have committed dates).
- **Card:** an outline tag showing the item's kind (Activity / Food / Other / …) top-left, title, location.
- **Data shown:** all items with `status == idea`.

### 4. Notes
- **Purpose:** free-form trip notes (separate concept from per-item notes — decision log D11).
- **Layout:** vertical stack of cards (10px gap), each with a title and a body paragraph (13px, 80% opacity, preserves line breaks).

### 5. Item detail (overlay)
- Opens over any tab when a card is tapped. Full-screen overlay, back chevron + "Details" header.
- Status tag, then title (H2), kind label (13px muted).
- Fact rows (14px): When (date + time), Where (location), Confirmation (code), Notes — each only rendered if present.
- Resources section (if any): label + a "File"/"Link" tag per resource, in a filled row (surface background, pill radius).
- Action row at the bottom, context-sensitive:
  - `idea` → **Move to Timeline** (promotes to confirmed — the promotion flow decision log D2 calls out as the reason for one shared table).
  - `confirmed` → **Cancel**.
  - `cancelled` → **Restore**.
  - anything except `confirmed` → **Delete** (confirmed items are never hard-deleted, per D3 — cancel instead).

### 6. Add item (overlay)
- Full-screen overlay, X + "New item" header, form, primary button "Add item" pinned at the bottom.
- Fields: Title (text), Kind (select: Activity/Food/Stay/Transport/Task/Other), Status (select: Idea → goes to Places / Confirmed → goes to Timeline), and — only when Confirmed — Day (select, one of the trip's 4 days) and Time (text). Then Location (text), Notes (textarea).
- On submit: item is appended and the app navigates to Timeline or Places depending on the status chosen.

## Navigation
Bottom tab bar, 4 tabs (Now / Timeline / Places / Notes), icon + 11px label each, active tab tinted `--color-accent-700`, inactive `--color-neutral-600`. A circular FAB (56px, accent fill, "+" icon) floats above the tab bar, bottom-right, opens Add item from any tab.

## Design Tokens
Base tokens come from the **Organic** design system (`_ds/styles.css` in this bundle) — cream ground, Caprasimo headings over Figtree body text, 16px base radius growing to pill buttons, tonal 100–900 ramps in OKLCH. This app overrides only the two accent hues (scoped locally, not in the shared system file):

- `--color-bg`: `#f5ead8` (cream)
- `--color-surface`: `#ebddc5`
- `--color-text`: `#201e1d`
- `--color-accent` (primary, "canal teal"): `oklch(58% 0.09 210)` — ramp 100–900 at the same hue/chroma curve, L stepping 97%→24%
- `--color-accent-2` (secondary, "stone gold"): `oklch(62% 0.09 75)` — same ramp pattern, hue 75
- Fonts: `--font-heading` = Caprasimo, `--font-body` = Figtree
- Radius: cards/dialogs ~32px (`--radius-lg` × 1.15), buttons/tags/inputs pill (999px)
- Elevation: `--shadow-sm` on all cards

Status tag colors: `idea` → outline (accent, transparent fill), `confirmed` → `tag-accent-2` (gold-tinted), `cancelled` → `tag-neutral` (grey, 55% opacity on its card).

## Assets
No photography or custom icons — tab bar and header icons are inline stroke-based SVGs (2.2–2.75px stroke, rounded caps), consistent with the Organic system's Lucide-style icon guidance.

## Files
- `travel-app-prototype.html` — the full interactive prototype (Design Component format — a single HTML file with an embedded logic class; view source for exact markup/state logic).
- `android-frame-reference.jsx` — the device-bezel component the prototype is mounted in (prototype chrome only, not part of the design).
- `decision-log-source.html` — the product decision log. Read this before implementing; it settles schema, status model, time handling, resources, search, backup, and build-order questions that the UI depends on.
- `_ds/` — the Organic design system source (tokens in `styles.css`, full guidance in `readme.md`).
