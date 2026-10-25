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
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DATABASE_NAME, migrate } from '../src/db/client';
import { StartupErrorBoundary } from '../src/features/startup/StartupErrorBoundary';
import { useMediaSweep } from '../src/files/useMediaSweep';
import { useReminders } from '../src/notifications/useReminders';
import { useColors } from '../src/ui/tokens';

/** Stable, so the provider (memoised on its props) never reopens the database on a re-render. */
const DATABASE_OPTIONS = { enableChangeListener: true };

export default function RootLayout() {
  const c = useColors();
  // Each *Try again* remounts the database provider, which opens and migrates afresh (F-02).
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState(false);
  // The fonts ship inside the bundle, so this settles in milliseconds with no network. If one
  // fails, render anyway: the system font is a better failure than a blank screen abroad.
  const [fontsLoaded, fontError] = useFonts({
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
      {/* Outside the database provider, so it also applies to the start-up error screen. */}
      <StatusBar style="auto" />
      {/* Not `useSuspense`: expo-sqlite keeps a failed suspense open for the life of the JS
          runtime, so nothing short of a restart could try again. Without it the provider
          renders nothing until the database is ready, then throws its error to the boundary. */}
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <StartupErrorBoundary
          opened={opened}
          onRetry={() => {
            setOpened(false);
            setAttempt((n) => n + 1);
          }}>
          <SQLiteProvider
            key={attempt}
            databaseName={DATABASE_NAME}
            onInit={migrate}
            // Defaults to false; without it addDatabaseChangeListener never fires and
            // useLiveQuery silently never refreshes.
            options={DATABASE_OPTIONS}>
            <Opened onOpened={setOpened} />
            <MediaSweep />
            <Reminders />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.background },
              }}
            />
            <ShareLanding />
          </SQLiteProvider>
        </StartupErrorBoundary>
      </View>
    </ShareIntentProvider>
  );
}

/** Rendered only once the provider has opened and migrated the database. */
function Opened({ onOpened }: { onOpened: (opened: true) => void }) {
  useEffect(() => onOpened(true), [onOpened]);
  return null;
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
});
