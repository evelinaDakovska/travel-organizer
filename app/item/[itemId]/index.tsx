import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMoment, formatMoney } from '../../../src/domain/format';
import { timezoneLabel } from '../../../src/domain/timezones';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../../src/domain/tripItem';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  setTaskCompleted,
  TRIP_ITEM_TABLES,
} from '../../../src/repositories/tripItems';
import { Button } from '../../../src/ui/components/Button';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { radius, spacing, type, useColors } from '../../../src/ui/tokens';

export default function ItemDetail() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: item, loading } = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen>
        <ScreenHeader title="Item" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This item no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  const details = transportDetails(item);
  const route = routeLabel(details);

  return (
    <Screen>
      <ScreenHeader
        title={item.title}
        action={
          <Pressable onPress={() => router.push(`/item/${item.id}/edit`)} hitSlop={12}>
            <Text style={[type.body, { color: c.accent }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badges}>
          <Badge label={item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind)} />
          <Badge label={statusLabel(item)} tone={item.status === 'cancelled' ? 'muted' : 'accent'} />
          {item.status === 'idea' && item.priority ? <Badge label={item.priority} /> : null}
        </View>

        {route ? <Text style={[type.title, { color: c.text }]}>{route}</Text> : null}

        {item.start ? (
          <Block label="WHEN">
            <Text style={[type.body, { color: c.text }]}>
              {formatMoment(item.start.local, item.start.precision)}
            </Text>
            {item.end ? (
              <Text style={[type.body, { color: c.textMuted }]}>
                until {formatMoment(item.end.local, item.end.precision)}
              </Text>
            ) : null}
            {item.startTzOverride ? (
              <Text style={[type.caption, { color: c.textFaint }]}>
                {timezoneLabel(item.startTzOverride)}
              </Text>
            ) : null}
          </Block>
        ) : (
          <Block label="WHEN">
            <Text style={[type.body, { color: c.textMuted }]}>No date yet</Text>
          </Block>
        )}

        {item.locationName || item.address ? (
          <Block label="WHERE">
            {item.locationName ? (
              <Text style={[type.body, { color: c.text }]}>{item.locationName}</Text>
            ) : null}
            {item.address ? (
              <Text style={[type.body, { color: c.textMuted }]}>{item.address}</Text>
            ) : null}
          </Block>
        ) : null}

        {item.confirmationCode || item.priceAmount !== null || details?.number || details?.seat ? (
          <Block label="BOOKING">
            {item.confirmationCode ? (
              <Detail label="Reference" value={item.confirmationCode} />
            ) : null}
            {details?.number ? <Detail label="Number" value={details.number} /> : null}
            {details?.seat ? <Detail label="Seat" value={details.seat} /> : null}
            {item.priceAmount !== null && item.priceCurrency ? (
              <Detail
                label="Price"
                value={`${formatMoney(item.priceAmount, item.priceCurrency)}${
                  item.isPaid ? ' · paid' : ' · not paid yet'
                }`}
              />
            ) : null}
          </Block>
        ) : null}

        {item.notes ? (
          <Block label="NOTES">
            <Text style={[type.body, styles.notes, { color: c.text }]}>{item.notes}</Text>
          </Block>
        ) : null}

        {item.kind === 'task' ? (
          <Button
            label={item.completedAt ? 'Mark as not done' : 'Mark as done'}
            variant={item.completedAt ? 'secondary' : 'primary'}
            onPress={() => setTaskCompleted(db, item.id, item.completedAt === null)}
          />
        ) : null}

        <View
          style={[styles.placeholder, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.body, { color: c.textMuted }]}>
            Tickets, confirmations and links attach here next.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function statusLabel(item: TripItem): string {
  if (item.status === 'confirmed') return 'Booked';
  if (item.status === 'cancelled') return 'Cancelled';
  return 'Idea';
}

function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone === 'accent' ? c.accentSoft : c.surfaceSunken,
          borderColor: tone === 'accent' ? c.accent : c.border,
        },
      ]}>
      <Text style={[type.caption, { color: tone === 'accent' ? c.accent : c.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.block}>
      <Text style={[type.overline, { color: c.textFaint }]}>{label}</Text>
      {children}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.detail}>
      <Text style={[type.body, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.body, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  block: { gap: spacing.xs },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  notes: { lineHeight: 22 },
  placeholder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
