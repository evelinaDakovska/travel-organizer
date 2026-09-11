import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { DATABASE_NAME, migrate } from '../src/db/client';

export default function RootLayout() {
  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      }>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={migrate}
        // Defaults to false; without it addDatabaseChangeListener never fires and
        // useLiveQuery silently never refreshes.
        options={{ enableChangeListener: true }}
        useSuspense>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SQLiteProvider>
    </Suspense>
  );
}
