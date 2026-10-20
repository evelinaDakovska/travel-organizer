# Someday / maybe

Not MVP. Recorded so they are not lost. Items the owner has since scheduled point at their phase in
`roadmap.md` (2026-10-19).
Everything here is *Deferred* or *Discovery* in the owner's status words (2026-10-20, D38;
`MASTER_ROADMAP.md` §1.1): not in scope now, which never means never.

- **"Someday" trips** — a trip with no fixed dates; a wishlist destination with places and notes
  attached, promoted to a real trip once dates exist. (Deferred from R2-d.) → **roadmap Phase 6**.
- Gmail import + automatic booking extraction → a Gmail PoC was verified outside the repo; a
  universal email import is in the discovery backlog (`MASTER_ROADMAP.md` §17)
- Smart PDF/email parsing into a draft TripItem, always user-confirmed
- Trip-wide map of saved places → a **full-day map** is roadmap Phase 5
- Google Calendar export → **roadmap Phase 8** (.ics)
- **Shared trips — everyone travelling sees and edits the same trip** (owner, 2026-10-11; only if
  the app is ever published to a store). Each traveller has the app with the full trip: the same
  items, tickets, notes and expenses, and the same features, and a change one person makes reaches
  the others.
  - **What it would take.** It reverses today's core constraints (CLAUDE.md §7: no backend, no
    accounts, no sync): accounts or invite links, a server or a sync service, merging two people's
    edits to the same item, syncing the **files** (the PDFs are the product, and the bulky part),
    who may edit or delete, and a privacy policy. Offline-first must survive it: everyone keeps a
    full local copy and syncs when online. If fellow travellers use iPhones, an iOS app as well.
  - **Fits well with:** N5b (expenses split between the travellers; *paid by* and *settle up* only
    really work when everyone sees the same expenses), and *per-item travellers* below.
  - **A cheap step that needs none of that:** send one trip as a file. `filterTablesForTrip` already
    builds a backup of a single trip (technical reference §12), so *Share this trip* could hand a
    zip to the other person, who imports it. A one-off snapshot, not live sync, but it works with
    the app as it is. → **roadmap Phase 2** (single-trip export/import)
- Weather; currency conversion → **roadmap Phase 4**
- Duplicate detection when importing
- ~~Per-item travellers (who is actually going to this one thing)~~ — built in 0.6.0 (C2)
- App lock (biometric) for passport scans and references
- Import saved places from a **Google Takeout** export of Maps lists (CSV of names, notes, links)
  into a trip as ideas — offline, no API. Asked about on 2026-09-18; not wanted then → place import
  is **roadmap Phase 7**
