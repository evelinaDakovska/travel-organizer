import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TimelineConnector } from '../../domain/directions';
import { Icon } from '../../ui/components/Icon';
import { radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

type Props = {
  connector: TimelineConnector;
  onPress: () => void;
};

/**
 * A quiet connector row between consecutive itinerary entries on the timeline (Spec §8.1).
 * Aligned with the timeline body rather than a new large card.
 *
 * - Direction icon (18dp).
 * - Label: 'Directions to [Place]'.
 * - Secondary line: 'From [Origin]' when helpful.
 * - Link-coloured action, minimum 48dp effective touch target.
 */
export function TimelineConnectorRow({ connector, onPress }: Props) {
  const c = useColors();
  const label = `Directions to ${connector.destination.title}`;
  const originText = connector.origin.title ? `From ${connector.origin.title}` : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, originText].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: c.surfaceSunken },
      ]}>
      {/* Align with the 72dp time column of surrounding TimelineRows */}
      <View style={styles.when} />

      <View style={[styles.body, { borderLeftColor: c.border }]}>
        <View style={styles.content}>
          <Icon name="directions" size={18} color={c.accentText} />
          <View style={styles.textColumn}>
            <Text style={[type.label, { color: c.accentText }]} numberOfLines={2}>
              {label}
            </Text>
            {originText ? (
              <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
                {originText}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: touchTarget,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  when: {
    width: 72,
  },
  body: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    gap: 1,
  },
});
