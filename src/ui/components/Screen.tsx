import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '../tokens';

export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
