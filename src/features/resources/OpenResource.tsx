import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openGroups, type OpenGroup, type Resource } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { Sheet } from '../../ui/components/Sheet';
import { opacity, spacing, touchTarget, type, useColors } from '../../ui/tokens';
import { openResource } from './open';
import { ResourceRow } from './ResourceRow';

/**
 * The fastest path to a ticket (R6): the tickets first, on the main button, the rest on a quieter
 * one. A button with one attachment opens it directly; with several, a sheet of just those.
 *
 * As a `link`, inside a row (B3): only the first group — the tickets, when any are marked — as a
 * text action with its own 48 dp target; the rest stay one tap further, on the item.
 */
export function OpenResource({
  resources,
  variant = 'buttons',
}: {
  resources: readonly Resource[];
  variant?: 'buttons' | 'link';
}) {
  const c = useColors();
  const [sheet, setSheet] = useState<OpenGroup | null>(null);

  const groups = openGroups(resources);
  if (groups.length === 0) return null;

  const close = () => setSheet(null);
  const open = (group: OpenGroup) =>
    group.resources.length === 1 ? void openResource(group.resources[0]) : setSheet(group);

  return (
    <>
      {variant === 'link' ? (
        <Pressable
          onPress={() => open(groups[0])}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8 }}
          style={({ pressed }) => [styles.link, { opacity: pressed ? opacity.pressed : 1 }]}>
          <Text style={[type.label, { color: c.accentText }]} numberOfLines={1}>
            {groups[0].label} →
          </Text>
        </Pressable>
      ) : (
        <View style={styles.buttons}>
          {groups.map((group, index) => (
            <Button
              key={group.sheetTitle}
              label={group.label}
              variant={index === 0 ? 'primary' : 'secondary'}
              onPress={() => open(group)}
            />
          ))}
        </View>
      )}

      <Sheet visible={sheet !== null} title={sheet?.sheetTitle ?? 'Open'} onClose={close}>
        {(sheet?.resources ?? []).map((resource) => (
          <ResourceRow
            key={resource.id}
            resource={resource}
            onPress={() => {
              close();
              void openResource(resource);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: spacing.sm },
  link: { minHeight: touchTarget - spacing.md, justifyContent: 'center', alignSelf: 'flex-start' },
});
