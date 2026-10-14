import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import {
  addListItem,
  addPresetLists,
  addToPacking,
  copyListToTrip,
  countTripCopies,
  createList,
  deleteList,
  deleteListItem,
  getListItem,
  listListItems,
  listReusableLists,
  listTripLists,
  saveAsReusable,
  setListItemDone,
  setListOrder,
  updateListItem,
  updateReusableFrom,
} from './lists';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const now = '2026-10-13T09:00:00.000Z';

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  for (const id of ['lapland', 'alps']) {
    raw
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES (?, ?, '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
      )
      .run(id, id, now, now);
  }
  return { raw, db: asyncDatabase(raw) };
}

const labels = (items: { label: string }[]) => items.map((item) => item.label);

async function winterMaster(db: ReturnType<typeof setup>['db']) {
  const id = await createList(db, { tripId: null, kind: 'packing', name: 'Winter layers' });
  await addListItem(db, id, { label: 'Base layers', category: 'Clothing' });
  await addListItem(db, id, { label: 'Wool socks', quantity: 3, unit: 'pairs' });
  await addListItem(db, id, { label: 'Mittens' });
  return id;
}

describe('copying a reusable list into trips (the review’s acceptance check)', () => {
  it('gives each trip its own copy, edited and ticked independently', async () => {
    const { db } = setup();
    const master = await winterMaster(db);

    const lapland = await copyListToTrip(db, master, 'lapland');
    const alps = await copyListToTrip(db, master, 'alps');

    const [socks] = (await listListItems(db, lapland)).filter((i) => i.label === 'Wool socks');
    await updateListItem(db, socks.id, { label: 'Wool socks', quantity: 6, unit: 'pairs' });
    await setListItemDone(db, socks.id, true);
    await addListItem(db, lapland, { label: 'Head torch' });

    expect(labels(await listListItems(db, lapland))).toEqual([
      'Base layers',
      'Wool socks',
      'Mittens',
      'Head torch',
    ]);
    const alpsItems = await listListItems(db, alps);
    expect(labels(alpsItems)).toEqual(['Base layers', 'Wool socks', 'Mittens']);
    expect(alpsItems.find((i) => i.label === 'Wool socks')).toMatchObject({
      quantity: 3,
      doneAt: null,
    });
    // The master is neither changed nor ticked.
    expect((await listListItems(db, master)).map((i) => [i.label, i.quantity, i.doneAt])).toEqual([
      ['Base layers', null, null],
      ['Wool socks', 3, null],
      ['Mittens', null, null],
    ]);
  });

  it('master copied to 2 QA trips: modifying or deleting in one trip never affects master or second trip', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const laplandCopy = await copyListToTrip(db, master, 'lapland');
    const alpsCopy = await copyListToTrip(db, master, 'alps');

    expect(laplandCopy).not.toBe(alpsCopy);
    expect(laplandCopy).not.toBe(master);

    // Delete an item from laplandCopy
    const [laplandFirst] = await listListItems(db, laplandCopy);
    await deleteListItem(db, laplandFirst.id);

    // Alps and master still have all 3 items
    expect(await listListItems(db, laplandCopy)).toHaveLength(2);
    expect(await listListItems(db, alpsCopy)).toHaveLength(3);
    expect(await listListItems(db, master)).toHaveLength(3);
  });

  it('starts a copy with every tick cleared, and counts copies for the warning', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const first = await copyListToTrip(db, master, 'lapland');
    for (const item of await listListItems(db, first)) await setListItemDone(db, item.id, true);

    const second = await copyListToTrip(db, master, 'lapland');

    expect((await listListItems(db, second)).every((item) => item.doneAt === null)).toBe(true);
    expect(await countTripCopies(db, 'lapland', master)).toBe(2);
    expect(await countTripCopies(db, 'alps', master)).toBe(0);
  });

  it('keeps the trip copies when the reusable list is deleted, and the reverse', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const copy = await copyListToTrip(db, master, 'lapland');

    await deleteList(db, master);
    expect(labels(await listListItems(db, copy))).toHaveLength(3);

    const another = await winterMaster(db);
    const copy2 = await copyListToTrip(db, another, 'alps');
    await deleteList(db, copy2);
    expect(labels(await listListItems(db, another))).toHaveLength(3);
  });
});

describe('ticks', () => {
  it('never tick a reusable list', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const [first] = await listListItems(db, master);
    await setListItemDone(db, first.id, true);
    expect((await getListItem(db, first.id))?.doneAt).toBeNull();
  });

  it('count rows in the summaries', async () => {
    const { db } = setup();
    const copy = await copyListToTrip(db, await winterMaster(db), 'lapland');
    const [first] = await listListItems(db, copy);
    await setListItemDone(db, first.id, true);
    expect(await listTripLists(db, 'lapland')).toEqual([
      expect.objectContaining({ id: copy, kind: 'packing', done: 1, total: 3 }),
    ]);
  });
});

describe('bought is not packed', () => {
  it('puts a bought item on the packing list unticked, making the list when there is none', async () => {
    const { db } = setup();
    const shopping = await createList(db, { tripId: 'lapland', kind: 'shopping', name: 'To buy' });
    const id = await addListItem(db, shopping, { label: 'Hand warmers', quantity: 10 });
    await setListItemDone(db, id, true);

    await addToPacking(db, 'lapland', (await getListItem(db, id))!);

    const packing = (await listTripLists(db, 'lapland')).find((list) => list.kind === 'packing');
    expect(packing).toMatchObject({ name: 'Packing', done: 0, total: 1 });
    const [packed] = await listListItems(db, packing!.id);
    expect(packed).toMatchObject({ label: 'Hand warmers', quantity: 10, doneAt: null });
    // The shopping item is still bought, and still a shopping item.
    expect((await getListItem(db, id))?.doneAt).not.toBeNull();
  });
});

describe('keeping a trip’s list for next time', () => {
  it('saves it as a new reusable list without its ticks', async () => {
    const { db } = setup();
    const copy = await copyListToTrip(db, await winterMaster(db), 'lapland');
    const [first] = await listListItems(db, copy);
    await setListItemDone(db, first.id, true);

    const saved = await saveAsReusable(db, copy, 'Winter layers, with kids');

    expect((await listReusableLists(db)).map((list) => list.name)).toEqual([
      'Winter layers',
      'Winter layers, with kids',
    ]);
    expect((await listListItems(db, saved)).every((item) => item.doneAt === null)).toBe(true);
  });

  it('updates the reusable list it came from only when asked, never another trip’s copy', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const lapland = await copyListToTrip(db, master, 'lapland');
    const alps = await copyListToTrip(db, master, 'alps');
    await addListItem(db, lapland, { label: 'Head torch' });

    await updateReusableFrom(db, lapland, master);

    expect(labels(await listListItems(db, master))).toContain('Head torch');
    expect(labels(await listListItems(db, alps))).not.toContain('Head torch');
    await expect(updateReusableFrom(db, alps, lapland)).rejects.toThrow('Not a reusable list');
  });
});

describe('order and presets', () => {
  it('writes a new order', async () => {
    const { db } = setup();
    const master = await winterMaster(db);
    const ids = (await listListItems(db, master)).map((item) => item.id);
    await setListOrder(db, [ids[2], ids[0], ids[1]]);
    expect(labels(await listListItems(db, master))).toEqual(['Mittens', 'Base layers', 'Wool socks']);
  });

  it('adds the starting lists in one go', async () => {
    const { db } = setup();
    await addPresetLists(db);
    const lists = await listReusableLists(db);
    expect(lists.map((list) => list.name)).toEqual([
      'General packing',
      'Winter layers',
      'Child essentials',
      'Toiletries to buy',
    ]);
    expect(lists.every((list) => list.total > 0 && list.tripId === null)).toBe(true);
  });
});
