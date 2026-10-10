import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { tripInputSchema, type TripInput } from '../../domain/trip';
import { Button } from '../../ui/components/Button';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { TimezoneField } from '../../ui/components/TimezoneField';
import { spacing } from '../../ui/tokens';

type Props = {
  defaultValues: TripInput;
  submitLabel: string;
  onSubmit: (input: TripInput) => Promise<void>;
};

export function TripForm({ defaultValues, submitLabel, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripInput>({
    resolver: zodResolver(tripInputSchema),
    defaultValues,
    mode: 'onBlur',
  });

  return (
    <FormScroll>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Field label="Trip name" error={errors.name?.message}>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="Milan"
                invalid={!!errors.name}
                autoFocus={!defaultValues.name}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="destination"
          render={({ field }) => (
            <Field label="Destination" error={errors.destination?.message} hint="Optional">
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="Italy"
              />
            </Field>
          )}
        />

        <View style={styles.row}>
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <View style={styles.flex}>
                <Field label="Start" error={errors.startDate?.message}>
                  <DateField
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.startDate}
                  />
                </Field>
              </View>
            )}
          />
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <View style={styles.flex}>
                <Field label="End" error={errors.endDate?.message}>
                  <DateField
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.endDate}
                  />
                </Field>
              </View>
            )}
          />
        </View>

        <Controller
          control={control}
          name="defaultTz"
          render={({ field }) => (
            <Field
              label="Main timezone"
              error={errors.defaultTz?.message}
              hint="Used when an item does not specify its own">
              <TimezoneField
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.defaultTz}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="travellers"
          render={({ field }) => (
            <Field label="Travelling with" hint="Comma separated. Optional">
              <Input
                defaultValue={(field.value ?? []).join(', ')}
                onChangeText={(text) => {
                  const names = text
                    .split(',')
                    .map((n) => n.trim())
                    .filter(Boolean);
                  field.onChange(names.length > 0 ? names : undefined);
                }}
                onBlur={field.onBlur}
                placeholder="Sam, Alex"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="travellerCount"
          render={({ field }) => (
            <Field
              label="Number of people"
              error={errors.travellerCount?.message}
              hint="Optional. Handy when tickets are per person">
              <Input
                value={field.value === undefined ? '' : String(field.value)}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, '');
                  field.onChange(digits === '' ? undefined : Number(digits));
                }}
                onBlur={field.onBlur}
                keyboardType="number-pad"
                placeholder="2"
                invalid={!!errors.travellerCount}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Field label="Notes" hint="Optional">
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                multiline
                numberOfLines={4}
                style={styles.multiline}
                placeholder="Anything worth remembering"
              />
            </Field>
          )}
        />

        <View style={styles.actions}>
          <Button
            label={submitLabel}
            busy={isSubmitting}
            onPress={handleSubmit(async (values) => {
              await onSubmit(values);
            })}
          />
        </View>
      </FormScroll>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.lg },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  actions: { marginTop: spacing.sm },
});
