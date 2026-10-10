import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/** Waits before each retry of a failed read. After the last, the error stands until a change. */
const RETRY_DELAYS_MS = [300, 1000, 3000];

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
  const [state, setState] = useState<State<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });

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
          setState({ data, error: undefined, loading: false });
        }
      } catch (error) {
        if (!mounted.current || ticket !== latest.current) return;
        console.warn('Live query failed', error);
        setState((previous) => ({ data: previous.data, error: error as Error, loading: false }));
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) retry.current = setTimeout(() => void read(attempt + 1), delay);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, ...deps],
  );

  const run = useCallback(() => read(0), [read]);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    const watched = new Set(tables);
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (watched.has(tableName)) void run();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, tables.join(',')]);

  return { ...state, refetch: run };
}
