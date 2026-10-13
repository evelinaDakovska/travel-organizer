/**
 * Trip templates (C5): reusable preparation — tasks, notes and lists — never an old trip with its
 * bookings. A template is one JSON document (FB-16), read and applied whole. Applying it copies
 * everything into the trip with new ids, ticks cleared, and a task's day moved to the new trip:
 * two days before the old trip's first day becomes two days before the new one's.
 */

import { z } from 'zod';

import { LIST_KINDS, type ListKind } from './lists';
import { listPhrase } from './format';
import { addCalendarDays, calendarDaysBetween, dayKey, timeOfDay, type LocalMoment } from './time';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const templateTaskSchema = z.object({
  title: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).optional(),
  /** Days from the trip's first day: -2 is two days before it. Null: undated, stays undated. */
  offsetDays: z.number().int().min(-366).max(366).nullable(),
  /** 'HH:mm' on that day, read in the new trip's zone; null for a date only. */
  time: z.string().regex(TIME).nullable(),
});

const templateNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(20000),
  pinned: z.boolean(),
});

const templateListSchema = z.object({
  kind: z.enum(LIST_KINDS),
  name: z.string().trim().min(1).max(60),
  items: z.array(
    z.object({
      label: z.string().trim().min(1).max(120),
      quantity: z.number().int().min(1).optional(),
      unit: z.string().max(20).optional(),
      category: z.string().max(40).optional(),
      note: z.string().max(200).optional(),
    }),
  ),
});

export const templateContentSchema = z.object({
  version: z.literal(1),
  tasks: z.array(templateTaskSchema),
  notes: z.array(templateNoteSchema),
  lists: z.array(templateListSchema),
});

export type TemplateContent = z.infer<typeof templateContentSchema>;
export type TemplateTask = z.infer<typeof templateTaskSchema>;

export const templateNameSchema = z.string().trim().min(1, 'Give it a name').max(60);

/** A template as stored, or null when it cannot be read (a later version's, say). */
export function parseTemplateContent(json: string): TemplateContent | null {
  try {
    const parsed = templateContentSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A task as a template keeps it: its day relative to the trip's start, its time of day. */
export function templateTask(
  task: { title: string; notes: string | null; start: LocalMoment | null },
  tripStart: string,
): TemplateTask {
  return {
    title: task.title,
    ...(task.notes ? { notes: task.notes } : {}),
    offsetDays: task.start ? calendarDaysBetween(tripStart, dayKey(task.start)) : null,
    time: task.start ? timeOfDay(task.start) : null,
  };
}

/**
 * A template task on a trip: its day counted from the trip's first day, its time — if it had one —
 * on that day in the trip's own zone (the old task's zone is not carried over). Undated stays
 * undated. Ready for the item schema.
 */
export function taskStart(
  task: Pick<TemplateTask, 'offsetDays' | 'time'>,
  tripStart: string,
): { local: string } | undefined {
  if (task.offsetDays === null) return undefined;
  const date = addCalendarDays(tripStart, task.offsetDays);
  return { local: task.time ? `${date}T${task.time}` : date };
}

/** '3 tasks, 2 notes and a packing list' — what a template holds, or what will be added. */
export function templateSummary(content: TemplateContent): string {
  const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  const lists = (kind: ListKind) => content.lists.filter((list) => list.kind === kind).length;
  const parts = [
    content.tasks.length > 0 ? count(content.tasks.length, 'task', 'tasks') : null,
    content.notes.length > 0 ? count(content.notes.length, 'note', 'notes') : null,
    lists('packing') > 0 ? count(lists('packing'), 'packing list', 'packing lists') : null,
    lists('shopping') > 0 ? count(lists('shopping'), 'shopping list', 'shopping lists') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? listPhrase(parts) : 'Nothing in it yet';
}

/** Where a task lands, against the trip: '2 days before', 'The day before', 'Day 1', 'No date'. */
export function offsetLabel(offsetDays: number | null): string {
  if (offsetDays === null) return 'No date';
  if (offsetDays < 0) return offsetDays === -1 ? 'The day before' : `${-offsetDays} days before`;
  return `Day ${offsetDays + 1}`;
}
