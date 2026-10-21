import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CLASSIFICATION_LABELS,
  legacyNames,
  namesakeHint,
  travellerLabel,
  travellerNameSchema,
  type Traveller,
  type TravellerClassification,
} from '../../../src/domain/traveller';
import { MoneyRuleError } from '../../../src/domain/bookingPayments';
import type { JoinCandidates } from '../../../src/domain/participation';
import type { TripItem } from '../../../src/domain/tripItem';
import { AddToItemsSheet } from '../../../src/features/travellers/AddToItemsSheet';
import { useMe } from '../../../src/features/travellers/useMe';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  addTravellerToItems,
  addTripTraveller,
  convertLegacyTraveller,
  createTripTraveller,
  listJoinCandidates,
  listTravellers,
  listTripTravellers,
  removeTripTraveller,
  travellerTripNames,
  updateTripTravellerClassification,
  TRAVELLER_TABLES,
} from '../../../src/repositories/travellers';
import { listTripCover, setTripCover, SHARE_TABLES } from '../../../src/repositories/costShares';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { AddByName } from '../../../src/ui/components/AddByName';
import { Button } from '../../../src/ui/components/Button';
import { HeaderAction } from '../../../src/ui/components/HeaderAction';
import { Icon } from '../../../src/ui/components/Icon';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { MultiChoiceField } from '../../../src/ui/components/MultiChoiceField';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { Sheet } from '../../../src/ui/components/Sheet';
import { gutter, radius, spacing, touchTarget, type, useColors } from '../../../src/ui/tokens';
import { alertRefusal } from '../../../src/features/payments/refusal';

/** Someone who just joined, and what they could be added to. */
type Joining = { id: string; name: string; candidates: JoinCandidates<TripItem> };

const CLASSIFICATION_OPTIONS: { value: TravellerClassification; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'unspecified', label: 'Not specified' },
];

/**
 * Who is going on a trip (C2): picked from the travellers you keep, or added here. Names typed in
 * the trip's old Travellers field are shown until each is turned into a profile — by a tap, never
 * by matching on its own (FB-12). Whoever joins is on none of the trip's plans until ticked in
 * *Also add … to* (3B), offered right after joining and from their row at any time.
 */
export default function TripTravellersScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { meId } = useMe();

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
  // Who covers each child's share on this trip (3D-2).
  const { data: cover = [] } = useLiveQuery(
    useCallback((database) => listTripCover(database, tripId), [tripId]),
    SHARE_TABLES,
    [tripId],
  );
  // Two profiles of one name are told apart by their trips (3B), as when importing a trip (2B).
  const { data: tripsOf = {} } = useLiveQuery(travellerTripNames, [
    ...TRIP_TABLES,
    ...TRAVELLER_TABLES,
  ]);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const trip = tripQuery.data;
  const [editingMember, setEditingMember] = useState<Traveller | null>(null);
  const convertingRef = useRef(false);
  const [convertingName, setConvertingName] = useState<string | null>(null);
  const [joining, setJoining] = useState<Joining | null>(null);

  const typed = useMemo(
    () =>
      legacyNames(
        trip?.travellers ?? [],
        members,
        profiles,
        trip?.convertedTravellers ?? [],
      ),
    [trip, members, profiles],
  );

  const legacyMatchedProfileIds = useMemo(
    () =>
      new Set(
        typed.flatMap((item) =>
          item.match ? [item.match.id] : item.matches.map((m) => m.id),
        ),
      ),
    [typed],
  );

  const others = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          !members.some((member) => member.id === profile.id) &&
          !legacyMatchedProfileIds.has(profile.id),
      ),
    [profiles, members, legacyMatchedProfileIds],
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

  /**
   * After someone joins: the trip's plans and saved places to add them to, all unticked. Nothing to
   * offer, no sheet — unless asked from their row, which then says why.
   */
  const offerItems = async (id: string, name: string, asked = false) => {
    try {
      const candidates = await listJoinCandidates(db, trip.id, id);
      if (candidates.plans.length + candidates.places.length > 0) {
        setJoining({ id, name, candidates });
      } else if (asked) {
        Alert.alert(
          `Nothing to add ${name} to`,
          `${trip.name} has no plans or saved places that ${name} is not on already.`,
        );
      }
    } catch {
      if (asked) Alert.alert('Could not read the plans', 'Please try again.');
    }
  };

  const addJoinerTo = async (itemIds: string[]) => {
    if (!joining) return;
    try {
      await addTravellerToItems(db, trip.id, joining.id, itemIds);
      setJoining(null);
    } catch {
      Alert.alert('Could not add to plans', 'Nothing was changed. Please try again.');
    }
  };

  const executeConvert = async (name: string, existingTravellerId?: string) => {
    if (convertingRef.current || !trip) return;
    convertingRef.current = true;
    setConvertingName(name);
    try {
      const result = await convertLegacyTraveller(db, {
        tripId: trip.id,
        legacyName: name,
        existingTravellerId,
      });
      tripQuery.refetch();
      membersQuery.refetch();
      profilesQuery.refetch();
      if (result.travellerId && !result.alreadyConverted) {
        const linked = profiles.find((profile) => profile.id === result.travellerId);
        void offerItems(result.travellerId, linked?.name ?? name.trim());
      }
    } catch {
      Alert.alert(
        'Could not convert traveller',
        'Something went wrong while linking this traveller to your trip. Please try again.',
      );
    } finally {
      convertingRef.current = false;
      setConvertingName(null);
    }
  };

  const addNew = async (text: string) => {
    if (convertingRef.current) return;
    const name = travellerNameSchema.safeParse(text);
    if (!name.success) return name.error.issues[0]?.message;
    const id = await createTripTraveller(db, trip.id, name.data);
    void offerItems(id, name.data);
  };

  const handleLegacyConvert = (name: string, matches: Traveller[]) => {
    if (convertingRef.current) return;

    if (matches.length > 1) {
      Alert.alert(
        `Link “${name}” to which profile?`,
        'Multiple profiles share this name. Choose one or create a new profile.',
        [
          ...matches.map((m) => ({
            text: `Link to ${m.name} (${CLASSIFICATION_LABELS[m.classification]})`,
            onPress: () => {
              void executeConvert(name, m.id);
            },
          })),
          {
            text: 'Create new profile',
            onPress: () => {
              void executeConvert(name);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    if (matches.length === 1) {
      void executeConvert(name, matches[0].id);
      return;
    }
    void executeConvert(name);
  };

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone';
  /** The adults who cover this child's share on the trip, if they are adults here now. */
  const coveringAdults = (childId: string) =>
    cover
      .filter((cv) => cv.childId === childId)
      .map((cv) => members.find((m) => m.id === cv.adultId))
      .filter((m): m is Traveller => m?.classification === 'adult');
  const memberSubtitle = (member: Traveller) => {
    const base = `For this trip: ${CLASSIFICATION_LABELS[member.classification]}`;
    if (member.classification !== 'child') return base;
    const adults = coveringAdults(member.id);
    return adults.length > 0
      ? `${base} · covered by ${adults.map((a) => a.name).join(' and ')}`
      : `${base} · not covered`;
  };

  const confirmRemove = (member: Traveller) => {
    if (convertingRef.current) return;
    // A default cover is a setting: it goes with them, and the children it leaves are named.
    const uncovered = cover
      .filter((cv) => cv.adultId === member.id && coveringAdults(cv.childId).length === 1)
      .map((cv) => nameOf(cv.childId));
    Alert.alert(
      `Remove ${member.name} from ${trip.name}?`,
      'They will be removed from this trip and unlinked from its bookings. Their reusable traveller profile will remain safe.' +
        (uncovered.length > 0
          ? ` ${uncovered.join(' and ')} will then be not covered — nobody else covers ${uncovered.length === 1 ? 'that share' : 'their shares'}.`
          : ''),
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove from trip',
          style: 'destructive',
          onPress: async () => {
            if (convertingRef.current) return;
            try {
              await removeTripTraveller(db, trip.id, member.id);
              membersQuery.refetch();
            } catch (error) {
              // Money records name them (3D-1, 3D-2): nothing was changed; each record can be opened.
              if (error instanceof MoneyRuleError) {
                Alert.alert(`${member.name} stays on this trip`, error.message, [
                  { text: 'Close', style: 'cancel' },
                  {
                    text: 'See the records',
                    onPress: () =>
                      router.push({
                        pathname: '/trip/[tripId]/holds',
                        params: { tripId: trip.id, travellerId: member.id },
                      }),
                  },
                ]);
                return;
              }
              Alert.alert(
                'Could not remove traveller',
                'Something went wrong while removing this traveller from the trip. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

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
                  title={travellerLabel(member, meId)}
                  subtitle={memberSubtitle(member)}
                  onPress={() => setEditingMember(member)}
                  trailing={
                    <HeaderAction
                      label="Remove"
                      accessibilityLabel={`Remove ${member.name} from ${trip.name}`}
                      disabled={convertingName !== null}
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
            <SectionLabel>Names from older trip notes</SectionLabel>
            <Text style={[type.caption, { color: c.textMuted }]}>
              From this trip’s original notes. Turn each into a profile to choose them for bookings
              and pricing; the original notes stay as they are.
            </Text>
            <Rows>
              {typed.map(({ name, match, matches }) => {
                const isConvertingThis = convertingName === name;
                const isAnyConverting = convertingName !== null;
                return (
                  <ListRow
                    key={name}
                    title={name}
                    subtitle={
                      matches.length > 1
                        ? `${matches.length} matching profiles`
                        : match
                          ? `Matches profile “${match.name}”`
                          : undefined
                    }
                    trailing={
                      <HeaderAction
                        disabled={isAnyConverting}
                        label={
                          isConvertingThis
                            ? 'Adding…'
                            : matches.length > 1
                              ? 'Choose profile'
                              : match
                                ? `Link to ${match.name}`
                                : 'Create traveller profile'
                        }
                        accessibilityLabel={
                          isConvertingThis
                            ? `Adding ${name}`
                            : matches.length > 1
                              ? `Choose profile for ${name}`
                              : match
                                ? `Link ${name} to ${match.name}`
                                : `Create traveller profile for ${name}`
                        }
                        onPress={() => handleLegacyConvert(name, matches)}
                      />
                    }
                  />
                );
              })}
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
                  title={travellerLabel(profile, meId)}
                  subtitle={namesakeHint(profile, profiles, tripsOf[profile.id] ?? [])}
                  trailing={
                    <HeaderAction
                      icon="add"
                      label="Add"
                      accessibilityLabel={`Add ${profile.name} to ${trip.name}`}
                      disabled={convertingName !== null}
                      onPress={() => {
                        if (convertingRef.current) return;
                        void (async () => {
                          try {
                            await addTripTraveller(db, trip.id, profile.id);
                            membersQuery.refetch();
                            void offerItems(profile.id, profile.name);
                          } catch {
                            Alert.alert(
                              'Could not add traveller',
                              'Something went wrong while adding this traveller to the trip. Please try again.',
                            );
                          }
                        })();
                      }}
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
        {editingMember?.classification === 'child' ? (
          <View style={styles.cover}>
            <Text style={[type.label, { color: c.textMuted }]}>Covered by</Text>
            <Text style={[type.caption, { color: c.textMuted }]}>
              Whose costs {editingMember.name}’s share of a split is on this trip. Several adults share
              it equally. A split can name someone else for one cost.
            </Text>
            {members.some((m) => m.classification === 'adult') ? (
              <MultiChoiceField
                options={members
                  .filter((m) => m.classification === 'adult')
                  .map((m) => ({ id: m.id, label: m.name }))}
                selected={coveringAdults(editingMember.id).map((a) => a.id)}
                onChange={(ids) => {
                  const child = editingMember;
                  void setTripCover(db, trip.id, child.id, ids).catch((error: unknown) => {
                    if (!alertRefusal(error)) Alert.alert('Not saved', 'Please try again.');
                  });
                }}
              />
            ) : (
              <Text style={[type.body, { color: c.textMuted }]}>
                No adult is on this trip yet — mark someone as an adult for this trip first.
              </Text>
            )}
          </View>
        ) : null}
        <Button
          label="Add to existing plans…"
          variant="secondary"
          onPress={() => {
            const member = editingMember;
            setEditingMember(null);
            if (member) void offerItems(member.id, member.name, true);
          }}
        />
      </Sheet>

      <AddToItemsSheet
        key={joining?.id ?? 'none'}
        traveller={joining}
        candidates={joining?.candidates ?? { plans: [], places: [] }}
        onAdd={addJoinerTo}
        onClose={() => setJoining(null)}
      />
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
  cover: { gap: spacing.sm, marginBottom: spacing.md },
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
