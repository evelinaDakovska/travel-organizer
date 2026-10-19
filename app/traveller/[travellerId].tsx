import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  travellerNameSchema,
  usesText,
  type TravellerClassification,
} from '../../src/domain/traveller';
import { useMe } from '../../src/features/travellers/useMe';
import { queryView } from '../../src/hooks/queryView';
import { useBusy } from '../../src/hooks/useBusy';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteTraveller,
  listTravellers,
  renameTraveller,
  updateTravellerClassification,
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
import { radius, spacing, touchTarget, type, useColors } from '../../src/ui/tokens';

/** One profile: its name, where it is used, and Delete when nothing uses it. */
export default function TravellerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { travellerId } = useLocalSearchParams<{ travellerId: string }>();
  const { meId } = useMe();

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
  // Me is never deleted by accident (2B-0): another profile is made Me first.
  const refuseMe = () =>
    Alert.alert(
      'This is your profile',
      'To delete it, first choose another profile as you, under Travellers → My traveller profile.',
    );
  const remove = async () => {
    const result = await deleteTraveller(db, traveller.id);
    if (result.deleted) router.back();
    else if (result.isMe) refuseMe();
    else refuse(result.uses);
  };
  // Known to be in use: say so at once, rather than ask and then refuse.
  const uses = usesQuery.data;
  const confirmDelete = () => {
    if (uses && (uses.trips.length > 0 || uses.items > 0)) return refuse(uses);
    if (traveller.id === meId) return refuseMe();
    Alert.alert(`Delete ${traveller.name}?`, 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader
        title={traveller.name}
        subtitle={traveller.id === meId ? 'This is you (Me)' : undefined}
      />
      {/* Keyed by the name and classification: a save elsewhere starts the field afresh. */}
      <NameForm
        key={`${traveller.name}:${traveller.classification}`}
        name={traveller.name}
        initialClassification={traveller.classification}
        uses={usesQuery.data ?? null}
        onSave={async (name, classification) => {
          await renameTraveller(db, traveller.id, name);
          await updateTravellerClassification(db, traveller.id, classification);
          router.back();
        }}
        onDelete={confirmDelete}
      />
    </Screen>
  );
}

const CLASSIFICATION_OPTIONS: { value: TravellerClassification; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'unspecified', label: 'Not specified' },
];

function NameForm({
  name,
  initialClassification,
  uses,
  onSave,
  onDelete,
}: {
  name: string;
  initialClassification: TravellerClassification;
  uses: { trips: string[]; items: number } | null;
  onSave: (name: string, classification: TravellerClassification) => Promise<void>;
  onDelete: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState(name);
  const [classification, setClassification] =
    useState<TravellerClassification>(initialClassification);
  const where = uses ? usesText(uses) : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const save = async () => {
    const parsed = travellerNameSchema.safeParse(text);
    if (!parsed.success) setError(parsed.error.issues[0]?.message ?? 'Check the name');
    else await run(() => onSave(parsed.data, classification));
  };

  return (
    <FormScroll footer={<Button label="Save" busy={busy} onPress={() => void save()} />}>
      <Field label="Name" error={error ?? undefined} hint="A new name shows wherever they are listed">
        <Input value={text} onChangeText={setText} invalid={!!error} autoFocus={false} />
      </Field>
      <Field
        label="Default classification"
        hint="Copied when adding to a new trip. Existing trips are not changed.">
        <View style={styles.pillRow}>
          {CLASSIFICATION_OPTIONS.map((opt) => {
            const selected = classification === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setClassification(opt.value)}
                accessibilityRole="button"
                accessibilityLabel={`Default classification: ${opt.label}`}
                accessibilityState={{ selected }}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selected ? c.accentSoft : c.surface,
                    borderColor: selected ? c.accent : c.border,
                  },
                ]}>
                <Text
                  style={[
                    type.caption,
                    {
                      color: selected ? c.accentText : c.text,
                      fontWeight: selected ? '600' : 'normal',
                    },
                  ]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      {where ? <Text style={[type.body, { color: c.textMuted }]}>{where}.</Text> : null}
      <View style={styles.danger}>
        <Button label="Delete traveller" variant="danger" onPress={onDelete} />
      </View>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  danger: { marginTop: spacing.lg },
});
