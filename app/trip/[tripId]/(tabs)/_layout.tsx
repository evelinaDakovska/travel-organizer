import { Tabs, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addActionFor } from '../../../../src/features/trips/addAction';
import { TripIdProvider } from '../../../../src/features/trips/TripContext';
import { TAB_BAR_HEIGHT, TripTabBar } from '../../../../src/features/trips/TripTabBar';
import { Icon } from '../../../../src/ui/components/Icon';
import { elevation, radius, spacing, useColors } from '../../../../src/ui/tokens';

export default function TripTabsLayout() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  // The button adds what the tab is about, and shows it (F2).
  const action = addActionFor(useSegments().at(-1));
  const pathname = { item: '/item/new', expense: '/expense/new', note: '/note/new' } as const;

  return (
    <TripIdProvider tripId={tripId}>
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.background } }}
          tabBar={(props) => <TripTabBar {...props} />}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="timeline" />
          <Tabs.Screen name="places" />
          <Tabs.Screen name="expenses" />
          <Tabs.Screen name="notes" />
        </Tabs>

        {/* Outside the bar, not inside it: Android does not deliver touches outside a parent's bounds. */}
        <Pressable
          onPress={() => router.push({ pathname: pathname[action.target], params: { tripId } })}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.add,
            elevation.md,
            {
              bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.lg,
              backgroundColor: pressed ? c.accentPressed : c.accent,
              shadowColor: c.shadow,
            },
          ]}>
          {action.icon === 'add' ? (
            <Icon name="add" size={24} color={c.onAccent} strokeWidth={2.75} />
          ) : (
            <View>
              <Icon name={action.icon} size={24} color={c.onAccent} strokeWidth={2.4} />
              {/* A small + keeps it reading as "add" while the glyph says what. */}
              <View style={[styles.plus, { backgroundColor: c.onAccent }]}>
                <Icon name="add" size={11} color={c.accent} strokeWidth={3.5} />
              </View>
            </View>
          )}
        </Pressable>
      </View>
    </TripIdProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  plus: {
    position: 'absolute',
    right: -7,
    bottom: -5,
    width: 15,
    height: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
