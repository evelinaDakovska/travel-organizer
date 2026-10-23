import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ListItem } from '../domain/lists';
import type { Note } from '../domain/note';
import {
  parseTemplateContent,
  taskStart,
  templateContentSchema,
  templateTask,
  type TemplateContent,
} from '../domain/templates';
import { tripItemInputSchema, type TripItem } from '../domain/tripItem';
import { addListItem, createList, listListItems, type ListSummary } from './lists';
import { createNote } from './notes';
import { getTrip } from './trips';
import { insertTripItem } from './tripItems';

export const TEMPLATE_TABLES = ['templates', 'template_uses'] as const;

export type Template = {
  id: string;
  name: string;
  /** Null when the stored document cannot be read: shown, never applied. */
  content: TemplateContent | null;
};

type TemplateRow = { id: string; name: string; content: string };

const parseRow = (row: TemplateRow): Template => ({
  id: row.id,
  name: row.name,
  content: parseTemplateContent(row.content),
});

export async function listTemplates(db: SQLiteDatabase): Promise<Template[]> {
  const rows = await db.getAllAsync<TemplateRow>(
    `SELECT id, name, content FROM templates ORDER BY name`,
  );
  return rows.map(parseRow);
}

export async function getTemplate(db: SQLiteDatabase, id: string): Promise<Template | null> {
  const row = await db.getFirstAsync<TemplateRow>(
    `SELECT id, name, content FROM templates WHERE id = $id`,
    { $id: id },
  );
  return row ? parseRow(row) : null;
}

export async function renameTemplate(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync(`UPDATE templates SET name = $name, updated_at = $now WHERE id = $id`, {
    $id: id,
    $name: name,
    $now: new Date().toISOString(),
  });
}

/** Trips made from it keep everything it gave them. */
export async function deleteTemplate(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM templates WHERE id = $id`, { $id: id });
}

export type TemplateChoice = {
  tasks: readonly TripItem[];
  notes: readonly Note[];
  lists: readonly ListSummary[];
};

/**
 * A template from what was chosen of a trip (C5): its tasks — each day kept relative to the trip's
 * first day — notes and lists without their ticks or people. Bookings, prices, references and
 * files are never in it; nothing else is read.
 */
export async function saveTemplate(
  db: SQLiteDatabase,
  tripStart: string | null,
  name: string,
  chosen: TemplateChoice,
): Promise<string> {
  const lists = await Promise.all(
    chosen.lists.map(async (list) => ({
      kind: list.kind,
      name: list.name,
      items: (await listListItems(db, list.id)).map(templateListItem),
    })),
  );
  // Checked as it will be read, so a template that saves is always one that can be used.
  const content: TemplateContent = templateContentSchema.parse({
    version: 1,
    tasks: chosen.tasks.map((task) => templateTask(task, tripStart)),
    notes: chosen.notes.map((note) => ({ title: note.title, body: note.body, pinned: note.pinned })),
    lists,
  });
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO templates (id, name, content, created_at, updated_at)
     VALUES ($id, $name, $content, $now, $now)`,
    { $id: id, $name: name, $content: JSON.stringify(content), $now: now },
  );
  return id;
}

const templateListItem = (item: ListItem) => ({
  label: item.label,
  ...(item.quantity !== null ? { quantity: item.quantity } : {}),
  ...(item.unit ? { unit: item.unit } : {}),
  ...(item.category ? { category: item.category } : {}),
  ...(item.note ? { note: item.note } : {}),
});

/** When this template was applied to this trip before, newest first: a reason to ask first. */
export async function templateUses(
  db: SQLiteDatabase,
  tripId: string,
  templateId: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ applied_at: string }>(
    `SELECT applied_at FROM template_uses WHERE trip_id = $tripId AND template_id = $templateId
      ORDER BY applied_at DESC`,
    { $tripId: tripId, $templateId: templateId },
  );
  return rows.map((row) => row.applied_at);
}

/**
 * A template added to a trip (C5), all or nothing: its tasks dated against this trip's first day
 * in this trip's zone, its notes, its lists unticked — all new rows — and a record that it was
 * applied. Later edits to the template never reach the trip, nor the other way round.
 */
export async function applyTemplate(
  db: SQLiteDatabase,
  templateId: string,
  tripId: string,
): Promise<void> {
  const [template, trip] = await Promise.all([getTemplate(db, templateId), getTrip(db, tripId)]);
  if (!template?.content) throw new Error('This template cannot be read');
  if (!trip) throw new Error('This trip no longer exists');
  const { content } = template;
  const schema = tripItemInputSchema(trip.defaultTz);
  // Every task checked before anything is written.
  const tasks = content.tasks.map((task) =>
    schema.parse({
      kind: 'task',
      status: 'confirmed',
      title: task.title,
      notes: task.notes,
      start: taskStart(task, trip.startDate),
    }),
  );

  await db.withTransactionAsync(async () => {
    for (const task of tasks) await insertTripItem(db, tripId, task, []);
    for (const note of content.notes) await createNote(db, tripId, note);
    for (const list of content.lists) {
      const listId = await createList(db, { tripId, kind: list.kind, name: list.name });
      for (const item of list.items) await addListItem(db, listId, item);
    }
    await db.runAsync(
      `INSERT INTO template_uses (trip_id, template_id, applied_at)
       VALUES ($tripId, $templateId, $now)`,
      { $tripId: tripId, $templateId: templateId, $now: new Date().toISOString() },
    );
  });
}
