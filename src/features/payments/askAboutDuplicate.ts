import { Alert } from 'react-native';

/**
 * An expense whose amount matches a booking's price or balance (§15 *10*): never merged by itself.
 * The person links it, keeps it as spending, or goes back to the form.
 */
export function askAboutDuplicate(title: string): Promise<'link' | 'keep' | 'back'> {
  return new Promise((resolve) =>
    Alert.alert(
      `Is this a payment for “${title}”?`,
      'Its amount matches that booking. Linked, it counts as paid on the booking — not twice.',
      [
        { text: 'Go back', style: 'cancel', onPress: () => resolve('back') },
        { text: 'Keep as spending', onPress: () => resolve('keep') },
        { text: 'Link it', onPress: () => resolve('link') },
      ],
      { cancelable: true, onDismiss: () => resolve('back') },
    ),
  );
}
