import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { configureReminders, reminderItemId, syncReminders } from './reminders';

/** Any of these changing can move, add or remove a reminder — a trip's zone included. */
const WATCHED = new Set(['trip_items', 'trips']);

/** Writes arrive in bursts (an import, a zone change); one sync after the burst is enough. */
const SETTLE_MS = 600;

/**
 * Keeps reminders in line with the database for as long as the app runs, and opens the item a
 * tapped reminder is about. Mounted once, inside the database provider.
 */
export function useReminders(): void {
  const db = useSQLiteContext();
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void syncReminders(db), SETTLE_MS);
    };

    // Also covers anything the OS dropped: a reinstall, a restore, cleared app data.
    configureReminders()
      .then(() => syncReminders(db))
      .catch((error: unknown) => console.warn('Reminders not set up', error));

    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (WATCHED.has(tableName)) schedule();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [db]);

  // Covers a tap that cold-started the app as well as one while it was running.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const itemId = reminderItemId(response);
    if (!itemId) return;
    // Consumed, so returning to the app later does not open the item again.
    void Notifications.clearLastNotificationResponseAsync();
    // Item detail already says so when the item has been deleted since.
    router.push({ pathname: '/item/[itemId]', params: { itemId } });
  }, [response, router]);
}
