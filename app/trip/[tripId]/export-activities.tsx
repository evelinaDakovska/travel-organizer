import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  activityFileName,
  buildActivityExport,
  exportBlocker,
} from '../../../src/domain/activityFormat';
import { formatShortMoment } from '../../../src/domain/format';
import { kindLabel, subkindLabel, type TripItem } from '../../../src/domain/tripItem';
import { shareActivityFile } from '../../../src/files/activityFiles';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listItemLinks } from '../../../src/repositories/activityImport';
import { RESOURCE_TABLES } from '../../../src/repositories/resources';
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
import { Segments } from '../../../src/ui/components/Segments';
import { spacing, type, useColors } from '../../../src/ui/tokens';

const FILTERS = ['all', 'ideas', 'planned'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = { all: 'All', ideas: 'Ideas', planned: 'Planned' };

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function detailOf(item: TripItem): string {
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const status =
    item.status === 'confirmed'
      ? 'Planned'
      : ['Idea', item.priority ? capitalise(item.priority) : null].filter(Boolean).join(' · ');
  const when = item.start ? formatShortMoment(item.start.local, item.start.precision) : null;
  return [kind, status, when].filter(Boolean).join(' · ');
}

/**
 * Export activities (2C): chosen ideas and plans of this trip, in the public activities format, to
 * share — with someone planning too, an AI assistant, or another trip. Only what the format has
 * goes in; booking references, people, documents and payments never do. To-dos and cancelled
 * plans are not offered, and the screen says why.
 */
export default function ExportActivitiesScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
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

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const offered = useMemo(() => items.filter((item) => exportBlocker(item) === null), [items]);
  const notOffered = items.length - offered.length;
  const shown = offered.filter(
    (item) =>
      filter === 'all' ||
      (filter === 'ideas' ? item.status === 'idea' : item.status === 'confirmed'),
  );
  // Only what is still offered counts: an item deleted meanwhile is not exported.
  const chosen = offered.filter((item) => selected.has(item.id));
  const hidden = chosen.filter((item) => !shown.includes(item)).length;

  const trip = tripQuery.data;
  const view = queryView(tripQuery);
  if (view !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Export activities"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  const toggle = (id: string) =>
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const share = () =>
    run(async () => {
      const built = buildActivityExport(chosen, linksQuery.data ?? new Map(), trip);
      const count = built.document.activities.length;
      const go = async () => {
        try {
          await shareActivityFile(activityFileName(trip.name, new Date()), built.document);
          setShared(
            `${count} ${count === 1 ? 'activity' : 'activities'} in the file.` +
              (built.skippedLinks > 0
                ? ` ${built.skippedLinks} ${built.skippedLinks === 1 ? 'link was' : 'links were'} left out (wallet passes, tickets and confirmations are never exported).`
                : ''),
          );
        } catch (error) {
          console.warn('Activity export failed', error);
          Alert.alert('Could not export', 'Nothing was shared. Try again.');
        }
      };
      if (built.excluded.length === 0) return go();
      if (count === 0) {
        Alert.alert(
          'Nothing can be exported',
          built.excluded.map((entry) => `${entry.title}: ${entry.reason}`).join('\n'),
        );
        return;
      }
      Alert.alert(
        built.excluded.length === 1
          ? 'One activity cannot be exported'
          : `${built.excluded.length} activities cannot be exported`,
        `${built.excluded.map((entry) => `${entry.title}: ${entry.reason}`).join('\n')}\n\nShare the other ${count}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Share ${count}`, onPress: () => void go() },
        ],
      );
    });

  return (
    <Screen>
      <ScreenHeader title="Export activities" context={trip.name} />
      <FormScroll
        contentStyle={styles.content}
        footer={
          <Button
            label={
              chosen.length === 0
                ? 'Nothing selected'
                : `Share ${chosen.length} ${chosen.length === 1 ? 'activity' : 'activities'}`
            }
            disabled={chosen.length === 0}
            busy={busy}
            onPress={() => void share()}
          />
        }>
        <Text style={[type.body, { color: c.textMuted }]}>
          A file with the activities you choose, in the format Import activities reads — for
          another trip, another phone, or an AI assistant.
        </Text>
        <Notice title="What is in the file" tone="info">
          Titles, kinds and types, idea or planned, priority, dates, times and zones, places, notes,
          prices, website and map links, and travel routes. Never booking references, who is
          going, traveller names, documents, photos, whether something is paid, or reminders.
        </Notice>
        {notOffered > 0 ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {`${notOffered} ${notOffered === 1 ? 'item is' : 'items are'} not offered: to-dos and cancelled plans are not part of the format — a cancelled plan would arrive as a live one.`}
          </Text>
        ) : null}

        {offered.length === 0 ? (
          <Text style={[type.body, { color: c.text }]}>
            {items.length === 0
              ? 'This trip has no activities yet.'
              : 'This trip has no ideas or plans that can be exported.'}
          </Text>
        ) : (
          <>
            <Segments value={filter} options={FILTERS} onChange={setFilter} labelFor={(f) => FILTER_LABELS[f]} />
            <View style={styles.actions}>
              <Button
                label={filter === 'all' ? 'Select all' : `Select all ${FILTER_LABELS[filter].toLowerCase()}`}
                variant="secondary"
                compact
                onPress={() =>
                  setSelected((now) => new Set([...now, ...shown.map((item) => item.id)]))
                }
              />
              <Button
                label="Deselect all"
                variant="secondary"
                compact
                onPress={() =>
                  setSelected((now) => {
                    const next = new Set(now);
                    for (const item of shown) next.delete(item.id);
                    return next;
                  })
                }
              />
            </View>
            {shown.length === 0 ? (
              <Text style={[type.body, { color: c.textMuted }]}>
                {filter === 'ideas' ? 'No ideas in this trip.' : 'No plans in this trip.'}
              </Text>
            ) : (
              <Rows>
                {shown.map((item) => {
                  const checked = selected.has(item.id);
                  // A tick row, not a link: the whole row toggles and nothing opens, so no chevron.
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => toggle(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${item.title}, ${detailOf(item)}`}>
                      <ListRow
                        title={item.title}
                        subtitle={item.locationName}
                        detail={detailOf(item)}
                        leading={
                          <View style={styles.leading}>
                            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                              <CheckBox
                                checked={checked}
                                onToggle={() => toggle(item.id)}
                                accessibilityLabel={`Export ${item.title}`}
                              />
                            </View>
                            <KindTile kind={item.kind} subkind={item.subkind} size={32} />
                          </View>
                        }
                      />
                    </Pressable>
                  );
                })}
              </Rows>
            )}
          </>
        )}

        {shared ? (
          <Notice title="Activities exported" tone="info" icon="check">
            {shared}
          </Notice>
        ) : null}
        {hidden > 0 ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {`${hidden} more selected under ${filter === 'ideas' ? 'Planned' : 'Ideas'}, included in the file.`}
          </Text>
        ) : null}
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
