import { Text } from 'react-native';

import { type, useColors } from '../tokens';

/** 'UP NEXT', 'TICKETS & LINKS' — the small accent label that heads every section. */
export function SectionLabel({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text style={[type.overline, { color: c.accentText }]} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}
