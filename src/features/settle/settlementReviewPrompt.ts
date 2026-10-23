import { Alert } from 'react-native';

import { SettlementReviewNeeded } from '../../domain/balances';
import type { MoneyWriteOptions } from '../../repositories/moneyWrites';

function askToContinue(error: SettlementReviewNeeded): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      `Settlements in ${error.currencies.join(' and ')}`,
      error.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/**
 * A write that may take a shared cost out of a currency with settlements (§15.2). It is tried as
 * it is; the repository refuses — nothing saved — if it would, and the person is told. *Cancel*
 * leaves everything as it was; *Continue* writes it again, saying so, and the currency waits for its
 * settlements to be reviewed. True when it was written. Any other error is the caller's.
 */
export async function withSettlementReview(write: (options: MoneyWriteOptions) => Promise<unknown>): Promise<boolean> {
  try {
    await write({});
    return true;
  } catch (error) {
    if (!(error instanceof SettlementReviewNeeded)) throw error;
    if (!(await askToContinue(error))) return false;
    await write({ acceptSettlementReview: true });
    return true;
  }
}
