import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COPY_LIST_ITEMS,
  COUNT_TRIP_COPIES,
  INSERT_LIST,
  INSERT_LIST_ITEM,
  RENAME_LIST,
  SELECT_LIST,
  SELECT_LIST_ITEM,
  SELECT_LIST_ITEMS,
  SELECT_REUSABLE_LISTS,
  SELECT_TRIP_LISTS,
  SET_LIST_ITEM_DONE,
  SET_LIST_ITEM_ORDER,
  UPDATE_LIST_ITEM,
} from '../db/queries';
import {
  parseListItemRow,
  parseListRow,
  PRESET_LISTS,
  type List,
  type ListItem,
  type ListItemInput,
  type ListItemRow,
  type ListKind,
  type ListRow,
} from '../domain/lists';

export const LIST_TABLES = ['lists', 'list_items'] as const;

export type ListSummary = List & { done: number; total: number };

type SummaryRow = ListRow & { item_count: number; done_count: number };

const summaryOf = (row: SummaryRow): ListSummary => ({
  ...parseListRow(row),
  done: row.done_count,
  total: row.item_count,
});

export async function listTripLists(db: SQLiteDatabase, tripId: string): Promise<ListSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(SELECT_TRIP_LISTS, { $tripId: tripId });
  return rows.map(summaryOf);
}

export async function listReusableLists(db: SQLiteDatabase): Promise<ListSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(SELECT_REUSABLE_LISTS);
  return rows.map(summaryOf);
}

export async function getList(db: SQLiteDatabase, id: string): Promise<List | null> {
  const row = await db.getFirstAsync<ListRow>(SELECT_LIST, { $id: id });
  return row ? parseListRow(row) : null;
}

export async function listListItems(db: SQLiteDatabase, listId: string): Promise<ListItem[]> {
  const rows = await db.getAllAsync<ListItemRow>(SELECT_LIST_ITEMS, { $listId: listId });
  return rows.map(parseListItemRow);
}

export async function getListItem(db: SQLiteDatabase, id: string): Promise<ListItem | null> {
  const row = await db.getFirstAsync<ListItemRow>(SELECT_LIST_ITEM, { $id: id });
  return row ? parseListItemRow(row) : null;
}

/** A new list: for a trip, or reusable when `tripId` is null. Not a transaction of its own. */
async function insertList(
  db: SQLiteDatabase,
  list: { tripId: string | null; kind: ListKind; name: string; sourceListId?: string | null },
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_LIST, {
    $id: id,
    $tripId: list.tripId,
    $kind: list.kind,
    $name: list.name,
    $sourceListId: list.sourceListId ?? null,
    $now: new Date().toISOString(),
  });
  return id;
}

export async function createList(
  db: SQLiteDatabase,
  list: { tripId: string | null; kind: ListKind; name: string },
): Promise<string> {
  return insertList(db, list);
}

export async function renameList(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync(RENAME_LIST, { $id: id, $name: name, $now: new Date().toISOString() });
}

/** Its items go with it. A reusable list's trip copies stay: they are lists of their own. */
export async function deleteList(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM lists WHERE id = $id`, { $id: id });
}

const itemBindings = (input: ListItemInput) => ({
  $label: input.label,
  $quantity: input.quantity ?? null,
  $unit: input.unit ?? null,
  $category: input.category ?? null,
  $note: input.note ?? null,
  $travellerId: input.travellerId ?? null,
});

export async function addListItem(
  db: SQLiteDatabase,
  listId: string,
  input: ListItemInput,
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_LIST_ITEM, {
    $id: id,
    $listId: listId,
    $now: new Date().toISOString(),
    ...itemBindings(input),
  });
  return id;
}

export async function updateListItem(
  db: SQLiteDatabase,
  id: string,
  input: ListItemInput,
): Promise<void> {
  await db.runAsync(UPDATE_LIST_ITEM, {
    $id: id,
    $now: new Date().toISOString(),
    ...itemBindings(input),
  });
}

export async function deleteListItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM list_items WHERE id = $id`, { $id: id });
}

/** Packed or bought — or not. Does nothing on a reusable list. */
export async function setListItemDone(
  db: SQLiteDatabase,
  id: string,
  done: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(SET_LIST_ITEM_DONE, { $id: id, $doneAt: done ? now : null, $now: now });
}

/** Writes a new order for a list's items, all at once. */
export async function setListOrder(db: SQLiteDatabase, ids: readonly string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync(SET_LIST_ITEM_ORDER, { $id: id, $sortOrder: index });
    }
  });
}

/** Copies every item of one list into another: new ids, same order, ticks cleared. */
async function copyItems(db: SQLiteDatabase, fromListId: string, toListId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const item of await listListItems(db, fromListId)) {
    await db.runAsync(COPY_LIST_ITEMS, {
      $newId: randomUUID(),
      $toListId: toListId,
      $fromItemId: item.id,
      $now: now,
    });
  }
}

/**
 * A reusable list copied into a trip (C1): a new list with new items and no ticks, saying which
 * list it came from. Later changes to either never reach the other.
 */
export async function copyListToTrip(
  db: SQLiteDatabase,
  sourceListId: string,
  tripId: string,
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    const source = await getList(db, sourceListId);
    if (!source) throw new Error('That list no longer exists');
    id = await insertList(db, {
      tripId,
      kind: source.kind,
      name: source.name,
      sourceListId: source.id,
    });
    await copyItems(db, source.id, id);
  });
  return id;
}

/** How many copies of this reusable list the trip has, to warn before adding another. */
export async function countTripCopies(
  db: SQLiteDatabase,
  tripId: string,
  sourceListId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(COUNT_TRIP_COPIES, {
    $tripId: tripId,
    $sourceListId: sourceListId,
  });
  return row?.n ?? 0;
}

/** A trip's list kept for next time as a new reusable list, its ticks left behind. */
export async function saveAsReusable(
  db: SQLiteDatabase,
  tripListId: string,
  name: string,
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    const list = await getList(db, tripListId);
    if (!list) throw new Error('That list no longer exists');
    id = await insertList(db, { tripId: null, kind: list.kind, name });
    await copyItems(db, list.id, id);
  });
  return id;
}

/**
 * The reusable list a trip copy came from, made to match the copy — only on an explicit, confirmed
 * request (C1). Its items are replaced; its name and other trips' copies are not touched.
 */
export async function updateReusableFrom(
  db: SQLiteDatabase,
  tripListId: string,
  reusableListId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const reusable = await getList(db, reusableListId);
    if (!reusable || reusable.tripId !== null) throw new Error('Not a reusable list');
    await db.runAsync(`DELETE FROM list_items WHERE list_id = $id`, { $id: reusableListId });
    await copyItems(db, tripListId, reusableListId);
  });
}

/**
 * A shopping item put on the trip's packing list (C1): a new packing item, not ticked — buying
 * something is not packing it. Into the trip's first packing list, or a new *Packing* one.
 */
export async function addToPacking(
  db: SQLiteDatabase,
  tripId: string,
  item: ListItem,
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    const packing = (await listTripLists(db, tripId)).find((list) => list.kind === 'packing');
    const listId = packing?.id ?? (await insertList(db, { tripId, kind: 'packing', name: 'Packing' }));
    id = await addListItem(db, listId, {
      label: item.label,
      quantity: item.quantity ?? undefined,
      unit: item.unit ?? undefined,
      category: item.category ?? undefined,
      note: item.note ?? undefined,
      travellerId: item.travellerId ?? undefined,
    });
  });
  return id;
}

/** The starting reusable lists (C1), added in one go when asked for. */
export async function addPresetLists(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const preset of PRESET_LISTS) {
      const listId = await insertList(db, { tripId: null, kind: preset.kind, name: preset.name });
      for (const item of preset.items) await addListItem(db, listId, item);
    }
  });
}
