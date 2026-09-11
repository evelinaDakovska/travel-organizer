import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  INSERT_NOTE,
  SELECT_NOTES,
  SET_NOTE_PINNED,
  UPDATE_NOTE,
} from '../db/queries';
import { parseNoteRow, type Note, type NoteInput, type NoteRow } from '../domain/note';

export const NOTE_TABLES = ['trip_notes'] as const;

export async function listNotes(db: SQLiteDatabase, tripId: string): Promise<Note[]> {
  const rows = await db.getAllAsync<NoteRow>(SELECT_NOTES, { $tripId: tripId });
  return rows.map(parseNoteRow);
}

export async function createNote(
  db: SQLiteDatabase,
  tripId: string,
  input: NoteInput,
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_NOTE, {
    $id: id,
    $tripId: tripId,
    $title: input.title,
    $body: input.body,
    $pinned: input.pinned ? 1 : 0,
    $now: new Date().toISOString(),
  });
  return id;
}

export async function updateNote(
  db: SQLiteDatabase,
  id: string,
  input: NoteInput,
): Promise<void> {
  await db.runAsync(UPDATE_NOTE, {
    $id: id,
    $title: input.title,
    $body: input.body,
    $pinned: input.pinned ? 1 : 0,
    $now: new Date().toISOString(),
  });
}

export async function setNotePinned(
  db: SQLiteDatabase,
  id: string,
  pinned: boolean,
): Promise<void> {
  await db.runAsync(SET_NOTE_PINNED, {
    $id: id,
    $pinned: pinned ? 1 : 0,
    $now: new Date().toISOString(),
  });
}

export async function deleteNote(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM trip_notes WHERE id = ?`, id);
}
