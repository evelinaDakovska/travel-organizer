import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { TripForm } from '../../../src/features/trips/TripForm';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  countTripContents,
  deleteTrip,
  getTrip,
  TRIP_TABLES,
  updateTrip,
} from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { spacing, type, useColors } from '../../../src/ui/tokens';

export default function EditTrip() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const { data: trip, loading } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  /** Names the blast radius — these files may be the only copies. */
  const confirmDelete = useCallback(async () => {
    const { items, files } = await countTripContents(db, tripId);
    const detail = [
      items > 0 ? `${items} item${items === 1 ? '' : 's'}` : null,
      files > 0 ? `${files} saved file${files === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' and ');

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

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Edit trip" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Edit trip" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This trip no longer exists.</Text>
        </View>
      </Screen>
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
      <View style={styles.danger}>
        <Button label="Delete trip" variant="danger" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  danger: { padding: spacing.xl, paddingTop: 0 },
});
