/**
 * Balances and settlements (3E, `docs/phase3e-plan.md`). Who paid, who bears, who settled, and
 * the net — worked out from the records every time, never stored (invariant J).
 *
 * Only a cost whose money story is complete enters a net (§3): it counts as spent, it is split,
 * the split adds up, every child's share is covered, everything paid on it has a payer, and what
 * was paid is exactly the cost. Every other cost waits, named, with what is recorded on it (§5).
 * Nothing here guesses a payer, a share, a payment or an exchange rate.
 *
 * A settlement is money one traveller gave another. It is never a cost, so it never touches the
 * trip total, a booking's paid state or spending — only the nets. Suggested transfers are made per
 * currency, and only where nothing waits but costs left unsplit (§12.1), at least one cost is
 * complete (B) and no child is below zero (E).
 */

import { z } from 'zod';

import { countsAsSpent, refundableOf } from './bookingCosts';
import { coverOf, shareAmounts, splitEqually, type CostShare, type Member, type TripCover } from './costShares';
import type { BookingPayment } from './bookingPayments';
import { formatMoney } from './format';
import { expenseTitle, type Expense } from './spending';
import { isValidLocal } from './time';
import type { TripItem } from './tripItem';

// ─── Settlements ─────────────────────────────────────────────────────────────────────────────────

export type Settlement = {
  id: string;
  tripId: string;
  fromId: string;
  toId: string;
  /** Minor units, always positive. */
  amount: number;
  currency: string;
  /** Local date, YYYY-MM-DD; null when nobody said. */
  settledOn: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementRow = {
  id: string;
  trip_id: string;
  from_id: string;
  to_id: string;
  amount: number;
  currency: string;
  settled_on: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export function parseSettlementRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromId: row.from_id,
    toId: row.to_id,
    amount: row.amount,
    currency: row.currency,
    settledOn: row.settled_on,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The form's schema, and the repository's again before every write: whatever reaches the database
 * passed it, typed or not.
 */
export const settlementInputSchema = z.object({
  fromId: z.string().min(1, 'Pick who paid'),
  toId: z.string().min(1, 'Pick who received it'),
  amount: z
    .number({
      error: (issue) => (issue.input === undefined ? 'Enter the amount' : 'Enter an amount like 12.50'),
    })
    .int()
    .positive('Enter an amount above zero'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter code like EUR'),
  settledOn: z
    .string()
    .refine((value) => isValidLocal(value, 'date'), 'Pick a date')
    .nullable(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type SettlementInput = z.output<typeof settlementInputSchema>;
export type SettlementFormValues = z.input<typeof settlementInputSchema>;

// ─── Costs, as balances read them ────────────────────────────────────────────────────────────────

/** Money handed to a vendor for one cost: a booking payment, a linked expense, or the expense itself. */
export type PaidRecord = {
  payerId: string | null;
  amount: number;
  /** What to open: a booking payment, else an expense. */
  paymentId: string | null;
  expenseId: string | null;
};

export type BalanceCost = {
  kind: 'booking' | 'expense';
  /** The booking's or the standalone expense's id. */
  id: string;
  title: string;
  currency: string;
  /** The price, or the expense's amount. Minor units. */
  amount: number;
  /** Counts as money spent (`countsAsSpent`); a standalone expense always does. */
  counts: boolean;
  /** A booking's status; null for a standalone expense. Part of the fingerprint only. */
  status: TripItem['status'] | null;
  /** A cancellation that is not spent: why. Null for anything else. */
  cancelled: 'refundExpected' | 'refundNotSet' | null;
  /** The legacy *Paid* switch: fully paid, whatever is recorded. */
  isPaid: boolean;
  records: PaidRecord[];
  shares: Pick<CostShare, 'travellerId' | 'amount' | 'coveredBy' | 'sortOrder'>[];
};

// ─── Unsplit costs kept outside (review P1, §14.2) ───────────────────────────────────────────────

/** Someone reviewed this unsplit cost and keeps it outside the shared balances, as it was then. */
export type UnsplitConfirmation = {
  costKind: BalanceCost['kind'];
  costId: string;
  /** `costFingerprint` when it was confirmed: it applies only while the cost still reads so. */
  fingerprint: string;
};

export type UnsplitConfirmationRow = {
  id: string;
  trip_id: string;
  trip_item_id: string | null;
  expense_id: string | null;
  fingerprint: string;
  confirmed_at: string;
};

export function parseUnsplitConfirmationRow(row: UnsplitConfirmationRow): UnsplitConfirmation {
  return row.trip_item_id !== null
    ? { costKind: 'booking', costId: row.trip_item_id, fingerprint: row.fingerprint }
    : { costKind: 'expense', costId: row.expense_id!, fingerprint: row.fingerprint };
}

type Fingerprint = {
  v: 1;
  kind: BalanceCost['kind'];
  currency: string;
  amount: number;
  counts: boolean;
  status: BalanceCost['status'];
  cancelled: BalanceCost['cancelled'];
  isPaid: boolean;
  /** [a payment or a linked expense, payer, amount] — never a record's id, so a remap keeps it. */
  records: ['payment' | 'expense', string | null, number][];
  /** [traveller, amount, covered by, order]. */
  shares: [string, number | null, string | null, number][];
};

const byJson = (a: unknown, b: unknown) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

function canonical(fingerprint: Fingerprint): string {
  return JSON.stringify({
    v: fingerprint.v,
    kind: fingerprint.kind,
    currency: fingerprint.currency,
    amount: fingerprint.amount,
    counts: fingerprint.counts,
    status: fingerprint.status,
    cancelled: fingerprint.cancelled,
    isPaid: fingerprint.isPaid,
    records: [...fingerprint.records].sort(byJson),
    shares: [...fingerprint.shares].sort(byJson),
  });
}

/**
 * Everything about a cost that balances read, as one deterministic string: what it costs and in
 * which currency, its status, whether it is spent, cancelled or marked *Paid*, who paid what towards it, and how
 * it is split. A title, a note, a date or a category is not in it, and neither is any record's id.
 */
export function costFingerprint(cost: BalanceCost): string {
  return canonical({
    v: 1,
    kind: cost.kind,
    currency: cost.currency,
    amount: cost.amount,
    counts: cost.counts,
    status: cost.status,
    cancelled: cost.cancelled,
    isPaid: cost.isPaid,
    records: cost.records.map((record) => [
      record.paymentId !== null ? 'payment' : 'expense',
      record.payerId,
      record.amount,
    ]),
    shares: cost.shares.map((share) => [share.travellerId, share.amount, share.coveredBy, share.sortOrder]),
  });
}

/**
 * The same fingerprint with its travellers renamed, for a trip archive imported under new ids.
 * Anything that is not a fingerprint comes back as it was: it matches no cost, so it confirms
 * nothing.
 */
export function remapFingerprint(fingerprint: string, travellerId: (id: string) => string): string {
  let parsed: Fingerprint;
  try {
    parsed = JSON.parse(fingerprint) as Fingerprint;
  } catch {
    return fingerprint;
  }
  if (parsed?.v !== 1 || !Array.isArray(parsed.records) || !Array.isArray(parsed.shares)) return fingerprint;
  return canonical({
    ...parsed,
    records: parsed.records.map(([what, payerId, amount]) => [
      what,
      payerId === null ? null : travellerId(payerId),
      amount,
    ]),
    shares: parsed.shares.map(([id, amount, coveredBy, sortOrder]) => [
      travellerId(id),
      amount,
      coveredBy === null ? null : travellerId(coveredBy),
      sortOrder,
    ]),
  });
}

/** Confirmed, and the cost still reads exactly as it did then. Never a split cost. */
export function isKeptOutside(cost: BalanceCost, confirmations: readonly UnsplitConfirmation[]): boolean {
  if (cost.shares.length > 0) return false;
  const confirmation = confirmations.find((c) => c.costKind === cost.kind && c.costId === cost.id);
  return confirmation !== undefined && confirmation.fingerprint === costFingerprint(cost);
}

type CostItem = Pick<
  TripItem,
  'id' | 'kind' | 'title' | 'status' | 'priceAmount' | 'priceCurrency' | 'isPaid' | 'details'
>;

/**
 * Every cost of a trip that balances could read: bookings with a price (ideas and to-dos are
 * not costs) and standalone expenses. An expense that pays for a booking is one of that booking's
 * records, never a cost of its own (3D-1, L-4).
 */
export function balanceCosts(input: {
  items: readonly CostItem[];
  expenses: readonly Expense[];
  payments: readonly BookingPayment[];
  shares: readonly CostShare[];
}): BalanceCost[] {
  const recordsByItem = new Map<string, PaidRecord[]>();
  const add = (itemId: string, record: PaidRecord) =>
    recordsByItem.set(itemId, [...(recordsByItem.get(itemId) ?? []), record]);
  for (const payment of input.payments) {
    add(payment.tripItemId, {
      payerId: payment.payerId,
      amount: payment.amount,
      paymentId: payment.id,
      expenseId: null,
    });
  }
  for (const expense of input.expenses) {
    if (expense.tripItemId !== null) {
      add(expense.tripItemId, {
        payerId: expense.payerId,
        amount: expense.amount,
        paymentId: null,
        expenseId: expense.id,
      });
    }
  }
  const sharesOf = (owner: (share: CostShare) => boolean) =>
    input.shares.filter(owner).map(({ travellerId, amount, coveredBy, sortOrder }) => ({
      travellerId,
      amount,
      coveredBy,
      sortOrder,
    }));

  const costs: BalanceCost[] = [];
  for (const item of input.items) {
    if (item.kind === 'task' || item.status === 'idea') continue;
    if (item.priceAmount === null || item.priceAmount <= 0 || item.priceCurrency === null) continue;
    const counts = countsAsSpent(item);
    const refundable = refundableOf(item.details);
    costs.push({
      kind: 'booking',
      id: item.id,
      title: item.title,
      currency: item.priceCurrency,
      amount: item.priceAmount,
      counts,
      status: item.status,
      cancelled:
        counts || item.status !== 'cancelled'
          ? null
          : refundable === null
            ? 'refundNotSet'
            : 'refundExpected',
      isPaid: item.isPaid,
      records: recordsByItem.get(item.id) ?? [],
      shares: sharesOf((share) => share.tripItemId === item.id),
    });
  }
  for (const expense of input.expenses) {
    if (expense.tripItemId !== null) continue;
    costs.push({
      kind: 'expense',
      id: expense.id,
      title: expenseTitle(expense),
      currency: expense.currency,
      amount: expense.amount,
      counts: true,
      status: null,
      cancelled: null,
      isPaid: false,
      records: [{ payerId: expense.payerId, amount: expense.amount, paymentId: null, expenseId: expense.id }],
      shares: sharesOf((share) => share.expenseId === expense.id),
    });
  }
  return costs;
}

// ─── Eligibility ─────────────────────────────────────────────────────────────────────────────────

/** Why a cost is not in the balances, in the order §5 checks them. */
export type WaitReason =
  | { kind: 'cancelled'; refund: 'refundExpected' | 'refundNotSet' }
  | { kind: 'notSplit' }
  | { kind: 'splitMismatch'; allocated: number }
  | { kind: 'notCovered'; childIds: string[] }
  | { kind: 'payerMissing'; amount: number }
  | { kind: 'paidNotRecorded'; amount: number }
  | { kind: 'toPay'; amount: number }
  | { kind: 'overpaid'; amount: number };

type Classify = (travellerId: string) => Member['classification'] | undefined;

/** Null: the cost enters the balances. Otherwise the first reason it waits. */
export function waitReason(cost: BalanceCost, classificationOf: Classify, tripCover: readonly TripCover[]): WaitReason | null {
  if (cost.cancelled !== null) return { kind: 'cancelled', refund: cost.cancelled };
  if (cost.shares.length === 0) return { kind: 'notSplit' };
  const split = shareAmounts(cost.amount, cost.shares);
  if (split.unallocated !== 0) return { kind: 'splitMismatch', allocated: cost.amount - split.unallocated };
  const notCovered = cost.shares
    .filter((share) => coverOf(share, classificationOf, tripCover).kind === 'notCovered')
    .map((share) => share.travellerId);
  if (notCovered.length > 0) return { kind: 'notCovered', childIds: notCovered };
  const unknown = cost.records.filter((record) => record.payerId === null);
  if (unknown.length > 0) {
    return { kind: 'payerMissing', amount: unknown.reduce((sum, record) => sum + record.amount, 0) };
  }
  const recorded = cost.records.reduce((sum, record) => sum + record.amount, 0);
  if (recorded > cost.amount) return { kind: 'overpaid', amount: recorded - cost.amount };
  if (recorded < cost.amount) {
    return cost.isPaid
      ? { kind: 'paidNotRecorded', amount: cost.amount - recorded }
      : { kind: 'toPay', amount: cost.amount - recorded };
  }
  return null;
}

/** Who bears each part of a complete cost: own shares, and a child's share by those covering it. */
function borneBy(cost: BalanceCost, classificationOf: Classify, tripCover: readonly TripCover[]) {
  const ordered = [...cost.shares].sort((a, b) => a.sortOrder - b.sortOrder);
  const amounts = shareAmounts(cost.amount, ordered).shares;
  const parts: { bearerId: string; amount: number; forChildId: string | null }[] = [];
  ordered.forEach((share, i) => {
    const amount = amounts[i].amount;
    const cover = coverOf(share, classificationOf, tripCover);
    if (cover.kind === 'covered') {
      splitEqually(amount, cover.adultIds.length).forEach((part, j) =>
        parts.push({ bearerId: cover.adultIds[j], amount: part, forChildId: share.travellerId }),
      );
    } else {
      parts.push({ bearerId: share.travellerId, amount, forChildId: null });
    }
  });
  return parts;
}

// ─── Balances ────────────────────────────────────────────────────────────────────────────────────

export type PersonBalance = {
  travellerId: string;
  /** Paid to vendors on costs in the balances. */
  paid: number;
  /** Own shares, and the children's shares they cover. */
  borne: number;
  sent: number;
  received: number;
  /** paid − borne + sent − received. Positive: is owed. */
  net: number;
  /** Paid on costs not in the balances yet: shown, never in `net` (A). */
  paidWaiting: number;
};

export type WaitingCost = { cost: BalanceCost; reason: WaitReason };

export type Transfer = { fromId: string; toId: string; amount: number };

/**
 * `final`: only complete costs (and any left unsplit). `soFar`: a cost could be shared but is not
 * complete — the nets are not final and nothing is suggested (§12.1). `review`: it would be final,
 * but the currency has settlements and an unsplit cost nobody has reviewed — a settlement may have
 * paid for it while it was split (§14.2); read like `soFar`. `settlementsOnly`: no cost at all that
 * could be shared, only settlements (B). `nothing`: nothing to settle yet.
 */
export type BalanceState = 'final' | 'soFar' | 'review' | 'settlementsOnly' | 'nothing';

export type CurrencyBalances = {
  currency: string;
  state: BalanceState;
  /** Everyone with anything in this currency, in the trip's member order. */
  people: PersonBalance[];
  complete: BalanceCost[];
  /** Waiting for a reason other than *not split*: blocks suggestions. */
  waiting: WaitingCost[];
  /** Left unsplit: outside the balances, shown collapsed; never blocks (Q2) unless to review. */
  notSplit: BalanceCost[];
  /** Unsplit, unconfirmed, in a currency with settlements: holds suggestions back (§14.2). */
  toReview: BalanceCost[];
  /** Unsplit and confirmed as it stands: kept outside on purpose. */
  keptOutside: BalanceCost[];
  settlements: Settlement[];
  /** Children whose net is below zero after later edits (E): flagged, never shown as owing. */
  childrenBelowZero: string[];
  /** Empty unless `heldBecause` is null. */
  transfers: Transfer[];
  heldBecause: 'waiting' | 'review' | 'settlementsOnly' | 'child' | 'nothing' | null;
};

export type BalanceInput = {
  members: readonly Member[];
  tripCover: readonly TripCover[];
  costs: readonly BalanceCost[];
  settlements: readonly Settlement[];
  /** Unsplit costs kept outside; none when left out. */
  confirmations?: readonly UnsplitConfirmation[];
};

/** The trip's balances, one entry per currency, in order of first appearance among the costs. */
export function tripBalances(input: BalanceInput): CurrencyBalances[] {
  const classOf = new Map(input.members.map((member) => [member.id, member.classification]));
  const classificationOf: Classify = (id) => classOf.get(id);
  const order = new Map(input.members.map((member, i) => [member.id, i]));

  const currencies: string[] = [];
  const note = (currency: string) => {
    if (!currencies.includes(currency)) currencies.push(currency);
  };
  for (const cost of input.costs) if (cost.counts || cost.records.length > 0) note(cost.currency);
  for (const settlement of input.settlements) note(settlement.currency);

  return currencies.map((currency) => {
    const people = new Map<string, PersonBalance>();
    const person = (id: string) => {
      let row = people.get(id);
      if (!row) {
        row = { travellerId: id, paid: 0, borne: 0, sent: 0, received: 0, net: 0, paidWaiting: 0 };
        people.set(id, row);
      }
      return row;
    };

    const complete: BalanceCost[] = [];
    const waiting: WaitingCost[] = [];
    const notSplit: BalanceCost[] = [];
    for (const cost of input.costs) {
      if (cost.currency !== currency) continue;
      // A cancellation that is not spent and has nothing recorded is simply not money (R10 names it).
      if (!cost.counts && cost.records.length === 0) continue;
      const reason = waitReason(cost, classificationOf, input.tripCover);
      if (reason === null) {
        complete.push(cost);
        for (const record of cost.records) person(record.payerId!).paid += record.amount;
        for (const part of borneBy(cost, classificationOf, input.tripCover)) person(part.bearerId).borne += part.amount;
        continue;
      }
      if (reason.kind === 'notSplit') notSplit.push(cost);
      else waiting.push({ cost, reason });
      for (const record of cost.records) {
        if (record.payerId !== null) person(record.payerId).paidWaiting += record.amount;
      }
    }

    const settlements = input.settlements.filter((settlement) => settlement.currency === currency);
    for (const settlement of settlements) {
      person(settlement.fromId).sent += settlement.amount;
      person(settlement.toId).received += settlement.amount;
    }

    const rows = [...people.values()]
      .map((row) => ({ ...row, net: row.paid - row.borne + row.sent - row.received }))
      .sort((a, b) => (order.get(a.travellerId) ?? Infinity) - (order.get(b.travellerId) ?? Infinity));

    const confirmations = input.confirmations ?? [];
    const keptOutside = notSplit.filter((cost) => isKeptOutside(cost, confirmations));
    const toReview = settlements.length > 0 ? notSplit.filter((cost) => !keptOutside.includes(cost)) : [];

    const state: BalanceState =
      waiting.length > 0
        ? 'soFar'
        : complete.length > 0
          ? toReview.length > 0
            ? 'review'
            : 'final'
          : settlements.length > 0
            ? 'settlementsOnly'
            : 'nothing';
    const childrenBelowZero = rows
      .filter((row) => row.net < 0 && classificationOf(row.travellerId) === 'child')
      .map((row) => row.travellerId);
    const heldBecause =
      state === 'soFar'
        ? ('waiting' as const)
        : state === 'review'
          ? ('review' as const)
          : state === 'settlementsOnly'
            ? ('settlementsOnly' as const)
            : state === 'nothing'
              ? ('nothing' as const)
              : childrenBelowZero.length > 0
                ? ('child' as const)
                : null;

    return {
      currency,
      state,
      people: rows,
      complete,
      waiting,
      notSplit,
      toReview,
      keptOutside,
      settlements,
      childrenBelowZero,
      transfers: heldBecause === null ? settleUp(rows) : [],
      heldBecause,
    };
  });
}

/**
 * Who pays whom so every net is zero: the largest debtor pays the largest creditor, again and
 * again. At most (people with a net) − 1 transfers — few, not always the fewest. Ties go by the
 * order given (the trip's members), so the result never changes between two reads.
 */
export function settleUp(people: readonly Pick<PersonBalance, 'travellerId' | 'net'>[]): Transfer[] {
  const debtors = people.filter((p) => p.net < 0).map((p) => ({ id: p.travellerId, left: -p.net }));
  const creditors = people.filter((p) => p.net > 0).map((p) => ({ id: p.travellerId, left: p.net }));
  const largest = (rows: { left: number }[]) =>
    rows.reduce((best, row, i) => (row.left > rows[best].left ? i : best), 0);
  const transfers: Transfer[] = [];
  while (debtors.some((d) => d.left > 0) && creditors.some((c) => c.left > 0)) {
    const debtor = debtors[largest(debtors)];
    const creditor = creditors[largest(creditors)];
    const amount = Math.min(debtor.left, creditor.left);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amount });
    debtor.left -= amount;
    creditor.left -= amount;
  }
  return transfers;
}

// ─── One person's working ────────────────────────────────────────────────────────────────────────

export type ExplanationLine = {
  title: string;
  amount: number;
  /** For a share: the child's id when this is a child's share they cover. */
  forChildId: string | null;
  kind: 'booking' | 'expense' | 'settlement';
  /** What to open. */
  id: string;
  paymentId: string | null;
  expenseId: string | null;
};

export type Explanation = {
  paid: ExplanationLine[];
  shares: ExplanationLine[];
  sent: ExplanationLine[];
  received: ExplanationLine[];
  /** Paid on costs not in the balances yet: never part of the net (A). */
  paidWaiting: ExplanationLine[];
  balance: PersonBalance;
};

/** Every line behind one person's balance in one currency, so the sum can be checked by hand. */
export function explainBalance(input: BalanceInput, travellerId: string, currency: string, nameOf: (id: string) => string): Explanation | null {
  const balances = tripBalances(input).find((entry) => entry.currency === currency);
  const balance = balances?.people.find((row) => row.travellerId === travellerId);
  if (!balances || !balance) return null;
  const classOf = new Map(input.members.map((member) => [member.id, member.classification]));
  const classificationOf: Classify = (id) => classOf.get(id);

  const line = (cost: BalanceCost, amount: number, extra: Partial<ExplanationLine> = {}): ExplanationLine => ({
    title: cost.title,
    amount,
    forChildId: null,
    kind: cost.kind,
    id: cost.id,
    paymentId: null,
    expenseId: cost.kind === 'expense' ? cost.id : null,
    ...extra,
  });
  const paidLines = (cost: BalanceCost) =>
    cost.records
      .filter((record) => record.payerId === travellerId)
      .map((record) => line(cost, record.amount, { paymentId: record.paymentId, expenseId: record.expenseId }));

  const shares: ExplanationLine[] = [];
  for (const cost of balances.complete) {
    for (const part of borneBy(cost, classificationOf, input.tripCover)) {
      if (part.bearerId === travellerId) shares.push(line(cost, part.amount, { forChildId: part.forChildId }));
    }
  }
  const settlementLine = (settlement: Settlement, other: string): ExplanationLine => ({
    title: nameOf(other),
    amount: settlement.amount,
    forChildId: null,
    kind: 'settlement',
    id: settlement.id,
    paymentId: null,
    expenseId: null,
  });
  return {
    paid: balances.complete.flatMap(paidLines),
    shares,
    sent: balances.settlements
      .filter((settlement) => settlement.fromId === travellerId)
      .map((settlement) => settlementLine(settlement, settlement.toId)),
    received: balances.settlements
      .filter((settlement) => settlement.toId === travellerId)
      .map((settlement) => settlementLine(settlement, settlement.fromId)),
    paidWaiting: [...balances.waiting.map((entry) => entry.cost), ...balances.notSplit].flatMap(paidLines),
    balance,
  };
}

// ─── Rules for a settlement ──────────────────────────────────────────────────────────────────────

type Draft = Pick<Settlement, 'fromId' | 'toId' | 'amount' | 'currency'>;

/** The input with this settlement written (or replaced, when editing): what the nets would be. */
export function withSettlement(input: BalanceInput, draft: Draft, editingId?: string): BalanceInput {
  const now = '';
  const others = input.settlements.filter((settlement) => settlement.id !== editingId);
  return {
    ...input,
    settlements: [
      ...others,
      {
        id: editingId ?? '(new)',
        tripId: '',
        settledOn: null,
        note: null,
        createdAt: now,
        updatedAt: now,
        ...draft,
      },
    ],
  };
}

/**
 * Why this settlement cannot be saved, or null (§7). Both people on the trip, two different
 * people, an amount above zero — and never one that leaves the child receiving it owing money
 * (invariant D). A child may send: that only makes them owed.
 */
export function settlementRefusal(
  input: BalanceInput,
  draft: Draft,
  editingId?: string,
): string | null {
  const members = new Map(input.members.map((member) => [member.id, member]));
  if (draft.fromId === draft.toId) return 'Pick two different people.';
  const from = members.get(draft.fromId);
  const to = members.get(draft.toId);
  if (!from || !to) return 'Both people must be on this trip.';
  if (!Number.isInteger(draft.amount) || draft.amount <= 0) return 'Enter an amount above zero.';
  if (to.classification === 'child') {
    const after = tripBalances(withSettlement(input, draft, editingId))
      .find((entry) => entry.currency === draft.currency)
      ?.people.find((row) => row.travellerId === to.id);
    if (after && after.net < 0) {
      return `${to.name} would owe money. A child never owes — record it with the adult who covers ${to.name}.`;
    }
  }
  return null;
}

export type SettlementPreview = {
  /** The currency's balances with the settlement in. */
  after: CurrencyBalances;
  /** More than the sender owed the receiver (Q4): by how much. 0 when not over. */
  overBy: number;
  /** No cost in this currency could be shared (B). */
  noCosts: boolean;
  /** Exactly one of the suggested transfers: no preview needed. */
  matchesSuggestion: boolean;
};

/** What saving this settlement would do, for the warning and the preview before saving (§7). */
export function previewSettlement(input: BalanceInput, draft: Draft, editingId?: string): SettlementPreview {
  const without = { ...input, settlements: input.settlements.filter((s) => s.id !== editingId) };
  const before = tripBalances(without).find((entry) => entry.currency === draft.currency);
  const after = tripBalances(withSettlement(input, draft, editingId)).find(
    (entry) => entry.currency === draft.currency,
  )!;
  const owed = Math.max(0, -(before?.people.find((row) => row.travellerId === draft.fromId)?.net ?? 0));
  const credit = Math.max(0, before?.people.find((row) => row.travellerId === draft.toId)?.net ?? 0);
  const fair = Math.min(owed, credit);
  return {
    after,
    overBy: Math.max(0, draft.amount - fair),
    noCosts: !before || (before.complete.length === 0 && before.waiting.length === 0),
    matchesSuggestion: (before?.transfers ?? []).some(
      (transfer) =>
        transfer.fromId === draft.fromId && transfer.toId === draft.toId && transfer.amount === draft.amount,
    ),
  };
}

// ─── Words ───────────────────────────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One person's net as a row reads it. Under *Balances so far* it is never worded as a debt (§12.1
 * rule 8); a child below zero is never shown as owing (E).
 */
export function netText(
  row: Pick<PersonBalance, 'net'>,
  currency: string,
  state: BalanceState,
  isChild: boolean,
): string {
  const money = formatMoney(Math.abs(row.net), currency);
  if (isChild && row.net < 0) return `received ${money} more than paid · check the settlements`;
  if (state === 'final') {
    if (row.net > 0) return `is owed ${money}`;
    if (row.net < 0) return `owes ${money}`;
    return 'settled';
  }
  if (row.net === 0) return `${formatMoney(0, currency)} so far`;
  return `${row.net > 0 ? '+' : '−'}${money} so far`;
}

/** The heading over a currency's nets (§3, A, B). */
export function balancesHeading(entry: CurrencyBalances): string {
  switch (entry.state) {
    case 'final':
      return `Balances · ${entry.currency}`;
    case 'soFar':
      return `Balances so far · ${entry.currency} — ${plural(entry.waiting.length, 'cost', 'costs')} not included yet`;
    case 'review':
      return `Balances so far · ${entry.currency} — ${plural(entry.toReview.length, 'unsplit cost', 'unsplit costs')} to review`;
    case 'settlementsOnly':
      return `Settlements only · ${entry.currency} — no costs in the balances`;
    case 'nothing':
      return entry.currency;
  }
}

/**
 * The line that says where a currency stands (D). Never a bare *All settled up* while something
 * is left out; null when the balances and suggestions say it themselves.
 */
export function statusText(entry: CurrencyBalances): string | null {
  const allZero = entry.people.every((row) => row.net === 0);
  const notSplit = entry.notSplit.length;
  switch (entry.state) {
    case 'nothing':
      return `Nothing to settle yet in ${entry.currency}.`;
    case 'settlementsOnly':
      return 'Check the currency, or complete the costs these settlements pay back. Nothing is suggested here.';
    case 'soFar':
      return allZero
        ? `Balances so far: all at zero · ${plural(entry.waiting.length, 'cost', 'costs')} not included yet.`
        : `Suggested transfers appear once ${entry.waiting.length === 1 ? 'this cost is' : `these ${entry.waiting.length} costs are`} complete.`;
    case 'review':
      return entry.toReview.length === 1
        ? `Suggested transfers are paused: 1 cost is not split and ${entry.currency} has settlements. Split it, or keep it outside on purpose.`
        : `Suggested transfers are paused: ${entry.toReview.length} costs are not split and ${entry.currency} has settlements. Split each, or keep it outside on purpose.`;
    case 'final':
      if (entry.childrenBelowZero.length > 0) {
        return 'A child has received more than they paid. Check the settlements — nothing is suggested until then.';
      }
      if (!allZero) return null;
      return notSplit > 0
        ? `Settled up for the shared costs · ${plural(notSplit, 'cost', 'costs')} not split, not part of this.`
        : `All settled up in ${entry.currency}.`;
  }
}

/** A waiting cost's reason in words (§5). */
export function waitText(reason: WaitReason, currency: string, cost: Pick<BalanceCost, 'amount'>, nameOf: (id: string) => string): string {
  const money = (amount: number) => formatMoney(amount, currency);
  switch (reason.kind) {
    case 'cancelled':
      return reason.refund === 'refundExpected' ? 'Cancelled — refund expected' : 'Cancelled — refund not set';
    case 'notSplit':
      return 'Not split';
    case 'splitMismatch':
      return `Split adds to ${money(reason.allocated)} · price ${money(cost.amount)}`;
    case 'notCovered':
      return `${reason.childIds.map(nameOf).join(' and ')}'s share — not covered`;
    case 'payerMissing':
      return `${money(reason.amount)} paid — payer not recorded`;
    case 'paidNotRecorded':
      return `Paid — ${money(reason.amount)} not recorded by whom`;
    case 'toPay':
      return `${money(reason.amount)} to pay`;
    case 'overpaid':
      return `${money(reason.amount)} more recorded than the price`;
  }
}

/** What is recorded on a waiting cost, so a deposit stays visible while it waits (A). */
export function recordedText(cost: BalanceCost, nameOf: (id: string) => string): string | null {
  if (cost.records.length === 0) return null;
  const byPayer = new Map<string | null, number>();
  for (const record of cost.records) byPayer.set(record.payerId, (byPayer.get(record.payerId) ?? 0) + record.amount);
  return [...byPayer.entries()]
    .map(([payerId, amount]) =>
      payerId === null
        ? `paid ${formatMoney(amount, cost.currency)}, payer not recorded`
        : `paid ${formatMoney(amount, cost.currency)} (${nameOf(payerId)})`,
    )
    .join(' · ');
}

/** Where a waiting cost is fixed (§5). */
export function waitTarget(reason: WaitReason): 'split' | 'travellers' | 'record' | 'cost' {
  switch (reason.kind) {
    case 'notSplit':
    case 'splitMismatch':
      return 'split';
    case 'notCovered':
      return 'travellers';
    case 'payerMissing':
      return 'record';
    default:
      return 'cost';
  }
}

/**
 * The share text (§9): suggested transfers only, for the currencies that have them; a currency
 * whose nets are not final says so in one line and gives no numbers (§12.1 rule 8).
 */
export function settleUpText(tripName: string, balances: readonly CurrencyBalances[], nameOf: (id: string) => string): string {
  const sections: string[] = [];
  const notes: string[] = [];
  for (const entry of balances) {
    if (entry.state === 'soFar') {
      sections.push(`${entry.currency}: not final — ${plural(entry.waiting.length, 'cost', 'costs')} not complete`);
      continue;
    }
    if (entry.state === 'review') {
      sections.push(`${entry.currency}: not final — ${plural(entry.toReview.length, 'unsplit cost', 'unsplit costs')} to review`);
      continue;
    }
    if (entry.transfers.length > 0) {
      const money = (amount: number) => formatMoney(amount, entry.currency).replace(`${entry.currency} `, '');
      sections.push(
        [entry.currency, ...entry.transfers.map((t) => `${nameOf(t.fromId)} pays ${nameOf(t.toId)} ${money(t.amount)}`)].join('\n'),
      );
    } else if (entry.state === 'final' && entry.childrenBelowZero.length === 0) {
      sections.push(`${entry.currency}: settled up`);
    }
    if (entry.notSplit.length > 0) notes.push(`${plural(entry.notSplit.length, 'cost', 'costs')} in ${entry.currency} not split`);
  }
  const lines = [`${tripName} — settle up (suggested)`, '', sections.join('\n\n') || 'Nothing to settle yet.'];
  if (notes.length > 0) lines.push('', `Not included: ${notes.join(', ')}.`);
  return lines.join('\n');
}
