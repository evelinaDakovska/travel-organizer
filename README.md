# Travel Organizer

A personal, local-first Android app for organising trips that are already planned and booked.

Not a trip planner, not a recommender. It is the single place to find **what happens next**
and **where the relevant ticket is** — quickly, while travelling, possibly offline.

## Status

**Milestone 0 complete — architecture agreed. M1 next.** Nothing is scaffolded yet.

## Docs

Start with [`CLAUDE.md`](CLAUDE.md).

| File | Role |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Project context: decisions, terminology, conventions, open questions |
| [`docs/technical-reference.md`](docs/technical-reference.md) | **Single source of truth** — schema, time model, file storage, queries |
| [`docs/plan.md`](docs/plan.md) | Step-by-step implementation plan and current position |
| [`docs/decision-log.md`](docs/decision-log.md) | *Why* each decision was made, and what was rejected |
| [`docs/dev-setup.md`](docs/dev-setup.md) | Machine setup: git identity, SSH, hooks, toolchain, how to run |
| [`docs/original-spec.md`](docs/original-spec.md) | The original brief. Historical |
| [`docs/ideas.md`](docs/ideas.md) | Someday/maybe, deliberately out of scope |

## Stack

React Native · Expo SDK 57 (`>=57.0.17`) · TypeScript · Expo Router · SQLite · Zod · React Hook Form

Raw SQL with hand-written migrations, no ORM. No backend, no accounts, no sync — data and
imported documents live on the device.

## Target

Android only, Samsung Galaxy S26 Ultra. A custom dev client is required (`expo-share-intent`
needs native code), so Expo Go cannot run this app.

```bash
npx expo prebuild
npx expo run:android
```

Development targets the `Medium_Phone_API_36.1` emulator by default — see `CLAUDE.md` §9.
