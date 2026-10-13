import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatShortDate } from '../../domain/format';
import { entryRoleLabel } from '../../domain/itinerary';
import { dayKey, timeOfDay, type LocalMoment } from '../../domain/time';
import type { TripItem } from '../../domain/tripItem';
import { routePlace, zoneName } from '../../domain/zoneHints';
import { Card } from '../../ui/components/Card';
import { spacing, type, useColors } from '../../ui/tokens';

/** From this font scale the two ends no longer fit side by side, so they stack (B4). At 1.3 they still do. */
const STACK_AT_FONT_SCALE = 1.5;

/**
 * A journey's two ends side by side (B4): where, the local time there, the date and whose clock
 * it is. Each end is in its own zone — a flight leaving Sofia at 06:00 lands in Munich at 07:05
 * Munich time — so each says so. An arrival on another day carries its own date.
 */
export function JourneyEnds({ item }: { item: TripItem }) {
  const { fontScale } = useWindowDimensions();
  if (!item.start) return null;

  const stacked = fontScale >= STACK_AT_FONT_SCALE;
  return (
    <Card style={stacked ? styles.stacked : styles.sideBySide}>
      <End item={item} end="start" moment={item.start} />
      {item.end ? <End item={item} end="end" moment={item.end} /> : null}
    </Card>
  );
}

function End({ item, end, moment }: { item: TripItem; end: 'start' | 'end'; moment: LocalMoment }) {
  const c = useColors();
  const place = routePlace(item, end);
  const time = timeOfDay(moment);
  const role = entryRoleLabel({ role: end, item }) ?? (end === 'start' ? 'Departs' : 'Arrives');
  const date = formatShortDate(dayKey(moment));

  return (
    <View style={styles.end}>
      <Text style={[type.overline, { color: c.textMuted }]}>{role.toUpperCase()}</Text>
      <Text style={[type.section, { color: c.text }]}>
        {place ?? '—'}
      </Text>
      <Text style={[type.display, { color: c.text }]}>{time ?? date}</Text>
      {time ? <Text style={[type.caption, { color: c.textMuted }]}>{date}</Text> : null}
      {time ? (
        <Text style={[type.caption, { color: c.textMuted }]}>
          {zoneName(moment.tz, place)} time
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sideBySide: { flexDirection: 'row', gap: spacing.lg },
  stacked: { gap: spacing.lg },
  end: { flex: 1, gap: 2 },
});
