import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  listItemInputSchema,
  moveInOrder,
  recipientsLine,
  SUGGESTED_GROUPS,
  type List,
  type ListItem,
} from '../../src/domain/lists';
import type { Traveller } from '../../src/domain/traveller';
import { TravellerPicker } from '../../src/features/travellers/TravellerPicker';
import { useMe } from '../../src/features/travellers/useMe';
import { queryView } from '../../src/hooks/queryView';
import { useBusy } from '../../src/hooks/useBusy';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  addToPacking,
  deleteListItem,
  getList,
  getListItem,
  getRecipientIds,
  LIST_TABLES,
  listListItems,
  setListOrder,
  updateListItem,
} from '../../src/repositories/lists';
import {
  addTripTraveller,
  createTraveller,
  createTripTraveller,
  listTravellers,
  listTripTravellers,
  TRAVELLER_TABLES,
} from '../../src/repositories/travellers';
import { Button } from '../../src/ui/components/Button';
import { Field, Input } from '../../src/ui/components/Field';
import { FormScroll } from '../../src/ui/components/FormScroll';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { opacity, radius, spacing, type, useColors } from '../../src/ui/tokens';

/**
 * One thing on a list (C1): what, how many, which group, for whom — any number of people (2B-0) —
 * a note, and its place.
 */
export default function ListItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const item = await getListItem(database, itemId);
        if (!item) return null;
        const list = await getList(database, item.listId);
        if (!list) return null;
        // Who it can be for: the trip's travellers, or anyone on a reusable list — a profile
        // either way, never someone a trip does not know as a profile.
        const [everyone, members, recipientIds] = await Promise.all([
          listTravellers(database),
          list.tripId ? listTripTravellers(database, list.tripId) : Promise.resolve(null),
          getRecipientIds(database, item.id),
        ]);
        return { item, list, everyone, members, recipientIds };
      },
      [itemId],
    ),
    [...LIST_TABLES, ...TRAVELLER_TABLES],
    [itemId],
  );

  const view = queryView(query);
  if (view !== 'ready' || !query.data) {
    return (
      <QueryScreen
        title="Item"
        view={view}
        missingText="This item is no longer on the list."
        what="this item"
        onRetry={query.refetch}
      />
    );
  }
  const { item, list, everyone, members, recipientIds } = query.data;

  return (
    <Screen>
      <ScreenHeader title={item.label} subtitle={list.name} />
      {/* Keyed by the item: an edit saved elsewhere starts the form afresh. */}
      <ItemForm
        key={`${item.id}:${item.label}`}
        item={item}
        list={list}
        everyone={everyone}
        members={members}
        initialRecipients={recipientIds}
      />
    </Screen>
  );
}

function ItemForm({
  item,
  list,
  everyone,
  members,
  initialRecipients,
}: {
  item: ListItem;
  list: List;
  everyone: Traveller[];
  /** The trip's travellers; null on a reusable list. */
  members: Traveller[] | null;
  initialRecipients: string[];
}) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [label, setLabel] = useState(item.label);
  const [quantity, setQuantity] = useState(item.quantity === null ? '' : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? '');
  const [category, setCategory] = useState(item.category ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [recipients, setRecipients] = useState<string[]>(initialRecipients);
  const { meId } = useMe();
  // On a trip: its travellers, plus anyone already chosen who has since left it — kept and shown,
  // never dropped unseen. Everyone else saved can be put on the trip from the add sheet.
  const shown = members
    ? [
        ...members,
        ...everyone.filter(
          (person) => recipients.includes(person.id) && !members.some((m) => m.id === person.id),
        ),
      ]
    : everyone;
  const notShown = members ? everyone.filter((person) => !shown.some((s) => s.id === person.id)) : [];
  // In the order the list shows them (SELECT_LIST_RECIPIENTS), so the two never disagree.
  const chosen = shown
    .filter((person) => recipients.includes(person.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const forLine = recipientsLine(chosen, members ? members.map((member) => member.id) : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, run] = useBusy();

  const save = async () => {
    const parsed = listItemInputSchema.safeParse({
      label,
      quantity: quantity.trim() === '' ? undefined : Number(quantity),
      unit,
      category,
      note,
      recipientIds: recipients,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    await run(async () => {
      await updateListItem(db, item.id, parsed.data);
      router.back();
    });
  };

  const move = async (delta: -1 | 1) => {
    const ids = (await listListItems(db, list.id)).map((one) => one.id);
    const next = moveInOrder(ids, item.id, delta);
    if (next) await setListOrder(db, next);
  };

  const copyToPacking = async () => {
    await addToPacking(db, list.tripId!, item);
    Alert.alert(
      'On the packing list',
      `“${item.label}” is on this trip's packing list, not packed yet.`,
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      `Remove “${item.label}”?`,
      list.tripId
        ? 'This removes it from this trip only. Any reusable master list is not changed.'
        : 'This removes it from this reusable list. Lists already copied into trips are not changed.',
      [
        { text: 'Keep item', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteListItem(db, item.id);
            router.back();
          },
        },
      ],
    );

  return (
    <FormScroll footer={<Button label="Save" busy={busy} onPress={() => void save()} />}>
      <Field label="What" error={errors.label}>
        <Input value={label} onChangeText={setLabel} invalid={!!errors.label} />
      </Field>

      <View style={styles.row}>
        <View style={styles.grow}>
          <Field label="How many" hint="Optional" error={errors.quantity}>
            <Input
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              placeholder="2"
              invalid={!!errors.quantity}
            />
          </Field>
        </View>
        <View style={styles.grow}>
          <Field label="Unit" hint="Optional">
            <Input value={unit} onChangeText={setUnit} placeholder="pairs" />
          </Field>
        </View>
      </View>

      <Field label="Group" hint="Optional — any name, or one of these">
        <Input value={category} onChangeText={setCategory} placeholder="Clothing" />
        <View style={styles.chips}>
          {SUGGESTED_GROUPS[list.kind].map((group) => (
            <Pressable
              key={group}
              onPress={() => setCategory(group)}
              accessibilityRole="button"
              accessibilityLabel={`Group: ${group}`}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.border, opacity: pressed ? opacity.pressed : 1 },
              ]}>
              <Text style={[type.caption, { color: c.text }]}>{group}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field
        label="For"
        hint={
          forLine ? `For: ${forLine}` : 'Optional — tick one or more people. It does not change how many.'
        }>
        <TravellerPicker
          profiles={shown}
          selectedIds={recipients}
          onChange={setRecipients}
          meId={meId}
          existingToAdd={notShown}
          onAddExisting={
            list.tripId ? (id) => addTripTraveller(db, list.tripId!, id) : undefined
          }
          onAddNewProfile={(name, classification) =>
            list.tripId
              ? createTripTraveller(db, list.tripId, name, classification)
              : createTraveller(db, name, classification)
          }
        />
      </Field>

      <Field label="Note" hint="Optional">
        <Input value={note} onChangeText={setNote} placeholder="The thick ones" />
      </Field>

      <View style={styles.row}>
        <View style={styles.grow}>
          <Button label="Move up" variant="secondary" compact onPress={() => void move(-1)} />
        </View>
        <View style={styles.grow}>
          <Button label="Move down" variant="secondary" compact onPress={() => void move(1)} />
        </View>
      </View>

      {/* Buying something is not packing it: this adds it to pack, nothing more (C1). */}
      {list.kind === 'shopping' && list.tripId ? (
        <Button
          label="Add to packing list"
          variant="secondary"
          onPress={() => void copyToPacking()}
        />
      ) : null}

      <Button label="Remove item" variant="danger" onPress={confirmDelete} />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
