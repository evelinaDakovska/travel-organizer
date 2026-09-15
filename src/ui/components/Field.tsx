import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';

import { radius, spacing, type, useColors, type Colors } from '../tokens';

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
        <Text style={[type.caption, { color: c.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * The box every input and picker sits in, so a text field and a date button look like one
 * family. Single-line controls are pills; a multi-line box is rounded instead.
 */
export function inputFrame(
  c: Colors,
  invalid = false,
  multiline = false,
): Pick<
  TextStyle,
  | 'minHeight'
  | 'borderWidth'
  | 'borderRadius'
  | 'paddingHorizontal'
  | 'paddingVertical'
  | 'justifyContent'
  | 'backgroundColor'
  | 'borderColor'
> {
  return {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: multiline ? radius.lg : radius.pill,
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.md,
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderColor: invalid ? c.danger : c.border,
  };
}

type InputProps = TextInputProps & { invalid?: boolean };

export function Input({ invalid = false, multiline, style, onFocus, onBlur, ...props }: InputProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={c.textFaint}
      cursorColor={c.accent}
      selectionColor={c.accent}
      multiline={multiline}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        inputFrame(c, invalid, multiline),
        type.body,
        { color: c.text },
        focused && !invalid && { borderColor: c.accent },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
});
