import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMoment, formatMoney } from '../../../src/domain/format';
import { timezoneLabel } from '../../../src/domain/timezones';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
} from '../../../src/domain/tripItem';
import { OpenResource } from '../../../src/features/resources/OpenResource';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listResources, RESOURCE_TABLES } from '../../../src/repositories/resources';
import {
  getTripItem,
  setTaskCompleted,
  TRIP_ITEM_TABLES,
} from '../../../src/repositories/tripItems';
import { Button } from '../../../src/ui/components/Button';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { StatusTag } from '../../../src/ui/components/StatusTag';
import { Tag } from '../../../src/ui/components/Tag';
import { spacing, type, useColors } from '../../../src/ui/tokens';

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

  const { data: resources } = useLiveQuery(
    useCallback((database) => listResources(database, { scope: 'item', id: itemId }), [itemId]),
    RESOURCE_TABLES,
    [itemId],
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Details" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen>
        <ScreenHeader title="Details" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This item no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  const details = transportDetails(item);
  const route = routeLabel(details);
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);

  const whenDetail = [
    item.end ? `until ${formatMoment(item.end.local, item.end.precision)}` : null,
    item.startTzOverride ? timezoneLabel(item.startTzOverride) : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <Screen>
      <ScreenHeader
        title="Details"
        action={
          <Pressable
            onPress={() => router.push(`/item/${item.id}/edit`)}
            hitSlop={12}
            accessibilityRole="button">
            <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <View style={styles.tags}>
            <StatusTag status={item.status} />
            {item.status === 'idea' && item.priority ? (
              <Tag label={capitalise(item.priority)} tone="neutral" />
            ) : null}
          </View>
          <Text style={[type.display, { color: c.text }]}>{item.title}</Text>
          <Text style={[type.body, { color: c.textMuted }]}>{route ? `${kind} · ${route}` : kind}</Text>
        </View>

        <OpenResource resources={resources ?? []} />

        <View style={styles.facts}>
          <Fact
            label="When"
            value={item.start ? formatMoment(item.start.local, item.start.precision) : 'No date yet'}
            detail={whenDetail || null}
            muted={!item.start}
          />
          {item.locationName || item.address ? (
            <Fact
              label="Where"
              value={item.locationName ?? item.address ?? ''}
              detail={item.locationName ? item.address : null}
            />
          ) : null}
          {item.confirmationCode ? (
            <Fact label="Confirmation" value={item.confirmationCode} selectable />
          ) : null}
          {details?.number ? <Fact label="Number" value={details.number} selectable /> : null}
          {details?.seat ? <Fact label="Seat" value={details.seat} /> : null}
          {item.priceAmount !== null && item.priceCurrency ? (
            <Fact
              label="Price"
              value={formatMoney(item.priceAmount, item.priceCurrency)}
              detail={item.isPaid ? 'Paid' : 'Not paid yet'}
            />
          ) : null}
          {item.notes ? <Fact label="Notes" value={item.notes} /> : null}
        </View>

        {item.kind === 'task' ? (
          <Button
            label={item.completedAt ? 'Mark as not done' : 'Mark as done'}
            variant={item.completedAt ? 'secondary' : 'primary'}
            onPress={() => setTaskCompleted(db, item.id, item.completedAt === null)}
          />
        ) : null}

        <ResourceList
          owner={{ scope: 'item', id: item.id }}
          resources={resources ?? []}
          title="Tickets & links"
          emptyText="Attach the boarding pass, the booking confirmation, or a link to manage it."
        />
      </ScrollView>
    </Screen>
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type FactProps = {
  label: string;
  value: string;
  detail?: string | null;
  muted?: boolean;
  /** Long-press to copy — a reference is read out at a desk or pasted into a form. */
  selectable?: boolean;
};

function Fact({ label, value, detail, muted = false, selectable = false }: FactProps) {
  const c = useColors();
  return (
    <View style={styles.fact}>
      <Text style={[type.bodyStrong, styles.factLabel, { color: c.text }]}>{label}</Text>
      <View style={styles.factValue}>
        <Text style={[type.body, { color: muted ? c.textMuted : c.text }]} selectable={selectable}>
          {value}
        </Text>
        {detail ? <Text style={[type.caption, { color: c.textMuted }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xxxl },
  heading: { gap: spacing.sm },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  facts: { gap: spacing.md },
  fact: { flexDirection: 'row', gap: spacing.lg },
  factLabel: { width: 108 },
  factValue: { flex: 1, gap: 2 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
