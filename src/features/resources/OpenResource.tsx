import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { openLabel, type Resource } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { radius, spacing, type, useColors } from '../../ui/tokens';
import { openResource } from './open';
import { ResourceRow } from './ResourceRow';

/** The fastest path to a ticket: one attachment opens directly, several open a sheet. */
export function OpenResource({ resources }: { resources: readonly Resource[] }) {
  const c = useColors();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (resources.length === 0) return null;

  const close = () => setSheetOpen(false);

  return (
    <>
      <Button
        label={openLabel(resources)}
        onPress={() =>
          resources.length === 1 ? void openResource(resources[0]) : setSheetOpen(true)
        }
      />

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
          <Text style={[type.overline, { color: c.textFaint }]}>OPEN</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {resources.map((resource) => (
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  scroll: { maxHeight: 420 },
  list: { gap: spacing.sm },
});
