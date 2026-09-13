import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

import { isSafeExternalUrl, type Resource } from '../../domain/resource';
import { openStoredFile, storedFileExists } from '../../files/storage';

/** Never throws: a failure to open is explained, because this runs while someone is at a gate. */
export async function openResource(resource: Resource): Promise<void> {
  if (resource.kind === 'file' && !storedFileExists(resource.storedPath)) {
    Alert.alert(
      'File missing',
      `“${resource.label}” is no longer saved on this phone. Remove it and attach it again.`,
    );
    return;
  }

  try {
    if (resource.kind === 'link') {
      if (!isSafeExternalUrl(resource.url)) throw new Error(`Refused link: ${resource.url}`);
      await Linking.openURL(resource.url);
    } else {
      await openStoredFile(resource);
    }
  } catch (error) {
    console.warn('Open failed', error);
    Alert.alert(
      'Could not open',
      resource.kind === 'link'
        ? 'No app on this phone can open that link.'
        : 'No app on this phone can open this type of file.',
    );
  }
}
