import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ResourceInput } from '../../domain/resource';
import { deleteStoredFile } from '../../files/storage';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../ui/tokens';
import { pickAndImport, type PickerKind } from '../resources/attach';
import { alertAttachError, alertIfSomeFailed } from '../resources/attachAlerts';

type Props = {
  receipts: readonly ResourceInput[];
  onChange: (receipts: ResourceInput[]) => void;
};

const BUTTONS: { kind: PickerKind; label: string }[] = [
  { kind: 'camera', label: '+ Camera' },
  { kind: 'photo', label: '+ Photo' },
  { kind: 'file', label: '+ File' },
];

/**
 * Receipts for an expense not saved yet: the files are copied in as they are picked and saved
 * with the expense. One removed here is deleted at once; a form closed without saving deletes the
 * rest (`app/expense/new.tsx`).
 */
export function PendingReceipts({ receipts, onChange }: Props) {
  const c = useColors();
  const [busy, setBusy] = useState<PickerKind | null>(null);

  const pick = async (kind: PickerKind) => {
    setBusy(kind);
    try {
      const { inputs, failed } = await pickAndImport(kind);
      onChange([...receipts, ...inputs]);
      alertIfSomeFailed(inputs.length, failed);
    } catch (error) {
      alertAttachError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.block}>
      <SectionLabel>Receipts</SectionLabel>

      {receipts.map((receipt, index) => (
        <View key={index} style={[styles.row, { backgroundColor: c.surface }]}>
          <Icon name="receipt" size={18} color={c.textMuted} />
          <Text style={[type.body, styles.label, { color: c.text }]} numberOfLines={1}>
            {receipt.label}
          </Text>
          <Pressable
            onPress={() => {
              onChange(receipts.filter((_, i) => i !== index));
              if (receipt.kind === 'file') deleteStoredFile(receipt.storedPath);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${receipt.label}`}>
            <Icon name="close" size={18} color={c.textMuted} />
          </Pressable>
        </View>
      ))}

      <View style={styles.actions}>
        {BUTTONS.map(({ kind, label }) => (
          <View key={kind} style={styles.action}>
            <Button
              label={label}
              variant="secondary"
              compact
              busy={busy === kind}
              disabled={busy !== null}
              onPress={() => void pick(kind)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  label: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
