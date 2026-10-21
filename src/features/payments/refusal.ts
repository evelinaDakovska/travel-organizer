import { Alert } from 'react-native';

import { MoneyRuleError } from '../../domain/bookingPayments';

/**
 * Shows a money rule's explanation (3D-1) and says so; anything else is left to the caller.
 * Nothing was written when one of these is thrown — the repository refuses before it writes.
 */
export function alertRefusal(error: unknown, title = 'Not saved'): boolean {
  if (!(error instanceof MoneyRuleError)) return false;
  Alert.alert(title, error.message);
  return true;
}
