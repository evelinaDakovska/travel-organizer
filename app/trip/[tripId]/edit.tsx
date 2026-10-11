import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countOf, listPhrase } from '../../../src/domain/format';
import { TripForm } from '../../../src/features/trips/TripForm';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  countTripContents,
  deleteTrip,
  getTrip,
  TRIP_TABLES,
  updateTrip,
} from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { spacing } from '../../../src/ui/tokens';

export default function EditTrip() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  // The screen draws under the navigation bar, so the pinned button must clear it itself.
  const insets = useSafeAreaInsets();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  const trip = tripQuery.data;
  /** Names the blast radius — these files may be the only copies. */
  const confirmDelete = useCallback(async () => {
    const { items, files, expenses } = await countTripContents(db, tripId);
    const detail = listPhrase(
      [
        items > 0 ? countOf(items, 'item') : null,
        expenses > 0 ? countOf(expenses, 'expense') : null,
        files > 0 ? countOf(files, 'saved file') : null,
      ].filter((part) => part !== null),
    );

    Alert.alert(
      `Delete ${trip?.name ?? 'this trip'}?`,
      detail ? `This also removes ${detail}. It cannot be undone.` : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTrip(db, tripId);
            router.replace('/');
          },
        },
      ],
    );
  }, [db, tripId, trip?.name, router]);

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Edit trip"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit trip" />
      <TripForm
        submitLabel="Save changes"
        defaultValues={{
          name: trip.name,
          destination: trip.destination ?? undefined,
          startDate: trip.startDate,
          endDate: trip.endDate,
          defaultTz: trip.defaultTz,
          travellers: trip.travellers.length > 0 ? trip.travellers : undefined,
          travellerCount: trip.travellerCount ?? undefined,
          notes: trip.notes ?? undefined,
        }}
        onSubmit={async (input) => {
          await updateTrip(db, trip.id, input);
          router.back();
        }}
      />
      <View style={[styles.danger, { paddingBottom: spacing.xl + insets.bottom }]}>
        <Button label="Delete trip" variant="danger" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  danger: { padding: spacing.xl, paddingTop: 0 },
});
