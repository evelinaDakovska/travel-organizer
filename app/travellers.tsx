import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { CLASSIFICATION_LABELS, travellerLabel, travellerNameSchema } from '../src/domain/traveller';
import { useMe } from '../src/features/travellers/useMe';
import { queryView } from '../src/hooks/queryView';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { createTraveller, listTravellers, TRAVELLER_TABLES } from '../src/repositories/travellers';
import { AddByName } from '../src/ui/components/AddByName';
import { ListRow, Rows } from '../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../src/ui/components/QueryStates';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { gutter, spacing, type, useColors } from '../src/ui/tokens';

/**
 * Travellers (C2): the people you travel with, kept once and picked per trip. A name is all there
 * is to a profile.
 */
export default function TravellersScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const query = useLiveQuery(listTravellers, TRAVELLER_TABLES);
  const view = queryView(query);
  const { me, meId, loading } = useMe();

  const add = async (text: string) => {
    const name = travellerNameSchema.safeParse(text);
    if (!name.success) return name.error.issues[0]?.message;
    await createTraveller(db, name.data);
  };

  return (
    <Screen>
      <ScreenHeader
        title="Travellers"
        subtitle="Chosen per trip, and per booking when not everyone goes"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StaleNotice queries={[query]} />
        {/* Which of these is you (2B-0) — chosen once, changed rarely. */}
        {loading ? null : (
          <Rows>
            <ListRow
              title={me ? travellerLabel(me, meId) : 'Which traveller are you?'}
              subtitle={
                me
                  ? `My traveller profile · ${CLASSIFICATION_LABELS[me.classification]}`
                  : 'Choose or add your own profile, so new trips start with you on them'
              }
              onPress={() => router.push('/me')}
            />
          </Rows>
        )}
        <AddByName placeholder="A name, e.g. Ana" onAdd={add} />
        {view === 'failed' ? (
          <LoadFailed what="the travellers" onRetry={query.refetch} />
        ) : view === 'empty' ? (
          <Text style={[type.body, { color: c.textMuted }]}>
            Nobody yet. Add yourself and whoever you travel with; a trip then picks who is going.
          </Text>
        ) : (
          <Rows>
            {(query.data ?? []).map((traveller) => (
              <ListRow
                key={traveller.id}
                title={travellerLabel(traveller, meId)}
                onPress={() =>
                  router.push({
                    pathname: '/traveller/[travellerId]',
                    params: { travellerId: traveller.id },
                  })
                }
              />
            ))}
          </Rows>
        )}
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
});
