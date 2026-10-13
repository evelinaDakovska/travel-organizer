import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { defaultItemDate, type Trip } from '../../../src/domain/trip';
import type { TripItem } from '../../../src/domain/tripItem';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  scheduleTripItem,
  TRIP_ITEM_TABLES,
} from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Field } from '../../../src/ui/components/Field';
import { MomentField, type MomentValue } from '../../../src/ui/components/MomentField';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';
import { askForRemindersIfDue } from '../../../src/notifications/reminders';

/** Moving an idea onto the timeline: give it a day, and it becomes confirmed. */
export default function ScheduleItem() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const itemQuery = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );
  const item = itemQuery.data;
  const tripId = item?.tripId;
  const tripQuery = useLiveQuery(
    useCallback(async (database) => (tripId ? getTrip(database, tripId) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  const itemView = queryView(itemQuery);
  if (itemView !== 'ready' || !item) {
    return (
      <QueryScreen
        title="Add to itinerary"
        view={itemView}
        missingText="This item no longer exists."
        what="this item"
        onRetry={itemQuery.refetch}
      />
    );
  }
  const trip = tripQuery.data;
  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Add to itinerary"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Add to itinerary" leading="close" />
      <ScheduleForm item={item} trip={trip} />
    </Screen>
  );
}

function ScheduleForm({ item, trip }: { item: TripItem; trip: Trip }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [moment, setMoment] = useState<MomentValue | undefined>(
    item.start
      ? { local: item.start.local, ...(item.startTzOverride ? { tz: item.startTzOverride } : {}) }
      : undefined,
  );

  const move = async () => {
    if (!moment) return;
    setBusy(true);
    try {
      await scheduleTripItem(db, item.id, moment, 'confirmed');
      router.back();
      void askForRemindersIfDue(db, item.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[type.body, { color: c.textMuted }]}>
        “{item.title}” leaves Places and goes onto the timeline as confirmed. Its notes and
        attachments come with it.
      </Text>

      <Field label="When" hint="A day is enough. Add a time if you know it">
        <MomentField
          value={moment}
          onChange={setMoment}
          defaultTz={trip.defaultTz}
          initial={defaultItemDate(trip)}
        />
      </Field>

      <Button label="Add to itinerary" disabled={!moment} busy={busy} onPress={() => void move()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
});
