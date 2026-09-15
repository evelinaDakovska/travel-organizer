import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DATABASE_NAME, migrate } from '../src/db/client';
import { useMediaSweep } from '../src/files/useMediaSweep';
import { useColors } from '../src/ui/tokens';

export default function RootLayout() {
  const c = useColors();
  // The fonts ship inside the bundle, so this settles in milliseconds with no network. If one
  // fails, render anyway: the system font is a better failure than a blank screen abroad.
  const [fontsLoaded, fontError] = useFonts({
    Caprasimo_400Regular,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={[styles.fill, { backgroundColor: c.background }]} />;
  }

  return (
    <Suspense
      fallback={
        <View style={[styles.fill, styles.centre, { backgroundColor: c.background }]}>
          <ActivityIndicator color={c.accent} />
        </View>
      }>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={migrate}
        // Defaults to false; without it addDatabaseChangeListener never fires and
        // useLiveQuery silently never refreshes.
        options={{ enableChangeListener: true }}
        useSuspense>
        <MediaSweep />
        <StatusBar style="auto" />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}
        />
      </SQLiteProvider>
    </Suspense>
  );
}

/** Has to sit inside the provider, which is where the database context exists. */
function MediaSweep() {
  useMediaSweep();
  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
