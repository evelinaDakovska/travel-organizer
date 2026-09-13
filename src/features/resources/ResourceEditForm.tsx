import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  resourceEditSchema,
  resourceMeta,
  subtypeLabel,
  subtypesFor,
  type Resource,
  type ResourceEdit,
} from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  resource: Resource;
  onSave: (values: ResourceEdit) => Promise<void>;
  onDelete: () => void;
};

export function ResourceEditForm({ resource, onSave, onDelete }: Props) {
  const c = useColors();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResourceEdit>({
    resolver: zodResolver(resourceEditSchema),
    defaultValues: { label: resource.label, subtype: resource.subtype },
    mode: 'onBlur',
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.source, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.overline, { color: c.textFaint }]}>
            {resource.kind === 'file' ? 'SAVED FILE' : 'LINK'}
          </Text>
          <Text style={[type.body, { color: c.text }]} selectable numberOfLines={3}>
            {resource.kind === 'file' ? (resource.fileName ?? resource.storedPath) : resource.url}
          </Text>
          <Text style={[type.caption, { color: c.textMuted }]}>{resourceMeta(resource)}</Text>
        </View>

        <Controller
          control={control}
          name="label"
          render={({ field }) => (
            <Field label="Label" error={errors.label?.message}>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.label}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="subtype"
          render={({ field }) => (
            <Field label="What is it?">
              <ChoiceField
                value={field.value}
                options={subtypesFor(resource.kind)}
                onChange={(value) => value && field.onChange(value)}
                labelFor={subtypeLabel}
              />
            </Field>
          )}
        />

        <Button
          label="Save"
          busy={isSubmitting}
          onPress={handleSubmit(async (values) => {
            await onSave(values);
          })}
        />
        <Button label="Remove attachment" variant="danger" onPress={onDelete} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  source: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
