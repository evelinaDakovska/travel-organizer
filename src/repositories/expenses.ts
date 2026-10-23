import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_RECEIPTS_FOR_TRIP,
  DELETE_EXPENSE,
  INSERT_EXPENSE,
  SELECT_EXPENSE,
  SELECT_SPLIT_FACTS,
  SELECT_EXPENSES_FOR_TRIP,
  UPDATE_EXPENSE,
} from '../db/queries';
import { MoneyRuleError } from '../domain/bookingPayments';
import { expenseSplitEditRefusal, splitFactsFrom } from '../domain/costShares';
import type { ResourceInput } from '../domain/resource';
import {
  expenseInputSchema,
  parseExpenseRow,
  type Expense,
  type ExpenseInput,
  type ExpenseRow,
} from '../domain/spending';
import { afterMoneyWrite, moneyBefore, type MoneyWriteOptions } from './moneyWrites';
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

/** The form's own schema, again at the boundary: a whole, positive amount in a three-letter currency. */
function validInput(input: ExpenseInput): ExpenseInput {
  const result = expenseInputSchema.safeParse(input);
  if (!result.success) throw new MoneyRuleError(result.error.issues[0]?.message ?? 'Check the expense.');
  return result.data;
}

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

/** How the expense is split (3D-2), for the edit rules and the amount-change warning. */
export async function expenseSplitFacts(db: SQLiteDatabase, expenseId: string) {
  return splitFactsFrom(await db.getFirstAsync(SELECT_SPLIT_FACTS, { $itemId: null, $expenseId: expenseId }));
}

/**
 * A split expense keeps its currency while split by amounts, and is not linked to a booking —
 * a payment for a booking is split with the booking (3D-2).
 */
async function checkSplit(db: SQLiteDatabase, saved: Expense, input: ExpenseInput): Promise<void> {
  const split = await expenseSplitFacts(db, saved.id);
  if (split.mode === null) return;
  if (input.tripItemId !== null && saved.tripItemId === null) {
    throw new MoneyRuleError(
      `This expense is split between ${split.people} ${split.people === 1 ? 'person' : 'people'}. A payment for a booking is split with the booking — remove this split first.`,
    );
  }
  const refusal = expenseSplitEditRefusal(saved, input, split);
  if (refusal) throw new MoneyRuleError(refusal);
}

/**
 * The expense and its receipts in one transaction: either all of it is saved or none. The
 * receipt files are already copied in, so a failed save leaves only orphans the sweep collects.
 */
export async function createExpense(
  db: SQLiteDatabase,
  tripId: string,
  raw: ExpenseInput,
  receipts: readonly ResourceInput[] = [],
): Promise<string> {
  const input = validInput(raw);
  const id = randomUUID();
  await db.withTransactionAsync(async () => {
    await checkLink(db, tripId, input);
    await checkPayer(db, tripId, input.payerId);
    const before = await moneyBefore(db, tripId);
    await db.runAsync(INSERT_EXPENSE, { $id: id, $tripId: tripId, ...bindings(input) });
    for (const receipt of receipts) {
      await createResource(db, { scope: 'expense', id }, receipt);
    }
    await afterMoneyWrite(db, tripId, before);
  });
  return id;
}

/** A new currency or a link takes it out of its currency's balances: `acceptSettlementReview` (§15). */
export async function updateExpense(
  db: SQLiteDatabase,
  id: string,
  raw: ExpenseInput,
  options: MoneyWriteOptions = {},
): Promise<void> {
  const input = validInput(raw);
  await db.withTransactionAsync(async () => {
    const saved = await getExpense(db, id);
    const before = saved ? await moneyBefore(db, saved.tripId) : null;
    if (saved) {
      await checkLink(db, saved.tripId, input);
      await checkPayer(db, saved.tripId, input.payerId, saved.payerId);
      await checkSplit(db, saved, input);
    }
    await db.runAsync(UPDATE_EXPENSE, { $id: id, ...bindings(input) });
    if (saved) await afterMoneyWrite(db, saved.tripId, before, options);
  });
}

/** Receipt rows and its split cascade. Their files are reclaimed by the start-up sweep, not here. */
export async function deleteExpense(db: SQLiteDatabase, id: string, options: MoneyWriteOptions = {}): Promise<void> {
  await db.withTransactionAsync(async () => {
    const saved = await getExpense(db, id);
    const before = saved ? await moneyBefore(db, saved.tripId) : null;
    await db.runAsync(DELETE_EXPENSE, { $id: id });
    if (saved) await afterMoneyWrite(db, saved.tripId, before, options);
  });
}
