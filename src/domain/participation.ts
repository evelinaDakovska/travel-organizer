import { addCalendarDays, toInstant, type LocalMoment } from './time';
import type { TripItem, TripItemKind } from './tripItem';

/**
 * Who is going to an item (3B): the rules for a new item and for someone joining a trip. Pure —
 * the repository reads and writes, the screens ask these what to offer.
 *
 * Participation says who takes part, nothing more: it is never a price, a share or a payment.
 */

/**
 * Who starts ticked on an item made by hand in the item form: every current member of the trip,
 * for plans and saved places of every kind. A to-do starts with nobody — it is something to do,
 * not something people go to. Nothing else that creates items uses this: AI import, shared-in
 * items and templates keep *not specified* (Phase 3, §16).
 */
export function newItemParticipants(
  kind: TripItemKind,
  members: readonly { id: string }[],
): string[] {
  return kind === 'task' ? [] : members.map((member) => member.id);
}

/** Whether an item can be offered to someone who joins the trip: not a to-do, not cancelled. */
export function offeredOnJoin(item: Pick<TripItem, 'kind' | 'status'>): boolean {
  return item.kind !== 'task' && item.status !== 'cancelled';
}

export type JoinCandidates<T> = {
  /** Plans: upcoming soonest first, then undated by title, then past most recent first. */
  plans: T[];
  /** Saved places (ideas), by title. */
  places: T[];
};

type Candidate = Pick<TripItem, 'id' | 'kind' | 'status' | 'title' | 'start' | 'end'>;

/**
 * What *Also add … to* offers, all unticked: the trip's plans and saved places the person is not
 * on yet, as `offeredOnJoin` allows. A plan is upcoming until it has ended (its end, else its
 * start — a date without a time lasts the whole day); ties fall to the title, then the id, so the
 * order is always the same.
 */
export function joinCandidates<T extends Candidate>(
  items: readonly T[],
  now: Date = new Date(),
): JoinCandidates<T> {
  const nowIso = now.toISOString();
  const offered = items.filter(offeredOnJoin);
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const startOf = (item: T) => (item.start ? toInstant(item.start) : '');

  const upcoming: T[] = [];
  const undated: T[] = [];
  const past: T[] = [];
  for (const item of offered) {
    if (item.status !== 'confirmed') continue;
    if (!item.start) undated.push(item);
    else if (endsAfter(item.end ?? item.start) > nowIso) upcoming.push(item);
    else past.push(item);
  }
  upcoming.sort((a, b) => startOf(a).localeCompare(startOf(b)) || byTitle(a, b));
  undated.sort(byTitle);
  past.sort((a, b) => startOf(b).localeCompare(startOf(a)) || byTitle(a, b));

  return {
    plans: [...upcoming, ...undated, ...past],
    places: offered.filter((item) => item.status === 'idea').sort(byTitle),
  };
}

/** The instant a moment is over: the next midnight for a date alone, else the moment itself. */
function endsAfter(moment: LocalMoment): string {
  return moment.precision === 'date'
    ? toInstant({ ...moment, local: addCalendarDays(moment.local, 1) })
    : toInstant(moment);
}
