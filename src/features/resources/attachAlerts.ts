import { Alert, Linking } from 'react-native';

import { CameraPermissionError } from './attach';

/** Says nothing when everything was saved. */
export function alertIfSomeFailed(attached: number, failed: number): void {
  if (failed === 0) return;
  Alert.alert(
    attached > 0 ? `${failed} of ${attached + failed} could not be attached` : 'Could not attach',
    'Those files could not be saved. Try again, or pick another copy.',
  );
}

export function alertAttachError(error: unknown): void {
  if (error instanceof CameraPermissionError) {
    Alert.alert('The camera is not allowed', 'Allow the camera for this app in Settings.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return;
  }
  console.warn('Attach failed', error);
  Alert.alert('Could not attach', 'The file could not be saved. Try again, or pick another copy.');
}
