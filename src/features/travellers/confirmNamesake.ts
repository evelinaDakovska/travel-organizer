import { Alert } from 'react-native';

/**
 * A traveller of this name is already saved (QA D-02). Two people can share a name, so this asks
 * rather than refuses; dismissing it adds nobody.
 */
export function confirmNamesake(name: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      `There is already ${name}`,
      'Add another person with the same name? To put the saved one on a trip, tick them instead.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Add another', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
