import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_EXPENSE,
  INSERT_EXPENSE,
  SELECT_EXPENSE,
  SELECT_EXPENSES_FOR_TRIP,
  UPDATE_EXPENSE,
} from '../db/queries';
import type { ResourceInput } from '../domain/resource';
import { parseExpenseRow, type Expense, type ExpenseInput, type ExpenseRow } from '../domain/spending';
import { createResource } from './resources';

/** A receipt's row lives in `resources`, so lists of receipts refresh on that table too. */
export const EXPENSE_TABLES = ['expenses'] as const;

export async function listExpenses(db: SQLiteDatabase, tripId: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(SELECT_EXPENSES_FOR_TRIP, { $tripId: tripId });
  return rows.map(parseExpenseRow);
}

export async function getExpense(db: SQLiteDatabase, id: string): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(SELECT_EXPENSE, { $id: id });
  return row ? parseExpenseRow(row) : null;
}

const bindings = (input: ExpenseInput) => ({
  $category: input.category,
  $label: input.label ?? null,
  $amount: input.amount,
  $currency: input.currency,
  $spentOn: input.spentOn,
  $notes: input.notes ?? null,
  $now: new Date().toISOString(),
});

/**
 * The expense and its receipts in one transaction: either all of it is saved or none. The
 * receipt files are already copied in, so a failed save leaves only orphans the sweep collects.
 */
export async function createExpense(
  db: SQLiteDatabase,
  tripId: string,
  input: ExpenseInput,
  receipts: readonly ResourceInput[] = [],
): Promise<string> {
  const id = randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(INSERT_EXPENSE, { $id: id, $tripId: tripId, ...bindings(input) });
    for (const receipt of receipts) {
      await createResource(db, { scope: 'expense', id }, receipt);
    }
  });
  return id;
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: string,
  input: ExpenseInput,
): Promise<void> {
  await db.runAsync(UPDATE_EXPENSE, { $id: id, ...bindings(input) });
}

/** Receipt rows cascade. Their files are reclaimed by the start-up sweep, not here. */
export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(DELETE_EXPENSE, { $id: id });
}
