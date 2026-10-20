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
| **3** | Travellers, pricing and shared expenses in five stages: 3B participation → 3C adult/child pricing → 3D-1 money records → 3D-2 responsibility and splits → 3E balances and settlements | **3A audit approved; 3B done — 0.12.0** (emulators). **3C waits for approval**; the 3D-1 linking model (§17) must be approved before 3D-1 | [`phase3-plan.md`](phase3-plan.md) (§15 is the owner's decisions); supersedes N5b and the earlier [`expenses-spec.md`](expenses-spec.md) |
| **4** | Multi-currency integrity and conversion; reverses the earlier rule that currencies are never converted (D25 → D32) | not started | master §10 |
| **5** | Day route map | not started | master §11 |
| **6** | Trips without fixed dates (needs a migration: trip dates are `NOT NULL`) | not started | master §12 |
| **7** | Import from Google Maps share links | not started | master §13 |
| **8** | `.ics` calendar export | not started | master §14 |
| — | Beta, feedback form, Play readiness; discovery backlog | not committed | master §16, §17 |

As of 2026-10-20, every build since 0.7.4 is verified on emulators only and installed on no phone.
Independent review of 3B (`991994e`) comes before 3C planning (master §20).

**Data safety holds for every phase.** The rules: master §3, CLAUDE.md §9 and `phase3-plan.md` §15
*11*. In short:
- Never uninstall the app from the owner's primary phone or clear its data.
- Never touch real trips or the production database.
- Never change the application id or the signing key.
- Use synthetic data on emulators only. No physical device is connected, installed on or tested
  with without the owner's explicit permission; master §21 *1* records the open question about
  the beta phone.
- Any migration is explained and agreed before it is written.

Open points found when the master roadmap was cross-checked against the repository: master §21.
