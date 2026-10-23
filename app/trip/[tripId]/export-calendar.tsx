import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayHeading, formatShortMoment } from '../../../src/domain/format';
import {
  buildIcs,
  calendarEvents,
  DEFAULT_ICS_OPTIONS,
  icsFileName,
  isCalendarItem,
  type IcsOptions,
} from '../../../src/domain/ics';
import { dayKey, toInstant } from '../../../src/domain/time';
import { kindLabel, subkindLabel, type TripItem } from '../../../src/domain/tripItem';
import { shareCalendarFile } from '../../../src/files/activityFiles';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listItemLinks } from '../../../src/repositories/activityImport';
import { RESOURCE_TABLES } from '../../../src/repositories/resources';
import { listTripParticipantNames, TRAVELLER_TABLES } from '../../../src/repositories/travellers';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { CheckBox } from '../../../src/ui/components/CheckBox';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { KindTile } from '../../../src/ui/components/KindTile';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { Notice } from '../../../src/ui/components/Notice';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

/** The switches, in the order the screen shows them, with what each adds (P8-6). */
const OPTION_ROWS: { key: keyof IcsOptions; title: string; subtitle: string }[] = [
  { key: 'places', title: 'Places and addresses', subtitle: 'Place names, addresses and coordinates' },
  { key: 'notes', title: 'Notes', subtitle: "Each plan's notes" },
  { key: 'references', title: 'Booking references', subtitle: 'Confirmation codes' },
  { key: 'people', title: 'Who is going', subtitle: 'Names of the people on each plan' },
  { key: 'links', title: 'Links', subtitle: 'Web and map links saved on each plan' },
];

function detailOf(item: TripItem): string {
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const when = item.start ? formatShortMoment(item.start.local, item.start.precision) : null;
  return [kind, item.status === 'idea' ? 'Idea' : null, when].filter(Boolean).join(' · ');
}

/**
 * Add to calendar (Phase 8, `docs/phase8-plan.md`): chosen plans as an .ics file for the share
 * sheet — a one-time copy for a calendar app, never a sync. Plans are listed by day, each day and
 * each plan tickable; what goes in beyond titles and times is the person's choice, private by
 * default.
 */
export default function ExportCalendarScreen() {
  const c = useColors();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const [options, setOptions] = useState<IcsOptions>(DEFAULT_ICS_OPTIONS);
  const [shared, setShared] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const linksQuery = useLiveQuery(
    useCallback((database) => listItemLinks(database, tripId), [tripId]),
    RESOURCE_TABLES,
    [tripId],
  );
  const peopleQuery = useLiveQuery(
    useCallback((database) => listTripParticipantNames(database, tripId), [tripId]),
    [...TRAVELLER_TABLES, ...TRIP_ITEM_TABLES],
    [tripId],
  );

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const offered = useMemo(
    () => items.filter(isCalendarItem).sort((a, b) => toInstant(a.start!).localeCompare(toInstant(b.start!))),
    [items],
  );
  const days = useMemo(() => {
    const byDay = new Map<string, TripItem[]>();
    for (const item of offered) byDay.set(dayKey(item.start!), [...(byDay.get(dayKey(item.start!)) ?? []), item]);
    return [...byDay.entries()];
  }, [offered]);
  const notOffered = items.length - offered.length;

  // Until the person ticks anything: every plan in the itinerary, no ideas (P8-2).
  const selected = picked ?? new Set(offered.filter((item) => item.status === 'confirmed').map((item) => item.id));
  const chosen = offered.filter((item) => selected.has(item.id));

  const trip = tripQuery.data;
  const view = queryView(tripQuery);
  if (view !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Add to calendar"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  const setSome = (ids: readonly string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };

  const share = () =>
    run(async () => {
      const events = calendarEvents(chosen, options, {
        people: peopleQuery.data ?? new Map(),
        links: new Map([...(linksQuery.data ?? new Map<string, { url: string }[]>()).entries()].map(([id, links]) => [id, links.map((l) => l.url)])),
      });
      try {
        await shareCalendarFile(icsFileName(trip.name), buildIcs(events, trip.name));
        setShared(`${events.length} ${events.length === 1 ? 'event' : 'events'} in the file.`);
      } catch (error) {
        console.warn('Calendar export failed', error);
        Alert.alert('Could not export', 'Nothing was shared. Try again.');
      }
    });

  const tick = (checked: boolean, label: string, onToggle: () => void) => (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <CheckBox checked={checked} onToggle={onToggle} accessibilityLabel={label} />
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Add to calendar" context={trip.name} />
      <FormScroll
        contentStyle={styles.content}
        footer={
          <Button
            label={
              chosen.length === 0
                ? 'Nothing selected'
                : `Share ${chosen.length} ${chosen.length === 1 ? 'plan' : 'plans'}`
            }
            disabled={chosen.length === 0}
            busy={busy}
            onPress={() => void share()}
          />
        }>
        <Text style={[type.body, { color: c.textMuted }]}>
          A calendar file to open in your calendar app, or save. It is a copy: later changes here do
          not reach it, so export again to update.
        </Text>
        <Notice title="Exporting again" tone="info" icon="addToCalendar">
          Each plan keeps the same identity in the file. Apple Calendar and Outlook update events they
          already have; Google Calendar may add them a second time.
        </Notice>

        <View style={styles.section}>
          <SectionLabel>What goes in</SectionLabel>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Always titles, dates, times with their time zones, and journey routes. Never documents,
            prices or payments.
          </Text>
          <Rows>
            {OPTION_ROWS.map((row) => {
              const checked = options[row.key];
              const toggle = () => setOptions((now) => ({ ...now, [row.key]: !now[row.key] }));
              return (
                <Pressable
                  key={row.key}
                  onPress={toggle}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${row.title}, ${row.subtitle}`}>
                  <ListRow title={row.title} subtitle={row.subtitle} leading={tick(checked, row.title, toggle)} />
                </Pressable>
              );
            })}
          </Rows>
        </View>

        {notOffered > 0 ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {`${notOffered} ${notOffered === 1 ? 'item is' : 'items are'} not offered: to-dos, cancelled plans and anything without a date.`}
          </Text>
        ) : null}

        {offered.length === 0 ? (
          <Text style={[type.body, { color: c.text }]}>
            Nothing here has a date yet, so there is nothing to add to a calendar.
          </Text>
        ) : (
          days.map(([day, dayItems]) => {
            const ids = dayItems.map((item) => item.id);
            const whole = ids.every((id) => selected.has(id));
            const toggleDay = () => setSome(ids, !whole);
            return (
              <View key={day} style={styles.section}>
                <Pressable
                  onPress={toggleDay}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: whole }}
                  accessibilityLabel={`Whole day, ${formatDayHeading(day)}`}
                  style={styles.dayHead}>
                  {tick(whole, `Whole day, ${formatDayHeading(day)}`, toggleDay)}
                  <SectionLabel>{formatDayHeading(day)}</SectionLabel>
                </Pressable>
                <Rows>
                  {dayItems.map((item) => {
                    const checked = selected.has(item.id);
                    const toggle = () => setSome([item.id], !checked);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={toggle}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        accessibilityLabel={`${item.title}, ${detailOf(item)}`}>
                        <ListRow
                          title={item.title}
                          subtitle={item.locationName}
                          detail={detailOf(item)}
                          leading={
                            <View style={styles.leading}>
                              {tick(checked, `Add ${item.title}`, toggle)}
                              <KindTile kind={item.kind} subkind={item.subkind} size={32} />
                            </View>
                          }
                        />
                      </Pressable>
                    );
                  })}
                </Rows>
              </View>
            );
          })
        )}

        {shared ? (
          <Notice title="Calendar file shared" tone="info" icon="check">
            {shared}
          </Notice>
        ) : null}
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
