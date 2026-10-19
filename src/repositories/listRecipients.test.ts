import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import {
  addListItem,
  addToPacking,
  copyListToTrip,
  createList,
  deleteListItem,
  getListItem,
  getRecipientIds,
  listListItems,
  listRecipients,
  saveAsReusable,
  updateListItem,
} from './lists';
import { createTraveller, deleteTraveller } from './travellers';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Who a list item is for, several people at once (2B-0): written with the item, carried by every
 * copy, never a quantity.
 */

const now = '2026-10-19T09:00:00.000Z';

async function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  raw
    .prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('lapland', 'Lapland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
    )
    .run(now, now);
  const db = asyncDatabase(raw);
  const evelina = await createTraveller(db, 'Evelina', 'adult');
  const misho = await createTraveller(db, 'Misho', 'adult');
  const mitko = await createTraveller(db, 'Mitko', 'child');
  const shopping = await createList(db, { tripId: 'lapland', kind: 'shopping', name: 'Shopping' });
  return { raw, db, evelina, misho, mitko, shopping };
}

const sorted = (ids: string[]) => [...ids].sort();

describe('who a list item is for', () => {
  it('holds none, one or several people, each once, and never changes the quantity', async () => {
    const { db, evelina, misho, shopping } = await setup();
    const none = await addListItem(db, shopping, { label: 'Snacks' });
    const one = await addListItem(db, shopping, { label: 'Gloves', recipientIds: [misho] });
    const several = await addListItem(db, shopping, {
      label: 'Merino base layer',
      quantity: 1,
      recipientIds: [evelina, misho, evelina],
    });

    expect(await getRecipientIds(db, none)).toEqual([]);
    expect(await getRecipientIds(db, one)).toEqual([misho]);
    expect(sorted(await getRecipientIds(db, several))).toEqual(sorted([evelina, misho]));
    expect((await getListItem(db, several))?.quantity).toBe(1);
  });

  it('replaces the people on an edit, and keeps them when the edit does not say', async () => {
    const { db, evelina, misho, mitko, shopping } = await setup();
    const id = await addListItem(db, shopping, {
      label: 'Hand warmers',
      quantity: 10,
      recipientIds: [evelina, misho, mitko],
    });

    await updateListItem(db, id, { label: 'Hand warmers', quantity: 10, recipientIds: [evelina, mitko] });
    expect(sorted(await getRecipientIds(db, id))).toEqual(sorted([evelina, mitko]));

    await updateListItem(db, id, { label: 'Hand warmers (big)', quantity: 10 });
    expect(sorted(await getRecipientIds(db, id))).toEqual(sorted([evelina, mitko]));

    await updateListItem(db, id, { label: 'Hand warmers', quantity: 10, recipientIds: [] });
    expect(await getRecipientIds(db, id)).toEqual([]);
    expect((await getListItem(db, id))?.quantity).toBe(10);
  });

  it('lists each item’s people by name', async () => {
    const { db, evelina, misho, shopping } = await setup();
    const id = await addListItem(db, shopping, { label: 'Merino', recipientIds: [misho, evelina] });
    const byItem = await listRecipients(db, shopping);
    expect(byItem.get(id)?.map((person) => person.name).sort()).toEqual(['Evelina', 'Misho']);
  });

  it('copies them with the list, into a trip and back into a reusable list', async () => {
    const { db, evelina, misho, shopping } = await setup();
    const master = await createList(db, { tripId: null, kind: 'shopping', name: 'Winter' });
    await addListItem(db, master, { label: 'Merino', recipientIds: [evelina, misho] });

    const copy = await copyListToTrip(db, master, 'lapland');
    const [copied] = await listListItems(db, copy);
    expect(sorted(await getRecipientIds(db, copied.id))).toEqual(sorted([evelina, misho]));

    await addListItem(db, shopping, { label: 'Boots', recipientIds: [misho] });
    const kept = await saveAsReusable(db, shopping, 'Next winter');
    const [keptItem] = await listListItems(db, kept);
    expect(await getRecipientIds(db, keptItem.id)).toEqual([misho]);
  });

  it('keeps them when a bought item goes on the packing list', async () => {
    const { db, evelina, misho, shopping } = await setup();
    const id = await addListItem(db, shopping, { label: 'Merino', recipientIds: [evelina, misho] });
    const packed = await addToPacking(db, 'lapland', (await getListItem(db, id))!);
    expect(sorted(await getRecipientIds(db, packed))).toEqual(sorted([evelina, misho]));
  });

  it('goes with its item, and a deleted profile leaves only the others', async () => {
    const { raw, db, evelina, misho, shopping } = await setup();
    const a = await addListItem(db, shopping, { label: 'Merino', recipientIds: [evelina, misho] });
    const b = await addListItem(db, shopping, { label: 'Gloves', recipientIds: [misho] });

    await deleteListItem(db, a);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM list_item_recipients`).get()).toEqual({ n: 1 });

    // Misho is on no trip, so the profile can be deleted; his place on the list goes with him.
    expect(await deleteTraveller(db, misho)).toEqual({ deleted: true });
    expect(await getRecipientIds(db, b)).toEqual([]);
    expect((await getListItem(db, b))?.label).toBe('Gloves');
  });
});
