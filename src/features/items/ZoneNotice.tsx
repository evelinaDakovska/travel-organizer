import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { timezoneLabel } from '../../domain/timezones';
import type { TripItem } from '../../domain/tripItem';
import { mismatchText, withMomentZone, type ZoneMismatch } from '../../domain/zoneHints';
import { updateTripItem } from '../../repositories/tripItems';
import { Icon } from '../../ui/components/Icon';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { item: TripItem; mismatches: readonly ZoneMismatch[] };

/**
 * A journey saved before the form filled in zones (N6): a departure from Munich on a Helsinki
 * trip, read as Helsinki time. The screen shows the time as typed, so nothing else would reveal
 * that the countdown and the reminder are an hour out.
 */
export function ZoneNotice({ item, mismatches }: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);

  const fix = async (mismatch: ZoneMismatch) => {
    const result = withMomentZone(item, mismatch.end, mismatch.tz, mismatch.readIn);
    if (!result.ok) {
      Alert.alert('Could not change the time zone', `${result.reason} Edit the item instead.`);
      return;
    }
    setBusy(true);
    try {
      await updateTripItem(db, item.id, result.input);
    } catch (error) {
      console.warn('Setting a zone failed', error);
      Alert.alert('Could not change the time zone', 'Nothing was changed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.list}>
      {mismatches.map((mismatch) => (
        <View
          key={mismatch.end}
          style={[styles.notice, { backgroundColor: c.accent2Soft }]}
          accessibilityRole="alert">
          <Icon name="warning" size={18} color={c.accent2Text} />
          <View style={styles.body}>
            <Text style={[type.body, { color: c.text }]}>{mismatchText(mismatch)}</Text>
            <Pressable
              onPress={() => void fix(mismatch)}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => ({ opacity: pressed || busy ? opacity.pressed : 1 })}>
              <Text style={[type.bodyStrong, { color: c.accentText }]}>
                Use {timezoneLabel(mismatch.tz)} time
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  body: { flex: 1, gap: spacing.sm },
});
