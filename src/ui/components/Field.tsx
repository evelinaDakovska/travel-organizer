import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, type, useColors } from '../tokens';

type FieldProps = { label: string; error?: string; hint?: string; children: ReactNode };

export function Field({ label, error, hint, children }: FieldProps) {
  const c = useColors();
  return (
    <View style={styles.field}>
      <Text style={[type.label, { color: c.textMuted }]}>{label}</Text>
      {children}
      {error ? (
        <Text style={[type.caption, { color: c.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, { color: c.textFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

type InputProps = TextInputProps & { invalid?: boolean };

export function Input({ invalid = false, style, ...props }: InputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.textFaint}
      style={[
        styles.input,
        type.body,
        {
          backgroundColor: c.surface,
          borderColor: invalid ? c.danger : c.border,
          color: c.text,
        },
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
