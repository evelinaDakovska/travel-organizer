import { z } from 'zod';

/** Free-form trip information: door codes, packing lists, what someone recommended. */
export type Note = {
  id: string;
  tripId: string;
  title: string;
  body: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const noteInputSchema = z.object({
  title: z.string().trim().min(1, 'Give the note a title').max(120),
  body: z.string().trim().default(''),
  pinned: z.boolean().default(false),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

export type NoteRow = {
  id: string;
  trip_id: string;
  title: string;
  body: string;
  pinned: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function parseNoteRow(row: NoteRow): Note {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    body: row.body,
    pinned: row.pinned === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
