import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { openGroups, type OpenGroup, type Resource } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { Sheet } from '../../ui/components/Sheet';
import { spacing } from '../../ui/tokens';
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
});
