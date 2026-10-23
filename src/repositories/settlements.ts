import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  ACKNOWLEDGE_SETTLEMENT_REVIEWS,
  DELETE_SETTLEMENT,
  DELETE_UNSPLIT_CONFIRMATION,
  INSERT_SETTLEMENT,
  INSERT_UNSPLIT_CONFIRMATION,
  SELECT_OPEN_SETTLEMENT_REVIEWS,
  SELECT_SETTLEMENT,
  SELECT_TRIP_SETTLEMENTS,
  UPDATE_SETTLEMENT,
} from '../db/queries';
import {
  costFingerprint,
  parseSettlementRow,
  settlementInputSchema,
  settlementRefusal,
  tripBalances,
  type BalanceCost,
  type Settlement,
  type SettlementInput,
  type SettlementReviewRow,
  type SettlementRow,
} from '../domain/balances';
import { MoneyRuleError } from '../domain/bookingPayments';
import { balanceInput } from './moneyWrites';

export { balanceInput } from './moneyWrites';

/**
 * Settlements and the balances they move (3E, `docs/phase3e-plan.md`). Balances are never stored:
 * `balanceInput` reads every record they are worked out from, and the screens call the pure
 * `tripBalances` on it. Every rule a screen explains is checked again here, inside the write's
 * transaction; the database's keys to `trip_travellers` are the last word on who may settle.
 */

/** Everything a balance reads: a change to any of these can change one. */
export const BALANCE_TABLES = [
  'settlements',
  'settlement_reviews',
  'unsplit_confirmations',
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

type CostRef = Pick<BalanceCost, 'kind' | 'id'>;

const costBindings = (cost: CostRef) => ({
  $itemId: cost.kind === 'booking' ? cost.id : null,
  $expenseId: cost.kind === 'expense' ? cost.id : null,
});

/**
 * Keeps an unsplit cost outside the shared balances on purpose (§14.2). `seen` is the fingerprint
 * the screen showed: the cost is read again inside the transaction and refused unless it is still
 * an unsplit cost of this trip that reads exactly so — a stale screen never confirms a changed
 * cost. Writes only the confirmation: no settlement, payment, share, payer or cover changes.
 */
export async function keepOutside(db: SQLiteDatabase, tripId: string, cost: CostRef, seen: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const input = await balanceInput(db, tripId);
    const now = input.costs.find((c) => c.kind === cost.kind && c.id === cost.id);
    if (!now) throw new MoneyRuleError('That cost is not here any more.');
    if (now.shares.length > 0) throw new MoneyRuleError('This cost is split now, so it is part of the balances.');
    const unsplit = tripBalances(input).some((entry) => entry.notSplit.some((c) => c.kind === cost.kind && c.id === cost.id));
    if (!unsplit) throw new MoneyRuleError('This cost is not one the balances leave out as not split.');
    if (costFingerprint(now) !== seen) {
      throw new MoneyRuleError('This cost changed while you were looking at it. Check it again before keeping it outside.');
    }
    await db.runAsync(DELETE_UNSPLIT_CONFIRMATION, costBindings(cost));
    await db.runAsync(INSERT_UNSPLIT_CONFIRMATION, {
      $id: randomUUID(),
      $tripId: tripId,
      ...costBindings(cost),
      $fingerprint: seen,
      $now: new Date().toISOString(),
    });
  });
}

/** Takes a cost back to review: its confirmation goes, nothing else changes. */
export async function reviewAgain(db: SQLiteDatabase, cost: CostRef): Promise<void> {
  await db.runAsync(DELETE_UNSPLIT_CONFIRMATION, costBindings(cost));
}

/**
 * *Settlements still stand* (§15.3): acknowledges exactly the reviews of this currency the screen
 * showed. Inside the transaction the open ones are read again; if any was added (or acknowledged)
 * since, the screen was stale and nothing is written. Stamps the reviews and nothing else — no
 * settlement, cost or record changes.
 */
export async function settlementsStillStand(
  db: SQLiteDatabase,
  tripId: string,
  currency: string,
  seenIds: readonly string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const open = (await db.getAllAsync<SettlementReviewRow>(SELECT_OPEN_SETTLEMENT_REVIEWS, { $tripId: tripId }))
      .filter((row) => row.currency === currency)
      .map((row) => row.id);
    const seen = new Set(seenIds);
    if (open.length === 0) throw new MoneyRuleError(`Nothing in ${currency} is waiting for review any more.`);
    if (open.length !== seen.size || !open.every((id) => seen.has(id))) {
      throw new MoneyRuleError(
        `Something changed in ${currency} since you opened this review. Check the settlements again before saying they still stand.`,
      );
    }
    await db.runAsync(ACKNOWLEDGE_SETTLEMENT_REVIEWS, {
      $tripId: tripId,
      $currency: currency,
      $now: new Date().toISOString(),
    });
  });
}
