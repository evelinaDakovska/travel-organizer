import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';

import { listAllStoredPaths } from '../repositories/resources';
import { sweepOldExports, sweepOrphanedFiles } from './storage';

/**
 * Reclaims media no row points at, and exports left in the cache, once per launch. A failed read
 * must never reach the media sweep — an empty reference list means "delete everything" — so the
 * catch sits outside it.
 */
export function useMediaSweep(): void {
  const db = useSQLiteContext();
  const swept = useRef(false);

  useEffect(() => {
    if (swept.current) return;
    swept.current = true;

    sweepOldExports();

    listAllStoredPaths(db)
      .then(sweepOrphanedFiles)
      .catch((error: unknown) => console.warn('Media sweep skipped', error));
  }, [db]);
}
