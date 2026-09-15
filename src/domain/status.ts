import type { TripItemStatus } from './tripItem';

export type StatusActions = {
  /** Move an idea onto the timeline as a confirmed item. */
  promote: boolean;
  cancel: boolean;
  /** Bring a cancelled item back as confirmed. */
  restore: boolean;
  delete: boolean;
};

/**
 * What an item's status lets you do next. Delete is withheld from confirmed items: a booking
 * holds tickets that may be the only copies, so it is cancelled first (decision log D21).
 */
export function statusActions(status: TripItemStatus): StatusActions {
  return {
    promote: status === 'idea',
    cancel: status === 'confirmed',
    restore: status === 'cancelled',
    delete: status !== 'confirmed',
  };
}
