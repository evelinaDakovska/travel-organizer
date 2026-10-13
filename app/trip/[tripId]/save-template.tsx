import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { listKindLabel } from '../../../src/domain/lists';
import type { Note } from '../../../src/domain/note';
import type { Trip } from '../../../src/domain/trip';
import type { TripItem } from '../../../src/domain/tripItem';
import { offsetLabel, templateNameSchema, templateTask } from '../../../src/domain/templates';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { LIST_TABLES, listTripLists, type ListSummary } from '../../../src/repositories/lists';
import { listNotes } from '../../../src/repositories/notes';
import { saveTemplate } from '../../../src/repositories/templates';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { CheckBox } from '../../../src/ui/components/CheckBox';
import { Field, Input } from '../../../src/ui/components/Field';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * Save as template (C5): this trip's preparation, kept for the next one — the tasks, notes and
 * lists ticked here. Everything is chosen up front; nothing else of the trip is read.
 */
export default function SaveTemplateScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const trip = await getTrip(database, tripId);
        if (!trip) return null;
        const [items, notes, lists] = await Promise.all([
          listTripItems(database, tripId),
          listNotes(database, tripId),
          listTripLists(database, tripId),
        ]);
        const tasks = items.filter((item) => item.kind === 'task' && item.status !== 'cancelled');
        return { trip, tasks, notes, lists };
      },
      [tripId],
    ),
    [...TRIP_ITEM_TABLES, 'trip_notes', ...LIST_TABLES],
    [tripId],
  );

  const view = queryView(query);
  if (view !== 'ready' || !query.data) {
    return (
      <QueryScreen
        title="Save as template"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={query.refetch}
      />
    );
  }
  return (
    <Screen>
      <ScreenHeader title="Save as template" subtitle={query.data.trip.name} />
      <Chooser {...query.data} />
    </Screen>
  );
}

type ChooserProps = {
  trip: Pick<Trip, 'name' | 'startDate'>;
  tasks: readonly TripItem[];
  notes: readonly Note[];
  lists: readonly ListSummary[];
};

function Chooser({ trip, tasks, notes, lists }: ChooserProps) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [name, setName] = useState(trip.name);
  const [error, setError] = useState<string | null>(null);
  // Everything starts chosen; untick what is particular to this trip.
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set([...tasks, ...notes, ...lists].map((thing) => thing.id)),
  );
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const box = (id: string, label: string) => (
    <CheckBox checked={chosen.has(id)} onToggle={() => toggle(id)} accessibilityLabel={label} />
  );

  const save = async () => {
    const parsed = templateNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name');
      return;
    }
    await saveTemplate(db, trip.startDate, parsed.data, {
      tasks: tasks.filter((task) => chosen.has(task.id)),
      notes: notes.filter((note) => chosen.has(note.id)),
      lists: lists.filter((list) => chosen.has(list.id)),
    });
    router.back();
    Alert.alert('Template saved', `“${parsed.data}” is under Lists & templates.`);
  };

  const nothing = tasks.length + notes.length + lists.length === 0;
  return (
    <FormScroll footer={<Button label="Save template" onPress={() => void save()} />}>
      <Field label="Name" error={error ?? undefined}>
        <Input value={name} onChangeText={setName} invalid={!!error} placeholder="City break" />
      </Field>
      <Text style={[type.caption, { color: c.textMuted }]}>
        Bookings, prices, booking references, files and who is going are never part of a template.
        Tasks keep their day counted from the trip’s first day; ticks are cleared.
      </Text>

      {nothing ? (
        <Text style={[type.body, { color: c.textMuted }]}>
          This trip has no tasks, notes or lists yet — a template would be empty.
        </Text>
      ) : null}

      {tasks.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Tasks</SectionLabel>
          <Rows>
            {tasks.map((task) => (
              <ListRow
                key={task.id}
                title={task.title}
                subtitle={offsetLabel(templateTask(task, trip.startDate).offsetDays)}
                leading={box(task.id, task.title)}
              />
            ))}
          </Rows>
        </View>
      ) : null}
      {notes.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Notes</SectionLabel>
          <Rows>
            {notes.map((note) => (
              <ListRow key={note.id} title={note.title} leading={box(note.id, note.title)} />
            ))}
          </Rows>
        </View>
      ) : null}
      {lists.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Lists</SectionLabel>
          <Rows>
            {lists.map((list) => (
              <ListRow
                key={list.id}
                title={list.name}
                subtitle={`${listKindLabel(list.kind)} · ${list.total} item${
                  list.total === 1 ? '' : 's'
                }`}
                leading={box(list.id, list.name)}
              />
            ))}
          </Rows>
        </View>
      ) : null}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
});
