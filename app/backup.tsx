import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { importChangesNothing, summariseExport, summariseImportPlan } from '../src/domain/archive';
import type { ImportMode } from '../src/domain/export';
import {
  applyBackupImport,
  exportBackup,
  pickBackup,
  planBackupImport,
  shareBackup,
} from '../src/files/backupFiles';
import { askForRemindersIfAnyDue } from '../src/notifications/reminders';
import { Button } from '../src/ui/components/Button';
import { Card } from '../src/ui/components/Card';
import { ChoiceField } from '../src/ui/components/ChoiceField';
import { Field } from '../src/ui/components/Field';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../src/ui/tokens';

const MODE_HINTS: Record<ImportMode, string> = {
  merge: 'Adds trips that are not on this phone. Trips already here are left exactly as they are.',
  replace: "Trips in the backup overwrite the same trips on this phone. Use it to restore after a reset.",
};

/** The only copy of anything outside the phone. Export before every trip. */
export default function Backup() {
  const c = useColors();
  const db = useSQLiteContext();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const runExport = async () => {
    setBusy('export');
    setResult(null);
    try {
      const exported = await exportBackup(db);
      setResult(summariseExport(exported.document, exported.packedFiles));
      await shareBackup(exported.uri);
    } catch (error) {
      console.warn('Export failed', error);
      Alert.alert('Could not export', 'The backup could not be written. Nothing on this phone was changed.');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    setResult(null);
    try {
      const picked = await pickBackup();
      if (!picked) return;
      if (!picked.ok) {
        Alert.alert('Not a backup this app can read', picked.reason);
        return;
      }

      const plan = await planBackupImport(db, picked.backup, mode);
      if (importChangesNothing(plan)) {
        setResult(summariseImportPlan(plan));
        return;
      }

      // Awaited, so the buttons stay disabled while the question is open.
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Import this backup?',
          summariseImportPlan(plan),
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Import', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        ),
      );
      if (!confirmed) return;

      try {
        await applyBackupImport(db, picked.backup, plan);
        setResult("Import finished. The backup's trips are on Your trips.");
        void askForRemindersIfAnyDue(db);
      } catch (error) {
        console.warn('Import failed', error);
        Alert.alert('Could not import', 'Nothing was changed — the import runs all at once or not at all.');
      }
    } catch (error) {
      console.warn('Reading the backup failed', error);
      Alert.alert('Could not read that file', 'Try the zip again, or pick another copy.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Backup" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.body, { color: c.textMuted }]}>
          Everything lives only on this phone. A backup is one zip with every trip, note and saved
          file — keep it in Drive or anywhere off the phone, and make a new one before each trip.
        </Text>

        <View style={styles.section}>
          <SectionLabel>Export</SectionLabel>
          <Button
            label="Export everything"
            busy={busy === 'export'}
            disabled={busy !== null}
            onPress={() => void runExport()}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Import</SectionLabel>
          <Field label="When a trip is already on this phone" hint={MODE_HINTS[mode]}>
            <ChoiceField
              value={mode}
              options={['merge', 'replace'] as const}
              labelFor={(m) => (m === 'merge' ? 'Keep mine' : "Use the backup's")}
              onChange={(next) => next && setMode(next)}
            />
          </Field>
          <Button
            label="Import a backup"
            variant="secondary"
            busy={busy === 'import'}
            disabled={busy !== null}
            onPress={() => void runImport()}
          />
        </View>

        {result ? (
          <Card>
            <Text style={[type.body, { color: c.text }]}>{result}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.md },
});
