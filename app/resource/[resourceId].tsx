import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { ResourceEditForm } from '../../src/features/resources/ResourceEditForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  countOtherFileReferences,
  deleteResource,
  getResource,
  renameResource,
  RESOURCE_TABLES,
} from '../../src/repositories/resources';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

export default function EditResource() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { resourceId } = useLocalSearchParams<{ resourceId: string }>();

  const resourceQuery = useLiveQuery(
    useCallback((database) => getResource(database, resourceId), [resourceId]),
    RESOURCE_TABLES,
    [resourceId],
  );

  const resource = resourceQuery.data;
  const resourceView = queryView(resourceQuery);
  if (resourceView !== 'ready' || !resource) {
    return (
      <QueryScreen
        title="Attachment"
        view={resourceView}
        missingText="This attachment no longer exists."
        what="this attachment"
        onRetry={resourceQuery.refetch}
      />
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
        onAttachToItem={
          resource.owner.scope === 'expense'
            ? undefined
            : () =>
                router.push({
                  pathname: '/resource/attach-to',
                  params: { resourceId: resource.id },
                })
        }
      />
    </Screen>
  );
}

