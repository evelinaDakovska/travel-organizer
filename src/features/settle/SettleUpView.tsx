import { useRouter, type Href } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  balancesHeading,
  costFingerprint,
  netText,
  recordedText,
  statusText,
  waitTarget,
  waitText,
  type BalanceCost,
  type CurrencyBalances,
  type Settlement,
  type WaitingCost,
} from '../../domain/balances';
import type { Member } from '../../domain/costShares';
import { formatMoney, formatShortDate } from '../../domain/format';
import { Button } from '../../ui/components/Button';
import { Disclosure } from '../../ui/components/Disclosure';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  tripId: string;
  balances: readonly CurrencyBalances[];
  members: readonly Member[];
  /** Shares the suggested transfers as text; names leave the phone only from here (§9). */
  onShare: () => void;
  /** Keeps an unsplit cost outside on purpose, as `seen` read (§14.2); rejects with the reason. */
  onKeepOutside: (cost: BalanceCost, seen: string) => Promise<void>;
  /** Takes a kept-outside cost back to review. */
  onReviewAgain: (cost: BalanceCost) => Promise<void>;
};

/**
 * Who owes whom (3E, `docs/phase3e-plan.md` §8), one currency at a time, never added together.
 * Balances count only costs whose money story is complete; everything else is listed with what is
 * recorded on it and where to finish it. Suggested transfers appear only where nothing waits but
 * costs left unsplit (§12.1): a provisional figure is never worded or coloured as a debt. In a
 * currency with settlements, an unsplit cost is reviewed first: split it, or keep it outside on
 * purpose (§14.2).
 */
export function SettleUpView({ tripId, balances, members, onShare, onKeepOutside, onReviewAgain }: Props) {
  const c = useColors();
  const router = useRouter();
  const byId = new Map(members.map((member) => [member.id, member]));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Someone';
  const record = () => router.push({ pathname: '/settlement/new', params: { tripId } });

  if (balances.length === 0) {
    return (
      <View style={styles.view}>
        <Text style={[type.body, { color: c.textMuted }]}>
          Nothing to settle yet. Split a booking or an expense between the people on this trip, record who paid,
          and who owes whom shows here.
        </Text>
        <Button label="Record a settlement" variant="secondary" onPress={record} />
      </View>
    );
  }

  return (
    <View style={styles.view}>
      {balances.map((entry) => (
        <CurrencySection
          key={entry.currency}
          tripId={tripId}
          entry={entry}
          byId={byId}
          nameOf={nameOf}
          onKeepOutside={onKeepOutside}
          onReviewAgain={onReviewAgain}
        />
      ))}
      <Button label="Record a settlement" variant="secondary" onPress={record} />
      <Button label="Share who owes whom" variant="ghost" onPress={onShare} />
      <Text style={[type.caption, { color: c.textMuted }]}>
        Only costs that are split, fully paid and with every payer recorded count here. Money between travellers is
        not a cost: the trip total stays as it is. Nothing is converted between currencies.
      </Text>
    </View>
  );
}

function CurrencySection({
  tripId,
  entry,
  byId,
  nameOf,
  onKeepOutside,
  onReviewAgain,
}: {
  tripId: string;
  entry: CurrencyBalances;
  byId: ReadonlyMap<string, Member>;
  nameOf: (id: string) => string;
  onKeepOutside: Props['onKeepOutside'];
  onReviewAgain: Props['onReviewAgain'];
}) {
  const c = useColors();
  const router = useRouter();
  const money = (amount: number) => formatMoney(amount, entry.currency);
  const status = statusText(entry);
  // Each unsplit cost is listed once: to review, kept outside, or simply not split.
  const otherNotSplit = entry.notSplit.filter((cost) => !entry.toReview.includes(cost) && !entry.keptOutside.includes(cost));
  const total = (costs: readonly BalanceCost[]) => money(costs.reduce((sum, cost) => sum + cost.amount, 0));
  const costs = (n: number) => (n === 1 ? '1 cost' : `${n} costs`);

  return (
    <View style={styles.section}>
      <SectionLabel>{balancesHeading(entry)}</SectionLabel>

      {entry.people.length > 0 ? (
        <Rows>
          {entry.people.map((row) => {
            const isChild = byId.get(row.travellerId)?.classification === 'child';
            // Only a final debt is coloured as one; a provisional figure or a child never is (§12.1, E).
            const flagged = isChild && row.net < 0;
            const owes = entry.state === 'final' && row.net < 0 && !isChild;
            const working = [
              row.paid > 0 || row.borne > 0 ? `paid ${money(row.paid)} · share ${money(row.borne)}` : null,
              row.sent > 0 ? `settled ${money(row.sent)} sent` : null,
              row.received > 0 ? `${money(row.received)} received` : null,
            ].filter((part): part is string => part !== null);
            return (
              // The net and its working on full-width lines under the name: a narrow screen at a large
              // font must not cut either (plan §10, 360 dp · font 2.0).
              <ListRow
                key={row.travellerId}
                title={nameOf(row.travellerId)}
                footer={
                  <View style={styles.working}>
                    <Text
                      style={[
                        type.label,
                        { color: owes || flagged ? c.attention : entry.state === 'final' ? c.text : c.textMuted },
                      ]}>
                      {netText(row, entry.currency, entry.state, isChild)}
                    </Text>
                    {working.length > 0 ? (
                      <Text style={[type.caption, { color: c.textMuted }]}>{working.join(' · ')}</Text>
                    ) : null}
                    {row.paidWaiting > 0 ? (
                      <Text style={[type.caption, { color: c.textMuted }]}>
                        Also paid {money(row.paidWaiting)} on costs not in the balances yet
                      </Text>
                    ) : null}
                  </View>
                }
                onPress={() =>
                  router.push({
                    pathname: '/trip/[tripId]/balance',
                    params: { tripId, travellerId: row.travellerId, currency: entry.currency },
                  })
                }
              />
            );
          })}
        </Rows>
      ) : null}

      {status ? (
        <Text
          style={[
            type.caption,
            {
              color:
                entry.state === 'settlementsOnly' || entry.state === 'review' || entry.childrenBelowZero.length > 0
                  ? c.attention
                  : c.textMuted,
            },
          ]}>
          {status}
        </Text>
      ) : null}

      {entry.transfers.length > 0 ? (
        <View style={styles.block}>
          <Text style={[type.label, { color: c.text }]}>Suggested transfers</Text>
          <Rows>
            {entry.transfers.map((transfer) => (
              <ListRow
                key={`${transfer.fromId}-${transfer.toId}`}
                title={`${nameOf(transfer.fromId)} pays ${nameOf(transfer.toId)}`}
                subtitle="Tap to record it, in full or in part"
                trailing={<Text style={[type.label, { color: c.text }]}>{money(transfer.amount)}</Text>}
                onPress={() =>
                  router.push({
                    pathname: '/settlement/new',
                    params: {
                      tripId,
                      fromId: transfer.fromId,
                      toId: transfer.toId,
                      amount: String(transfer.amount),
                      currency: entry.currency,
                    },
                  })
                }
              />
            ))}
          </Rows>
        </View>
      ) : null}

      {entry.waiting.length > 0 ? (
        <View style={styles.block}>
          <Text style={[type.label, { color: c.text }]}>Not in the balances yet</Text>
          <Rows>
            {entry.waiting.map((waiting) => (
              <WaitingRow key={waiting.cost.id} tripId={tripId} waiting={waiting} nameOf={nameOf} />
            ))}
          </Rows>
        </View>
      ) : null}

      {entry.toReview.length > 0 ? (
        <View style={styles.block}>
          <Text style={[type.label, { color: c.text }]}>To review · {costs(entry.toReview.length)} not split</Text>
          <Text style={[type.caption, { color: c.textMuted }]}>
            {entry.toReview.length === 1
              ? `${entry.currency} has settlements, and one may have paid for this cost while it was split. Split it, or keep it outside on purpose.`
              : `${entry.currency} has settlements, and one may have paid for any of these while it was split. Split each, or keep it outside on purpose.`}
          </Text>
          <Rows>
            {entry.toReview.map((cost) => (
              <ReviewRow key={cost.id} tripId={tripId} cost={cost} nameOf={nameOf} onKeepOutside={onKeepOutside} />
            ))}
          </Rows>
        </View>
      ) : null}

      {entry.keptOutside.length > 0 ? (
        <Disclosure
          title="Kept outside on purpose"
          summary={`${costs(entry.keptOutside.length)}, ${total(entry.keptOutside)} — not part of who owes whom`}>
          <Rows>
            {entry.keptOutside.map((cost) => (
              <KeptRow key={cost.id} cost={cost} nameOf={nameOf} onReviewAgain={onReviewAgain} />
            ))}
          </Rows>
        </Disclosure>
      ) : null}

      {otherNotSplit.length > 0 ? (
        <Disclosure
          title="Not split"
          summary={`${costs(otherNotSplit.length)}, ${total(otherNotSplit)} — not part of who owes whom`}>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Nobody has said who these are for, so they stay out of the balances. Split one to bring it in.
          </Text>
          <Rows>
            {otherNotSplit.map((cost) => (
              <WaitingRow
                key={cost.id}
                tripId={tripId}
                waiting={{ cost, reason: { kind: 'notSplit' } }}
                nameOf={nameOf}
              />
            ))}
          </Rows>
        </Disclosure>
      ) : null}

      {entry.settlements.length > 0 ? (
        <View style={styles.block}>
          <Text style={[type.label, { color: c.text }]}>Settlements</Text>
          <Rows>
            {entry.settlements.map((settlement) => (
              <SettlementRow key={settlement.id} settlement={settlement} nameOf={nameOf} />
            ))}
          </Rows>
        </View>
      ) : null}
    </View>
  );
}

/** Where a waiting cost is finished (§5): its split, the trip's *Covered by*, a payment, the cost. */
export function waitingHref(tripId: string, cost: BalanceCost, target: ReturnType<typeof waitTarget>): Href {
  const owner = cost.kind === 'booking' ? { itemId: cost.id } : { expenseId: cost.id };
  if (target === 'split') return { pathname: '/split/edit', params: owner };
  if (target === 'travellers') return { pathname: '/trip/[tripId]/travellers', params: { tripId } };
  if (target === 'record') {
    const record = cost.records.find((one) => one.payerId === null);
    if (record?.paymentId) return { pathname: '/payment/[paymentId]', params: { paymentId: record.paymentId } };
    if (record?.expenseId) return { pathname: '/expense/[expenseId]', params: { expenseId: record.expenseId } };
  }
  return cost.kind === 'booking'
    ? { pathname: '/item/[itemId]', params: { itemId: cost.id } }
    : { pathname: '/expense/[expenseId]', params: { expenseId: cost.id } };
}

function WaitingRow({
  tripId,
  waiting,
  nameOf,
}: {
  tripId: string;
  waiting: WaitingCost;
  nameOf: (id: string) => string;
}) {
  const c = useColors();
  const router = useRouter();
  const { cost, reason } = waiting;
  // To pay before the trip is normal, not a warning (§5).
  const quiet = reason.kind === 'toPay' || reason.kind === 'notSplit';
  return (
    <ListRow
      title={cost.title}
      subtitle={recordedText(cost, nameOf)}
      footer={
        <Text style={[type.caption, { color: quiet ? c.textMuted : c.attention }]}>
          {waitText(reason, cost.currency, cost, nameOf)}
        </Text>
      }
      trailing={<Text style={[type.caption, { color: c.textMuted }]}>{formatMoney(cost.amount, cost.currency)}</Text>}
      onPress={() => router.push(waitingHref(tripId, cost, waitTarget(reason)))}
    />
  );
}

/**
 * An unsplit cost to review (§14.2): *Split it* opens the split editor, which changes nothing until
 * saved; *Keep outside* says what it means and asks before saving. The fingerprint is taken from
 * the cost as this screen shows it, so a cost changed meanwhile is refused, not confirmed.
 */
function ReviewRow({
  tripId,
  cost,
  nameOf,
  onKeepOutside,
}: {
  tripId: string;
  cost: BalanceCost;
  nameOf: (id: string) => string;
  onKeepOutside: Props['onKeepOutside'];
}) {
  const c = useColors();
  const router = useRouter();
  const money = formatMoney(cost.amount, cost.currency);
  const keep = () => {
    const seen = costFingerprint(cost);
    Alert.alert(
      'Keep it outside the balances?',
      `“${cost.title}” (${money}) stays unsplit and out of who owes whom in ${cost.currency}. ` +
        'Settlements already recorded do not change and keep counting as they are. ' +
        'If its price, payments or split change later, it comes back here for review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep outside',
          onPress: () =>
            void onKeepOutside(cost, seen).catch((error: unknown) =>
              Alert.alert('Not kept outside', error instanceof Error ? error.message : 'Nothing was changed.'),
            ),
        },
      ],
    );
  };
  return (
    <ListRow
      title={cost.title}
      subtitle={recordedText(cost, nameOf)}
      trailing={<Text style={[type.caption, { color: c.textMuted }]}>{money}</Text>}
      footer={
        <View style={styles.actions}>
          <Button
            label="Split it"
            variant="secondary"
            compact
            onPress={() => router.push(waitingHref(tripId, cost, 'split'))}
          />
          <Button label="Keep outside" variant="ghost" compact onPress={keep} />
        </View>
      }
    />
  );
}

/** A cost kept outside on purpose, with the way back to review. */
function KeptRow({
  cost,
  nameOf,
  onReviewAgain,
}: {
  cost: BalanceCost;
  nameOf: (id: string) => string;
  onReviewAgain: Props['onReviewAgain'];
}) {
  const c = useColors();
  return (
    <ListRow
      title={cost.title}
      subtitle={recordedText(cost, nameOf)}
      trailing={<Text style={[type.caption, { color: c.textMuted }]}>{formatMoney(cost.amount, cost.currency)}</Text>}
      footer={
        <View style={styles.actions}>
          <Button
            label="Review again"
            variant="ghost"
            compact
            onPress={() =>
              void onReviewAgain(cost).catch(() => Alert.alert('Could not change it', 'Nothing was changed.'))
            }
          />
        </View>
      }
    />
  );
}

function SettlementRow({ settlement, nameOf }: { settlement: Settlement; nameOf: (id: string) => string }) {
  const c = useColors();
  const router = useRouter();
  return (
    <ListRow
      title={`${nameOf(settlement.fromId)} → ${nameOf(settlement.toId)}`}
      subtitle={
        [settlement.settledOn ? formatShortDate(settlement.settledOn) : null, settlement.note].filter(Boolean).join(' · ') ||
        null
      }
      trailing={
        <Text style={[type.label, { color: c.text }]}>{formatMoney(settlement.amount, settlement.currency)}</Text>
      }
      onPress={() => router.push({ pathname: '/settlement/[settlementId]', params: { settlementId: settlement.id } })}
    />
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.xl },
  section: { gap: spacing.md },
  block: { gap: spacing.xs },
  working: { gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
});
