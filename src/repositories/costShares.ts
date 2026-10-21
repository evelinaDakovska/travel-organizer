import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_HOLDS,
  DELETE_CHILD_COVER,
  DELETE_SHARES,
  INSERT_COST_SHARE,
  INSERT_TRIP_COVER,
  SELECT_HOLDS,
  SELECT_SHARES,
  SELECT_SPLIT_FACTS,
  SELECT_TRIP_COVER,
  SELECT_TRIP_SHARES,
} from '../db/queries';
import { MoneyRuleError } from '../domain/bookingPayments';
import {
  bookingSplitRefusal,
  coverRefusal,
  expenseSplitRefusal,
  parseCostShareRow,
  splitFactsFrom,
  splitRefusal,
  type CostShare,
  type CostShareRow,
  type Member,
  type MoneyHolds,
  type SplitFacts,
  type SplitInput,
  type TripCover,
} from '../domain/costShares';
import { getExpense } from './expenses';
import { listTripTravellers } from './travellers';
import { getTripItem } from './tripItems';

/**
 * Splits and *Covered by* (3D-2, `docs/phase3d2-plan.md`). Every rule the screens explain is
 * checked again here inside the write's transaction; the database's keys to `trip_travellers` are
 * the last word on who may be in a split or cover a child.
 */

/** What a split reads: the shares, the cover, and who is on the trip with which classification. */
export const SHARE_TABLES = ['cost_shares', 'trip_cover', 'trip_travellers', 'trip_items', 'expenses'] as const;

/** A booking or a standalone expense: what a split belongs to. */
export type CostOwner = { itemId: string } | { expenseId: string };

const ownerBindings = (owner: CostOwner) => ({
  $itemId: 'itemId' in owner ? owner.itemId : null,
  $expenseId: 'expenseId' in owner ? owner.expenseId : null,
});

export async function listShares(db: SQLiteDatabase, owner: CostOwner): Promise<CostShare[]> {
  const rows = await db.getAllAsync<CostShareRow>(SELECT_SHARES, ownerBindings(owner));
  return rows.map(parseCostShareRow);
}

export async function listTripShares(db: SQLiteDatabase, tripId: string): Promise<CostShare[]> {
  const rows = await db.getAllAsync<CostShareRow>(SELECT_TRIP_SHARES, { $tripId: tripId });
  return rows.map(parseCostShareRow);
}

export async function listTripCover(db: SQLiteDatabase, tripId: string): Promise<TripCover[]> {
  const rows = await db.getAllAsync<{ child_id: string; adult_id: string; sort_order: number }>(
    SELECT_TRIP_COVER,
    { $tripId: tripId },
  );
  return rows.map((row) => ({ childId: row.child_id, adultId: row.adult_id, sortOrder: row.sort_order }));
}

/** How a cost is split, for the edit rules; `allocated` is what a split by amounts adds up to. */
export async function splitFacts(
  db: SQLiteDatabase,
  owner: CostOwner,
): Promise<SplitFacts & { allocated: number }> {
  return splitFactsFrom(
    await db.getFirstAsync<{ people: number; withAmount: number; allocated: number }>(
      SELECT_SPLIT_FACTS,
      ownerBindings(owner),
    ),
  );
}

async function membersOf(db: SQLiteDatabase, tripId: string): Promise<Map<string, Member>> {
  const members = await listTripTravellers(db, tripId);
  return new Map(members.map((member) => [member.id, member]));
}

/** The cost a split divides — its trip, total and currency — or a refusal. */
async function costOf(
  db: SQLiteDatabase,
  owner: CostOwner,
): Promise<{ tripId: string; total: number; currency: string }> {
  if ('itemId' in owner) {
    const booking = await getTripItem(db, owner.itemId);
    if (!booking) throw new MoneyRuleError('That booking is not here any more.');
    const refusal = bookingSplitRefusal(booking);
    if (refusal) throw new MoneyRuleError(refusal);
    return { tripId: booking.tripId, total: booking.priceAmount!, currency: booking.priceCurrency! };
  }
  const expense = await getExpense(db, owner.expenseId);
  if (!expense) throw new MoneyRuleError('That expense is not here any more.');
  if (expense.tripItemId !== null) {
    const booking = await getTripItem(db, expense.tripItemId);
    throw new MoneyRuleError(expenseSplitRefusal(expense, booking?.title)!);
  }
  return { tripId: expense.tripId, total: expense.amount, currency: expense.currency };
}

/**
 * Replaces a cost's split with the one given, in its order: every row equal or every row an
 * amount adding up to the cost, everyone on the trip once, an override only on a child's share by
 * an adult. One transaction; a refusal or a failed write leaves the old split exactly as it was.
 */
export async function saveSplit(db: SQLiteDatabase, owner: CostOwner, input: SplitInput): Promise<void> {
  await db.withTransactionAsync(async () => {
    const cost = await costOf(db, owner);
    const refusal = splitRefusal(input, cost.total, cost.currency, await membersOf(db, cost.tripId));
    if (refusal) throw new MoneyRuleError(refusal);
    const now = new Date().toISOString();
    await db.runAsync(DELETE_SHARES, ownerBindings(owner));
    for (const [sortOrder, person] of input.people.entries()) {
      await db.runAsync(INSERT_COST_SHARE, {
        $id: randomUUID(),
        $tripId: cost.tripId,
        ...ownerBindings(owner),
        $travellerId: person.travellerId,
        $amount: person.amount,
        $coveredBy: person.coveredBy,
        $sortOrder: sortOrder,
        $now: now,
      });
    }
  });
}

/** *Remove split*: the cost reads *Not split* again. Always allowed — nothing paid changes. */
export async function removeSplit(db: SQLiteDatabase, owner: CostOwner): Promise<void> {
  await db.runAsync(DELETE_SHARES, ownerBindings(owner));
}

/**
 * The trip's *Covered by* for one child: the adults given, in order, sharing it equally; none
 * clears it. Every split without its own override follows it from now on (read live).
 */
export async function setTripCover(
  db: SQLiteDatabase,
  tripId: string,
  childId: string,
  adultIds: readonly string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const refusal = coverRefusal(childId, adultIds, await membersOf(db, tripId));
    if (refusal) throw new MoneyRuleError(refusal);
    await db.runAsync(DELETE_CHILD_COVER, { $tripId: tripId, $childId: childId });
    for (const [sortOrder, adultId] of adultIds.entries()) {
      await db.runAsync(INSERT_TRIP_COVER, {
        $tripId: tripId,
        $childId: childId,
        $adultId: adultId,
        $sortOrder: sortOrder,
      });
    }
  });
}

/** What holds someone on a trip: they paid, are in a split, or cover a share by override. */
export async function moneyHolds(
  db: SQLiteDatabase,
  tripId: string,
  travellerId: string,
): Promise<MoneyHolds> {
  const row = await db.getFirstAsync<MoneyHolds>(COUNT_HOLDS, { $tripId: tripId, $travellerId: travellerId });
  return { paid: row?.paid ?? 0, shares: row?.shares ?? 0, covers: row?.covers ?? 0 };
}

export type Hold = {
  kind: 'paid' | 'share' | 'covers';
  /** What to open: the payment, else the expense, else the booking. */
  paymentId: string | null;
  itemId: string | null;
  expenseId: string | null;
  title: string;
  /** A payment's or expense's amount, a share's saved amount; null for an equal share. */
  amount: number | null;
  currency: string | null;
};

/** Every record that holds someone on a trip, for the screen that lets them resolve each (§7). */
export async function listHolds(db: SQLiteDatabase, tripId: string, travellerId: string): Promise<Hold[]> {
  const rows = await db.getAllAsync<{
    kind: Hold['kind'];
    payment_id: string | null;
    item_id: string | null;
    expense_id: string | null;
    title: string;
    amount: number | null;
    currency: string | null;
  }>(SELECT_HOLDS, { $tripId: tripId, $travellerId: travellerId });
  return rows.map((row) => ({
    kind: row.kind,
    paymentId: row.payment_id,
    itemId: row.item_id,
    expenseId: row.expense_id,
    title: row.title,
    amount: row.amount,
    currency: row.currency,
  }));
}
