import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { coverOf, coverText, shareAmounts, splitSummary } from '../../domain/costShares';
import { formatMoney } from '../../domain/format';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { listShares, listTripCover, SHARE_TABLES, type CostOwner } from '../../repositories/costShares';
import { listTripTravellers } from '../../repositories/travellers';
import { Button } from '../../ui/components/Button';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  owner: CostOwner;
  tripId: string;
  /** The cost being split, in its currency; null when there is none (nothing to split). */
  cost: { total: number; currency: string } | null;
  /** Why it cannot be split now, or null. A split saved earlier is still shown. */
  refusal: string | null;
  /** False for a cancelled booking that does not count: its split is kept and said so. */
  counted?: boolean;
};

/**
 * Whose cost this is (3D-2): *Not split*, or one line per person with their share and, for a
 * child, who covers it. *Split between* is never *Going* and never *Paid by*.
 */
export function SplitSection({ owner, tripId, cost, refusal, counted = true }: Props) {
  const c = useColors();
  const router = useRouter();
  const key = 'itemId' in owner ? owner.itemId : owner.expenseId;

  const { data } = useLiveQuery(
    useCallback(
      async (database) => {
        const [shares, members, cover] = await Promise.all([
          listShares(database, owner),
          listTripTravellers(database, tripId),
          listTripCover(database, tripId),
        ]);
        return { shares, members, cover };
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `owner`
      [key, tripId],
    ),
    [...SHARE_TABLES, 'travellers'],
    [key, tripId],
  );

  if (!data) return null;
  const { shares, members, cover } = data;
  if (shares.length === 0 && refusal !== null) return null;

  const byId = new Map(members.map((member) => [member.id, member]));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Someone';
  const classificationOf = (id: string) => byId.get(id)?.classification;
  const amounts = cost ? shareAmounts(cost.total, shares) : null;
  const open = () =>
    router.push({ pathname: '/split/edit', params: 'itemId' in owner ? { itemId: owner.itemId } : { expenseId: owner.expenseId } });

  return (
    <View style={styles.section}>
      <SectionLabel>Split</SectionLabel>
      <Text style={[type.body, { color: c.text }]}>
        {splitSummary(shares)}
        {shares.length > 0 && !counted ? ' · not counted in the totals' : ''}
      </Text>
      {amounts && cost && amounts.unallocated !== 0 && shares.length > 0 ? (
        <Text style={[type.caption, { color: c.attention }]}>
          {amounts.unallocated > 0
            ? `Does not add up: ${formatMoney(amounts.unallocated, cost.currency)} not allocated.`
            : `Does not add up: ${formatMoney(-amounts.unallocated, cost.currency)} more than the cost.`}
        </Text>
      ) : null}
      {shares.length > 0 ? (
        <Rows>
          {shares.map((share, i) => {
            const covered = coverText(coverOf(share, classificationOf, cover), nameOf);
            return (
              <ListRow
                key={share.id}
                title={nameOf(share.travellerId)}
                subtitle={covered ?? undefined}
                detail={amounts && cost ? formatMoney(amounts.shares[i].amount, cost.currency) : undefined}
                onPress={open}
              />
            );
          })}
        </Rows>
      ) : null}
      {refusal === null ? (
        <Button label={shares.length > 0 ? 'Edit split' : 'Split it'} variant="secondary" onPress={open} />
      ) : (
        <Text style={[type.caption, { color: c.textMuted }]}>{refusal}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
