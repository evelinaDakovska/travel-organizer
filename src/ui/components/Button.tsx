import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, type, useColors } from '../tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: Props) {
  const c = useColors();

  const background =
    variant === 'primary' ? c.accent : variant === 'danger' ? 'transparent' : c.surfaceSunken;
  const foreground =
    variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : c.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'danger' ? c.danger : 'transparent',
          borderWidth: variant === 'danger' ? 1 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[type.heading, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
});
