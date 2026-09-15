import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../ui/components/Icon';
import { spacing, type, useColors } from '../../ui/tokens';

/** Height of the bar above the system inset. The add button floats this far up, plus a gap. */
export const TAB_BAR_HEIGHT = 60;

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Now', icon: 'now' },
  timeline: { label: 'Timeline', icon: 'timeline' },
  places: { label: 'Places', icon: 'places' },
  notes: { label: 'Notes', icon: 'notes' },
};

/** The design's bottom bar: icon over label, the active tab in the accent. */
export function TripTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;

        const focused = state.index === index;
        const color = focused ? c.accentText : c.tabInactive;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.tab}>
            <Icon name={tab.icon} color={color} />
            <Text style={[type.caption, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
