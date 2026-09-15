import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { searchTimezones, timezoneLabel } from '../../domain/timezones';
import { opacity, spacing, type, useColors } from '../tokens';
import { Input } from './Field';
import { Icon } from './Icon';
import { PickerButton } from './PickerButton';

type Props = { value: string; onChange: (tz: string) => void; invalid?: boolean };

/** Hermes has no Intl.supportedValuesOf, so this searches a curated list. */
export function TimezoneField({ value, onChange, invalid = false }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchTimezones(query), [query]);

  return (
    <>
      <PickerButton
        value={value ? timezoneLabel(value) : null}
        placeholder="Pick a timezone"
        detail={value || null}
        invalid={invalid}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={styles.sheetHeader}>
            <Text style={[type.title, { color: c.text }]}>Timezone</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={[type.bodyStrong, { color: c.accentText }]}>Done</Text>
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
                style={({ pressed }) => [styles.row, { opacity: pressed ? opacity.pressed : 1 }]}>
                <View style={styles.rowText}>
                  <Text style={[type.body, { color: c.text }]}>{timezoneLabel(item)}</Text>
                  <Text style={[type.caption, { color: c.textMuted }]}>{item}</Text>
                </View>
                {item === value ? <Icon name="check" color={c.accentText} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  separator: { height: StyleSheet.hairlineWidth },
  empty: { paddingVertical: spacing.xl },
});
