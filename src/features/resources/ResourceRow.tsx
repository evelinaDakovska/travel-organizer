import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { resourceBadge, resourceMeta, type Resource } from '../../domain/resource';
import { absoluteUriFor, storedFileExists } from '../../files/storage';
import { Icon } from '../../ui/components/Icon';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { resource: Resource; onPress: () => void; onEdit?: () => void };

export function ResourceRow({ resource, onPress, onEdit }: Props) {
  const c = useColors();
  const missing = resource.kind === 'file' && !storedFileExists(resource.storedPath);
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
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, opacity: pressed ? opacity.pressed : 1 },
      ]}>
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          // Decoded at the size shown, not the photo's: a 12 MP image would cost ~48 MB otherwise.
          resizeMethod="resize"
          resizeMode="cover"
          onError={() => setUnreadable(true)}
          style={[styles.badge, { backgroundColor: c.accent2Soft }]}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.badge, { backgroundColor: missing ? c.dangerSoft : c.accent2Soft }]}>
          <Text style={[type.overline, { color: missing ? c.danger : c.accent2Text }]}>{badge}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {resource.label}
        </Text>
        <Text style={[type.caption, { color: missing ? c.danger : c.textMuted }]} numberOfLines={1}>
          {missing ? 'File missing from this phone' : resourceMeta(resource)}
        </Text>
      </View>

      {onEdit ? (
        <Pressable
          onPress={onEdit}
          hitSlop={12}
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
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  edit: { paddingHorizontal: spacing.xs },
});
