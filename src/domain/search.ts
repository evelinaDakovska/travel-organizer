/**
 * Search is `LIKE` over a handful of columns. Small trips, no index needed — but the
 * wildcards in a user's query have to be neutralised or "50%" matches everything.
 */

const LIKE_ESCAPE = '\\';

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE}${character}`);
}

/** Null for a blank query, so an empty box shows nothing rather than the whole trip. */
export function searchPattern(query: string): string | null {
  const trimmed = query.trim();
  return trimmed.length === 0 ? null : `%${escapeLike(trimmed)}%`;
}
