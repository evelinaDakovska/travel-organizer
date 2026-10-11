import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import {
  resourceEditSchema,
  resourceMeta,
  subtypeLabel,
  subtypesFor,
  type Resource,
  type ResourceEdit,
} from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { FormScroll } from '../../ui/components/FormScroll';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  resource: Resource;
  onSave: (values: ResourceEdit) => Promise<void>;
  onDelete: () => void;
  /** Show the same file or link on an item as well. Not offered for a receipt. */
  onAttachToItem?: () => void;
};

export function ResourceEditForm({ resource, onSave, onDelete, onAttachToItem }: Props) {
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
    <FormScroll>
      <View style={[styles.source, { backgroundColor: c.surfaceSunken }]}>
        <SectionLabel>{resource.kind === 'file' ? 'Saved file' : 'Link'}</SectionLabel>
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
      {onAttachToItem ? (
        <Button label="Also attach to an item" variant="secondary" onPress={onAttachToItem} />
      ) : null}
      <Button label="Remove attachment" variant="danger" onPress={onDelete} />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  source: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
});
