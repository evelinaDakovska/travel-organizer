import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  bookingSplitRefusal,
  expenseSplitRefusal,
  fillFromPrices,
  shareAmounts,
  changedWhileEditing,
  goneFromDraft,
  keptBasis,
  splitDraftConflicts,
  splitMode,
  splitRefusal,
  whoIsGoing,
  type CostShare,
  type Member,
  type SplitBasis,
  type SplitInput,
  type SplitMode,
  type TripCover,
} from '../../src/domain/costShares';
import { formatMoney } from '../../src/domain/format';
import { pricingOf, type Pricing } from '../../src/domain/pricing';
import { expenseTitle } from '../../src/domain/spending';
import { alertRefusal } from '../../src/features/payments/refusal';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  listShares,
  listTripCover,
  removeSplit,
  saveSplit,
  SHARE_TABLES,
  type CostOwner,
} from '../../src/repositories/costShares';
import { getExpense } from '../../src/repositories/expenses';
import { listItemParticipants, listTripTravellers } from '../../src/repositories/travellers';
import { getTripItem } from '../../src/repositories/tripItems';
import { Button } from '../../src/ui/components/Button';
import { CheckBox } from '../../src/ui/components/CheckBox';
import { ChoiceField } from '../../src/ui/components/ChoiceField';
import { Field } from '../../src/ui/components/Field';
import { FormScroll } from '../../src/ui/components/FormScroll';
import { AmountInput } from '../../src/ui/components/MoneyInputs';
import { Notice } from '../../src/ui/components/Notice';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { Segments } from '../../src/ui/components/Segments';
import { gutter, spacing, type, useColors } from '../../src/ui/tokens';

type Loaded = {
  title: string;
  tripId: string;
  /** Null when the cost cannot be split now: the reason. */
  refusal: string | null;
  total: number;
  currency: string;
  members: Member[];
  shares: CostShare[];
  cover: TripCover[];
  /** Booking only: who goes, and its price lines. */
  participantIds: string[];
  pricing: Pricing | null;
};

/**
 * Who a booking or a standalone expense is for (3D-2): equally, or by amounts that add up to the
 * cost. Nobody is ticked until the person says; *Who's going*, *Everyone* and *Fill from prices*
 * are fills shown before saving, never saved by themselves. A child's share is covered by the
 * trip's *Covered by* unless an adult is picked here for this cost.
 *
 * The draft is kept while the data under it refreshes. When something it depends on changes —
 * the cost, its currency, the saved split, or someone it names leaving the trip or changing adult
 * or child — the screen says what, and Save is refused until the person keeps their changes or
 * starts again from the saved split. The repository checks the same again inside the save.
 */
export default function EditSplit() {
  const { itemId, expenseId } = useLocalSearchParams<{ itemId?: string; expenseId?: string }>();
  const owner: CostOwner | null = itemId ? { itemId } : expenseId ? { expenseId } : null;
  const key = itemId ?? expenseId ?? '';
  // Bumped by *Start again from the saved split*: the only time a draft is thrown away.
  const [generation, setGeneration] = useState(0);

  const query = useLiveQuery(
    useCallback(
      async (database): Promise<Loaded | null> => {
        if (!owner) return null;
        if ('itemId' in owner) {
          const item = await getTripItem(database, owner.itemId);
          if (!item) return null;
          const [members, shares, cover, participants] = await Promise.all([
            listTripTravellers(database, item.tripId),
            listShares(database, owner),
            listTripCover(database, item.tripId),
            listItemParticipants(database, item.id),
          ]);
          return {
            title: item.title,
            tripId: item.tripId,
            refusal: bookingSplitRefusal(item),
            total: item.priceAmount ?? 0,
            currency: item.priceCurrency ?? '',
            members,
            shares,
            cover,
            participantIds: participants.map((p) => p.id),
            pricing: pricingOf(item.details),
          };
        }
        const expense = await getExpense(database, owner.expenseId);
        if (!expense) return null;
        const [members, shares, cover] = await Promise.all([
          listTripTravellers(database, expense.tripId),
          listShares(database, owner),
          listTripCover(database, expense.tripId),
        ]);
        return {
          title: expenseTitle(expense),
          tripId: expense.tripId,
          refusal: expenseSplitRefusal(expense),
          total: expense.amount,
          currency: expense.currency,
          members,
          shares,
          cover,
          participantIds: [],
          pricing: null,
        };
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `owner`
      [key],
    ),
    [...SHARE_TABLES, 'travellers', 'item_participants'],
    [key],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data || !owner) {
    return (
      <QueryScreen
        title="Split"
        view={view === 'ready' ? 'missing' : view}
        missingText="This cost no longer exists."
        what="this cost"
        onRetry={query.refetch}
      />
    );
  }
  return (
    <SplitEditor
      key={`${key}-${generation}`}
      owner={owner}
      data={data}
      onStartAgain={() => setGeneration((n) => n + 1)}
    />
  );
}

const basisOf = (data: Loaded): SplitBasis => ({
  total: data.total,
  currency: data.currency,
  members: data.members,
  shares: data.shares,
});

function SplitEditor({ owner, data, onStartAgain }: { owner: CostOwner; data: Loaded; onStartAgain: () => void }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { members, total, currency } = data;

  const [mode, setMode] = useState<SplitMode>(splitMode(data.shares) ?? 'equal');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(data.shares.map((s) => s.travellerId)));
  const [amounts, setAmounts] = useState<Record<string, number | undefined>>(() =>
    Object.fromEntries(data.shares.map((s) => [s.travellerId, s.amount ?? undefined])),
  );
  const [overrides, setOverrides] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(data.shares.map((s) => [s.travellerId, s.coveredBy])),
  );
  // Remounts the amount boxes after a fill, so they show the filled amounts.
  const [fillCount, setFillCount] = useState(0);
  // Set while this screen's own save or removal runs: its write is not someone else's change.
  const [saving, setSaving] = useState(false);
  // What the draft was last checked against: where it started, or what the person kept it over.
  const [reviewed, setReviewed] = useState<SplitBasis>(() => basisOf(data));

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const adults = members.filter((m) => m.classification === 'adult');
  const chosen = members.filter((m) => selected.has(m.id));
  // The draft is everyone ticked, including anyone who has left the trip since: they stay in it,
  // and in what is sent to save, until the person takes them out. Never rebuilt from the trip alone.
  const gone = reviewed.members.filter((m) => !byId.has(m.id) && selected.has(m.id));
  const drafted = [...chosen, ...gone];
  const nameOf = (id: string) =>
    byId.get(id)?.name ?? reviewed.members.find((m) => m.id === id)?.name ?? 'Someone not on this trip';

  const input: SplitInput = {
    people: drafted.map((m) => ({
      travellerId: m.id,
      amount: mode === 'amounts' ? (amounts[m.id] ?? Number.NaN) : null,
      coveredBy: m.classification === 'child' ? (overrides[m.id] ?? null) : null,
    })),
  };
  const equalAmounts =
    mode === 'equal'
      ? new Map(
          shareAmounts(
            total,
            drafted.map((m, sortOrder) => ({ travellerId: m.id, amount: null, sortOrder })),
          ).shares.map((s) => [s.travellerId, s.amount]),
        )
      : null;
  const now = basisOf(data);
  const conflicts = saving ? [] : splitDraftConflicts(reviewed, now, input.people);
  const toTakeOut = saving ? [] : goneFromDraft(reviewed, now, input.people);
  const typed = drafted.reduce((sum, m) => sum + (Number.isFinite(amounts[m.id]) ? amounts[m.id]! : 0), 0);
  /** *Take … out*: off the draft and its covers, by the person's tap. Nothing else changes. */
  const takeOut = (id: string) => {
    setSelected((prev) => new Set([...prev].filter((x) => x !== id)));
    setOverrides((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === id ? null : v])));
    setReviewed((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== id) }));
  };

  if (data.refusal !== null) {
    return (
      <Screen>
        <ScreenHeader title="Split" subtitle={data.title} leading="close" />
        <View style={styles.notice}>
          <Notice title="This cannot be split">{data.refusal}</Notice>
        </View>
        {data.shares.length > 0 ? (
          <View style={styles.notice}>
            <Button label="Remove split" variant="danger" onPress={() => confirmRemove(db, owner, setSaving, router.back)} />
          </View>
        ) : null}
      </Screen>
    );
  }

  const tick = (ids: readonly string[]) => setSelected(new Set(ids));
  const going = whoIsGoing(members, data.participantIds);
  const fill = () => {
    if (!data.pricing) return;
    const result = fillFromPrices(data.pricing, chosen, total, currency);
    if (result.kind === 'refused') {
      Alert.alert('Not filled', result.reason);
      return;
    }
    setMode('amounts');
    setAmounts(Object.fromEntries(result.amounts.map((s) => [s.travellerId, s.amount])));
    setFillCount((n) => n + 1);
  };

  const save = async () => {
    const problem = conflicts.length > 0 ? changedWhileEditing(conflicts) : splitRefusal(input, total, currency, byId);
    if (problem) {
      Alert.alert('Not saved', problem);
      return;
    }
    setSaving(true);
    try {
      await saveSplit(db, owner, input, reviewed);
      router.back();
    } catch (error) {
      setSaving(false);
      if (!alertRefusal(error)) throw error;
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Split" subtitle={data.title} leading="close" />
      <FormScroll footer={<Button label="Save split" busy={saving} onPress={() => void save()} />}>
        {conflicts.length > 0 ? (
          <Notice title="Changed while you were editing">
            <Text style={[type.caption, { color: c.text }]}>
              {conflicts.join(' ')} Your changes are kept below — check them before saving.
            </Text>
            <View style={styles.fills}>
              {toTakeOut.map((m) => (
                <Button key={m.id} label={`Take ${m.name} out`} variant="secondary" onPress={() => takeOut(m.id)} />
              ))}
              <Button
                label="Keep my changes"
                variant="secondary"
                onPress={() => setReviewed(keptBasis(reviewed, now, input.people))}
              />
              <Button label="Start again from the saved split" variant="secondary" onPress={onStartAgain} />
            </View>
          </Notice>
        ) : null}

        <Text style={[type.caption, { color: c.textMuted }]}>
          Cost {formatMoney(total, currency)} · who it is for, not who went or who paid
        </Text>

        <Segments
          value={mode}
          options={['equal', 'amounts'] as const}
          onChange={setMode}
          labelFor={(m) => (m === 'equal' ? 'Equally' : 'By amounts')}
        />

        <View style={styles.fills}>
          <Button label="Everyone on the trip" variant="secondary" onPress={() => tick(members.map((m) => m.id))} />
          {going.length > 0 ? (
            <Button label="Who's going" variant="secondary" onPress={() => tick(going.map((m) => m.id))} />
          ) : null}
          {data.pricing ? <Button label="Fill from prices" variant="secondary" onPress={fill} /> : null}
        </View>

        {members.length === 0 ? (
          <Text style={[type.body, { color: c.textMuted }]}>
            Nobody is on this trip yet. Add travellers to the trip first.
          </Text>
        ) : null}

        {members.map((member) => {
          const on = selected.has(member.id);
          const tripAdults = data.cover
            .filter((cv) => cv.childId === member.id && byId.get(cv.adultId)?.classification === 'adult')
            .map((cv) => byId.get(cv.adultId)!.name);
          return (
            <View key={member.id} style={styles.person}>
              <View style={styles.personRow}>
                <CheckBox
                  checked={on}
                  onToggle={() => {
                    const next = new Set(selected);
                    if (on) next.delete(member.id);
                    else next.add(member.id);
                    setSelected(next);
                  }}
                  accessibilityLabel={`${member.name} in the split`}
                />
                <View style={styles.grow}>
                  <Text style={[type.bodyStrong, { color: c.text }]}>{member.name}</Text>
                  {member.classification === 'child' ? (
                    <Text style={[type.caption, { color: c.textMuted }]}>Child</Text>
                  ) : null}
                </View>
                {on && equalAmounts ? (
                  <Text style={[type.body, { color: c.text }]}>
                    {formatMoney(equalAmounts.get(member.id) ?? 0, currency)}
                  </Text>
                ) : null}
              </View>
              {on && mode === 'amounts' ? (
                <AmountInput
                  key={`${member.id}-${fillCount}`}
                  value={amounts[member.id]}
                  onChange={(value) => setAmounts((prev) => ({ ...prev, [member.id]: value }))}
                  onBlur={() => {}}
                  invalid={amounts[member.id] !== undefined && !Number.isFinite(amounts[member.id])}
                />
              ) : null}
              {on && member.classification === 'child' ? (
                <Field
                  label={`Covered by, for this cost`}
                  hint={
                    overrides[member.id]
                      ? byId.has(overrides[member.id]!)
                        ? undefined
                        : `${nameOf(overrides[member.id]!)} — no longer on this trip`
                      : tripAdults.length > 0
                        ? `The trip’s: ${tripAdults.join(' and ')}`
                        : 'Not covered — nobody is set on the trip (Travellers)'
                  }>
                  <ChoiceField
                    value={overrides[member.id] ?? null}
                    options={adults.map((a) => a.id)}
                    labelFor={nameOf}
                    onChange={(value) => setOverrides((prev) => ({ ...prev, [member.id]: value }))}
                    clearable
                  />
                </Field>
              ) : null}
            </View>
          );
        })}

        {mode === 'amounts' && drafted.length > 0 ? (
          <Text style={[type.caption, { color: typed === total ? c.textMuted : c.attention }]}>
            {typed === total
              ? `Adds up to ${formatMoney(total, currency)}`
              : typed < total
                ? `${formatMoney(total - typed, currency)} left to split`
                : `${formatMoney(typed - total, currency)} more than the cost`}
          </Text>
        ) : null}

        {data.shares.length > 0 ? (
          <Button label="Remove split" variant="danger" onPress={() => confirmRemove(db, owner, setSaving, router.back)} />
        ) : null}
      </FormScroll>
    </Screen>
  );
}

function confirmRemove(
  db: ReturnType<typeof useSQLiteContext>,
  owner: CostOwner,
  setBusy: (busy: boolean) => void,
  done: () => void,
) {
  Alert.alert('Remove the split?', 'It will read Not split again. Nothing paid changes.', [
    { text: 'Keep it', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: async () => {
        setBusy(true);
        try {
          await removeSplit(db, owner);
        } catch (error) {
          setBusy(false);
          throw error;
        }
        done();
      },
    },
  ]);
}

const styles = StyleSheet.create({
  notice: { paddingHorizontal: gutter.normal, paddingTop: spacing.sm },
  fills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  person: { gap: spacing.sm },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
});
