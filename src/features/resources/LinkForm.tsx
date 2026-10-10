import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import {
  linkFormSchema,
  linkResourceInput,
  type LinkFormInput,
  type LinkFormOutput,
  type ResourceInput,
} from '../../domain/resource';
import { Button } from '../../ui/components/Button';
import { FormScroll } from '../../ui/components/FormScroll';
import { Field, Input } from '../../ui/components/Field';
import { spacing } from '../../ui/tokens';

type Props = { onSubmit: (input: ResourceInput) => Promise<void> };

export function LinkForm({ onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LinkFormInput, unknown, LinkFormOutput>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: { url: '', label: '' },
    mode: 'onBlur',
  });

  return (
    <FormScroll>
      <Controller
        control={control}
        name="url"
        render={({ field }) => (
          <Field
            label="Link"
            error={errors.url?.message}
            hint="A booking page, a Wallet pass, a Google Maps pin">
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              invalid={!!errors.url}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="label"
        render={({ field }) => (
          <Field label="Label" error={errors.label?.message} hint="Optional. Defaults to the site name">
            <Input
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Manage booking"
            />
          </Field>
        )}
      />

      <Button
        label="Save link"
        busy={isSubmitting}
        onPress={handleSubmit(async (values) => {
          await onSubmit(linkResourceInput(values));
        })}
      />
    </FormScroll>
  );
}

const styles = StyleSheet.create({
});
