import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Resource, ResourceOwner } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../ui/tokens';
import { attach, type PickerKind } from './attach';
import { alertAttachError, alertIfSomeFailed } from './attachAlerts';
import { openResource } from './open';
import { ResourceRow } from './ResourceRow';

type Props = {
  owner: ResourceOwner;
  resources: readonly Resource[];
  title: string;
  emptyText: string;
};

/** Receipts are photographed on the spot; documents arrive as files and links. */
const BUTTONS: Record<'documents' | 'receipts', (PickerKind | 'link')[]> = {
  documents: ['file', 'photo', 'link'],
  receipts: ['camera', 'photo', 'file'],
};

const LABELS: Record<PickerKind | 'link', string> = {
  file: '+ File',
  photo: '+ Photo',
  camera: '+ Camera',
  link: '+ Link',
};

export function ResourceList({ owner, resources, title, emptyText }: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [busy, setBusy] = useState<PickerKind | null>(null);

  const pick = async (kind: PickerKind) => {
    setBusy(kind);
    try {
      const { attached, failed } = await attach(db, owner, kind);
      alertIfSomeFailed(attached, failed);
    } catch (error) {
      alertAttachError(error);
    } finally {
      setBusy(null);
    }
  };

  const addLink = () =>
    router.push({
      pathname: '/resource/new-link',
      params: { scope: owner.scope, ownerId: owner.id },
    });

  return (
    <View style={styles.block}>
      <SectionLabel>{title}</SectionLabel>

      {resources.length > 0 ? (
        <View style={styles.list}>
          {resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onPress={() => void openResource(resource)}
              onEdit={() =>
                router.push({
                  pathname: '/resource/[resourceId]',
                  params: { resourceId: resource.id },
                })
              }
            />
          ))}
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
          <Text style={[type.body, { color: c.textMuted }]}>{emptyText}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {BUTTONS[owner.scope === 'expense' ? 'receipts' : 'documents'].map((kind) => (
          <View key={kind} style={styles.action}>
            <Button
              label={LABELS[kind]}
              variant="secondary"
              compact
              busy={busy === kind}
              disabled={busy !== null}
              onPress={() => (kind === 'link' ? addLink() : void pick(kind))}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  list: { gap: spacing.sm },
  empty: { borderRadius: radius.lg, padding: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
