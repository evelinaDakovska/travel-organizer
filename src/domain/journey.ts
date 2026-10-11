/**
 * A journey of several legs — connections, a return — entered on one form and saved as one
 * transport item per leg (U7). Each leg stays a whole item, so its own zones, reminder, timeline
 * place and tickets keep working; `details.journeyId` is all that ties them together.
 */

import { localPrecision, toInstant } from './time';
import {
  detailsForKind,
  type MomentInput,
  type TripItem,
  type TripItemFormValues,
} from './tripItem';

export type Leg = {
  from?: string;
  to?: string;
  departs?: MomentInput;
  arrives?: MomentInput;
  number?: string;
  seat?: string;
};

export type Journey = { outbound: Leg[]; returning: Leg[] };

/** Whether the form needs the leg list at all: a direct one-way trip is the ordinary form. */
export function isMultiLeg(journey: Journey): boolean {
  return journey.outbound.length > 1 || journey.returning.length > 0;
}

/** The leg that follows `previous`: it leaves from where that one lands, on that day. */
export function nextLeg(previous: Leg | undefined): Leg {
  if (!previous) return {};
  const landed = previous.arrives ?? previous.departs;
  if (!landed) return { from: previous.to };
  // Leaves from the zone it landed in, on that day; the time is left to fill in.
  const departs: MomentInput = { local: landed.local.slice(0, 10) };
  if (landed.tz) departs.tz = landed.tz;
  return { from: previous.to, departs };
}

/**
 * The day a leg's date picker opens on: the day the leg before it landed (or left), so a
 * connection is not dated from the trip's first day — found in the end-to-end pass, when both legs
 * appeared at once and the second opened on the wrong day. The fallback for the first leg.
 */
export function legDefaultDate(legs: readonly Leg[], index: number, fallback: string): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    const landed = legs[i].arrives ?? legs[i].departs;
    if (landed) return landed.local.slice(0, 10);
  }
  return fallback;
}

/** The way back starts where the way out ended and goes home. Dates are left to fill in. */
export function firstReturnLeg(outbound: readonly Leg[]): Leg {
  return { from: outbound[outbound.length - 1]?.to, to: outbound[0]?.from };
}

/** Back to one direct leg, first departure to last arrival, so nothing at the ends is lost. */
export function mergeToDirect(legs: readonly Leg[]): Leg {
  if (legs.length <= 1) return legs[0] ?? {};
  const first = legs[0];
  const last = legs[legs.length - 1];
  return { ...first, to: last.to, arrives: last.arrives };
}

const instantOf = (moment: MomentInput, defaultTz: string) => {
  const precision = localPrecision(moment.local);
  if (!precision) return null;
  return toInstant({ local: moment.local, tz: moment.tz ?? defaultTz, precision });
};

export type LegProblem = { part: 'outbound' | 'returning'; index: number; message: string };

/**
 * What would make a leg wrong before anything is saved: no departure, or a connection leaving
 * before the previous leg lands. An arrival before its own departure is the item schema's to catch.
 */
export function journeyProblems(journey: Journey, defaultTz: string): LegProblem[] {
  const problems: LegProblem[] = [];
  const check = (part: LegProblem['part'], legs: readonly Leg[], after: Leg | undefined) => {
    legs.forEach((leg, index) => {
      if (!leg.departs) {
        problems.push({ part, index, message: 'Add when it departs' });
        return;
      }
      const previous = index === 0 ? after : legs[index - 1];
      const landed = previous?.arrives ?? previous?.departs;
      if (!landed) return;
      const [a, b] = [instantOf(landed, defaultTz), instantOf(leg.departs, defaultTz)];
      if (a && b && b < a) {
        problems.push({
          part,
          index,
          message:
            index === 0
              ? 'Leaves before the way out arrives'
              : 'Leaves before the previous leg lands',
        });
      }
    });
  };
  check('outbound', journey.outbound, undefined);
  check('returning', journey.returning, journey.outbound[journey.outbound.length - 1]);
  return problems;
}

const ROUTE_KEYS = ['from', 'to', 'number', 'seat'] as const;

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * One form's worth of values per leg. Everything shared — kind, status, confirmation, notes,
 * reminder, refundable — goes on every leg; the price only on the first, so the trip's expenses
 * count it once. Titles number the legs: *Flight to Bergamo (1/2)*, *Return: Flight to Bergamo*.
 */
export function journeyItemValues(
  base: TripItemFormValues,
  journey: Journey,
  journeyId: string,
): TripItemFormValues[] {
  const shared = detailsForKind(base.details ?? undefined, 'other') ?? {};
  const legs = [
    ...journey.outbound.map((leg, i, all) => ({ leg, title: numbered(base.title, i, all.length) })),
    ...journey.returning.map((leg, i, all) => ({
      leg,
      title: `Return: ${numbered(base.title, i, all.length)}`,
    })),
  ];

  return legs.map(({ leg, title }, index) => {
    const route = Object.fromEntries(
      ROUTE_KEYS.map((key) => [key, trimmed(leg[key])]).filter(([, value]) => value !== undefined),
    );
    const first = index === 0;
    return {
      ...base,
      kind: 'transport',
      title: title.slice(0, 120),
      start: leg.departs,
      end: leg.arrives,
      details: { ...shared, ...route, journeyId },
      priceAmount: first ? base.priceAmount : undefined,
      priceCurrency: first ? base.priceCurrency : undefined,
      isPaid: first ? base.isPaid : false,
    };
  });
}

function numbered(title: string, index: number, count: number): string {
  return count > 1 ? `${title.trim()} (${index + 1}/${count})` : title.trim();
}

/** The other legs of the journey this item belongs to, in time order. Empty for a lone item. */
export function journeyLegs<T extends Pick<TripItem, 'id' | 'details' | 'start'>>(
  items: readonly T[],
  item: Pick<TripItem, 'id' | 'details'>,
): T[] {
  const id = item.details?.journeyId;
  if (typeof id !== 'string' || id === '') return [];
  return items
    .filter((other) => other.id !== item.id && other.details?.journeyId === id)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** By the instant, not the wall clock: legs are written in different zones. Undated last. */
function sortKey(item: Pick<TripItem, 'start'>): string {
  return item.start ? toInstant(item.start) : '~';
}
