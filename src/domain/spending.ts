/**
 * Spending entered during a trip (N5): a taxi, groceries, a souvenir. Not a TripItem — it has no
 * time, no place on the timeline and no reminder; it is money and a receipt.
 *
 * Money stays in minor units and in its own currency. A converted total is worked out on demand
 * (`conversion.ts`, Phase 4); nothing stored is ever converted.
 */

import { z } from 'zod';

import { chargedFromRow, chargedRefusal, chargedSchema, type Charged } from './conversion';
import { DEFAULT_CURRENCY } from './tripItem';

export const EXPENSE_CATEGORIES = [
  'food',
  'groceries',
  'transport',
  'activities',
  'shopping',
  'accommodation',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food & drink',
  groceries: 'Groceries',
  transport: 'Transport',
  activities: 'Activities',
  shopping: 'Shopping & souvenirs',
  accommodation: 'Accommodation',
  other: 'Other',
};

export function categoryLabel(category: ExpenseCategory): string {
  return CATEGORY_LABELS[category];
}

export type Expense = {
  id: string;
  tripId: string;
  category: ExpenseCategory;
  label: string | null;
  /** Minor units, always positive. */
  amount: number;
  currency: string;
  /** Local date, YYYY-MM-DD. */
  spentOn: string;
  notes: string | null;
  /**
   * The booking this expense pays for (3D-1): then it is a payment towards that booking, never
   * spending of its own. Null: standalone spending — every expense from before 3D-1.
   */
  tripItemId: string | null;
  /** Who paid; null: not recorded. The legacy text column `paid_by` is never read. */
  payerId: string | null;
  /** What it really cost in another currency (Phase 4): locked, never re-estimated. */
  charged: Charged | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseRow = {
  id: string;
  trip_id: string;
  category: string;
  label: string | null;
  amount: number;
  currency: string;
  spent_on: string;
  notes: string | null;
  trip_item_id: string | null;
  payer_id: string | null;
  // Migration 012; absent from rows built before it.
  charged_amount?: number | null;
  charged_currency?: string | null;
  created_at: string;
  updated_at: string;
};

export function parseExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    // The column's CHECK allows only these.
    category: row.category as ExpenseCategory,
    label: row.label,
    amount: row.amount,
    currency: row.currency,
    spentOn: row.spent_on,
    notes: row.notes,
    tripItemId: row.trip_item_id,
    payerId: row.payer_id,
    charged: chargedFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Empty text means "not given", so it is stored as NULL rather than ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const expenseInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { message: 'Pick a category' }),
  label: optionalText(120),
  amount: z
    .number({
      error: (issue) => (issue.input === undefined ? 'Enter the amount' : 'Enter an amount like 12.50'),
    })
    .int()
    .positive('Enter an amount above zero'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Three letters, like EUR'),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  notes: optionalText(2000),
  // 3D-1. Absent in the quick sheet: not recorded, and standalone.
  payerId: z.string().min(1).nullable().default(null),
  tripItemId: z.string().min(1).nullable().default(null),
  // Phase 4. Absent: an edit keeps what is saved; null clears it.
  charged: chargedSchema.optional(),
}).refine((input) => !chargedRefusal(input.currency, input.charged), {
  message: 'The charged amount must be in another currency than the expense.',
  path: ['charged'],
});

export type ExpenseInput = z.output<typeof expenseInputSchema>;
export type ExpenseFormValues = z.input<typeof expenseInputSchema>;

export function expenseFormValues(expense: Expense): ExpenseFormValues {
  return {
    category: expense.category,
    label: expense.label ?? undefined,
    amount: expense.amount,
    currency: expense.currency,
    spentOn: expense.spentOn,
    notes: expense.notes ?? undefined,
    payerId: expense.payerId,
    tripItemId: expense.tripItemId,
    charged: expense.charged,
  };
}

/** What a row is called: its label, or its category when it has none. */
export function expenseTitle(expense: Pick<Expense, 'label' | 'category'>): string {
  return expense.label ?? categoryLabel(expense.category);
}

/**
 * The currency a new expense starts in: the one last entered on this trip — abroad, the next
 * expense is nearly always in the same currency as the previous one — else EUR.
 */
export function nextCurrency(expenses: readonly Pick<Expense, 'currency' | 'createdAt'>[]): string {
  let latest: Pick<Expense, 'currency' | 'createdAt'> | undefined;
  for (const expense of expenses) {
    if (!latest || expense.createdAt > latest.createdAt) latest = expense;
  }
  return latest?.currency ?? DEFAULT_CURRENCY;
}

export type ExpenseDay<T> = { day: string; expenses: T[] };

/** Newest day first; within a day, the latest entered first — the order they happened in reverse. */
export function expensesByDay<T extends Pick<Expense, 'spentOn' | 'createdAt'>>(
  expenses: readonly T[],
): ExpenseDay<T>[] {
  const sorted = [...expenses].sort(
    (a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt),
  );

  const days: ExpenseDay<T>[] = [];
  for (const expense of sorted) {
    const last = days[days.length - 1];
    if (last?.day === expense.spentOn) last.expenses.push(expense);
    else days.push({ day: expense.spentOn, expenses: [expense] });
  }
  return days;
}

export type CategoryTotal = { category: ExpenseCategory; total: number };
export type SpendingTotal = { currency: string; total: number; categories: CategoryTotal[] };

/** Spending of its own: an expense that pays for a booking is part of that booking instead. */
export function isStandalone(expense: Partial<Pick<Expense, 'tripItemId'>>): boolean {
  return (expense.tripItemId ?? null) === null;
}

/**
 * One line per currency, the largest first, each broken down by category, the largest first.
 * Standalone expenses only: a linked one is paid towards its booking, whose price already counts.
 */
export function spendingTotals(
  expenses: readonly (Pick<Expense, 'category' | 'amount' | 'currency'> &
    Partial<Pick<Expense, 'tripItemId'>>)[],
): SpendingTotal[] {
  const byCurrency = new Map<string, Map<ExpenseCategory, number>>();

  for (const { currency, category, amount } of expenses.filter(isStandalone)) {
    const categories = byCurrency.get(currency) ?? new Map<ExpenseCategory, number>();
    categories.set(category, (categories.get(category) ?? 0) + amount);
    byCurrency.set(currency, categories);
  }

  const lines = [...byCurrency.entries()].map(([currency, categories]) => {
    const list = [...categories.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
    return { currency, total: list.reduce((sum, c) => sum + c.total, 0), categories: list };
  });

  return lines.sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
}

export type TripTotal = { currency: string; bookings: number; spending: number; total: number };

/**
 * What the whole trip costs, per currency: booked items (`tripExpenses`) plus spending. The two
 * parts stay apart in the result so the screen can show where the money went.
 */
export function tripTotals(
  bookings: readonly { currency: string; total: number }[],
  spending: readonly { currency: string; total: number }[],
): TripTotal[] {
  const byCurrency = new Map<string, TripTotal>();
  const lineFor = (currency: string) => {
    let line = byCurrency.get(currency);
    if (!line) {
      line = { currency, bookings: 0, spending: 0, total: 0 };
      byCurrency.set(currency, line);
    }
    return line;
  };

  for (const { currency, total } of bookings) lineFor(currency).bookings += total;
  for (const { currency, total } of spending) lineFor(currency).spending += total;
  for (const line of byCurrency.values()) line.total = line.bookings + line.spending;

  return [...byCurrency.values()].sort(
    (a, b) => b.total - a.total || a.currency.localeCompare(b.currency),
  );
}
