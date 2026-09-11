import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = { data: T | undefined; error: Error | undefined; loading: boolean };

/**
 * Runs a query and re-runs it when a watched table changes. This is why the app
 * needs no global store — SQLite stays the source of truth.
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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    try {
      const data = await queryRef.current(db);
      if (mounted.current) setState({ data, error: undefined, loading: false });
    } catch (error) {
      if (mounted.current) {
        setState({ data: undefined, error: error as Error, loading: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

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
