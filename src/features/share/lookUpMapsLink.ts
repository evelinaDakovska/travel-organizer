import { acceptedRedirect, isShortMapsLink, type MapsPlace } from '../../domain/mapsLink';

/** Long enough for a slow mobile connection, short enough that the screen never seems stuck. */
const TIME_LIMIT_MS = 8000;

export type LookUpResult =
  | { ok: true; place: MapsPlace }
  /** `offline`: no answer at all; `unreadable`: an answer this does not trust or cannot read. */
  | { ok: false; reason: 'offline' | 'unreadable' };

/**
 * Where a Google Maps short link points (Phase 7, P7-2): one HEAD request to the short link, the
 * redirects followed, and only the final address read — never a page, never a cookie. The person
 * asked for it with a tap; nothing else is sent. Anything but a Google Maps page is `unreadable`, and
 * the link is still saved as it came.
 */
export async function lookUpMapsLink(shortLink: string): Promise<LookUpResult> {
  if (!isShortMapsLink(shortLink)) return { ok: false, reason: 'unreadable' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_LIMIT_MS);
  try {
    const response = await fetch(shortLink, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
    const place = acceptedRedirect(response.url);
    return place ? { ok: true, place } : { ok: false, reason: 'unreadable' };
  } catch {
    return { ok: false, reason: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
