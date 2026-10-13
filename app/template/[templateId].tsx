import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { listKindLabel } from '../../src/domain/lists';
import { offsetLabel, templateNameSchema, templateSummary } from '../../src/domain/templates';
import { queryView } from '../../src/hooks/queryView';
import { useBusy } from '../../src/hooks/useBusy';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteTemplate,
  getTemplate,
  renameTemplate,
  TEMPLATE_TABLES,
  type Template,
} from '../../src/repositories/templates';
import { Button } from '../../src/ui/components/Button';
import { Field, Input } from '../../src/ui/components/Field';
import { FormScroll } from '../../src/ui/components/FormScroll';
import { ListRow, Rows } from '../../src/ui/components/ListRow';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../src/ui/tokens';

/** One template (C5): what it holds, its name, and Delete — which leaves trips made from it alone. */
export default function TemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const query = useLiveQuery(
    useCallback((database) => getTemplate(database, templateId), [templateId]),
    TEMPLATE_TABLES,
    [templateId],
  );

  const view = queryView(query);
  if (view !== 'ready' || !query.data) {
    return (
      <QueryScreen
        title="Template"
        view={view}
        missingText="This template no longer exists."
        what="this template"
        onRetry={query.refetch}
      />
    );
  }
  return (
    <Screen>
      <ScreenHeader title={query.data.name} subtitle="Template" />
      <TemplateForm key={query.data.name} template={query.data} />
    </Screen>
  );
}

function TemplateForm({ template }: { template: Template }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const { content } = template;

  const save = async () => {
    const parsed = templateNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name');
      return;
    }
    await run(async () => {
      await renameTemplate(db, template.id, parsed.data);
      router.back();
    });
  };
  const confirmDelete = () =>
    Alert.alert(`Delete “${template.name}”?`, 'Trips already made from it keep what it added.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTemplate(db, template.id);
          router.back();
        },
      },
    ]);

  return (
    <FormScroll footer={<Button label="Save" busy={busy} onPress={() => void save()} />}>
      <Field label="Name" error={error ?? undefined}>
        <Input value={name} onChangeText={setName} invalid={!!error} />
      </Field>

      {content ? (
        <>
          <Text style={[type.body, { color: c.textMuted }]}>{templateSummary(content)}.</Text>
          {content.tasks.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Tasks</SectionLabel>
              <Rows>
                {content.tasks.map((task, index) => (
                  <ListRow
                    key={index}
                    title={task.title}
                    subtitle={[offsetLabel(task.offsetDays), task.time].filter(Boolean).join(' · ')}
                  />
                ))}
              </Rows>
            </View>
          ) : null}
          {content.notes.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Notes</SectionLabel>
              <Rows>
                {content.notes.map((note, index) => (
                  <ListRow key={index} title={note.title} subtitle={note.pinned ? 'Pinned' : null} />
                ))}
              </Rows>
            </View>
          ) : null}
          {content.lists.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Lists</SectionLabel>
              <Rows>
                {content.lists.map((list, index) => (
                  <ListRow
                    key={index}
                    title={list.name}
                    subtitle={`${listKindLabel(list.kind)} · ${list.items.length} item${
                      list.items.length === 1 ? '' : 's'
                    }`}
                  />
                ))}
              </Rows>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[type.body, { color: c.textMuted }]}>
          Saved by a newer version of the app, so this one cannot show or use it. It is kept as it
          is.
        </Text>
      )}

      <Button label="Delete template" variant="danger" onPress={confirmDelete} />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
});
