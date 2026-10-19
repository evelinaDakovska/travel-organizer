import type { SQLiteDatabase } from 'expo-sqlite';

export const SETTINGS_TABLES = ['settings'] as const;

export type SettingKey =
  | 'default_travellers'
  | 'default_currency'
  | 'notification_lead_minutes'
  /** The traveller profile that is the person using the app on this phone (2B-0). */
  | 'me_traveller_id';

export async function getSetting(
  db: SQLiteDatabase,
  key: SettingKey,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(
  db: SQLiteDatabase,
  key: SettingKey,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

/** Powers "usually travel with" — prefills new trips. */
export async function getDefaultTravellers(db: SQLiteDatabase): Promise<string[]> {
  const raw = await getSetting(db, 'default_travellers');
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

export async function setDefaultTravellers(
  db: SQLiteDatabase,
  names: string[],
): Promise<void> {
  await setSetting(db, 'default_travellers', JSON.stringify(names));
}
