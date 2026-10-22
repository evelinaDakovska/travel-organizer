import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import {
  COUNT_RECEIPTS_FOR_TRIP,
  COUNT_TRIP_CONTENTS,
  DELETE_EXPENSE,
  INSERT_EXPENSE,
  INSERT_RECEIPT,
  INSERT_RESOURCE,
  SELECT_ALL_STORED_PATHS,
  SELECT_EXPENSE,
  SELECT_EXPENSES_FOR_TRIP,
  SELECT_RESOURCES_FOR_EXPENSE,
  SELECT_RESOURCES_FOR_TRIP,
  UPDATE_EXPENSE,
} from './queries';
import { parseExpenseRow, type ExpenseRow } from '../domain/spending';
import { parseResourceRow, type ResourceRow } from '../domain/resource';

const now = '2026-11-02T12:00:00.000Z';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Munich', '2026-11-01', '2026-11-05', 'Europe/Berlin', ?, ?)`,
  ).run(now, now);

  const addExpense = (id: string, values: Partial<Record<string, unknown>> = {}) =>
    db.prepare(INSERT_EXPENSE).run({
      id,
      tripId: 't1',
      category: 'food',
      label: null,
      amount: 1250,
      currency: 'EUR',
      spentOn: '2026-11-02',
      notes: null,
      payerId: null,
      tripItemId: null,
      now,
      ...values,
    });

  const addReceipt = (id: string, expenseId: string) =>
    db.prepare(INSERT_RECEIPT).run({
      id,
      expenseId,
      kind: 'file',
      subtype: 'generic',
      label: 'Receipt',
      url: null,
      storedPath: `media/${id}.jpg`,
      fileName: `${id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      now,
    });

  const addTripDocument = (id: string) =>
    db.prepare(INSERT_RESOURCE).run({
      id,
      tripId: 't1',
      tripItemId: null,
      kind: 'file',
      subtype: 'generic',
      label: id,
      url: null,
      storedPath: `media/${id}.pdf`,
      fileName: null,
      mimeType: 'application/pdf',
      sizeBytes: null,
      now,
    });

  return { db, addExpense, addReceipt, addTripDocument };
}

const expensesOf = (db: Database.Database) =>
  (db.prepare(SELECT_EXPENSES_FOR_TRIP).all({ tripId: 't1' }) as ExpenseRow[]).map(
    parseExpenseRow,
  );

const resources = (db: Database.Database, sql: string, id: string) =>
  (db.prepare(sql).all({ id }) as ResourceRow[]).map(parseResourceRow);

describe('expenses', () => {
  it('lists the newest day first, then the latest entered', () => {
    const { db, addExpense } = setup();
    addExpense('old', { spentOn: '2026-11-01' });
    addExpense('early', { spentOn: '2026-11-02', now: '2026-11-02T08:00:00.000Z' });
    addExpense('late', { spentOn: '2026-11-02', now: '2026-11-02T20:00:00.000Z' });

    expect(expensesOf(db).map((e) => e.id)).toEqual(['late', 'early', 'old']);
  });

  it('updates what the form edits, and leaves who paid and the split alone', () => {
    const { db, addExpense } = setup();
    addExpense('e1');
    db.prepare(`UPDATE expenses SET paid_by = 'Ana', split = '{"mode":"equal"}' WHERE id = 'e1'`).run();

    db.prepare(UPDATE_EXPENSE).run({
      id: 'e1',
      category: 'transport',
      label: 'Taxi',
      amount: 3400,
      currency: 'HUF',
      spentOn: '2026-11-03',
      notes: 'To the airport',
      payerId: null,
      tripItemId: null,
      now: '2026-11-03T10:00:00.000Z',
    });

    expect(db.prepare(SELECT_EXPENSE).get({ id: 'e1' })).toMatchObject({
      category: 'transport',
      label: 'Taxi',
      amount: 3400,
      currency: 'HUF',
      spent_on: '2026-11-03',
      notes: 'To the airport',
      paid_by: 'Ana',
      split: '{"mode":"equal"}',
      created_at: now,
      updated_at: '2026-11-03T10:00:00.000Z',
    });
  });

  it('is counted with what deleting the trip would remove, receipts among its files', () => {
    const { db, addExpense, addReceipt, addTripDocument } = setup();
    addExpense('e1');
    addExpense('e2');
    addReceipt('rc1', 'e1');
    addTripDocument('doc');

    expect(db.prepare(COUNT_TRIP_CONTENTS).get({ id: 't1' })).toEqual({
      items: 0,
      files: 2,
      expenses: 2,
      payments: 0,
      splits: 0,
      settlements: 0,
    });
  });
});

describe('receipts', () => {
  it('belong to their expense and are filed under its trip', () => {
    const { db, addExpense, addReceipt } = setup();
    addExpense('e1');
    addReceipt('rc1', 'e1');

    expect(db.prepare(`SELECT trip_id, trip_item_id, expense_id FROM resources`).get()).toEqual({
      trip_id: 't1',
      trip_item_id: null,
      expense_id: 'e1',
    });
    expect(resources(db, SELECT_RESOURCES_FOR_EXPENSE, 'e1').map((r) => r.owner)).toEqual([
      { scope: 'expense', id: 'e1' },
    ]);
  });

  it('are numbered in the order they were added', () => {
    const { db, addExpense, addReceipt } = setup();
    addExpense('e1');
    addReceipt('first', 'e1');
    addReceipt('second', 'e1');

    expect(resources(db, SELECT_RESOURCES_FOR_EXPENSE, 'e1').map((r) => [r.id, r.sortOrder])).toEqual([
      ['first', 0],
      ['second', 1],
    ]);
  });

  it('insert nothing for an expense that does not exist', () => {
    const { db, addReceipt } = setup();
    expect(addReceipt('rc1', 'missing').changes).toBe(0);
  });

  it('stay out of trip documents', () => {
    const { db, addExpense, addReceipt, addTripDocument } = setup();
    addExpense('e1');
    addReceipt('rc1', 'e1');
    addTripDocument('doc');

    expect(resources(db, SELECT_RESOURCES_FOR_TRIP, 't1').map((r) => r.id)).toEqual(['doc']);
  });

  it('keep their files through the sweep while the expense exists', () => {
    const { db, addExpense, addReceipt } = setup();
    addExpense('e1');
    addReceipt('rc1', 'e1');

    expect(db.prepare(SELECT_ALL_STORED_PATHS).all()).toEqual([{ stored_path: 'media/rc1.jpg' }]);
  });

  it('are counted per expense, for the trip asked about only', () => {
    const { db, addExpense, addReceipt } = setup();
    addExpense('e1');
    addExpense('e2');
    addReceipt('rc1', 'e1');
    addReceipt('rc2', 'e1');
    db.prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t2', 'Other', '2026-12-01', '2026-12-02', 'Europe/Sofia', ?, ?)`,
    ).run(now, now);
    addExpense('e3', { tripId: 't2' });
    addReceipt('rc3', 'e3');

    expect(db.prepare(COUNT_RECEIPTS_FOR_TRIP).all({ tripId: 't1' })).toEqual([
      { expense_id: 'e1', n: 2 },
    ]);
  });

  it('go with their expense, so the sweep can collect the file', () => {
    const { db, addExpense, addReceipt } = setup();
    addExpense('e1');
    addExpense('e2');
    addReceipt('rc1', 'e1');
    addReceipt('rc2', 'e2');

    db.prepare(DELETE_EXPENSE).run({ id: 'e1' });

    expect(db.prepare(SELECT_ALL_STORED_PATHS).all()).toEqual([{ stored_path: 'media/rc2.jpg' }]);
  });

  it('ensures a newly saved expense appears strictly in its designated trip', () => {
    const { db, addExpense, addReceipt } = setup();
    // Add second trip
    db.prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t2', 'Lapland', '2026-11-20', '2026-11-25', 'Europe/Helsinki', ?, ?)`,
    ).run(now, now);

    // Save expense in Trip 1
    addExpense('e-munich', { tripId: 't1', amount: 1500, label: 'Pretzel' });
    addReceipt('rc-munich', 'e-munich');

    // Save expense in Trip 2
    addExpense('e-lapland', { tripId: 't2', amount: 2500, label: 'Snowshoe rental' });
    addReceipt('rc-lapland', 'e-lapland');

    // Query Trip 1 expenses
    const t1Expenses = db.prepare(SELECT_EXPENSES_FOR_TRIP).all({ tripId: 't1' }) as ExpenseRow[];
    expect(t1Expenses.map((e) => e.id)).toEqual(['e-munich']);
    expect(t1Expenses[0].label).toBe('Pretzel');

    // Query Trip 2 expenses
    const t2Expenses = db.prepare(SELECT_EXPENSES_FOR_TRIP).all({ tripId: 't2' }) as ExpenseRow[];
    expect(t2Expenses.map((e) => e.id)).toEqual(['e-lapland']);
    expect(t2Expenses[0].label).toBe('Snowshoe rental');

    // Verify receipts are strictly partitioned
    expect(db.prepare(COUNT_RECEIPTS_FOR_TRIP).all({ tripId: 't1' })).toEqual([
      { expense_id: 'e-munich', n: 1 },
    ]);
    expect(db.prepare(COUNT_RECEIPTS_FOR_TRIP).all({ tripId: 't2' })).toEqual([
      { expense_id: 'e-lapland', n: 1 },
    ]);
  });
});
