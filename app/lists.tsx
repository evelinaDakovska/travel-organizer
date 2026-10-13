import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LIST_KINDS, listKindLabel, type ListKind } from '../src/domain/lists';
import { templateSummary } from '../src/domain/templates';
import { queryView } from '../src/hooks/queryView';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import {
  addPresetLists,
  createList,
  LIST_TABLES,
  listReusableLists,
} from '../src/repositories/lists';
import { listTemplates, TEMPLATE_TABLES } from '../src/repositories/templates';
import { Button } from '../src/ui/components/Button';
import { HeaderAction } from '../src/ui/components/HeaderAction';
import { Icon } from '../src/ui/components/Icon';
import { ListRow, Rows } from '../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../src/ui/components/QueryStates';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { Sheet } from '../src/ui/components/Sheet';
import { gutter, radius, spacing, type, useColors } from '../src/ui/tokens';

/**
 * Lists & templates (C1, C5): what you take and buy on every trip, kept once. A trip copies a list
 * and ticks its own copy; nothing here is ever ticked, and editing it never changes a trip's copy.
 */
export default function ListsScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [choosingKind, setChoosingKind] = useState(false);
  const listsQuery = useLiveQuery(listReusableLists, LIST_TABLES);
  const { data: templates } = useLiveQuery(listTemplates, TEMPLATE_TABLES);
  const lists = listsQuery.data ?? [];
  const view = queryView(listsQuery);

  const openList = (listId: string) =>
    router.push({ pathname: '/list/[listId]', params: { listId } });
  const startList = async (kind: ListKind) => {
    setChoosingKind(false);
    const name = `New ${listKindLabel(kind).toLowerCase()}`;
    openList(await createList(db, { tripId: null, kind, name }));
  };

  return (
    <Screen>
      <ScreenHeader
        title="Lists & templates"
        subtitle="Kept once, copied into each trip"
        action={
          <HeaderAction icon="add" label="New list" onPress={() => setChoosingKind(true)} />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[listsQuery]} />
        {view === 'failed' ? (
          <LoadFailed what="your lists" onRetry={listsQuery.refetch} />
        ) : view === 'empty' ? (
          <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.body, { color: c.textMuted }]}>
              No lists yet. Start from a few common ones — General packing, Winter layers, Child
              essentials, Toiletries to buy — and change them as you like.
            </Text>
            <Button label="Add the starting lists" onPress={() => void addPresetLists(db)} />
          </View>
        ) : (
          LIST_KINDS.map((kind) => {
            const ofKind = lists.filter((list) => list.kind === kind);
            return ofKind.length > 0 ? (
              <View key={kind} style={styles.section}>
                <SectionLabel>
                  {kind === 'packing' ? 'Packing lists' : 'Shopping lists'}
                </SectionLabel>
                <Rows>
                  {ofKind.map((list) => (
                    <ListRow
                      key={list.id}
                      title={list.name}
                      subtitle={`${list.total} item${list.total === 1 ? '' : 's'}`}
                      leading={
                        <Icon
                          name={kind === 'packing' ? 'packing' : 'shoppingList'}
                          color={c.accentText}
                        />
                      }
                      onPress={() => openList(list.id)}
                    />
                  ))}
                </Rows>
              </View>
            ) : null;
          })
        )}

        <View style={styles.section}>
          <SectionLabel>Trip templates</SectionLabel>
          {templates && templates.length > 0 ? (
            <Rows>
              {templates.map((template) => (
                <ListRow
                  key={template.id}
                  title={template.name}
                  subtitle={
                    template.content ? templateSummary(template.content) : 'From a newer version'
                  }
                  leading={<Icon name="lists" color={c.accentText} />}
                  onPress={() =>
                    router.push({
                      pathname: '/template/[templateId]',
                      params: { templateId: template.id },
                    })
                  }
                />
              ))}
            </Rows>
          ) : (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Tasks, notes and lists kept from a trip, to start the next one with. Save one from a
              trip’s More menu.
            </Text>
          )}
        </View>
      </ScrollView>

      <Sheet visible={choosingKind} title="New list" onClose={() => setChoosingKind(false)}>
        <Rows>
          {LIST_KINDS.map((kind) => (
            <ListRow
              key={kind}
              title={listKindLabel(kind)}
              subtitle={kind === 'packing' ? 'Things to take' : 'Things to get before you go'}
              onPress={() => void startList(kind)}
            />
          ))}
        </Rows>
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
  section: { gap: spacing.xs },
  empty: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
