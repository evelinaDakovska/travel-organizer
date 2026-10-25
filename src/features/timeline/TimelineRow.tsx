import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PaymentStatus } from '../../domain/bookingCosts';
import { formatShortDate } from '../../domain/format';
import { entryRoleLabel, entryZoneLabel } from '../../domain/itinerary';
import type { Resource } from '../../domain/resource';
import { dayKey } from '../../domain/time';
import type { TimelineEntry } from '../../domain/timeline';
import { routeLabel, transportDetails, type TripItem } from '../../domain/tripItem';
import { KindTile } from '../../ui/components/KindTile';
import { PaymentTag } from '../../ui/components/PaymentTag';
import { Tag } from '../../ui/components/Tag';
import { spacing, type, useColors } from '../../ui/tokens';
import { OpenResource } from '../resources/OpenResource';

type Props = {
  entry: TimelineEntry<TripItem>;
  resources: readonly Resource[];
  onPress: () => void;
  /** Where no day heading is above it (Up next), the time column carries the date too. */
  showDate?: boolean;
  /** A line in the accent under the place, e.g. 'Until 11:15'. */
  note?: string | null;
  /** Paid or not (F7); worked out over all the trip's items, journeys included. */
  payment?: PaymentStatus | null;
};

/**
 * One timeline entry as a row (B3): the time in a column on the left, where it can be read
 * without opening anything, then what and where. A whole item, or one end of a stay or journey
 * that spans days — an overnight arrival is its own row on the day it lands.
 */
export function TimelineRow({ entry, resources, onPress, showDate = false, note, payment }: Props) {
  const c = useColors();
  const { item, moment } = entry;

  const role = entryRoleLabel(entry);
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const zone = entryZoneLabel(entry);
  const done = item.kind === 'task' && item.completedAt !== null;
  const title = role ? `${role} · ${item.title}` : item.title;
  const time = entry.time ?? 'All day';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[showDate ? formatShortDate(dayKey(moment)) : null, time, title]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceSunken }]}>
      <View style={styles.when}>
        {showDate ? (
          <Text style={[type.caption, { color: c.textMuted }]}>{formatShortDate(dayKey(moment))}</Text>
        ) : null}
        {/* A time on one line, smaller if it must: "10:0" / "0" at the largest font could be
            misread (QA O-10). "All day" may wrap. */}
        <Text
          style={[entry.time ? type.figure : type.caption, { color: c.text }]}
          numberOfLines={entry.time ? 1 : undefined}
          adjustsFontSizeToFit={!!entry.time}>
          {time}
        </Text>
      </View>

      <View style={[styles.body, { borderLeftColor: c.border }]}>
        <View style={styles.titleRow}>
          <KindTile kind={item.kind} subkind={item.subkind} size={28} />
          <Text
            style={[type.heading, styles.grow, { color: c.text }, done && styles.done]}
            numberOfLines={3}>
            {title}
          </Text>
        </View>
        {where ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={2}>
            {where}
          </Text>
        ) : null}
        {zone ? (
          <Text style={[type.caption, { color: c.textMuted }]}>{zone} time</Text>
        ) : null}
        {note ? <Text style={[type.label, { color: c.accentText }]}>{note}</Text> : null}
        {item.status === 'idea' || payment ? (
          <View style={styles.tags}>
            {/* An idea on the timeline is a maybe; confirmed needs no label (B3). */}
            {item.status === 'idea' ? <Tag label="Optional" tone="outline" /> : null}
            <PaymentTag status={payment} />
          </View>
        ) : null}
        {resources.length > 0 ? <OpenResource resources={resources} variant="link" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  // Wide enough for 'Fri 20 Nov' on one line at the default font scale.
  when: { width: 72, paddingTop: 2, gap: 2 },
  body: { flex: 1, gap: spacing.xs, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  done: { textDecorationLine: 'line-through' },
});
