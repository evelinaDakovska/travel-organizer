import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '../../ui/components/Icon';
import { spacing, useColors } from '../../ui/tokens';

/** The header action on every trip tab. Search reaches cancelled items, which no tab shows. */
export function SearchButton({ tripId }: { tripId: string }) {
  const c = useColors();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[tripId]/search', params: { tripId } })}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Search this trip"
      style={styles.button}>
      <Icon name="search" color={c.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: spacing.xs },
});
