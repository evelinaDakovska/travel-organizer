import { StyleSheet, Text, View } from 'react-native';

import { rateText, type ConvertedTotal } from '../../domain/conversion';
import { formatMoney, formatShortDate } from '../../domain/format';
import type { TripTotal as Total } from '../../domain/spending';
import { Button } from '../../ui/components/Button';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  totals: readonly Total[];
  /** Cancelled bookings whose refund nobody set: named beside the total they are left out of. */
  notCounted: readonly { currency: string; amount: number }[];
  /** The whole in the trip's reporting currency (Phase 4); null when the trip is not converted. */
  converted: ConvertedTotal | null;
  /** Opens the trip's currencies and rates. */
  onRates: () => void;
};

/**
 * The one expected total for the trip (B8): bookings plus spending, per currency. Shown once, above
 * the switch, so Bookings and Spending never change what it means. With a reporting currency
 * (Phase 4) one converted figure leads, marked ≈ when any part is an estimate, and the amounts as
 * recorded follow it, unchanged; what has no rate is named, never guessed.
 */
export function TripTotal({ totals, notCounted, converted, onRates }: Props) {
  const c = useColors();

  const lines = totals.map((line) => (
    <View key={line.currency} style={styles.line}>
      <Text style={[converted ? type.bodyStrong : type.display, { color: c.text }]}>
        {formatMoney(line.total, line.currency)}
      </Text>
      <Text style={[type.caption, { color: c.textMuted }]}>
        Bookings {formatMoney(line.bookings, line.currency)} · Spending{' '}
        {formatMoney(line.spending, line.currency)}
      </Text>
    </View>
  ));

  return (
    <View style={styles.block} accessibilityRole="summary">
      <Text style={[type.overline, { color: c.textMuted }]}>EXPECTED TRIP COST</Text>
      {converted ? (
        <>
          <View style={styles.line}>
            <Text
              style={[type.display, { color: c.text }]}
              accessibilityLabel={`${converted.estimated ? 'About ' : ''}${formatMoney(converted.total, converted.base)}`}>
              {converted.estimated ? '≈ ' : ''}
              {formatMoney(converted.total, converted.base)}
            </Text>
            <Text style={[type.caption, { color: c.textMuted }]}>
              Bookings {formatMoney(converted.bookings, converted.base)} · Spending{' '}
              {formatMoney(converted.spending, converted.base)}
            </Text>
            {converted.ratesUsed.length > 0 ? (
              <Text style={[type.caption, { color: c.textMuted }]}>
                Estimated at{' '}
                {converted.ratesUsed.map((rate) => `${rateText(rate)} (${formatShortDate(rate.rateDate)})`).join(', ')}
              </Text>
            ) : null}
            {converted.notIncluded.length > 0 ? (
              <Text style={[type.caption, { color: c.attention }]}>
                Not included:{' '}
                {converted.notIncluded.map(({ currency, amount }) => formatMoney(amount, currency)).join(' · ')}{' '}
                — no rate to {converted.base}.
              </Text>
            ) : null}
          </View>
          {/* Only when converting changed something: one currency already is the total. */}
          {totals.length > 1 || totals.some((line) => line.currency !== converted.base) ? (
            <>
              <Text style={[type.overline, { color: c.textMuted }]}>AS RECORDED</Text>
              {lines}
            </>
          ) : null}
        </>
      ) : (
        lines
      )}
      {/* Not counted, but never silently zero (R10): an unknown is not a refund. */}
      {notCounted.length > 0 ? (
        <Text style={[type.caption, { color: c.attention }]}>
          Not counted:{' '}
          {notCounted.map(({ currency, amount }) => formatMoney(amount, currency)).join(' · ')}{' '}
          cancelled with the refund not specified.
        </Text>
      ) : null}
      {/* Offered where it helps: a trip in two or more currencies, or one already converted. */}
      {converted || totals.length > 1 ? (
        <View style={styles.action}>
          <Button
            label={converted ? 'Currencies and rates' : 'Convert to one currency'}
            variant="ghost"
            compact
            onPress={onRates}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  line: { gap: 2 },
  action: { alignItems: 'flex-start', marginLeft: -spacing.md },
});
