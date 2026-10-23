import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_SETTLEMENT,
  INSERT_SETTLEMENT,
  SELECT_SETTLEMENT,
  SELECT_TRIP_BOOKING_PAYMENTS,
  SELECT_TRIP_SETTLEMENTS,
  UPDATE_SETTLEMENT,
} from '../db/queries';
import {
  balanceCosts,
  parseSettlementRow,
  settlementInputSchema,
  settlementRefusal,
  type BalanceInput,
  type Settlement,
  type SettlementInput,
  type SettlementRow,
} from '../domain/balances';
import { MoneyRuleError, parseBookingPaymentRow, type BookingPaymentRow } from '../domain/bookingPayments';
import { listTripCover, listTripShares } from './costShares';
import { listExpenses } from './expenses';
import { listTripTravellers } from './travellers';
import { listTripItems } from './tripItems';

/**
 * Settlements and the balances they move (3E, `docs/phase3e-plan.md`). Balances are never stored:
 * `balanceInput` reads every record they are worked out from, and the screens call the pure
 * `tripBalances` on it. Every rule a screen explains is checked again here, inside the write's
 * transaction; the database's keys to `trip_travellers` are the last word on who may settle.
 */

/** Everything a balance reads: a change to any of these can change one. */
export const BALANCE_TABLES = [
  'settlements',
  'booking_payments',
  'expenses',
  'trip_items',
  'cost_shares',
  'trip_cover',
  'trip_travellers',
  'travellers',
] as const;

export async function listTripSettlements(db: SQLiteDatabase, tripId: string): Promise<Settlement[]> {
  const rows = await db.getAllAsync<SettlementRow>(SELECT_TRIP_SETTLEMENTS, { $tripId: tripId });
  return rows.map(parseSettlementRow);
}

export async function getSettlement(db: SQLiteDatabase, id: string): Promise<Settlement | null> {
  const row = await db.getFirstAsync<SettlementRow>(SELECT_SETTLEMENT, { $id: id });
  return row ? parseSettlementRow(row) : null;
}

/** Every record a trip's balances are worked out from, read as it is now. */
export async function balanceInput(db: SQLiteDatabase, tripId: string): Promise<BalanceInput> {
  const [members, tripCover, items, expenses, paymentRows, shares, settlements] = await Promise.all([
    listTripTravellers(db, tripId),
    listTripCover(db, tripId),
    listTripItems(db, tripId),
    listExpenses(db, tripId),
    db.getAllAsync<BookingPaymentRow>(SELECT_TRIP_BOOKING_PAYMENTS, { $tripId: tripId }),
    listTripShares(db, tripId),
    listTripSettlements(db, tripId),
  ]);
  return {
    members,
    tripCover,
    costs: balanceCosts({ items, expenses, payments: paymentRows.map(parseBookingPaymentRow), shares }),
    settlements,
  };
}

/** The form's own schema, again at the boundary: a caller's types are not a check. */
function validInput(input: SettlementInput): SettlementInput {
  const result = settlementInputSchema.safeParse(input);
  if (!result.success) throw new MoneyRuleError(result.error.issues[0]?.message ?? 'Check the settlement.');
  return result.data;
}

function bindings(input: SettlementInput) {
  return {
    $fromId: input.fromId,
    $toId: input.toId,
    $amount: input.amount,
    $currency: input.currency,
    $settledOn: input.settledOn,
    $note: input.note ?? null,
  };
}

/** Records a settlement after the §7 rules: two people on the trip, never leaving a child owing. */
export async function createSettlement(
  db: SQLiteDatabase,
  tripId: string,
  raw: SettlementInput,
): Promise<string> {
  const input = validInput(raw);
  const id = randomUUID();
  await db.withTransactionAsync(async () => {
    const refusal = settlementRefusal(await balanceInput(db, tripId), input);
    if (refusal) throw new MoneyRuleError(refusal);
    await db.runAsync(INSERT_SETTLEMENT, {
      $id: id,
      $tripId: tripId,
      ...bindings(input),
      $now: new Date().toISOString(),
    });
  });
  return id;
}

/** Changes a settlement, judged without its own old values. */
export async function updateSettlement(db: SQLiteDatabase, id: string, raw: SettlementInput): Promise<void> {
  const input = validInput(raw);
  await db.withTransactionAsync(async () => {
    const saved = await getSettlement(db, id);
    if (!saved) throw new MoneyRuleError('That settlement is not here any more.');
    const refusal = settlementRefusal(await balanceInput(db, saved.tripId), input, id);
    if (refusal) throw new MoneyRuleError(refusal);
    await db.runAsync(UPDATE_SETTLEMENT, { $id: id, ...bindings(input), $now: new Date().toISOString() });
  });
}

/** The person's own record, deleted after a confirmation that names it. */
export async function deleteSettlement(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(DELETE_SETTLEMENT, { $id: id });
}
