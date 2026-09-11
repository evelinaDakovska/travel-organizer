import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LATEST_VERSION } from '../src/db/migrations';
import { dayKey, minutesUntil, toInstant } from '../src/domain/time';

type Check = { label: string; pass: boolean; detail: string };

/** M1 diagnostic screen. Replaced by the real Home in M2. */
export default function Diagnostics() {
  const db = useSQLiteContext();
  const [checks, setChecks] = useState<Check[]>([]);
  const [fileResult, setFileResult] = useState<string>('not run');

  useEffect(() => {
    const results: Check[] = [];

    const expect = (label: string, actual: unknown, wanted: unknown) =>
      results.push({
        label,
        pass: actual === wanted,
        detail: actual === wanted ? String(actual) : `got ${actual}, wanted ${wanted}`,
      });

    // Spike B — does @date-fns/tz resolve IANA zones correctly on Hermes?
    expect(
      'Sofia 06:10 -> UTC (+3)',
      toInstant({ local: '2026-09-19T06:10', tz: 'Europe/Sofia', precision: 'time' }),
      '2026-09-19T03:10:00.000Z',
    );
    expect(
      'Rome 14:00 -> UTC (+2)',
      toInstant({ local: '2026-09-19T14:00', tz: 'Europe/Rome', precision: 'time' }),
      '2026-09-19T12:00:00.000Z',
    );
    expect(
      'London DST boundary',
      toInstant({ local: '2026-03-29T03:30', tz: 'Europe/London', precision: 'time' }),
      '2026-03-29T02:30:00.000Z',
    );
    expect(
      'date-only -> local midnight',
      toInstant({ local: '2026-09-19', tz: 'Europe/Rome', precision: 'date' }),
      '2026-09-18T22:00:00.000Z',
    );
    expect(
      'late event keeps its local day',
      dayKey({ local: '2026-09-19T23:30', tz: 'Europe/Sofia', precision: 'time' }),
      '2026-09-19',
    );
    expect(
      'countdown',
      minutesUntil(
        { local: '2026-09-19T06:10', tz: 'Europe/Sofia', precision: 'time' },
        new Date('2026-09-19T01:38:00.000Z'),
      ),
      92,
    );

    const supportedValuesOf = (Intl as any).supportedValuesOf;
    results.push({
      label: 'Intl.supportedValuesOf("timeZone")',
      pass: typeof supportedValuesOf === 'function',
      detail:
        typeof supportedValuesOf === 'function'
          ? `${supportedValuesOf('timeZone').length} zones`
          : 'absent — timezone picker needs a curated list',
    });

    results.push({
      label: 'device zone',
      pass: true,
      detail: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    db.getFirstAsync<{ user_version: number }>('PRAGMA user_version').then((row) => {
      const all = [
        ...results,
        {
          label: 'DB schema version',
          pass: row?.user_version === LATEST_VERSION,
          detail: `user_version=${row?.user_version}`,
        },
      ];
      setChecks(all);
      all.forEach((c) => console.log(`SPIKE ${c.pass ? 'PASS' : 'FAIL'} | ${c.label} | ${c.detail}`));
    });
  }, [db]);

  // Spike A — copy an imported file into app storage and open it via content URI.
  async function pickCopyAndOpen() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
      if (picked.canceled) return setFileResult('cancelled');

      const asset = picked.assets[0];
      const media = new Directory(Paths.document, 'media');
      if (!media.exists) media.create({ intermediates: true });

      const extension = asset.name.includes('.') ? asset.name.split('.').pop() : 'bin';
      const dest = new File(media, `${randomUUID()}.${extension}`);
      await new File(asset.uri).copy(dest);

      const uri = dest.contentUri;
      setFileResult(
        `copied ${asset.name}\nsize ${dest.size} · type ${dest.type}\nexists ${dest.exists}\ncontentUri ${uri}`,
      );

      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: uri,
        flags: 1,
        type: dest.type,
      });
    } catch (error) {
      setFileResult(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const failures = checks.filter((c) => !c.pass).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>M1 diagnostics</Text>
      <Text style={[styles.summary, failures > 0 && styles.fail]}>
        {checks.length === 0 ? 'running…' : failures === 0 ? 'all checks pass' : `${failures} failing`}
      </Text>

      {checks.map((check) => (
        <View key={check.label} style={styles.row}>
          <Text style={styles.icon}>{check.pass ? '✓' : '✗'}</Text>
          <View style={styles.rowText}>
            <Text style={styles.label}>{check.label}</Text>
            <Text style={styles.detail}>{check.detail}</Text>
          </View>
        </View>
      ))}

      <Pressable style={styles.button} onPress={pickCopyAndOpen}>
        <Text style={styles.buttonText}>Spike A — pick a file, copy it, open it</Text>
      </Pressable>
      <Text style={styles.detail}>{fileResult}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 72, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  summary: { fontSize: 15, color: '#137333' },
  fail: { color: '#c5221f' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  icon: { fontSize: 15, width: 16 },
  rowText: { flex: 1 },
  label: { fontSize: 15 },
  detail: { fontSize: 13, opacity: 0.6, fontFamily: 'monospace' },
  button: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '500' },
});
