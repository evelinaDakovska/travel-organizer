# Phase 7 — Import from Google Maps share links (plan, 2026-10-23)

Roadmap: `MASTER_ROADMAP.md` §13. The owner asked for this phase to be planned, built and tested in
one run, as with Phases 4–6 ("start phase 7 with plan and implement, then test"). This plan is written
first and not waited on; every product decision is in §3 for review.

Data rules still bind: emulator and synthetic data only, no phone, no release APK, no merge to `main`,
no backend. **No migration and no format change.**

## 1. What exists

- **Share to the app (S7):** `expo-share-intent`, patched; `app/share.tsx`, `src/domain/share.ts`,
  `src/features/share/saveShare.ts`. A shared link can be saved:
  - as a *New place* (an idea, titled with what the share calls it);
  - on an item;
  - in the trip's documents.

  The link is kept as a `maps` link resource. **No coordinates or address are read.**
- The **Coordinates** field (Phase 5) takes *66.5115, 25.7311*. `parseCoordinates` and
  `validateCoordinates` are in `directions.ts`.
- **Duplicate rules** for imported activities (2C): `activityDuplicates.ts`, the same title or within
  100 m.

## 2. What Google Maps actually sends (checked on the emulator, 2026-10-23)

Google Maps 26.x on `TO_2B_Test`, *Share* on a place:
- **The share sheet:** *Arktikum*, `https://maps.app.goo.gl/7428vcha2w3v6QgP7`.
- **The payload:** `text` and `webUrl` are both that short link, and `meta.title` is *Arktikum*. That
  is all: no address and no coordinates.
- **The short link** answers `302`. Its `Location` header is a place URL:
  - `https://www.google.com/maps/place/Arktikum,+Pohjoisranta+4,+96200+Rovaniemi,+Finland/data=!4m2!3m1!1s0x…:0x…!18m1!1e1?…`
    holds the name and the full address, and no coordinates;
  - a second place (`maps.app.goo.gl/sbMDDrxyEe5bcqFm8`) redirected to `…/data=!4m6!3m5!1s…!7e2!8m2!3d66.5039478!4d25.7293906!…`.
    That one does hold the place's own coordinates (`!3d` latitude, `!4d` longitude).

So the useful facts are one redirect away, and only sometimes include coordinates. Anything more
would mean reading Google's page, which is scraping, or a paid Places API with a key.

## 3. Decisions (for the owner's review)

**P7-1 — What is read, and from where.** A pure parser (`src/domain/mapsLink.ts`) reads only what
the URL itself says:

| Form | Name | Address | Coordinates |
|---|---|---|---|
| `google.<tld>/maps/place/<name, address>/…` | text before the first comma | the rest | `!3d…!4d…` when present |
| `…/maps/search/?api=1&query=…` (Google's documented Maps URLs) | the query text | — | when the query is `lat,lng` |
| `maps.google.<tld>/?q=…`, `google.<tld>/maps?q=…` (`q`, `query`, `ll`, `daddr`) | the text | — | when `lat,lng` |
| `…/maps/search/<lat>,<lng>` | — | — | yes |
| `geo:<lat>,<lng>?q=…` | the `q` text, if not coordinates | — | yes, unless 0,0 |
| `consent.google.<tld>/…?continue=<maps URL>` | unwrapped, then as above | | |
| `google.<tld>/maps/@<lat>,<lng>,<zoom>z` | — | — | **no**: a viewport centre, not a place |
| `maps.app.goo.gl/…`, `goo.gl/maps/…` | short: needs the lookup (P7-2) | | |

A viewport `@lat,lng` is never taken as the place: it is wherever the map happened to be centred.

**P7-2 — The short-link lookup is one request, on a tap.**
- *Look up address and coordinates* sends one `HEAD` request to the short link and reads only where
  it redirects. No page is read, no cookies are sent, nothing else goes out, and the time limit is
  8 seconds.
- It is the app's first network request outside the feedback form. That is why it waits for a tap and
  says what it does: *Asks Google where this short link points. Nothing else is sent.* The owner may
  later choose to make it automatic.
- **Only these are accepted:**
  - the request goes only to `maps.app.goo.gl` or `goo.gl/maps/…` over https;
  - the redirect target must be a `google.*` (or `consent.google.*`) https URL under `/maps`;
  - anything else is ignored, and the link is still saved.

**P7-3 — A preview before saving.** When the shared link is a Google Maps link, *New place* shows:
- **Name**: the share's title, else the URL's;
- **Address**: from the URL or the lookup;
- **Coordinates**: from the URL or the lookup, in the same field as the item form.

All are editable before saving, and the link is kept as the place's *Map* link (provenance). Nothing
is invented: a field the link does not give stays empty. *Save as* still offers an item or the trip's
documents, as before.

**P7-4 — Duplicates warn, never block.** If the chosen trip already has an item with the same title,
or within 100 m (the 2C rule), or the same link, the preview says *Already in this trip: "Arktikum"
(saved place)*. Saving still works: two visits to one place can be meant.

**P7-5 — Offline, unsupported, failed.** Offline or after a failed lookup, the screen says so. The
place is saved with its name and link, and the coordinates can be pasted later. A link that is not
Google Maps works as before.

**P7-6 — Manual paste.** The item form's *Coordinates* field also accepts a pasted Google Maps link
that carries coordinates (the P7-1 forms). It fills in the pair the link gives, so a link copied from
a browser works without the share sheet. Short links cannot be read there, and the hint says so.

**P7-7 — Not done.**
- No Google sign-in, no Places API or key, no reading of Google's pages, no account data.
- No automatic navigation or booking.
- **Importing many saved places** (Google Takeout's *Saved* lists) is investigated only. Takeout exports
  each list with titles, notes and URLs; most of those URLs are place-id links without coordinates,
  so a bulk import would mostly give names and links. It needs its own decision. It would reuse the
  2C preview and duplicate rules.

**P7-8 — Multiple trips.** Unchanged: the share screen's trip choice, defaulting to `suggestTrip`
(Phase 6 order).

## 4. Steps

1. **Domain:** `mapsLink.ts` (`isGoogleMapsUrl`, `parseMapsLink`, `isShortMapsLink`,
   `acceptedRedirect`, coordinate forms), `findPlaceDuplicate`, `parseCoordinates` taking a link
   (P7-6). Tests over every form, hostile URLs and the two real redirects above.
2. **Lookup:** `src/features/share/lookUpMapsLink.ts`: `fetch(HEAD)`, a timeout, the response URL
   checked by `acceptedRedirect`.
3. **Screen:** the place preview in `app/share.tsx`; `saveShare` writes `locationName`, `address`
   and coordinates.
4. **Docs and version 0.20.0.**
5. **Emulator:** share from Google Maps (a warm dev client; a cold start from a share needs a release
   build, finding 8), look up, preview, save; duplicate warning; airplane mode; a non-Maps link;
   pasting a link into *Coordinates*.

## 5. As built (0.20.0, 2026-10-23)

Commits `a7d3b85` (plan) and `18d27f1` (code), then a docs commit. No migration and no format change.

**What was built.**
- `src/domain/mapsLink.ts`:
  - `isGoogleMapsLink`, `isShortMapsLink`, `parseMapsLink`, `acceptedRedirect`, `hasPlaceFacts`;
  - `findPlaceDuplicate`, which uses `metresBetween`, now exported from `activityDuplicates.ts`;
  - coordinates from links are rounded to 7 places, because Google writes `66.50394779999999`;
  - a dropped pin named in degrees, minutes and seconds is read too.
- `src/features/share/lookUpMapsLink.ts`: `fetch(HEAD)`, `credentials: 'omit'`, 8 s abort, and
  `response.url` judged by `acceptedRedirect`. The result is `offline` or `unreadable` on failure.
- `app/share.tsx`, when the shared link is a Google Maps link and the target is *New place*:
  - the lookup button and its sentence;
  - Address and Coordinates, editable;
  - the duplicate notice.

  A lookup fills only empty fields. `saveShare` passes `locationName`, `address`, `latitude` and
  `longitude` to the item schema.
- `CoordinatesInput` replaces a typed or pasted Maps link that carries coordinates with its pair.

**Differences from §3.**
- P7-4 checks the title and the distance, not "the same link". The share screen has the trip's items
  but not their links, and the title check already catches the same share twice.
- P7-6: a short link typed into *Coordinates* shows the field's usual error. There is no separate
  hint.

**Verification.**
- Node: 1761 tests in 90 suites, typecheck clean. `mapsLink.test.ts` has 18 tests, including the two
  real redirects.
- Emulator: `%USERPROFILE%\Pictures\TravelOrganizer-0.20.0-P7-e2e\E2E-LOG.md`:
  - Arktikum shared from Google Maps, looked up on the device (address, no coordinates) and saved;
  - a place with coordinates;
  - the duplicate warning;
  - airplane mode;
  - a link typed into *Coordinates*.

**Limitations.**
- Some redirects carry no coordinates (Arktikum's did not). Getting them would mean reading Google's
  page or a paid API, which is excluded. The person can long-press in Maps and paste.
- **The first network request the app makes besides the feedback form.** It is a single request, on a
  tap, to Google only. It is listed in CLAUDE.md §7.
- The lookup is only on the share screen, not later from the item.
- A cold start from a share needs a release build (finding 8), which was not built (no release
  approval). The warm path was tested.
