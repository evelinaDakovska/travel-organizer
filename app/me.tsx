import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, listPhrase } from '../src/domain/format';
import {
  CLASSIFICATION_LABELS,
  TRAVELLER_CLASSIFICATIONS,
  travellerLabel,
  travellerNameSchema,
  type Traveller,
  type TravellerClassification,
} from '../src/domain/traveller';
import { deviceToday } from '../src/domain/trip';
import { useMe } from '../src/features/travellers/useMe';
import { queryView } from '../src/hooks/queryView';
import { useBusy } from '../src/hooks/useBusy';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import {
  addTravellerToTrips,
  createMe,
  listTravellers,
  listTripsWithout,
  setMe,
  TRAVELLER_TABLES,
  type TripWithoutTraveller,
} from '../src/repositories/travellers';
import { TRIP_TABLES } from '../src/repositories/trips';
import { Button } from '../src/ui/components/Button';
import { CheckBox } from '../src/ui/components/CheckBox';
import { ChoiceField } from '../src/ui/components/ChoiceField';
import { Field, Input } from '../src/ui/components/Field';
import { ListRow, Rows } from '../src/ui/components/ListRow';
import { LoadFailed } from '../src/ui/components/QueryStates';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../src/ui/tokens';

/**
 * My traveller profile (2B-0): which saved traveller is the person using the app on this phone.
 * Choosing one changes nothing by itself; putting Me on trips that already exist is a separate,
 * confirmed step, and touches membership only — never who goes to a booking, prices or lists.
 */
export default function MeScreen() {
  const c = useColors();
  const router = useRouter();
  const { me, loading } = useMe();
  const [changing, setChanging] = useState(false);
  const profiles = useLiveQuery(listTravellers, TRAVELLER_TABLES);

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="My traveller profile" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="My traveller profile"
        subtitle="You, as a traveller — on this phone only"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {me && !changing ? (
          <>
            <View style={styles.section}>
              <Rows>
                <ListRow
                  title={travellerLabel(me, me.id)}
                  subtitle={`${CLASSIFICATION_LABELS[me.classification]} · Tap to rename`}
                  onPress={() =>
                    router.push({
                      pathname: '/traveller/[travellerId]',
                      params: { travellerId: me.id },
                    })
                  }
                />
              </Rows>
              <Text style={[type.caption, { color: c.textMuted }]}>
                New trips start with you on them. You are offered as “{me.name} (Me)” wherever
                travellers are chosen.
              </Text>
              <Button
                label="This is not me — choose another"
                variant="secondary"
                compact
                onPress={() => setChanging(true)}
              />
            </View>
            <AddMeToTrips me={me} />
          </>
        ) : (
          <ChooseMe
            profiles={profiles.data ?? []}
            failed={queryView(profiles) === 'failed'}
            onRetry={profiles.refetch}
            current={me}
            onDone={() => setChanging(false)}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

/** Pick an existing profile as Me, or make a new one. Never creates a second you by itself. */
function ChooseMe({
  profiles,
  failed,
  onRetry,
  current,
  onDone,
}: {
  profiles: Traveller[];
  failed: boolean;
  onRetry: () => void;
  current: Traveller | null;
  onDone: () => void;
}) {
  const c = useColors();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [classification, setClassification] = useState<TravellerClassification>('adult');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const others = profiles.filter((profile) => profile.id !== current?.id);

  const choose = (profile: Traveller) =>
    Alert.alert(
      `Are you ${profile.name}?`,
      'They become your profile on this phone. No trip, booking or list changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Yes, I am ${profile.name}`,
          onPress: () =>
            void run(async () => {
              await setMe(db, profile.id);
              onDone();
            }),
        },
      ],
    );

  const create = async () => {
    const parsed = travellerNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name');
      return;
    }
    await run(async () => {
      await createMe(db, parsed.data, classification);
      onDone();
    });
  };

  return (
    <>
      <Text style={[type.body, { color: c.textMuted }]}>
        Tell the app which traveller is you. It then puts you on new trips and lets you pick
        yourself in lists and bookings. If you are already saved as a traveller, choose that
        profile — do not make a second one.
      </Text>

      {failed ? <LoadFailed what="the travellers" onRetry={onRetry} /> : null}
      {others.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Is one of these you?</SectionLabel>
          <Rows>
            {others.map((profile) => (
              <ListRow
                key={profile.id}
                title={profile.name}
                subtitle={CLASSIFICATION_LABELS[profile.classification]}
                onPress={() => choose(profile)}
              />
            ))}
          </Rows>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionLabel>{others.length > 0 ? 'Or add yourself' : 'Add yourself'}</SectionLabel>
        <Field label="Your name" error={error ?? undefined}>
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="The name your travel companions use"
            invalid={!!error}
          />
        </Field>
        <Field label="Classification">
          <ChoiceField
            value={classification}
            options={TRAVELLER_CLASSIFICATIONS}
            labelFor={(value) => CLASSIFICATION_LABELS[value]}
            onChange={(next) => next && setClassification(next)}
          />
        </Field>
        <Button label="Save my profile" busy={busy} onPress={() => void create()} />
        {current ? (
          <Button label="Keep the current one" variant="secondary" compact onPress={onDone} />
        ) : null}
      </View>
    </>
  );
}

/**
 * Trips made before Me existed, offered — not changed — one by one. Upcoming and ongoing trips
 * start ticked, past ones not; nothing happens until confirmed.
 */
function AddMeToTrips({ me }: { me: Traveller }) {
  const c = useColors();
  const db = useSQLiteContext();
  const [busy, run] = useBusy();
  const query = useLiveQuery(
    useCallback((database) => listTripsWithout(database, me.id), [me.id]),
    [...TRIP_TABLES, ...TRAVELLER_TABLES],
    [me.id],
  );
  const trips = useMemo(() => query.data ?? [], [query.data]);
  const today = deviceToday();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  // Until the person ticks anything: the trips not over yet.
  const selected =
    picked ?? new Set(trips.filter((trip) => trip.endDate >= today).map((trip) => trip.id));

  const toggle = (trip: TripWithoutTraveller) => {
    const next = new Set(selected);
    if (next.has(trip.id)) next.delete(trip.id);
    else next.add(trip.id);
    setPicked(next);
  };

  const chosen = trips.filter((trip) => selected.has(trip.id));
  const confirm = () =>
    Alert.alert(
      `Add ${me.name} to ${chosen.length === 1 ? 'this trip' : `${chosen.length} trips`}?`,
      `${listPhrase(chosen.map((trip) => trip.name))}.\n\nYou are added as a traveller only. Who goes ` +
        'to each booking, prices, expenses, payments, documents and lists stay exactly as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add me',
          onPress: () =>
            void run(async () => {
              await addTravellerToTrips(db, me.id, chosen.map((trip) => trip.id));
              setPicked(null);
            }),
        },
      ],
    );

  if (queryView(query) === 'failed') {
    return <LoadFailed what="your trips" onRetry={query.refetch} />;
  }
  if (query.loading || trips.length === 0) {
    return query.loading ? null : (
      <Text style={[type.caption, { color: c.textMuted }]}>You are on every trip.</Text>
    );
  }

  return (
    <View style={styles.section}>
      <SectionLabel>Trips you are not on yet</SectionLabel>
      <Text style={[type.caption, { color: c.textMuted }]}>
        Tick the trips to add yourself to. Bookings keep the people already chosen for them.
      </Text>
      <Rows>
        {trips.map((trip) => {
          const on = selected.has(trip.id);
          return (
            <ListRow
              key={trip.id}
              title={trip.name}
              subtitle={formatDateRange(trip.startDate, trip.endDate)}
              // The box is the control: a row that opened something would show an arrow.
              leading={
                <CheckBox
                  checked={on}
                  onToggle={() => toggle(trip)}
                  accessibilityLabel={`Add me to ${trip.name}`}
                />
              }
            />
          );
        })}
      </Rows>
      <Button
        label={
          chosen.length === 0
            ? 'Tick a trip to add yourself'
            : `Add me to ${chosen.length === 1 ? '1 trip' : `${chosen.length} trips`}`
        }
        disabled={chosen.length === 0}
        busy={busy}
        onPress={confirm}
      />
    </View>
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
});
