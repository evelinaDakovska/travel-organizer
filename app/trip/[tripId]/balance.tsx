import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  explainBalance,
  netText,
  tripBalances,
  type ExplanationLine,
} from '../../../src/domain/balances';
import { formatMoney } from '../../../src/domain/format';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { BALANCE_TABLES, balanceInput } from '../../../src/repositories/settlements';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * One person's balance in one currency, line by line (3E, exit criterion: a readable per-person
 * explanation): what they paid, what they bear — their own shares and the children's they cover —
 * what they settled, and the sum. What they paid on costs not in the balances yet is shown apart,
 * never added. Every line opens its record.
 */
export default function BalanceExplanation() {
  const c = useColors();
  const router = useRouter();
  const { tripId, travellerId, currency } = useLocalSearchParams<{
    tripId: string;
    travellerId: string;
    currency: string;
  }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const input = await balanceInput(database, tripId);
        const nameOf = (id: string) => input.members.find((member) => member.id === id)?.name ?? 'Someone';
        const explanation = explainBalance(input, travellerId, currency, nameOf);
        const entry = tripBalances(input).find((one) => one.currency === currency);
        if (!explanation || !entry) return null;
        const member = input.members.find((one) => one.id === travellerId);
        return { explanation, entry, nameOf, name: nameOf(travellerId), isChild: member?.classification === 'child' };
      },
      [tripId, travellerId, currency],
    ),
    BALANCE_TABLES,
    [tripId, travellerId, currency],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen
        title="Balance"
        view={view}
        missingText="Nothing is recorded for this person in this currency any more."
        what="the balance"
        onRetry={query.refetch}
      />
    );
  }

  const { explanation, entry, nameOf, name, isChild } = data;
  const money = (amount: number) => formatMoney(amount, currency);
  const open = (line: ExplanationLine) => {
    const href: Href =
      line.kind === 'settlement'
        ? { pathname: '/settlement/[settlementId]', params: { settlementId: line.id } }
        : line.paymentId
          ? { pathname: '/payment/[paymentId]', params: { paymentId: line.paymentId } }
          : line.expenseId
            ? { pathname: '/expense/[expenseId]', params: { expenseId: line.expenseId } }
            : { pathname: '/item/[itemId]', params: { itemId: line.id } };
    router.push(href);
  };
  const section = (title: string, lines: ExplanationLine[], sign: '+' | '−', label: (line: ExplanationLine) => string) =>
    lines.length > 0 ? (
      <View style={styles.block}>
        <SectionLabel>{title}</SectionLabel>
        <Rows>
          {lines.map((line, i) => (
            <ListRow
              key={`${line.id}-${i}`}
              title={label(line)}
              trailing={
                <Text style={[type.label, { color: c.text }]}>
                  {sign} {money(line.amount)}
                </Text>
              }
              onPress={() => open(line)}
            />
          ))}
        </Rows>
      </View>
    ) : null;

  const { balance } = explanation;
  return (
    <Screen>
      <ScreenHeader title={name} subtitle={`Balance · ${currency}`} />
      <ScrollView contentContainerStyle={styles.content}>
        {entry.state !== 'final' ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {entry.state === 'soFar'
              ? 'Balances so far: some costs in this currency are not complete yet, so this is not final.'
              : 'Only settlements in this currency, no costs in the balances: check the currency.'}
          </Text>
        ) : null}
        {section('Paid', explanation.paid, '+', (line) => line.title)}
        {section(`${name}'s share`, explanation.shares, '−', (line) =>
          line.forChildId ? `${line.title} · ${nameOf(line.forChildId)}'s share, covered by ${name}` : line.title,
        )}
        {section('Settled — sent', explanation.sent, '+', (line) => `To ${line.title}`)}
        {section('Settled — received', explanation.received, '−', (line) => `From ${line.title}`)}

        <View style={[styles.sum, { borderTopColor: c.border }]}>
          <Text style={[type.label, { color: c.textMuted }]}>
            {money(balance.paid)} − {money(balance.borne)} + {money(balance.sent)} − {money(balance.received)}
          </Text>
          <Text style={[type.heading, { color: c.text }]}>
            {name} {netText(balance, currency, entry.state, isChild)}
          </Text>
        </View>

        {explanation.paidWaiting.length > 0 ? (
          <View style={styles.block}>
            <SectionLabel>Paid on costs not in the balances yet</SectionLabel>
            <Text style={[type.caption, { color: c.textMuted }]}>
              Recorded, and kept apart: these count once their cost is split, fully paid and every payer recorded.
            </Text>
            <Rows>
              {explanation.paidWaiting.map((line, i) => (
                <ListRow
                  key={`${line.id}-${i}`}
                  title={line.title}
                  trailing={<Text style={[type.label, { color: c.textMuted }]}>{money(line.amount)}</Text>}
                  onPress={() => open(line)}
                />
              ))}
            </Rows>
          </View>
        ) : null}
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
  block: { gap: spacing.xs },
  sum: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
});
