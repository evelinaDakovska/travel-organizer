/**
 * What a live query's state means for the screen (review R4). A failed read is not an empty list
 * and not a deleted record, and must never be shown as either.
 *
 * Pure, no React: tested in node.
 */

export type QueryState<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/**
 * - `loading` — the first read has not finished.
 * - `failed` — the latest read failed and there is nothing to show. Retries run on their own.
 * - `missing` — the latest read worked and found no such record: it was deleted.
 * - `empty` — the latest read worked and the list has nothing in it.
 * - `ready` — there is something to show (possibly stale: see `isStale`).
 */
export type QueryView = 'loading' | 'failed' | 'missing' | 'empty' | 'ready';

export function queryView<T>({ data, error }: QueryState<T>): QueryView {
  if (data === undefined) return error ? 'failed' : 'loading';
  const nothing = data === null || (Array.isArray(data) && data.length === 0);
  // An earlier read found nothing, but the latest one failed: the record or the list may be back
  // by now, so claiming "deleted" or "nothing here" would be a guess (A5).
  if (nothing && error) return 'failed';
  if (data === null) return 'missing';
  if (nothing) return 'empty';
  return 'ready';
}

/**
 * Whether a list has been read: something in it, or nothing in it. A form that starts from the list
 * must wait for this — started early, it starts from an empty list and saving that loses the real
 * one (QA D-01: Edit trip dropped the trip's travellers).
 */
export function hasLoaded(view: QueryView): boolean {
  return view === 'ready' || view === 'empty';
}

/** A refresh failed after an earlier read found something: the screen shows that earlier data. */
export function isStale<T>(state: QueryState<T>): boolean {
  return state.error !== undefined && queryView(state) === 'ready';
}
