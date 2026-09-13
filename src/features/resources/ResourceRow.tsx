import { Pressable, StyleSheet, Text, View } from 'react-native';

import { resourceBadge, resourceMeta, type Resource } from '../../domain/resource';
import { storedFileExists } from '../../files/storage';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { resource: Resource; onPress: () => void; onEdit?: () => void };

export function ResourceRow({ resource, onPress, onEdit }: Props) {
  const c = useColors();
  const missing = resource.kind === 'file' && !storedFileExists(resource.storedPath);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={[styles.badge, { backgroundColor: missing ? c.surfaceSunken : c.accentSoft }]}>
        <Text style={[type.overline, { color: missing ? c.danger : c.accent }]}>
          {resourceBadge(resource)}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={[type.heading, { color: missing ? c.textMuted : c.text }]} numberOfLines={1}>
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
          <Text style={[type.title, { color: c.textMuted }]}>⋯</Text>
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
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  edit: { paddingHorizontal: spacing.sm },
});
