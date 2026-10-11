import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { openGroups, type OpenGroup, type Resource } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { opacity, radius, spacing, useColors } from '../../ui/tokens';
import { openResource } from './open';
import { ResourceRow } from './ResourceRow';

/**
 * The fastest path to a ticket (R6): the tickets first, on the main button, the rest on a quieter
 * one. A button with one attachment opens it directly; with several, a sheet of just those.
 */
export function OpenResource({
  resources,
  compact = false,
}: {
  resources: readonly Resource[];
  /** A shorter button, for use inside a card. */
  compact?: boolean;
}) {
  const c = useColors();
  const [sheet, setSheet] = useState<OpenGroup | null>(null);

  const groups = openGroups(resources);
  if (groups.length === 0) return null;

  const close = () => setSheet(null);

  return (
    <>
      <View style={styles.buttons}>
        {groups.map((group, index) => (
          <Button
            key={group.sheetTitle}
            label={group.label}
            variant={index === 0 ? 'primary' : 'secondary'}
            compact={compact}
            onPress={() =>
              group.resources.length === 1 ? void openResource(group.resources[0]) : setSheet(group)
            }
          />
        ))}
      </View>

      <Modal
        visible={sheet !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: opacity.scrim }]} />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <SectionLabel>{sheet?.sheetTitle ?? 'Open'}</SectionLabel>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
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
          </ScrollView>
          <Button label="Cancel" variant="secondary" onPress={close} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: spacing.sm },
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  scroll: { maxHeight: 420 },
  list: { gap: spacing.sm },
});
