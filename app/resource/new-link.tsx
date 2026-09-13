import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, Text, View } from 'react-native';

import { parseOwnerParams } from '../../src/domain/resource';
import { LinkForm } from '../../src/features/resources/LinkForm';
import { createResource } from '../../src/repositories/resources';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function NewLink() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { scope, ownerId } = useLocalSearchParams<{ scope?: string; ownerId?: string }>();
  const owner = parseOwnerParams(scope, ownerId);

  if (!owner) {
    return (
      <Screen>
        <ScreenHeader title="Add link" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>Nothing to attach this link to.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Add link" />
      <LinkForm
        onSubmit={async (input) => {
          await createResource(db, owner, input);
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
