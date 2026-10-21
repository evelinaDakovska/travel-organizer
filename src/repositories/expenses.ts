import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_RECEIPTS_FOR_TRIP,
  DELETE_EXPENSE,
  INSERT_EXPENSE,
  SELECT_EXPENSE,
  SELECT_EXPENSES_FOR_TRIP,
  UPDATE_EXPENSE,
} from '../db/queries';
import type { ResourceInput } from '../domain/resource';
import { parseExpenseRow, type Expense, type ExpenseInput, type ExpenseRow } from '../domain/spending';
import { bookingForRecord, checkPayer } from './payments';
import { createResource } from './resources';

export const EXPENSE_TABLES = ['expenses'] as const;

export async function listExpenses(db: SQLiteDatabase, tripId: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(SELECT_EXPENSES_FOR_TRIP, { $tripId: tripId });
  return rows.map(parseExpenseRow);
}

export async function getExpense(db: SQLiteDatabase, id: string): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(SELECT_EXPENSE, { $id: id });
  return row ? parseExpenseRow(row) : null;
}

/** Receipts per expense id; an expense with none is absent. */
export async function countReceipts(
  db: SQLiteDatabase,
  tripId: string,
): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ expense_id: string; n: number }>(COUNT_RECEIPTS_FOR_TRIP, {
    $tripId: tripId,
  });
  return new Map(rows.map((row) => [row.expense_id, row.n]));
}

/** The receipt counts join both tables. */
export const RECEIPT_COUNT_TABLES = ['expenses', 'resources'] as const;

const bindings = (input: ExpenseInput) => ({
  $category: input.category,
  $label: input.label ?? null,
  $amount: input.amount,
  $currency: input.currency,
  $spentOn: input.spentOn,
  $notes: input.notes ?? null,
  $payerId: input.payerId,
  $tripItemId: input.tripItemId,
  $now: new Date().toISOString(),
});

/** A link is to a priced booking of the same trip, in its currency, or it is refused (3D-1). */
async function checkLink(db: SQLiteDatabase, tripId: string, input: ExpenseInput): Promise<void> {
  if (input.tripItemId !== null) {
    await bookingForRecord(db, input.tripItemId, tripId, input.currency);
  }
}

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
    await checkLink(db, tripId, input);
    await checkPayer(db, tripId, input.payerId);
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
  await db.withTransactionAsync(async () => {
    const saved = await getExpense(db, id);
    if (saved) {
      await checkLink(db, saved.tripId, input);
      await checkPayer(db, saved.tripId, input.payerId, saved.payerId);
    }
    await db.runAsync(UPDATE_EXPENSE, { $id: id, ...bindings(input) });
  });
}

/** Receipt rows cascade. Their files are reclaimed by the start-up sweep, not here. */
export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(DELETE_EXPENSE, { $id: id });
}
