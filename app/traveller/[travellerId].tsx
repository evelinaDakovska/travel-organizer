import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { travellerNameSchema, usesText } from '../../src/domain/traveller';
import { queryView } from '../../src/hooks/queryView';
import { useBusy } from '../../src/hooks/useBusy';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteTraveller,
  listTravellers,
  renameTraveller,
  TRAVELLER_TABLES,
  travellerUses,
  type TravellerUses,
} from '../../src/repositories/travellers';
import { Button } from '../../src/ui/components/Button';
import { Field, Input } from '../../src/ui/components/Field';
import { FormScroll } from '../../src/ui/components/FormScroll';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { spacing, type, useColors } from '../../src/ui/tokens';

/** One profile: its name, where it is used, and Delete when nothing uses it. */
export default function TravellerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { travellerId } = useLocalSearchParams<{ travellerId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) =>
        (await listTravellers(database)).find((traveller) => traveller.id === travellerId) ?? null,
      [travellerId],
    ),
    TRAVELLER_TABLES,
    [travellerId],
  );
  const usesQuery = useLiveQuery(
    useCallback((database) => travellerUses(database, travellerId), [travellerId]),
    TRAVELLER_TABLES,
    [travellerId],
  );

  const traveller = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !traveller) {
    return (
      <QueryScreen
        title="Traveller"
        view={view}
        missingText="This traveller no longer exists."
        what="this traveller"
        onRetry={query.refetch}
      />
    );
  }

  const refuse = (uses: TravellerUses) =>
    Alert.alert(
      `${traveller.name} is still listed`,
      `${usesText(uses)}. Take them off those first, from each trip's Travellers.`,
    );
  const remove = async () => {
    const result = await deleteTraveller(db, traveller.id);
    if (result.deleted) router.back();
    else refuse(result.uses);
  };
  // Known to be in use: say so at once, rather than ask and then refuse.
  const uses = usesQuery.data;
  const confirmDelete = () => {
    if (uses && (uses.trips.length > 0 || uses.items > 0)) return refuse(uses);
    Alert.alert(`Delete ${traveller.name}?`, 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title={traveller.name} />
      {/* Keyed by the name: a rename saved elsewhere starts the field afresh. */}
      <NameForm
        key={traveller.name}
        name={traveller.name}
        uses={usesQuery.data ?? null}
        onSave={async (name) => {
          await renameTraveller(db, traveller.id, name);
          router.back();
        }}
        onDelete={confirmDelete}
      />
    </Screen>
  );
}

function NameForm({
  name,
  uses,
  onSave,
  onDelete,
}: {
  name: string;
  uses: { trips: string[]; items: number } | null;
  onSave: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState(name);
  const where = uses ? usesText(uses) : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const save = async () => {
    const parsed = travellerNameSchema.safeParse(text);
    if (!parsed.success) setError(parsed.error.issues[0]?.message ?? 'Check the name');
    else await run(() => onSave(parsed.data));
  };

  return (
    <FormScroll footer={<Button label="Save" busy={busy} onPress={() => void save()} />}>
      <Field label="Name" error={error ?? undefined} hint="A new name shows wherever they are listed">
        <Input value={text} onChangeText={setText} invalid={!!error} autoFocus={false} />
      </Field>
      {where ? <Text style={[type.body, { color: c.textMuted }]}>{where}.</Text> : null}
      <View style={styles.danger}>
        <Button label="Delete traveller" variant="danger" onPress={onDelete} />
      </View>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: spacing.lg },
});
