import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack, useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { DATABASE_NAME, migrate } from '../src/db/client';
import { useMediaSweep } from '../src/files/useMediaSweep';
import { useReminders } from '../src/notifications/useReminders';
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
    // Outermost, as the library asks: it must hear a share that cold-starts the app.
    <ShareIntentProvider>
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
          <Reminders />
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.background },
            }}
          />
          <ShareLanding />
        </SQLiteProvider>
      </Suspense>
    </ShareIntentProvider>
  );
}

/** Has to sit inside the provider, which is where the database context exists. */
function MediaSweep() {
  useMediaSweep();
  return null;
}

/** Inside the database provider, and inside the router so a tapped reminder can open its item. */
function Reminders() {
  useReminders();
  return null;
}

/**
 * Opens the share screen whenever another app sends something — at launch or while running. The
 * screen clears the share once it has read it, so this fires once per share.
 */
function ShareLanding() {
  const router = useRouter();
  const { hasShareIntent, error, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (hasShareIntent) router.push('/share');
  }, [hasShareIntent, router]);

  // The other app sent something this one may not read (a file it did not grant access to).
  useEffect(() => {
    if (!error) return;
    Alert.alert('Could not read what was shared', 'Try sharing it again from the other app.');
    resetShareIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
