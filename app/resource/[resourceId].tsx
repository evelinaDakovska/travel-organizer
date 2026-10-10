import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { ResourceEditForm } from '../../src/features/resources/ResourceEditForm';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  countOtherFileReferences,
  deleteResource,
  getResource,
  renameResource,
  RESOURCE_TABLES,
} from '../../src/repositories/resources';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function EditResource() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { resourceId } = useLocalSearchParams<{ resourceId: string }>();

  const { data: resource, loading } = useLiveQuery(
    useCallback((database) => getResource(database, resourceId), [resourceId]),
    RESOURCE_TABLES,
    [resourceId],
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Attachment" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!resource) {
    return (
      <Screen>
        <ScreenHeader title="Attachment" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This attachment no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  const confirmDelete = async () => {
    // A file also attached elsewhere stays for those; only this row goes.
    const elsewhere = await countOtherFileReferences(db, resource.id);
    Alert.alert(
      `Remove ${resource.label}?`,
      resource.kind !== 'file'
        ? 'This cannot be undone.'
        : elsewhere > 0
          ? 'The file stays where else it is attached.'
          : 'The copy saved on this phone is removed too. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteResource(db, resource.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Attachment" />
      <ResourceEditForm
        resource={resource}
        onSave={async (values) => {
          await renameResource(db, resource.id, values.label, values.subtype);
          router.back();
        }}
        onDelete={() => void confirmDelete()}
        onAttachToItem={() =>
          router.push({ pathname: '/resource/attach-to', params: { resourceId: resource.id } })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
