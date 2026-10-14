import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  legacyNames,
  travellerNameSchema,
  type Traveller,
  type TravellerClassification,
} from '../../../src/domain/traveller';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  addTripTraveller,
  createTripTraveller,
  listTravellers,
  listTripTravellers,
  removeTripTraveller,
  updateTripTravellerClassification,
  TRAVELLER_TABLES,
} from '../../../src/repositories/travellers';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { AddByName } from '../../../src/ui/components/AddByName';
import { HeaderAction } from '../../../src/ui/components/HeaderAction';
import { Icon } from '../../../src/ui/components/Icon';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { Sheet } from '../../../src/ui/components/Sheet';
import { gutter, radius, spacing, touchTarget, type, useColors } from '../../../src/ui/tokens';

const CLASSIFICATION_LABELS: Record<TravellerClassification, string> = {
  adult: 'Adult',
  child: 'Child',
  unspecified: 'Not specified',
};

const CLASSIFICATION_OPTIONS: { value: TravellerClassification; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'unspecified', label: 'Not specified' },
];

/**
 * Who is going on a trip (C2): picked from the travellers you keep, or added here. Names typed in
 * the trip's old Travellers field are shown until each is turned into a profile — by a tap, never
 * by matching on its own (FB-12).
 */
export default function TripTravellersScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const membersQuery = useLiveQuery(
    useCallback((database) => listTripTravellers(database, tripId), [tripId]),
    TRAVELLER_TABLES,
    [tripId],
  );
  const profilesQuery = useLiveQuery(listTravellers, TRAVELLER_TABLES);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const others = profiles.filter((profile) => !members.some((member) => member.id === profile.id));
  const trip = tripQuery.data;
  const [editingMember, setEditingMember] = useState<Traveller | null>(null);
  const typed = useMemo(
    () => legacyNames(trip?.travellers ?? [], members, profiles),
    [trip, members, profiles],
  );

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Travellers"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const failed = queryView(membersQuery) === 'failed' || queryView(profilesQuery) === 'failed';

  const addNew = async (text: string) => {
    const name = travellerNameSchema.safeParse(text);
    if (!name.success) return name.error.issues[0]?.message;
    await createTripTraveller(db, trip.id, name.data);
  };

  const confirmRemove = (member: Traveller) =>
    Alert.alert(
      `Remove ${member.name} from ${trip.name}?`,
      'They will be removed from this trip and unlinked from its bookings. Their reusable traveller profile will remain safe.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove from trip',
          style: 'destructive',
          onPress: () => void removeTripTraveller(db, trip.id, member.id),
        },
      ],
    );

  return (
    <Screen>
      <ScreenHeader title="Travellers" subtitle={trip.name} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StaleNotice queries={[membersQuery, profilesQuery]} />
        {failed ? (
          <LoadFailed
            what="the travellers"
            onRetry={() => {
              membersQuery.refetch();
              profilesQuery.refetch();
            }}
          />
        ) : null}

        <View style={styles.section}>
          <SectionLabel>Going</SectionLabel>
          {members.length > 0 ? (
            <Rows>
              {members.map((member) => (
                <ListRow
                  key={member.id}
                  title={member.name}
                  subtitle={`For this trip: ${CLASSIFICATION_LABELS[member.classification]}`}
                  onPress={() => setEditingMember(member)}
                  trailing={
                    <HeaderAction
                      label="Remove"
                      accessibilityLabel={`Remove ${member.name} from ${trip.name}`}
                      onPress={() => confirmRemove(member)}
                    />
                  }
                />
              ))}
            </Rows>
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>Nobody chosen yet.</Text>
          )}
          <AddByName placeholder="Someone new" onAdd={addNew} />
        </View>

        {typed.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Names typed before</SectionLabel>
            <Text style={[type.caption, { color: c.textMuted }]}>
              From this trip’s Travellers field. Make each a traveller to choose them for bookings;
              the field itself is left as it is.
            </Text>
            <Rows>
              {typed.map(({ name, match }) => (
                <ListRow
                  key={name}
                  title={name}
                  trailing={
                    <HeaderAction
                      label={match ? `Use “${match.name}”` : 'Make a traveller'}
                      onPress={() =>
                        void (match
                          ? addTripTraveller(db, trip.id, match.id)
                          : createTripTraveller(db, trip.id, name))
                      }
                    />
                  }
                />
              ))}
            </Rows>
          </View>
        ) : null}

        {others.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Your travellers</SectionLabel>
            <Rows>
              {others.map((profile) => (
                <ListRow
                  key={profile.id}
                  title={profile.name}
                  trailing={
                    <HeaderAction
                      icon="add"
                      label="Add"
                      accessibilityLabel={`Add ${profile.name} to ${trip.name}`}
                      onPress={() => void addTripTraveller(db, trip.id, profile.id)}
                    />
                  }
                />
              ))}
            </Rows>
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        visible={editingMember !== null}
        title={`For this trip: ${editingMember?.name ?? ''}`}
        onClose={() => setEditingMember(null)}
        closeLabel="Done">
        <Text style={[type.caption, { color: c.textMuted, marginBottom: spacing.md }]}>
          Overrides this traveller's profile default for {trip.name} only.
        </Text>
        <View style={styles.sheetOptions}>
          {CLASSIFICATION_OPTIONS.map((opt) => {
            const selected = editingMember?.classification === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  if (editingMember) {
                    void updateTripTravellerClassification(db, trip.id, editingMember.id, opt.value);
                    setEditingMember((prev) => (prev ? { ...prev, classification: opt.value } : null));
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Set ${editingMember?.name} classification for ${trip.name} to ${opt.label}`}
                accessibilityState={{ selected }}
                style={[
                  styles.sheetOption,
                  {
                    backgroundColor: selected ? c.accentSoft : c.surfaceSunken,
                    borderColor: selected ? c.accent : c.border,
                  },
                ]}>
                <Text
                  style={[
                    type.body,
                    {
                      color: selected ? c.accentText : c.text,
                      fontWeight: selected ? '600' : 'normal',
                    },
                  ]}>
                  {opt.label}
                </Text>
                {selected ? <Icon name="check" size={20} color={c.accentText} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.sm },
  sheetOptions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: touchTarget,
  },
});
