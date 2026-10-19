import type { BottomTabBarProps } from 'expo-router/tabs';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../ui/components/Icon';
import { fonts, radius, spacing, type, useColors } from '../../ui/tokens';

/** Height of the bar above the system inset. */
const TAB_BAR_HEIGHT = 60;

/**
 * Labels grow with the phone's font scale only so far: past this, five of them cannot share a
 * narrow phone's width on one line (on a 360 dp phone, *Overview* and *Expenses* were cut short
 * from 1.2). The screen's own title carries the full size; Android's bottom navigation caps its
 * labels too.
 */
const LABEL_MAX_SCALE = 1.15;

/** Each tab's inner side padding, so a label never touches its neighbour. */
const TAB_PADDING = 2;

type TabSpec = {
  label: string;
  /** Shown instead of `label` where that does not fit the tab on one line (P1). */
  shortLabel?: string;
  icon: IconName;
};

const TABS: Record<string, TabSpec> = {
  index: { label: 'Overview', icon: 'now' },
  timeline: { label: 'Timeline', icon: 'timeline' },
  places: { label: 'Places', icon: 'places' },
  expenses: { label: 'Expenses', icon: 'wallet' },
  notes: { label: 'Notes & lists', shortLabel: 'Notes', icon: 'notes' },
};

/**
 * The trip's bottom bar: icon over label. The active tab is told apart three ways, so colour is
 * never the only sign: an accent bar above it, the accent on icon and label, and a semibold label.
 */
export function TripTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors();
  // Measured, not guessed: a tab's width and a label's natural width both move with the screen
  // and the font scale.
  const [tabWidth, setTabWidth] = useState<number | null>(null);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});

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
        const fullWidth = labelWidths[route.name];
        // The full label until it is known not to fit, so a wide phone never flickers to the
        // short one.
        const tooWide =
          tabWidth !== null && fullWidth !== undefined && fullWidth > tabWidth - 2 * TAB_PADDING;
        const label = tab.shortLabel && tooWide ? tab.shortLabel : tab.label;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onLayout={index === 0 ? (e) => setTabWidth(e.nativeEvent.layout.width) : undefined}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.tab}>
            {/* Always laid out, so the icons never move when the selection does. */}
            <View
              style={[styles.indicator, { backgroundColor: focused ? c.accent : 'transparent' }]}
            />
            <Icon name={tab.icon} color={color} />
            <Text
              style={[type.caption, focused && styles.labelActive, { color }]}
              numberOfLines={1}
              maxFontSizeMultiplier={LABEL_MAX_SCALE}>
              {label}
            </Text>
            {tab.shortLabel ? (
              // The full label at its natural width, unseen, in the weight it would have when
              // active — the wider of the two.
              <View
                style={styles.measure}
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants">
                <Text
                  style={[type.caption, styles.labelActive]}
                  maxFontSizeMultiplier={LABEL_MAX_SCALE}
                  onLayout={(e) => {
                    const width = Math.ceil(e.nativeEvent.layout.width);
                    setLabelWidths((prev) =>
                      prev[route.name] === width ? prev : { ...prev, [route.name]: width },
                    );
                  }}>
                  {tab.label}
                </Text>
              </View>
            ) : null}
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
    paddingHorizontal: TAB_PADDING,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
  labelActive: { fontFamily: fonts.bodySemiBold },
  measure: { position: 'absolute', left: 0, top: 0, width: 1000, flexDirection: 'row', opacity: 0 },
});
