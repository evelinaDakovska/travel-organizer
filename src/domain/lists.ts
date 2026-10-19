/**
 * Packing and shopping lists (C1). A reusable list belongs to no trip; copying it into a trip
 * makes a new list that is edited and ticked on its own — packed, or bought — while the reusable
 * one never changes and is never ticked (FB-15). Bought is not packed: they are separate lists.
 */

import { z } from 'zod';

export const LIST_KINDS = ['packing', 'shopping'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export type List = {
  id: string;
  /** Null: a reusable list, kept outside any trip. */
  tripId: string | null;
  kind: ListKind;
  name: string;
  /** The reusable list a trip copy came from — provenance only (FB-19). */
  sourceListId: string | null;
  sortOrder: number;
};

export type ListItem = {
  id: string;
  listId: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  /** Packed or bought. Only ever set on a trip's copy. */
  doneAt: string | null;
  sortOrder: number;
};

export type ListRow = {
  id: string;
  trip_id: string | null;
  kind: string;
  name: string;
  source_list_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ListItemRow = {
  id: string;
  list_id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  /**
   * Legacy (until 0.7.x): the one person an item was for. Since migration 006 who it is for lives
   * in `list_item_recipients`; this column is kept as it was and no longer read or written.
   */
  traveller_id: string | null;
  done_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const asKind = (kind: string): ListKind => (kind === 'shopping' ? 'shopping' : 'packing');

export function parseListRow(row: ListRow): List {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: asKind(row.kind),
    name: row.name,
    sourceListId: row.source_list_id,
    sortOrder: row.sort_order,
  };
}

export function parseListItemRow(row: ListItemRow): ListItem {
  return {
    id: row.id,
    listId: row.list_id,
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    note: row.note,
    doneAt: row.done_at,
    sortOrder: row.sort_order,
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const listNameSchema = z.string().trim().min(1, 'Give the list a name').max(60);

export const listItemInputSchema = z.object({
  label: z.string().trim().min(1, 'What is it?').max(120),
  quantity: z.number({ error: 'A whole number' }).int('A whole number').min(1, 'At least 1').optional(),
  unit: optionalText(20),
  category: optionalText(40),
  note: optionalText(200),
  /** Who it is for: none, one or several people, each once (2B-0). */
  recipientIds: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .transform((ids) => (ids ? [...new Set(ids)] : undefined)),
});

/** What an item is saved from: the schema's output, or a preset's literal. */
export type ListItemInput = {
  label: string;
  quantity?: number;
  unit?: string;
  category?: string;
  note?: string;
  /** Traveller profile ids. Never a quantity: two people do not make it two of the thing. */
  recipientIds?: string[];
};

/**
 * Who an item is for, as one line: *Evelina, Misho*. *Everyone* only when the trip has two or
 * more travellers and every one of them is chosen — a summary of what is saved, never a rule: a
 * traveller added to the trip later is not added to the item. Null when it is for no one.
 */
export function recipientsLine(
  recipients: readonly { id: string; name: string }[],
  tripMemberIds: readonly string[] | null,
): string | null {
  if (recipients.length === 0) return null;
  const chosen = new Set(recipients.map((person) => person.id));
  if (tripMemberIds && tripMemberIds.length > 1 && tripMemberIds.every((id) => chosen.has(id))) {
    return 'Everyone';
  }
  return recipients.map((person) => person.name).join(', ');
}

/** Groups offered for a new item; any other group can be typed. Never required. */
export const SUGGESTED_GROUPS: Record<ListKind, readonly string[]> = {
  packing: ['Documents', 'Clothing', 'Toiletries', 'Electronics', 'Child essentials', 'Other'],
  shopping: ['Clothing', 'Toiletries', 'Equipment', 'Other'],
};

/** 'Packing list', 'Shopping list'. */
export function listKindLabel(kind: ListKind): string {
  return kind === 'packing' ? 'Packing list' : 'Shopping list';
}

/** Rows ticked and rows in all — a row is one thing, whatever its quantity (C1). */
export function listProgress(items: readonly Pick<ListItem, 'doneAt'>[]): {
  done: number;
  total: number;
} {
  return { done: items.filter((item) => item.doneAt !== null).length, total: items.length };
}

/** 'Packed 8 of 12', 'Bought 3 of 5', 'Nothing in it yet'. */
export function progressText(kind: ListKind, progress: { done: number; total: number }): string {
  if (progress.total === 0) return 'Nothing in it yet';
  return `${kind === 'packing' ? 'Packed' : 'Bought'} ${progress.done} of ${progress.total}`;
}

/** '3 pairs', '2', 'pairs' — how much, when it is said. Null when neither is. */
export function amountText(item: Pick<ListItem, 'quantity' | 'unit'>): string | null {
  const parts = [item.quantity === null ? null : String(item.quantity), item.unit].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export type ItemGroup<T> = { category: string | null; items: T[] };

/**
 * Items under their groups, in the order the list is kept: each group where its first item is,
 * items without a group together after the named ones.
 */
export function groupItems<T extends Pick<ListItem, 'category' | 'sortOrder'>>(
  items: readonly T[],
): ItemGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: ItemGroup<T>[] = [];
  for (const item of sorted) {
    const category = item.category?.trim() || null;
    const group = groups.find((existing) => existing.category === category);
    if (group) group.items.push(item);
    else groups.push({ category, items: [item] });
  }
  const named = groups.filter((group) => group.category !== null);
  return [...named, ...groups.filter((group) => group.category === null)];
}

/**
 * The order after moving one item a place up (-1) or down (+1): the ids in their new order, or
 * null when it is already at that end.
 */
export function moveInOrder(
  ids: readonly string[],
  id: string,
  delta: -1 | 1,
): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A starting set of reusable lists, offered once when there are none (C1). Edited like any other. */
export const PRESET_LISTS: readonly {
  kind: ListKind;
  name: string;
  items: readonly { label: string; category?: string; quantity?: number; unit?: string }[];
}[] = [
  {
    kind: 'packing',
    name: 'General packing',
    items: [
      { label: 'Passport or ID', category: 'Documents' },
      { label: 'Tickets and booking confirmations', category: 'Documents' },
      { label: 'Bank cards and some cash', category: 'Documents' },
      { label: 'Phone charger', category: 'Electronics' },
      { label: 'Power bank', category: 'Electronics' },
      { label: 'Plug adapter', category: 'Electronics' },
      { label: 'Toothbrush and toothpaste', category: 'Toiletries' },
      { label: 'Medicines', category: 'Toiletries' },
      { label: 'Underwear', category: 'Clothing' },
      { label: 'Socks', category: 'Clothing' },
    ],
  },
  {
    kind: 'packing',
    name: 'Winter layers',
    items: [
      { label: 'Base layers', category: 'Clothing' },
      { label: 'Fleece', category: 'Clothing' },
      { label: 'Wool socks', category: 'Clothing', quantity: 3, unit: 'pairs' },
      { label: 'Hat', category: 'Clothing' },
      { label: 'Liner gloves', category: 'Clothing' },
      { label: 'Mittens', category: 'Clothing' },
    ],
  },
  {
    kind: 'packing',
    name: 'Child essentials',
    items: [
      { label: 'Snacks', category: 'Child essentials' },
      { label: 'Favourite toy', category: 'Child essentials' },
      { label: 'Spare clothes', category: 'Child essentials' },
      { label: 'Wet wipes', category: 'Child essentials' },
    ],
  },
  {
    kind: 'shopping',
    name: 'Toiletries to buy',
    items: [
      { label: 'Sunscreen', category: 'Toiletries' },
      { label: 'Travel-size shampoo', category: 'Toiletries' },
      { label: 'Lip balm', category: 'Toiletries' },
    ],
  },
];
