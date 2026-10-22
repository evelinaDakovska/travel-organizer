/**
 * Who a cost is for, and who covers a child's share (3D-2, `docs/phase3d2-plan.md`). Four words,
 * never derived from one another: *Going* (participation), *Paid by* (3D-1), *Split between* (a
 * share of the cost) and *Covered by* (the adult who bears a child's share).
 *
 * A booking's cost is its price, a standalone expense's its amount. A split is one row per person:
 * all with `amount` null (equally — computed from the current cost) or all with an amount (by
 * amounts — must add up when saved, and is never rescaled). Nothing here converts currencies,
 * invents a share or a cover, or reads *Going* except when the person asks for it.
 */

import { z } from 'zod';

import { formatMoney } from './format';
import { AUDIENCE_LABEL, lineType, type Audience, type Pricing, type RateLine } from './pricing';
import type { TravellerClassification } from './traveller';
import type { TripItem } from './tripItem';

export type CostShare = {
  id: string;
  tripId: string;
  /** Exactly one of these two: the booking or the standalone expense it is a share of. */
  tripItemId: string | null;
  expenseId: string | null;
  travellerId: string;
  /** Minor units; null: an equal part of the current cost. */
  amount: number | null;
  /** For a child's share: the adult who covers it here, instead of the trip's *Covered by*. */
  coveredBy: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CostShareRow = {
  id: string;
  trip_id: string;
  trip_item_id: string | null;
  expense_id: string | null;
  traveller_id: string;
  amount: number | null;
  covered_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function parseCostShareRow(row: CostShareRow): CostShare {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripItemId: row.trip_item_id,
    expenseId: row.expense_id,
    travellerId: row.traveller_id,
    amount: row.amount,
    coveredBy: row.covered_by,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A default cover row: one adult covering one child on a trip. */
export type TripCover = { childId: string; adultId: string; sortOrder: number };

/** A trip member as a split needs one: classification is the trip's, not the profile's. */
export type Member = { id: string; name: string; classification: TravellerClassification };

// ─── The split as saved ──────────────────────────────────────────────────────────────────────────

/** What the split screen saves, in the order shown. Every row equal, or every row an amount. */
export const splitInputSchema = z.object({
  people: z
    .array(
      z.object({
        travellerId: z.string().min(1),
        // An empty or unreadable box arrives as NaN: said in words, never as a type error.
        amount: z
          .number({ error: 'Give everyone an amount, or split it equally.' })
          .int('Use whole cents.')
          .nonnegative('An amount cannot be below zero.')
          .nullable(),
        coveredBy: z.string().min(1).nullable(),
      }),
    )
    .min(1, 'Pick who it is for'),
});

export type SplitInput = z.output<typeof splitInputSchema>;

export type SplitMode = 'equal' | 'amounts';

/** Null: not split. A split is by amounts as soon as any row has one (the repository never mixes). */
export function splitMode(shares: readonly Pick<CostShare, 'amount'>[]): SplitMode | null {
  if (shares.length === 0) return null;
  return shares.some((share) => share.amount !== null) ? 'amounts' : 'equal';
}

/**
 * `total` in `n` parts that add up to it exactly: the floor each, then the leftover minor units
 * one each to the first parts (invariant E). EUR 10.00 / 3 → 3.34 · 3.33 · 3.33.
 */
export function splitEqually(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const leftover = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < leftover ? 1 : 0));
}

export type ShareAmount = { travellerId: string; amount: number };

export type SplitAmounts = {
  shares: ShareAmount[];
  /** The cost minus what the shares add up to: positive is not allocated, negative is over. */
  unallocated: number;
};

/**
 * Each share's amount for the cost as it is now, in the split's order. Equally follows the
 * current cost; by amounts stays as saved, and what no longer adds up is `unallocated`.
 */
export function shareAmounts(
  total: number,
  shares: readonly Pick<CostShare, 'travellerId' | 'amount' | 'sortOrder'>[],
): SplitAmounts {
  const ordered = [...shares].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) return { shares: [], unallocated: total };
  const amounts =
    splitMode(ordered) === 'equal'
      ? splitEqually(total, ordered.length)
      : ordered.map((share) => share.amount ?? 0);
  const allocated = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    shares: ordered.map((share, i) => ({ travellerId: share.travellerId, amount: amounts[i] })),
    unallocated: total - allocated,
  };
}

// ─── Who covers a child's share ──────────────────────────────────────────────────────────────────

export type Cover =
  /** An adult's, a not-specified person's, or a former child's: their own. */
  | { kind: 'own' }
  | { kind: 'covered'; adultIds: string[]; source: 'override' | 'trip' }
  /** A child's share nobody covers: shown so, never charged to a guessed adult. */
  | { kind: 'notCovered' };

/**
 * Invariant D: a child is never a debtor. Their share is covered by the share's own override,
 * else by the trip's *Covered by* (read live, several adults equally), else it is not covered. A
 * share of someone who is not a child on the trip is their own; an override on it stays dormant.
 * Only someone who is an adult on the trip now covers: one reclassified since is skipped, never
 * left covering as a child.
 */
export function coverOf(
  share: Pick<CostShare, 'travellerId' | 'coveredBy'>,
  classificationOf: (travellerId: string) => TravellerClassification | undefined,
  tripCover: readonly TripCover[],
): Cover {
  if (classificationOf(share.travellerId) !== 'child') return { kind: 'own' };
  const isAdult = (id: string) => classificationOf(id) === 'adult';
  if (share.coveredBy !== null && isAdult(share.coveredBy)) {
    return { kind: 'covered', adultIds: [share.coveredBy], source: 'override' };
  }
  const adultIds = tripCover
    .filter((cover) => cover.childId === share.travellerId && isAdult(cover.adultId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((cover) => cover.adultId);
  return adultIds.length > 0 ? { kind: 'covered', adultIds, source: 'trip' } : { kind: 'notCovered' };
}

// ─── What can be split, and what a split may hold ────────────────────────────────────────────────

type SplittableBooking = Pick<TripItem, 'kind' | 'title' | 'status' | 'priceAmount' | 'priceCurrency'>;

/**
 * Why a booking cannot be split, or null. An idea is a budget, not a cost; without a price there
 * is nothing to split; a to-do costs nothing (`docs/phase3d2-plan.md` §3).
 */
export function bookingSplitRefusal(booking: SplittableBooking): string | null {
  if (booking.kind === 'task') return 'A to-do has no cost to split.';
  if (booking.status === 'idea') {
    return 'A saved place is a budget, not a cost. Book it first, then split it.';
  }
  if (booking.priceAmount === null || booking.priceAmount <= 0 || booking.priceCurrency === null) {
    return `Add the price of “${booking.title}” first — a split divides it.`;
  }
  return null;
}

/** An expense that pays for a booking is split with that booking, never on its own (L-4). */
export function expenseSplitRefusal(expense: { tripItemId: string | null }, bookingTitle?: string): string | null {
  if (expense.tripItemId === null) return null;
  return `This expense pays for ${bookingTitle ? `“${bookingTitle}”` : 'a booking'}, so it is split with the booking. Unlink it first to split it on its own.`;
}

const whom = (members: ReadonlyMap<string, Member>, id: string) => members.get(id)?.name ?? 'Someone';

/**
 * Why this split cannot be saved for a cost of `total`, or null (`docs/phase3d2-plan.md` §6).
 * Everyone is on the trip, once; every row equal or every row an amount, adding up to the cost;
 * an override only on a child's share, by an adult of the trip.
 */
export function splitRefusal(
  input: SplitInput,
  total: number,
  currency: string,
  members: ReadonlyMap<string, Member>,
): string | null {
  const parsed = splitInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Check the split.';
  const { people } = parsed.data;

  const seen = new Set<string>();
  for (const person of people) {
    if (!members.has(person.travellerId)) return 'Everyone in a split must be on this trip.';
    if (seen.has(person.travellerId)) return `${whom(members, person.travellerId)} is in the split twice.`;
    seen.add(person.travellerId);
  }

  const withAmount = people.filter((person) => person.amount !== null).length;
  if (withAmount > 0 && withAmount < people.length) {
    return 'Give everyone an amount, or split it equally.';
  }
  if (withAmount > 0) {
    const sum = people.reduce((s, person) => s + (person.amount ?? 0), 0);
    if (sum < total) return `${formatMoney(total - sum, currency)} is left to split.`;
    if (sum > total) return `The amounts are ${formatMoney(sum - total, currency)} more than the cost.`;
  }

  for (const person of people) {
    if (person.coveredBy === null) continue;
    if (members.get(person.travellerId)?.classification !== 'child') {
      return `Only a child’s share is covered by someone else — ${whom(members, person.travellerId)} pays their own.`;
    }
    const refusal = adultRefusal(members, person.travellerId, person.coveredBy);
    if (refusal) return refusal;
  }
  return null;
}

function adultRefusal(members: ReadonlyMap<string, Member>, childId: string, adultId: string): string | null {
  if (adultId === childId) return 'A child does not cover their own share.';
  const adult = members.get(adultId);
  if (!adult) return 'Whoever covers a child must be on this trip.';
  if (adult.classification !== 'adult') {
    return `${adult.name} is not an adult on this trip — only an adult covers a child’s share.`;
  }
  return null;
}

/** Why the trip's *Covered by* for this child cannot be saved, or null. No adults clears it. */
export function coverRefusal(
  childId: string,
  adultIds: readonly string[],
  members: ReadonlyMap<string, Member>,
): string | null {
  const child = members.get(childId);
  if (!child) return 'That traveller is not on this trip.';
  if (child.classification !== 'child') {
    return `${child.name} is not a child on this trip — their share is their own.`;
  }
  if (new Set(adultIds).size !== adultIds.length) return 'The same adult is chosen twice.';
  for (const adultId of adultIds) {
    const refusal = adultRefusal(members, childId, adultId);
    if (refusal) return refusal;
  }
  return null;
}

// ─── Editing a split cost ────────────────────────────────────────────────────────────────────────

/** What a booking's or an expense's split is, for the edit rules: how many, and which mode. */
export type SplitFacts = { people: number; mode: SplitMode | null };

/** `SELECT_SPLIT_FACTS` read: `allocated` is what a split by amounts adds up to. */
export function splitFactsFrom(
  row: { people: number; withAmount: number; allocated: number } | null,
): SplitFacts & { allocated: number } {
  const people = row?.people ?? 0;
  return {
    people,
    mode: people === 0 ? null : (row?.withAmount ?? 0) > 0 ? 'amounts' : 'equal',
    allocated: row?.allocated ?? 0,
  };
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/**
 * An edit that would strand a booking's split, refused with the reason, or null. While split it
 * stays a booking with a price; a split by amounts also keeps its currency (the amounts would
 * silently mean another one). An equal split follows a new price or currency.
 */
export function bookingSplitEditRefusal(
  saved: Pick<TripItem, 'priceCurrency'>,
  next: { status: TripItem['status']; priceAmount?: number | null; priceCurrency?: string | null },
  split: SplitFacts,
): string | null {
  if (split.mode === null) return null;
  const what = `This booking is split between ${people(split.people)}`;
  if (next.status === 'idea') {
    return `${what}. A saved place is not split, so it stays a booking — cancel it instead, or remove the split first.`;
  }
  const price = next.priceAmount ?? null;
  if (price === null || price <= 0) return `${what}, so it keeps a price. Remove the split first to clear it.`;
  return currencyRefusal(saved.priceCurrency, next.priceCurrency ?? null, split, what);
}

/** The same for a standalone expense: its currency stays while it is split by amounts. */
export function expenseSplitEditRefusal(
  saved: { currency: string },
  next: { currency: string },
  split: SplitFacts,
): string | null {
  if (split.mode === null) return null;
  return currencyRefusal(saved.currency, next.currency, split, `This expense is split between ${people(split.people)}`);
}

function currencyRefusal(
  saved: string | null,
  next: string | null,
  split: SplitFacts,
  what: string,
): string | null {
  if (split.mode !== 'amounts' || saved === null || next === saved) return null;
  return `${what} by amounts in ${saved}, so it stays in ${saved}. Currencies are never converted — split it equally, or remove the split first.`;
}

/**
 * A warning, not a refusal: a new cost a split by amounts no longer adds up to. The split stays
 * as saved and shows the difference; nothing is rescaled.
 */
export function splitMismatchWarning(
  split: { mode: SplitMode | null; allocated: number },
  nextTotal: number | null | undefined,
  currency: string,
): string | null {
  if (split.mode !== 'amounts' || nextTotal === null || nextTotal === undefined) return null;
  if (split.allocated === nextTotal) return null;
  const difference = nextTotal - split.allocated;
  return difference > 0
    ? `The split adds up to ${formatMoney(split.allocated, currency)}. With this cost, ${formatMoney(difference, currency)} will be left unallocated until you edit the split.`
    : `The split adds up to ${formatMoney(split.allocated, currency)}, ${formatMoney(-difference, currency)} more than this cost, until you edit the split.`;
}

// ─── Removing someone from the trip ──────────────────────────────────────────────────────────────

/** What holds someone on a trip (invariant I): records that name them. */
export type MoneyHolds = { paid: number; shares: number; covers: number };

export const hasHolds = (holds: MoneyHolds) => holds.paid + holds.shares + holds.covers > 0;

/**
 * Why someone cannot leave a trip, or null: money records of the trip name them as the payer, a
 * person in a split, or the adult covering a child's share there. Nothing is moved or deleted by
 * itself — each record is opened and changed by the person (`docs/phase3d2-plan.md` §7).
 */
export function holdsRefusal(name: string, holds: MoneyHolds): string | null {
  if (!hasHolds(holds)) return null;
  const parts = [
    holds.paid > 0 ? `the payer on ${count(holds.paid, 'money record')}` : null,
    holds.shares > 0 ? `in ${count(holds.shares, 'split')}` : null,
    holds.covers > 0 ? `covering a child’s share on ${count(holds.covers, 'cost')}` : null,
  ].filter((part): part is string => part !== null);
  return `${name} is ${joinAnd(parts)} on this trip. Change those first — money history is never moved or deleted by itself.`;
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// ─── Suggestions the person asks for ─────────────────────────────────────────────────────────────

/**
 * *Split between who's going*: the trip members who go, in member order. A fill shown before
 * saving, never a share by itself, and never kept in step with *Going* afterwards.
 */
export function whoIsGoing<T extends { id: string }>(members: readonly T[], participantIds: readonly string[]): T[] {
  const going = new Set(participantIds);
  return members.filter((member) => going.has(member.id));
}

export type PriceFill =
  | { kind: 'amounts'; amounts: ShareAmount[] }
  | { kind: 'refused'; reason: string };

/**
 * *Fill from prices* (`docs/phase3d2-plan.md` §4): each person's rate by audience — an adult on
 * the Adult rate, else Anyone; a child on the Child rate, else Anyone; someone not specified on
 * Anyone only, never assumed adult (as *Price for who's going*, 3C). Every person rate must be
 * marked; an unmarked one refuses the fill. Group prices and extras are divided equally among the
 * people chosen. Proposed as amounts the person can edit; refused, with
 * why, when the lines and the people do not match the price.
 */
export function fillFromPrices(
  pricing: Pricing,
  chosen: readonly Pick<Member, 'id' | 'classification'>[],
  total: number,
  currency: string,
): PriceFill {
  if (chosen.length === 0) return { kind: 'refused', reason: 'Tick who it is for first.' };
  const personLines = pricing.lines.filter((line) => lineType(line) === 'person');
  // Only a rate marked Adult, Child or Anyone is matched to people: an unmarked one — a legacy
  // breakdown, even a lone *Ticket* line — is never taken for Anyone here, because this puts money
  // on each person (3D-2 corrective; 3C's *Price for who's going* changes only quantities).
  const lineFor = new Map<Audience, RateLine>();
  for (const line of personLines) {
    if (line.for === undefined) {
      return {
        kind: 'refused',
        reason:
          'A rate on this price is not marked Adult, Child or Anyone, so who it is for is not known. Mark it on the booking’s price, or split equally or by amounts here.',
      };
    }
    if (lineFor.has(line.for)) {
      return {
        kind: 'refused',
        reason: `Two rates on this price are marked ${AUDIENCE_LABEL[line.for]}, so which one applies is not known. Split equally or by amounts instead.`,
      };
    }
    lineFor.set(line.for, line);
  }

  const any = lineFor.get('any');
  const rates: number[] = [];
  for (const person of chosen) {
    const line =
      person.classification === 'adult'
        ? (lineFor.get('adult') ?? any)
        : person.classification === 'child'
          ? (lineFor.get('child') ?? any)
          : any;
    if (personLines.length > 0 && !line) {
      return { kind: 'refused', reason: 'There is no rate for everyone ticked. Split by amounts instead.' };
    }
    rates.push(line?.unitAmount ?? 0);
  }

  const shared = pricing.lines
    .filter((line) => lineType(line) !== 'person')
    .reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  const parts = splitEqually(shared, chosen.length);
  const amounts = chosen.map((person, i) => ({ travellerId: person.id, amount: rates[i] + parts[i] }));
  const sum = amounts.reduce((s, share) => s + share.amount, 0);
  if (sum !== total) {
    return {
      kind: 'refused',
      reason: `The rates for the people ticked add up to ${formatMoney(sum, currency)}, not the price ${formatMoney(total, currency)}. Check who is ticked, or split by amounts.`,
    };
  }
  return { kind: 'amounts', amounts };
}

// ─── A draft and the data it was made against ────────────────────────────────────────────────────

/** What a split draft was made against: the cost, who is on the trip as what, the saved split. */
export type SplitBasis = {
  total: number;
  currency: string;
  members: readonly Pick<Member, 'id' | 'name' | 'classification'>[];
  shares: readonly Pick<CostShare, 'travellerId' | 'amount' | 'coveredBy' | 'sortOrder'>[];
};

/** The saved split's content, without ids: a save of the same split elsewhere is no change. */
const sharesKey = (shares: SplitBasis['shares']) =>
  JSON.stringify(
    [...shares].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => [s.travellerId, s.amount, s.coveredBy]),
  );

/** One person in a split draft: who, and the adult picked to cover them here (a child's share). */
export type DraftPerson = { travellerId: string; coveredBy: string | null };

/**
 * What changed since a split draft was made that the draft depends on, in words; empty when
 * nothing did (3D-2 corrective). The cost, its currency and the saved split always count; so does
 * anyone seen who is no longer on the trip — for someone the draft names, in the split or covering
 * a child, until the person takes them out of the draft (`keptBasis` never drops them). Changing
 * adult/child counts only for someone the draft names. The trip's *Covered by*, a name or someone
 * joining never count: the screen shows them as they are, and nothing of them is saved.
 */
export function splitDraftConflicts(seen: SplitBasis, now: SplitBasis, draft: readonly DraftPerson[]): string[] {
  const conflicts: string[] = [];
  if (seen.total !== now.total || seen.currency !== now.currency) {
    conflicts.push(
      now.currency && now.total > 0
        ? `The cost is now ${formatMoney(now.total, now.currency)}, not ${formatMoney(seen.total, seen.currency)}.`
        : 'The cost has no price now.',
    );
  }
  const current = new Map(now.members.map((m) => [m.id, m]));
  const known = new Map([...seen.members, ...now.members].map((m) => [m.id, m.name]));
  const inSplit = new Set(draft.map((p) => p.travellerId));
  for (const before of seen.members) {
    const after = current.get(before.id);
    const covered = draft.filter((p) => p.coveredBy === before.id).map((p) => known.get(p.travellerId) ?? 'a child');
    if (!after) {
      if (inSplit.has(before.id)) {
        conflicts.push(
          `${before.name} is no longer on this trip but is still in this split. Take them out, or start again from the saved split.`,
        );
      } else if (covered.length > 0) {
        conflicts.push(
          `${before.name} covers ${joinAnd(covered)} here and is no longer on this trip. Take them out to choose again, or start again from the saved split.`,
        );
      } else {
        conflicts.push(`${before.name} is no longer on this trip.`);
      }
    } else if (after.classification !== before.classification && (inSplit.has(before.id) || covered.length > 0)) {
      conflicts.push(`${after.name} is now ${classificationWords(after.classification)} on this trip.`);
    }
  }
  // Someone the draft names whom neither the draft's data nor the trip has: never saved quietly.
  const unknown = draft.flatMap((p) => [p.travellerId, ...(p.coveredBy ? [p.coveredBy] : [])]).some((id) => !known.has(id));
  if (unknown) conflicts.push('Someone in this split is not on this trip.');
  if (sharesKey(seen.shares) !== sharesKey(now.shares)) {
    conflicts.push('The saved split was changed somewhere else.');
  }
  return conflicts;
}

/**
 * *Keep my changes*: the data as it is now becomes what the draft was checked against — except
 * that anyone who left and whom the draft still names stays in it, so their leaving is still said
 * and the save still refused until the person takes them out. Keeping never drops a share or a
 * cover by itself.
 */
export function keptBasis(seen: SplitBasis, now: SplitBasis, draft: readonly DraftPerson[]): SplitBasis {
  const current = new Set(now.members.map((m) => m.id));
  const named = new Set(draft.flatMap((p) => (p.coveredBy ? [p.travellerId, p.coveredBy] : [p.travellerId])));
  const gone = seen.members.filter((m) => !current.has(m.id) && named.has(m.id));
  return { ...now, members: [...now.members, ...gone] };
}

/** Who the draft names that is no longer on the trip: each to be taken out by the person. */
export function goneFromDraft(
  seen: SplitBasis,
  now: SplitBasis,
  draft: readonly DraftPerson[],
): Pick<Member, 'id' | 'name'>[] {
  return keptBasis(seen, now, draft).members.filter((m) => !now.members.some((n) => n.id === m.id));
}

/** The refusal when a draft's data changed under it: what changed, and that nothing was saved. */
export const changedWhileEditing = (conflicts: readonly string[]) =>
  `This changed while you were editing: ${conflicts.join(' ')} Nothing was saved — check the split, then save again.`;

const classificationWords = (c: TravellerClassification) =>
  c === 'adult' ? 'an adult' : c === 'child' ? 'a child' : 'not set as adult or child';

// ─── Reading ─────────────────────────────────────────────────────────────────────────────────────

/** "Not split", "Split equally between 3", "Split by amounts between 2". */
export function splitSummary(shares: readonly Pick<CostShare, 'amount'>[]): string {
  const mode = splitMode(shares);
  if (mode === null) return 'Not split';
  return `Split ${mode === 'equal' ? 'equally' : 'by amounts'} between ${shares.length}`;
}

/** "covered by Evelina", "covered by Evelina and Ana", "not covered"; null for one's own share. */
export function coverText(cover: Cover, nameOf: (travellerId: string) => string): string | null {
  if (cover.kind === 'own') return null;
  if (cover.kind === 'notCovered') return 'not covered';
  return `covered by ${joinAnd(cover.adultIds.map(nameOf))}`;
}

/** For a deletion's confirmation: the split goes with its cost (Q4), and says so. */
export function splitGoesText(people: number): string | null {
  return people > 0 ? `Its split between ${people} ${people === 1 ? 'person' : 'people'} goes too.` : null;
}
