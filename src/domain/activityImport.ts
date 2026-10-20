/**
 * The import preview (2C), as data: every entry of a file with its problems and possible
 * duplicate, what starts ticked, and what the ticked ones will do once added — so the screen only
 * draws it. Nothing here writes; the repository adds exactly the entries the person ticked.
 */

import {
  factsOfInput,
  factsOfItem,
  findActivityDuplicates,
  type DuplicateMatch,
} from './activityDuplicates';
import type { IgnoredField, ParsedActivity } from './activityFormat';
import { reminderFor } from './reminders';
import { localPrecision, type LocalMoment } from './time';
import type { TripItem, TripItemInput } from './tripItem';

export type PreviewRow = ParsedActivity & {
  duplicate: DuplicateMatch | null;
  /** Invalid entries cannot be ticked until the file is corrected. */
  selectable: boolean;
};

export type ImportPreview = {
  rows: PreviewRow[];
  /** Fields at the top of the file that are not read. */
  ignored: IgnoredField[];
  /** Valid and not a likely duplicate. */
  initiallySelected: number[];
};

export function buildImportPreview(
  activities: readonly ParsedActivity[],
  ignored: readonly IgnoredField[],
  existing: readonly TripItem[],
): ImportPreview {
  const duplicates = findActivityDuplicates(
    activities.map((activity) => (activity.input ? factsOfInput(activity.input) : null)),
    existing.map(factsOfItem),
  );
  const rows = activities.map((activity, i) => ({
    ...activity,
    duplicate: duplicates[i],
    selectable: activity.input !== null,
  }));
  return {
    rows,
    ignored: [...ignored],
    initiallySelected: rows.filter((row) => row.selectable && !row.duplicate).map((row) => row.index),
  };
}

export type PreviewCounts = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  selected: number;
  excluded: number;
};

export function previewCounts(rows: readonly PreviewRow[], selected: ReadonlySet<number>): PreviewCounts {
  const valid = rows.filter((row) => row.selectable).length;
  const chosen = rows.filter((row) => row.selectable && selected.has(row.index)).length;
  return {
    total: rows.length,
    valid,
    invalid: rows.length - valid,
    duplicates: rows.filter((row) => row.duplicate !== null).length,
    selected: chosen,
    excluded: rows.length - chosen,
  };
}

/** The ticked inputs, in file order — exactly what will be written. */
export function selectedRows(rows: readonly PreviewRow[], selected: ReadonlySet<number>): PreviewRow[] {
  return rows.filter((row) => row.selectable && row.input !== null && selected.has(row.index));
}

function startMoment(input: TripItemInput, defaultTz: string): LocalMoment | null {
  if (!input.start) return null;
  const precision = localPrecision(input.start.local);
  return precision ? { local: input.start.local, tz: input.start.tz ?? defaultTz, precision } : null;
}

export type SelectionNotices = {
  /** Planned with a price: shown in Expenses as an unpaid booking cost. */
  pricedPlans: number;
  /** Planned, dated and still ahead: the app's usual reminders will be scheduled. */
  remindingPlans: number;
  ideas: number;
  plans: number;
};

/** What adding the ticked entries will do beyond the entries themselves. */
export function selectionNotices(
  rows: readonly PreviewRow[],
  defaultTz: string,
  now: Date,
): SelectionNotices {
  let pricedPlans = 0;
  let remindingPlans = 0;
  let ideas = 0;
  let plans = 0;
  for (const { input } of rows) {
    if (!input) continue;
    if (input.status !== 'confirmed') {
      ideas++;
      continue;
    }
    plans++;
    if (input.priceAmount !== undefined) pricedPlans++;
    // The same rule the reminder system uses — asked, not re-implemented.
    const reminder = reminderFor(
      {
        id: 'preview',
        kind: input.kind,
        status: input.status,
        title: input.title,
        start: startMoment(input, defaultTz),
        completedAt: null,
        details: input.details ?? null,
      },
      now,
    );
    if (reminder) remindingPlans++;
  }
  return { pricedPlans, remindingPlans, ideas, plans };
}
