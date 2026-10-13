import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '../../../src/domain/format';
import { taskStart, templateSummary } from '../../../src/domain/templates';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  applyTemplate,
  listTemplates,
  TEMPLATE_TABLES,
  templateUses,
  type Template,
} from '../../../src/repositories/templates';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Icon } from '../../../src/ui/components/Icon';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { LoadFailed, QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, radius, spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * Use a template (C5): pick one, see exactly what it adds and where each task lands on this trip,
 * then add it. Also the step after creating a trip (`fresh`), where it can be skipped.
 */
export default function UseTemplateScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId, fresh } = useLocalSearchParams<{ tripId: string; fresh?: string }>();
  const [chosen, setChosen] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const templatesQuery = useLiveQuery(listTemplates, TEMPLATE_TABLES);

  const trip = tripQuery.data;
  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Use a template"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  const done = () => (fresh ? router.replace(`/trip/${trip.id}`) : router.back());

  const apply = async (template: Template) => {
    const uses = await templateUses(db, trip.id, template.id);
    const go = async () => {
      setBusy(true);
      try {
        await applyTemplate(db, template.id, trip.id);
        done();
      } catch (error) {
        console.warn('Applying a template failed', error);
        Alert.alert('Could not add the template', 'Nothing was added. Try again.');
      } finally {
        setBusy(false);
      }
    };
    if (uses.length === 0) return go();
    // Applying twice adds everything twice: say so, and let them decide (C5).
    Alert.alert(
      `“${template.name}” was added on ${formatShortDate(uses[0].slice(0, 10))}`,
      'Adding it again adds its tasks, notes and lists a second time. Nothing is merged.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Add again', onPress: () => void go() },
      ],
    );
  };

  const templates = templatesQuery.data ?? [];
  const content = chosen?.content ?? null;

  return (
    <Screen>
      <ScreenHeader
        title={fresh ? 'Start from a template?' : 'Use a template'}
        subtitle={trip.name}
        leading={fresh ? false : 'back'}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {queryView(templatesQuery) === 'failed' ? (
          <LoadFailed what="the templates" onRetry={templatesQuery.refetch} />
        ) : null}

        {content && chosen ? (
          <View style={styles.section}>
            <SectionLabel>{chosen.name}</SectionLabel>
            <Text style={[type.body, { color: c.textMuted }]}>
              Adds {templateSummary(content).toLowerCase()} to {trip.name}.
            </Text>
            {content.tasks.length > 0 ? (
              <Rows>
                {content.tasks.map((task, index) => {
                  const start = taskStart(task, trip.startDate);
                  return (
                    <ListRow
                      key={index}
                      title={task.title}
                      subtitle={
                        start
                          ? `${formatShortDate(start.local.slice(0, 10))}${
                              task.time ? ` · ${task.time}` : ''
                            }`
                          : 'No date'
                      }
                    />
                  );
                })}
              </Rows>
            ) : null}
            {content.lists.map((list, index) => (
              <Text key={index} style={[type.caption, { color: c.textMuted }]}>
                {list.name} · {list.items.length} item{list.items.length === 1 ? '' : 's'}, none
                ticked
              </Text>
            ))}
            <Button
              label={`Add “${chosen.name}”`}
              busy={busy}
              onPress={() => void apply(chosen)}
            />
            <Button label="Choose another" variant="secondary" onPress={() => setChosen(null)} />
          </View>
        ) : templates.length > 0 ? (
          <Rows>
            {templates.map((template) => (
              <ListRow
                key={template.id}
                title={template.name}
                subtitle={
                  template.content
                    ? templateSummary(template.content)
                    : 'Saved by a newer version of the app; cannot be used here'
                }
                leading={<Icon name="lists" color={c.accentText} />}
                onPress={template.content ? () => setChosen(template) : undefined}
                dimmed={!template.content}
              />
            ))}
          </Rows>
        ) : (
          <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.body, { color: c.textMuted }]}>
              No templates yet. Save one from a trip you have prepared: its menu, Save as template.
            </Text>
          </View>
        )}

        {fresh ? <Button label="Skip — a blank trip" variant="secondary" onPress={done} /> : null}
      </ScrollView>
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
  section: { gap: spacing.md },
  empty: { borderRadius: radius.lg, padding: spacing.lg },
});
