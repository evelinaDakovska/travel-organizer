import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type, useColors, type Colors } from '../tokens';

export type TagTone = 'accent' | 'accent2' | 'neutral' | 'outline' | 'danger';

function toneColors(c: Colors, tone: TagTone) {
  switch (tone) {
    case 'accent':
      return { fill: c.accentSoft, text: c.accentText, border: c.accentSoft };
    case 'accent2':
      return { fill: c.accent2Soft, text: c.accent2Text, border: c.accent2Soft };
    case 'outline':
      return { fill: 'transparent', text: c.accentText, border: c.accent };
    case 'danger':
      return { fill: c.dangerSoft, text: c.danger, border: c.dangerSoft };
    case 'neutral':
      return { fill: c.neutralSoft, text: c.neutralText, border: c.neutralSoft };
  }
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  const c = useColors();
  const { fill, text, border } = toneColors(c, tone);

  return (
    <View style={[styles.tag, { backgroundColor: fill, borderColor: border }]}>
      <Text style={[type.tag, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
});
