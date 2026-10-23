# Roadmap

A short overview. **The long-term product roadmap is
[`MASTER_ROADMAP.md`](MASTER_ROADMAP.md)** (the owner's baseline, 2026-10-20). It holds each phase's
goals and requirements, its exit gates, the product rules that must not drift, the beta and release
track, and the discovery backlog. Detailed designs live in the phase plans linked below.

Phases are done **in order, one at a time**, and a phase or stage starts only when the owner asks
for it. Finishing one is not permission to begin the next. The order was agreed on
**2026-10-19**, after the first friends-only beta (0.7.3); see
[`decision-log.md`](decision-log.md) D32. Per-task status and verification are in
[`status.md`](status.md), section *P*, and the feature view is in
[`product-status.md`](product-status.md).

| Phase | Scope | State | Detail |
|---|---|---|---|
| **1** | UI & navigation: trip context in tab headers, a clear active tab, one-line labels, clean sheet corners | **done — 0.7.4** (emulator) | status.md *P1* |
| **2** | Single-trip export/import and AI JSON import | **complete:** 2A plan; 2B-0 (0.8.0, Me, several people per list item); 2B (0.9.0); 2C (0.10.0); 2D (0.11.0), all on emulators | [`phase2-plan.md`](phase2-plan.md), [`phase2c-plan.md`](phase2c-plan.md), [`phase2d-plan.md`](phase2d-plan.md) |
| **3** | Travellers, pricing and shared expenses in five stages: 3B participation → 3C adult/child pricing → 3D-1 money records → 3D-2 responsibility and splits → 3E balances and settlements | **Closed 2026-10-23: every stage reviewed, exit checks in master §6–§9.** 3A audit approved; 3B done — 0.12.0; 3C done — 0.13.0** (emulators; [`phase3c-plan.md`](phase3c-plan.md)); **3D-1 done — 0.14.0 on the branch `phase-3d1`** (migration 007; [`phase3d1-plan.md`](phase3d1-plan.md)); **3D-2 done — 0.15.0 on the same branch** (migration 008; [`phase3d2-plan.md`](phase3d2-plan.md)); **3E done — 0.16.0 on the same branch** (migration 009; [`phase3e-plan.md`](phase3e-plan.md)), review corrections 0.16.1 (migration 010) and 0.16.2 (migration 011); on no phone until after the owner's trip | [`phase3-plan.md`](phase3-plan.md) (§15 is the owner's decisions); supersedes N5b and the earlier [`expenses-spec.md`](expenses-spec.md) |
| **4** | Multi-currency integrity and conversion; reverses the earlier rule that currencies are never converted (D25 → D32) | **done — 0.17.0 on `phase-3d1`** (migration 012, backup format 13); emulators; awaiting independent review | [`phase4-plan.md`](phase4-plan.md), master §10 |
| **5** | Day route map | **done — 0.18.0 on `phase-3d1`** (no migration); an offline drawing plus the Google Maps hand-off; emulators; awaiting independent review | [`phase5-plan.md`](phase5-plan.md), master §11 |
| **6** | Trips without fixed dates | **done — 0.19.0 on `phase-3d1`** (migration 014 rebuilds `trips`, dates nullable; format 15); emulators; awaiting independent review | [`phase6-plan.md`](phase6-plan.md), master §12 |
| **7** | Import from Google Maps share links | not started | master §13 |
| **8** | `.ics` calendar export | not started | master §14 |
| — | Pre-beta feedback deployment and security check (*B1*, before the first friends APK) | planned, waits for approval | master §16.2 |
| — | Beta, Play readiness; deferred and discovery backlog | not committed | master §16, §17 |

As of 2026-10-21, every build since 0.7.4 is verified on emulators only and installed on no phone.
0.14.0 (3D-1) and 0.15.0 (3D-2) live on the branch `phase-3d1`; `main` stays at 0.13.0 so a fix
during the owner's trip needs no migration. The phone's eventual install runs 007 and 008 together.
3C (0.13.0) was built on the owner's instruction in the same message as its plan. As of 2026-10-23,
everything built through 0.16.2 has passed the owner's review. Phase 3 is closed. One step is still
open: the signed release rehearsal of 0.13.0 → 0.16.x, done before the phone install after the trip.

**Data safety holds for every phase.** The rules: master §3, CLAUDE.md §9 and `phase3-plan.md` §15
*11*. In short:
- Never uninstall the app from the owner's primary phone or clear its data.
- Never touch real trips or the production database.
- Never change the application id or the signing key.
- Use synthetic data on emulators by default. The primary phone is never connected, installed on or
  tested with without the owner's explicit permission. A separate secondary beta phone may be used
  only in a testing session the owner explicitly approves, with synthetic data only (master §3.1).
- Any migration is explained and agreed before it is written.

The owner's answers to the points found when the master roadmap was cross-checked: master §21, D38.
