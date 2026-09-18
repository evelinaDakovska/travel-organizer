/**
 * The Android side of reminders: permission, the channel, and handing the planned set to the
 * scheduler. What should be scheduled is decided in `domain/reminders`.
 */

import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  planReminderSync,
  reminderFor,
  remindersFor,
  type ScheduledReminder,
} from '../domain/reminders';
import { getTripItem, listReminderCandidates } from '../repositories/tripItems';

const CHANNEL_ID = 'reminders';

/** Every notification we schedule carries this, so ones from elsewhere are never touched. */
type ReminderData = { itemId: string; fireAt: string };

function isReminderData(data: unknown): data is ReminderData {
  const d = data as Partial<ReminderData> | null;
  return typeof d?.itemId === 'string' && typeof d.fireAt === 'string';
}

/** Once per launch, before anything is scheduled. Android needs the channel to exist first. */
export async function configureReminders(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Trip reminders',
    description: 'Before travel, check-in, bookings and tasks',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * Asked at the moment it makes sense — right after saving something that would remind — never on
 * launch. Once refused, Android will not show the prompt again, and this stays quiet.
 */
export async function askForRemindersIfDue(db: SQLiteDatabase, itemId: string): Promise<void> {
  const item = await getTripItem(db, itemId);
  if (!item || !reminderFor(item, new Date())) return;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return;
  if ((await Notifications.requestPermissionsAsync()).granted) await syncReminders(db);
}

async function scheduledReminders(): Promise<ScheduledReminder[]> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.flatMap((request) => {
    const data: unknown = request.content.data;
    if (!isReminderData(data)) return [];
    return [
      {
        id: request.identifier,
        fireAt: data.fireAt,
        title: request.content.title ?? '',
        body: request.content.body ?? '',
      },
    ];
  });
}

async function runSync(db: SQLiteDatabase): Promise<void> {
  if (!(await hasPermission())) return;

  const now = new Date();
  const desired = remindersFor(await listReminderCandidates(db, now), now);
  const plan = planReminderSync(desired, await scheduledReminders());

  for (const id of plan.cancel) await Notifications.cancelScheduledNotificationAsync(id);
  for (const reminder of plan.schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { itemId: reminder.itemId, fireAt: reminder.fireAt } satisfies ReminderData,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.fireAt),
        channelId: CHANNEL_ID,
      },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Brings the scheduled reminders in line with the database. Runs one at a time: two overlapping
 * syncs would each see the other's reminders as missing and schedule them twice.
 */
export function syncReminders(db: SQLiteDatabase): Promise<void> {
  queue = queue
    .then(() => runSync(db))
    .catch((error: unknown) => console.warn('Reminder sync failed', error));
  return queue;
}

/** The item a tapped reminder is about, or null for a notification that is not ours. */
export function reminderItemId(response: Notifications.NotificationResponse): string | null {
  const data: unknown = response.notification.request.content.data;
  return isReminderData(data) ? data.itemId : null;
}
