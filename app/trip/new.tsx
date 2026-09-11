import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { TripForm } from '../../src/features/trips/TripForm';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { isResolvableTimezone } from '../../src/domain/timezones';
import { getDefaultTravellers, SETTINGS_TABLES } from '../../src/repositories/settings';
import { createTrip } from '../../src/repositories/trips';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { useColors } from '../../src/ui/tokens';

export default function NewTrip() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();

  // Prefills "travelling with" from the saved default.
  const { data: defaultTravellers, loading } = useLiveQuery(
    getDefaultTravellers,
    SETTINGS_TABLES,
  );

  return (
    <Screen>
      <ScreenHeader title="New trip" />
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <TripForm
          submitLabel="Create trip"
          defaultValues={{
            name: '',
            destination: undefined,
            startDate: today(),
            endDate: today(),
            defaultTz: deviceTimezone(),
            travellers: defaultTravellers?.length ? defaultTravellers : undefined,
            travellerCount: undefined,
            notes: undefined,
          }}
          onSubmit={async (input) => {
            const id = await createTrip(db, input);
            router.replace(`/trip/${id}`);
          }}
        />
      )}
    </Screen>
  );
}

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function deviceTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isResolvableTimezone(zone) ? zone : 'UTC';
}

const styles = StyleSheet.create({ centre: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
