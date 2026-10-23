import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dayRoute, dayRouteLinks, routeDays, stopRoleText, type RouteMode, type RouteStop } from '../../../src/domain/dayRoute';
import { tripDates } from '../../../src/domain/dayRail';
import { DATES_NOT_SET, formatDayHeading } from '../../../src/domain/format';
import { buildTimeline } from '../../../src/domain/timeline';
import { deviceToday } from '../../../src/domain/trip';
import { DaySchematic } from '../../../src/features/map/DaySchematic';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { ChoiceField } from '../../../src/ui/components/ChoiceField';
import { Icon } from '../../../src/ui/components/Icon';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { Notice } from '../../../src/ui/components/Notice';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, opacity, radius, spacing, touchTarget, type, useColors } from '../../../src/ui/tokens';

type ModeChoice = 'any' | 'driving' | 'walking';
const MODE_LABELS: Record<ModeChoice, string> = { any: 'Any', driving: 'Driving', walking: 'Walking' };

/**
 * One day of the trip as places (Phase 5, `docs/phase5-plan.md`): a drawing of the stops that have
 * coordinates, the stops in order, what has no time or no place, and the day handed to Google Maps
 * for real routes. Nothing is fetched or stored here; viewing changes nothing.
 */
export default function DayMap() {
  const c = useColors();
  const router = useRouter();
  const { tripId, day: wanted } = useLocalSearchParams<{ tripId: string; day?: string }>();
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeChoice>('any');

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const [trip, items] = await Promise.all([getTrip(database, tripId), listTripItems(database, tripId)]);
        return trip ? { trip, items } : null;
      },
      [tripId],
    ),
    ['trips', ...TRIP_ITEM_TABLES],
    [tripId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen title="Day map" view={view} missingText="This trip no longer exists." what="this trip" onRetry={query.refetch} />
    );
  }

  const { trip, items } = data;
  // Every day with something to show: the trip's days, and any dated plan before or after them.
  const candidates = [...new Set([...tripDates(trip), ...buildTimeline(items).map((d) => d.day)])].sort();
  const days = routeDays(items, candidates);
  const today = deviceToday();
  const fallback: string | null = days.find((d) => d >= today) ?? days[0] ?? trip.startDate;
  const day = chosen ?? (wanted && days.includes(wanted) ? wanted : fallback);
  if (day === null) {
    // No trip dates and no dated plan (Phase 6): no day to draw, and none is invented.
    return (
      <Screen>
        <ScreenHeader context={trip.name} title="Day map" subtitle={DATES_NOT_SET} />
        <ScrollView contentContainerStyle={styles.content}>
          <Notice title="No day to map yet" tone="info" icon="dayMap">
            This trip has no dates and no dated plans. Once a plan has a date, its day can be mapped.
          </Notice>
        </ScrollView>
      </Screen>
    );
  }
  const index = days.indexOf(day);
  const route = dayRoute(items, day);
  const placed = route.stops.filter((stop) => stop.coordinates !== null);
  const unplaced = route.stops.filter((stop) => stop.coordinates === null);
  const links = dayRouteLinks(route.stops, mode === 'any' ? null : (mode as RouteMode));
  const open = (itemId: string) => router.push({ pathname: '/item/[itemId]', params: { itemId } });

  const openLink = async (url: string | null) => {
    if (!url) {
      Alert.alert('Too long for Google Maps', 'The names of these stops make the link too long. Open the plans one by one.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open Google Maps', 'Check that a browser or Google Maps is installed.');
    }
  };

  const step = (delta: number) => {
    const next = days[index + delta];
    if (next) setChosen(next);
  };

  return (
    <Screen>
      <ScreenHeader context={trip.name} title="Day map" subtitle={formatDayHeading(day)} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.switcher}>
          <DayStep label="Previous day" icon="back" disabled={index <= 0} onPress={() => step(-1)} />
          <Text style={[type.bodyStrong, styles.dayLabel, { color: c.text }]}>
            {days.length > 0 && index >= 0 ? `${index + 1} of ${days.length} days with plans` : 'No plans with places'}
          </Text>
          <DayStep label="Next day" icon="forward" disabled={index < 0 || index >= days.length - 1} onPress={() => step(1)} />
        </View>

        {placed.length > 0 ? (
          <DaySchematic stops={route.stops} />
        ) : route.stops.length > 0 ? (
          <Notice title="Nothing to draw yet" tone="info" icon="dayMap">
            None of this day&apos;s places has coordinates. Add them to a plan under Coordinates, or open the day in Google
            Maps below.
          </Notice>
        ) : null}
        {placed.length > 0 && unplaced.length > 0 ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            Not on the drawing, no coordinates: {unplaced.map((stop) => `${route.stops.indexOf(stop) + 1} ${stop.label}`).join(', ')}.
          </Text>
        ) : null}

        {route.stops.length > 0 ? (
          <View style={styles.block}>
            <SectionLabel>In order</SectionLabel>
            <Rows>
              {route.stops.map((stop, i) => (
                <ListRow
                  key={stop.key}
                  leading={<StopNumber number={i + 1} />}
                  title={stop.label}
                  subtitle={stopPlansText(stop)}
                  onPress={() => open(stop.plans[0].itemId)}
                  accessibilityLabel={`Stop ${i + 1}: ${stop.label}. ${stopPlansText(stop)}`}
                />
              ))}
            </Rows>
          </View>
        ) : (
          <Text style={[type.body, { color: c.textMuted }]}>Nothing with a place on this day.</Text>
        )}

        {route.someTime.length > 0 ? (
          <View style={styles.block}>
            <SectionLabel>Some time this day</SectionLabel>
            <Text style={[type.caption, { color: c.textMuted }]}>No time given, so not placed in the order.</Text>
            <Rows>
              {route.someTime.map((plan) => (
                <ListRow key={plan.itemId} title={plan.title} onPress={() => open(plan.itemId)} />
              ))}
            </Rows>
          </View>
        ) : null}

        {route.noPlace.length > 0 ? (
          <View style={styles.block}>
            <SectionLabel>No place given</SectionLabel>
            <Rows>
              {route.noPlace.map((plan) => (
                <ListRow key={plan.itemId} title={plan.title} subtitle={plan.time} onPress={() => open(plan.itemId)} />
              ))}
            </Rows>
          </View>
        ) : null}

        {links.length > 0 ? (
          <View style={styles.block}>
            <SectionLabel>In Google Maps</SectionLabel>
            {route.stops.length > 1 ? (
              <ChoiceField
                value={mode}
                options={['any', 'driving', 'walking'] as const}
                labelFor={(option) => MODE_LABELS[option]}
                onChange={(next) => next && setMode(next)}
              />
            ) : null}
            {links.map((link, i) => (
              <Button
                key={`${link.from}-${link.to}`}
                label={
                  route.stops.length === 1
                    ? 'Show in Google Maps'
                    : links.length === 1
                      ? 'Open the day in Google Maps'
                      : `Part ${i + 1}: stops ${link.from}–${link.to}`
                }
                variant="secondary"
                onPress={() => void openLink(link.url)}
                wrap
              />
            ))}
            <Text style={[type.caption, { color: c.textMuted }]}>
              Google Maps works out the real routes and times, and needs a connection.
              {links.length > 1 ? ' A long day opens in parts of up to five stops.' : ''} For public transport, use the
              directions between plans on the Timeline: Google Maps cannot route transit through several stops.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** '10:30 Departure · Flight to Rovaniemi', one line per plan at the stop. */
function stopPlansText(stop: RouteStop): string {
  return stop.plans
    .map((plan) =>
      [plan.time, stopRoleText(plan.role), plan.role === 'wake' || plan.role === 'sleep' ? null : plan.title, plan.idea ? '(idea)' : null]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n');
}

function StopNumber({ number }: { number: number }) {
  const c = useColors();
  return (
    <View style={[styles.number, { backgroundColor: c.accent }]}>
      <Text style={[type.label, { color: c.onAccent }]}>{number}</Text>
    </View>
  );
}

function DayStep({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'back' | 'forward';
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.step,
        { borderColor: c.border, opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1 },
      ]}>
      <Icon name={icon} size={22} color={c.accentText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter.normal, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xxxl },
  block: { gap: spacing.sm },
  switcher: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayLabel: { flex: 1, textAlign: 'center' },
  step: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
