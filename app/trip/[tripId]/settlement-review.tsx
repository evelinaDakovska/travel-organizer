import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { settlementReviewText, tripBalances } from '../../../src/domain/balances';
import { formatMoney, formatShortDate } from '../../../src/domain/format';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { BALANCE_TABLES, balanceInput, settlementsStillStand } from '../../../src/repositories/settlements';
import { Button } from '../../../src/ui/components/Button';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * Reviewing a currency's settlements after shared costs left it (`docs/phase3e-plan.md` §15.5):
 * what changed, and every settlement in that currency, each opening its record. *Settlements still
 * stand* acknowledges exactly the changes shown here — a change made meanwhile is refused, not
 * covered — and changes no settlement. Correcting one is done on the settlement itself.
 */
export default function SettlementReview() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId, currency } = useLocalSearchParams<{ tripId: string; currency: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const input = await balanceInput(database, tripId);
        const entry = tripBalances(input).find((one) => one.currency === currency) ?? null;
        const nameOf = (id: string) => input.members.find((member) => member.id === id)?.name ?? 'Someone';
        return { entry, nameOf };
      },
      [tripId, currency],
    ),
    BALANCE_TABLES,
    [tripId, currency],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen title="Review settlements" view={view} missingText="" what="the settlements" onRetry={query.refetch} />
    );
  }

  const { entry, nameOf } = data;
  const reviews = entry?.settlementReviews ?? [];
  const settlements = entry?.settlements ?? [];

  const stillStand = () => {
    // Exactly what this screen shows now: anything added after this tap is not covered.
    const seen = reviews.map((review) => review.id);
    Alert.alert(
      'Settlements still stand?',
      `Every settlement in ${currency} stays exactly as it is. Suggested transfers in ${currency} come back ` +
        'if nothing else holds them — a cost still incomplete, or an unsplit cost to review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settlements still stand',
          onPress: () =>
            void settlementsStillStand(db, tripId, currency, seen)
              .then(() => router.back())
              .catch((error: unknown) =>
                Alert.alert('Not saved', error instanceof Error ? error.message : 'Nothing was changed.'),
              ),
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Review settlements" subtitle={currency} />
      <ScrollView contentContainerStyle={styles.content}>
        {reviews.length === 0 ? (
          <Text style={[type.body, { color: c.text }]}>Nothing in {currency} is waiting for review.</Text>
        ) : (
          <>
            <Text style={[type.body, { color: c.text }]}>
              Shared costs in {currency} changed after these settlements were recorded. A settlement is money that
              changed hands: it is never moved, reversed or deleted for you. Check whether each one still reflects
              what happened — open it to correct or delete it — then say whether they still stand.
            </Text>

            <View style={styles.block}>
              <SectionLabel>What changed</SectionLabel>
              <Rows>
                {reviews.map((review) => (
                  <ListRow
                    key={review.id}
                    title={settlementReviewText(review)}
                    subtitle={formatShortDate(review.createdAt.slice(0, 10))}
                  />
                ))}
              </Rows>
            </View>

            <View style={styles.block}>
              <SectionLabel>{`Settlements in ${currency}`}</SectionLabel>
              <Rows>
                {settlements.map((settlement) => (
                  <ListRow
                    key={settlement.id}
                    title={`${nameOf(settlement.fromId)} → ${nameOf(settlement.toId)}`}
                    subtitle={
                      [settlement.settledOn ? formatShortDate(settlement.settledOn) : 'No date', settlement.note]
                        .filter(Boolean)
                        .join(' · ')
                    }
                    trailing={<Text style={[type.label, { color: c.text }]}>{formatMoney(settlement.amount, currency)}</Text>}
                    onPress={() =>
                      router.push({ pathname: '/settlement/[settlementId]', params: { settlementId: settlement.id } })
                    }
                  />
                ))}
              </Rows>
            </View>

            <Button label="Settlements still stand" onPress={stillStand} wrap />
          </>
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
  block: { gap: spacing.xs },
});
