/**
 * What a live query's state means for the screen (review R4). A failed read is not an empty list
 * and not a deleted record, and must never be shown as either.
 *
 * Pure, no React: tested in node.
 */

export type QueryState<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/**
 * - `loading` — the first read has not finished.
 * - `failed` — the first read failed; nothing to show. Retries run on their own meanwhile.
 * - `missing` — the read worked and found no such record: it was deleted.
 * - `empty` — the read worked and the list has nothing in it.
 * - `ready` — there is something to show (possibly stale: see `isStale`).
 */
export type QueryView = 'loading' | 'failed' | 'missing' | 'empty' | 'ready';

export function queryView<T>({ data, error }: QueryState<T>): QueryView {
  if (data === undefined) return error ? 'failed' : 'loading';
  if (data === null) return 'missing';
  if (Array.isArray(data) && data.length === 0) return 'empty';
  return 'ready';
}

/** A refresh failed after an earlier read worked: the screen shows the earlier data. */
export function isStale<T>({ data, error }: QueryState<T>): boolean {
  return error !== undefined && data !== undefined;
}
