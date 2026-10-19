import { getMe, ME_TABLES } from '../../repositories/travellers';
import { useLiveQuery } from '../../hooks/useLiveQuery';

/**
 * The profile that is the person using the app (2B-0), live: null until chosen. `loading` is true
 * until the first read, so a form that starts from Me waits for it rather than start without.
 */
export function useMe() {
  const query = useLiveQuery(getMe, ME_TABLES);
  return { me: query.data ?? null, meId: query.data?.id ?? null, loading: query.loading };
}
