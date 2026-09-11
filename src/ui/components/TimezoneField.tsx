import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { searchTimezones, timezoneLabel } from '../../domain/timezones';
import { radius, spacing, type, useColors } from '../tokens';
import { Input } from './Field';

type Props = { value: string; onChange: (tz: string) => void; invalid?: boolean };

/** Hermes has no Intl.supportedValuesOf, so this searches a curated list. */
export function TimezoneField({ value, onChange, invalid = false }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchTimezones(query), [query]);

  return (
    <>
      <Pressable
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: c.surface,
            borderColor: invalid ? c.danger : c.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <Text style={[type.body, { color: value ? c.text : c.textFaint }]}>
          {value ? timezoneLabel(value) : 'Pick a timezone'}
        </Text>
        {value ? <Text style={[type.caption, { color: c.textFaint }]}>{value}</Text> : null}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={styles.sheetHeader}>
            <Text style={[type.title, { color: c.text }]}>Timezone</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={[type.heading, { color: c.accent }]}>Done</Text>
            </Pressable>
          </View>

          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search cities"
            autoCorrect={false}
            autoCapitalize="none"
          />

          <FlatList
            data={results}
            keyExtractor={(tz) => tz}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: c.border }]} />
            )}
            ListEmptyComponent={
              <Text style={[type.body, styles.empty, { color: c.textMuted }]}>
                No match. The list is curated — add the zone to src/domain/timezones.ts.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[type.body, { color: c.text }]}>{timezoneLabel(item)}</Text>
                <Text style={[type.caption, { color: c.textFaint }]}>{item}</Text>
                {item === value ? (
                  <Text style={[type.heading, styles.tick, { color: c.accent }]}>✓</Text>
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  sheet: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { paddingVertical: spacing.md, gap: 2 },
  separator: { height: StyleSheet.hairlineWidth },
  tick: { position: 'absolute', right: 0, top: spacing.md },
  empty: { paddingVertical: spacing.xl },
});
