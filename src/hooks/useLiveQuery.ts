import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type State<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

const LOADING = { data: undefined, error: undefined, loading: true } as const;

/** Waits before each retry of a failed read. After the last, the error stands until a change. */
const RETRY_DELAYS_MS = [300, 1000, 3000];

/** A read waits for this much quiet after the last change event… */
const CHANGE_QUIET_MS = 50;
/** …but never longer than this after the first, so a long stream of writes still shows. */
const CHANGE_MAX_WAIT_MS = 10_000;

/**
 * Runs a query and re-runs it when a watched table changes. This is why the app
 * needs no global store — SQLite stays the source of truth.
 *
 * A failed read must never look like an empty trip: it keeps the last data it had, retries on
 * its own, and says so in `error`. Before, one failed read left the Timeline reading "Nothing on
 * the timeline yet" until something wrote to the database or the app restarted.
 */
export function useLiveQuery<T>(
  query: (db: SQLiteDatabase) => Promise<T>,
  tables: readonly string[],
  deps: readonly unknown[] = [],
): State<T> & { refetch: () => void } {
  const db = useSQLiteContext();
  // A token per set of inputs. State read for other inputs (another trip, another item) is someone
  // else's: it reads as loading from the very render the inputs change, not one effect later — or a
  // failed first read would show the previous record as this one's.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inputs = useMemo(() => ({}), [db, ...deps]);
  const [stored, setState] = useState<State<T> & { inputs: object }>({ ...LOADING, inputs });
  const state: State<T> = stored.inputs === inputs ? stored : LOADING;

  const queryRef = useRef(query);
  queryRef.current = query;

  const mounted = useRef(true);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(retry.current);
    };
  }, []);

  // Each read is numbered: an older one finishing late cannot overwrite a newer result.
  const latest = useRef(0);

  const read = useCallback(
    async (attempt: number) => {
      const ticket = ++latest.current;
      clearTimeout(retry.current);
      try {
        const data = await queryRef.current(db);
        if (mounted.current && ticket === latest.current) {
          setState({ data, error: undefined, loading: false, inputs });
        }
      } catch (error) {
        if (!mounted.current || ticket !== latest.current) return;
        console.warn('Live query failed', error);
        setState((previous) => ({
          data: previous.inputs === inputs ? previous.data : undefined,
          error: error as Error,
          loading: false,
          inputs,
        }));
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) retry.current = setTimeout(() => void read(attempt + 1), delay);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, inputs],
  );

  const run = useCallback(() => read(0), [read]);

  useEffect(() => {
    void run();
  }, [run]);

  // Changes arrive one event per row. A batch write — 300 imported activities, a restore — used to
  // start a read per row in every mounted query, each re-rendering its screen and queued on the
  // same connection between the batch's own statements, so the batch itself crawled (2C E2E: 43 s,
  // then minutes, for 300 rows). Now a read waits for the events to pause (or for the max wait),
  // and while one runs at most one more is queued. Every change is still followed by a read that
  // starts after it, so nothing is left stale.
  useEffect(() => {
    const watched = new Set(tables);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstEventAt: number | undefined;
    let reading = false;
    let dirty = false;
    const drain = async () => {
      timer = undefined;
      firstEventAt = undefined;
      if (reading) {
        dirty = true;
        return;
      }
      reading = true;
      try {
        do {
          dirty = false;
          await run();
        } while (dirty && mounted.current);
      } finally {
        reading = false;
      }
    };
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      const now = Date.now();
      firstEventAt ??= now;
      clearTimeout(timer);
      const untilMax = firstEventAt + CHANGE_MAX_WAIT_MS - now;
      timer = setTimeout(drain, Math.max(0, Math.min(CHANGE_QUIET_MS, untilMax)));
    });
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, tables.join(',')]);

  return { data: state.data, error: state.error, loading: state.loading, refetch: run };
}
