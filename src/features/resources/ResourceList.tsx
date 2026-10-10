import { useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { Resource, ResourceOwner } from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../ui/tokens';
import { attachDocument, attachPhoto, type AttachResult } from './attach';
import { openResource } from './open';
import { ResourceRow } from './ResourceRow';

type Props = {
  owner: ResourceOwner;
  resources: readonly Resource[];
  title: string;
  emptyText: string;
};

type Picker = (db: SQLiteDatabase, owner: ResourceOwner) => Promise<AttachResult>;

export function ResourceList({ owner, resources, title, emptyText }: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [busy, setBusy] = useState<'file' | 'photo' | null>(null);

  const attach = async (which: 'file' | 'photo', pick: Picker) => {
    setBusy(which);
    try {
      const { attached, failed } = await pick(db, owner);
      if (failed > 0) {
        Alert.alert(
          attached > 0 ? `${failed} of ${attached + failed} could not be attached` : 'Could not attach',
          'Those files could not be saved. Try again, or pick another copy.',
        );
      }
    } catch (error) {
      console.warn('Attach failed', error);
      Alert.alert('Could not attach', 'The file could not be saved. Try again, or pick another copy.');
    } finally {
      setBusy(null);
    }
  };

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
        <View style={styles.action}>
          <Button
            label="+ File"
            variant="secondary"
            compact
            busy={busy === 'file'}
            disabled={busy !== null}
            onPress={() => void attach('file', attachDocument)}
          />
        </View>
        <View style={styles.action}>
          <Button
            label="+ Photo"
            variant="secondary"
            compact
            busy={busy === 'photo'}
            disabled={busy !== null}
            onPress={() => void attach('photo', attachPhoto)}
          />
        </View>
        <View style={styles.action}>
          <Button
            label="+ Link"
            variant="secondary"
            compact
            disabled={busy !== null}
            onPress={() =>
              router.push({
                pathname: '/resource/new-link',
                params: { scope: owner.scope, ownerId: owner.id },
              })
            }
          />
        </View>
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
