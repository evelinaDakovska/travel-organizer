import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  expenseFormValues,
  expenseInputSchema,
  expensesByDay,
  expenseTitle,
  nextCurrency,
  parseExpenseRow,
  spendingTotals,
  tripTotals,
  type Expense,
} from './spending';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  tripId: 't1',
  category: 'food',
  label: null,
  amount: 1250,
  currency: 'EUR',
  spentOn: '2026-11-02',
  notes: null,
  createdAt: '2026-11-02T12:00:00.000Z',
  updatedAt: '2026-11-02T12:00:00.000Z',
  ...over,
});

const valid = {
  category: 'groceries',
  amount: 2345,
  currency: 'EUR',
  spentOn: '2026-11-02',
};

describe('categories', () => {
  it('has a label for every category', () => {
    for (const category of EXPENSE_CATEGORIES) expect(categoryLabel(category)).not.toBe('');
  });
});

describe('expenseInputSchema', () => {
  it('accepts the least an expense needs', () => {
    expect(expenseInputSchema.parse(valid)).toEqual({
      ...valid,
      label: undefined,
      notes: undefined,
    });
  });

  it('treats empty and blank text as not given', () => {
    const parsed = expenseInputSchema.parse({ ...valid, label: '  ', notes: '' });
    expect(parsed.label).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });

  it('trims what was typed', () => {
    expect(expenseInputSchema.parse({ ...valid, label: ' Taxi ' }).label).toBe('Taxi');
  });

  it.each([
    ['no amount', { amount: undefined }, 'amount'],
    ['a zero amount', { amount: 0 }, 'amount'],
    ['a negative amount', { amount: -100 }, 'amount'],
    ['a fraction of a cent', { amount: 12.5 }, 'amount'],
    ['an amount that could not be read', { amount: Number.NaN }, 'amount'],
    ['an unknown category', { category: 'fun' }, 'category'],
    ['a lowercase currency', { currency: 'eur' }, 'currency'],
    ['a currency that is not three letters', { currency: 'EURO' }, 'currency'],
    ['a date that is not a date', { spentOn: 'today' }, 'spentOn'],
  ])('refuses %s', (_name, change, field) => {
    const result = expenseInputSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });

  it('tells a missing amount from one that could not be read (FB-2)', () => {
    const message = (amount: number | undefined) =>
      expenseInputSchema.safeParse({ ...valid, amount }).error?.issues[0].message;
    expect(message(undefined)).toBe('Enter the amount');
    expect(message(Number.NaN)).toBe('Enter an amount like 12.50');
  });
});

describe('rows and form values', () => {
  it('reads a row into an expense', () => {
    expect(
      parseExpenseRow({
        id: 'e1',
        trip_id: 't1',
        category: 'food',
        label: null,
        amount: 1250,
        currency: 'EUR',
        spent_on: '2026-11-02',
        notes: null,
        created_at: '2026-11-02T12:00:00.000Z',
        updated_at: '2026-11-02T12:00:00.000Z',
      }),
    ).toEqual(expense());
  });

  it('round-trips an expense through the form unchanged', () => {
    const saved = expense({ label: 'Taxi', notes: 'To the hotel', category: 'transport' });
    expect(expenseInputSchema.parse(expenseFormValues(saved))).toEqual({
      category: 'transport',
      label: 'Taxi',
      amount: 1250,
      currency: 'EUR',
      spentOn: '2026-11-02',
      notes: 'To the hotel',
    });
  });
});

describe('expenseTitle', () => {
  it('is the label, or the category when there is none', () => {
    expect(expenseTitle(expense({ label: 'Taxi' }))).toBe('Taxi');
    expect(expenseTitle(expense({ category: 'groceries' }))).toBe('Groceries');
  });
});

describe('nextCurrency', () => {
  it('is EUR on a trip with no expenses yet', () => {
    expect(nextCurrency([])).toBe('EUR');
  });

  it('is the currency of the expense entered last, whatever its date', () => {
    expect(
      nextCurrency([
        expense({ currency: 'HUF', createdAt: '2026-11-03T10:00:00.000Z', spentOn: '2026-11-01' }),
        expense({ currency: 'EUR', createdAt: '2026-11-01T10:00:00.000Z', spentOn: '2026-11-05' }),
      ]),
    ).toBe('HUF');
  });
});

describe('expensesByDay', () => {
  it('puts the newest day first, and the latest entered first within a day', () => {
    const a = expense({ id: 'a', spentOn: '2026-11-01', createdAt: '2026-11-01T09:00:00.000Z' });
    const b = expense({ id: 'b', spentOn: '2026-11-02', createdAt: '2026-11-02T09:00:00.000Z' });
    const c = expense({ id: 'c', spentOn: '2026-11-02', createdAt: '2026-11-02T18:00:00.000Z' });

    expect(expensesByDay([a, b, c])).toEqual([
      { day: '2026-11-02', expenses: [c, b] },
      { day: '2026-11-01', expenses: [a] },
    ]);
  });

  it('is empty with nothing to group', () => {
    expect(expensesByDay([])).toEqual([]);
  });
});

describe('spendingTotals', () => {
  it('totals each currency on its own, broken down by category, the largest first', () => {
    expect(
      spendingTotals([
        expense({ category: 'food', amount: 1000 }),
        expense({ category: 'transport', amount: 3000 }),
        expense({ category: 'food', amount: 500 }),
        expense({ category: 'shopping', amount: 9000, currency: 'HUF' }),
      ]),
    ).toEqual([
      { currency: 'HUF', total: 9000, categories: [{ category: 'shopping', total: 9000 }] },
      {
        currency: 'EUR',
        total: 4500,
        categories: [
          { category: 'transport', total: 3000 },
          { category: 'food', total: 1500 },
        ],
      },
    ]);
  });

  it('is empty with no expenses', () => {
    expect(spendingTotals([])).toEqual([]);
  });
});

describe('tripTotals', () => {
  it('adds bookings and spending per currency, keeping both parts', () => {
    expect(
      tripTotals(
        [{ currency: 'EUR', total: 168000 }],
        [
          { currency: 'EUR', total: 4500 },
          { currency: 'HUF', total: 900000 },
        ],
      ),
    ).toEqual([
      { currency: 'HUF', bookings: 0, spending: 900000, total: 900000 },
      { currency: 'EUR', bookings: 168000, spending: 4500, total: 172500 },
    ]);
  });

  it('is empty when nothing costs anything', () => {
    expect(tripTotals([], [])).toEqual([]);
  });
});
