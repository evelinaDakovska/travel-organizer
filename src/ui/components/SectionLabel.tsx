import { Text } from 'react-native';

import { type, useColors } from '../tokens';

/** 'Up next', 'Tickets & links' — a section's heading, in sentence case (B1). */
export function SectionLabel({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text style={[type.section, { color: c.text }]} accessibilityRole="header">
      {children}
    </Text>
  );
}
