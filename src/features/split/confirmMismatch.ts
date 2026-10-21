import { Alert } from 'react-native';

import { splitMismatchWarning } from '../../domain/costShares';

/**
 * A new cost that a split by amounts no longer adds up to (3D-2): allowed, said first. The split
 * stays as saved and shows the difference; nothing is rescaled. Resolves true to save.
 */
export function confirmSplitMismatch(
  split: Parameters<typeof splitMismatchWarning>[0],
  nextTotal: number | null | undefined,
  currency: string,
): Promise<boolean> {
  const message = splitMismatchWarning(split, nextTotal, currency);
  if (!message) return Promise.resolve(true);
  return new Promise((resolve) =>
    Alert.alert(
      'The split will not add up',
      message,
      [
        { text: 'Go back', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Save', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
