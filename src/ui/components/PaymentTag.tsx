import type { PaymentStatus } from '../../domain/bookingCosts';
import { Tag } from './Tag';

/**
 * Paid or not (F7, D29). *To pay* is the loud one — it is the one that asks for something; *Paid*
 * stays quiet. Nothing when nothing is known: a free item is not owed.
 */
export function PaymentTag({ status }: { status: PaymentStatus | null | undefined }) {
  if (!status) return null;
  return status === 'paid' ? (
    <Tag label="Paid" tone="neutral" icon="check" />
  ) : (
    <Tag label="To pay" tone="danger" icon="wallet" />
  );
}
