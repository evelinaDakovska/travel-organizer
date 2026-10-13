import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  availabilityLabel,
  availabilityOf,
  resourceBadge,
  resourceMeta,
  type Resource,
} from '../../domain/resource';
import { absoluteUriFor, storedFileExists } from '../../files/storage';
import { Icon } from '../../ui/components/Icon';
import { radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

type Props = {
  resource: Resource;
  onPress: () => void;
  onEdit?: () => void;
  /** What it belongs to, when listed away from it: 'Flight to Helsinki'. */
  context?: string | null;
};

/**
 * One document (B11): what it is, whether it can be opened now — on this phone, a link, or missing
 * — and what it belongs to when that is not obvious. The file's presence is checked, not assumed.
 */
export function ResourceRow({ resource, onPress, onEdit, context }: Props) {
  const c = useColors();
  const availability = availabilityOf(
    resource,
    resource.kind === 'file' && storedFileExists(resource.storedPath),
  );
  const missing = availability === 'missing';
  const badge = resourceBadge(resource);
  // A picture shows itself (F6); one that cannot be decoded falls back to its badge.
  const [unreadable, setUnreadable] = useState(false);
  const thumbnail =
    resource.kind === 'file' && badge === 'IMG' && !missing && !unreadable
      ? absoluteUriFor(resource.storedPath)
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[resource.label, context, availabilityLabel(availability)]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceSunken }]}>
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          // Decoded at the size shown, not the photo's: a 12 MP image would cost ~48 MB otherwise.
          resizeMethod="resize"
          resizeMode="cover"
          onError={() => setUnreadable(true)}
          style={[styles.badge, { backgroundColor: c.accentSoft }]}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.badge, { backgroundColor: missing ? c.dangerSoft : c.accentSoft }]}>
          <Text style={[type.overline, { color: missing ? c.danger : c.accentText }]}>{badge}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={[type.heading, { color: c.text }]} numberOfLines={2}>
          {resource.label}
        </Text>
        {context ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: missing ? c.danger : c.textMuted }]} numberOfLines={2}>
          {missing
            ? availabilityLabel(availability)
            : `${resourceMeta(resource)} · ${availabilityLabel(availability)}`}
        </Text>
      </View>

      {onEdit ? (
        <Pressable
          onPress={onEdit}
          style={styles.edit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${resource.label}`}>
          <Icon name="more" color={c.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  edit: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
