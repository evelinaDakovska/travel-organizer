import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripIdProvider } from '../../../../src/features/trips/TripContext';
import { TAB_BAR_HEIGHT, TripTabBar } from '../../../../src/features/trips/TripTabBar';
import { Icon } from '../../../../src/ui/components/Icon';
import { elevation, radius, spacing, useColors } from '../../../../src/ui/tokens';

export default function TripTabsLayout() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  return (
    <TripIdProvider tripId={tripId}>
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.background } }}
          tabBar={(props) => <TripTabBar {...props} />}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="timeline" />
          <Tabs.Screen name="places" />
          <Tabs.Screen name="notes" />
        </Tabs>

        {/* Outside the bar, not inside it: Android does not deliver touches outside a parent's bounds. */}
        <Pressable
          onPress={() => router.push({ pathname: '/item/new', params: { tripId } })}
          accessibilityRole="button"
          accessibilityLabel="Add to trip"
          style={({ pressed }) => [
            styles.add,
            elevation.md,
            {
              bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.lg,
              backgroundColor: pressed ? c.accentPressed : c.accent,
              shadowColor: c.shadow,
            },
          ]}>
          <Icon name="add" size={24} color={c.onAccent} strokeWidth={2.75} />
        </Pressable>
      </View>
    </TripIdProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
