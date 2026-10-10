import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import type { z } from 'zod';

import { noteInputSchema, type NoteInput } from '../../domain/note';
import { Button } from '../../ui/components/Button';
import { FormScroll } from '../../ui/components/FormScroll';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { spacing } from '../../ui/tokens';

export type NoteFormValues = z.input<typeof noteInputSchema>;

type Props = {
  defaultValues: NoteFormValues;
  submitLabel: string;
  onSubmit: (input: NoteInput) => Promise<void>;
  /** Rendered under the save button, for a destructive action on an existing note. */
  footer?: React.ReactNode;
};

export function NoteForm({ defaultValues, submitLabel, onSubmit, footer }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NoteFormValues, unknown, NoteInput>({
    resolver: zodResolver(noteInputSchema),
    defaultValues,
    mode: 'onBlur',
  });

  return (
    <FormScroll>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <Field label="Title" error={errors.title?.message}>
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Hotel door code"
              invalid={!!errors.title}
              autoFocus={!defaultValues.title}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="body"
        render={({ field }) => (
          <Field label="Note" hint="Optional">
            <Input
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              multiline
              style={styles.body}
              placeholder="4821#, the side entrance after 22:00"
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="pinned"
        render={({ field }) => (
          <Field label="Pin" hint="Pinned notes stay at the top of the list">
            <ChoiceField
              value={field.value ? 'pinned' : null}
              options={['pinned'] as const}
              labelFor={() => 'Pin to the top'}
              onChange={(next) => field.onChange(next === 'pinned')}
              clearable
            />
          </Field>
        )}
      />

      <Button
        label={submitLabel}
        busy={isSubmitting}
        onPress={handleSubmit(async (values) => {
          await onSubmit(values);
        })}
      />
      {footer}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 200, textAlignVertical: 'top' },
});
