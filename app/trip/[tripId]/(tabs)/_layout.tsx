import { Tabs, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TripIdProvider } from '../../../../src/features/trips/TripContext';
import { TripTabBar } from '../../../../src/features/trips/TripTabBar';
import { useColors } from '../../../../src/ui/tokens';

/**
 * A trip's five tabs. Each adds from a labelled action in its own header — no floating button
 * over the content (B5).
 */
export default function TripTabsLayout() {
  const c = useColors();
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
          <Tabs.Screen name="expenses" />
          <Tabs.Screen name="notes" />
        </Tabs>
      </View>
    </TripIdProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
