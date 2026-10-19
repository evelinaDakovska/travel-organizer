import { zodResolver } from '@hookform/resolvers/zod';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { tripInputSchema, type TripInput } from '../../domain/trip';
import { TravellerPicker } from '../travellers/TravellerPicker';
import { useMe } from '../travellers/useMe';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { createTraveller, listTravellers, TRAVELLER_TABLES } from '../../repositories/travellers';
import { Button } from '../../ui/components/Button';
import { DateRangeField } from '../../ui/components/DateRangeField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { TimezoneField } from '../../ui/components/TimezoneField';

type Props = {
  defaultValues: TripInput;
  defaultTravellerIds?: string[];
  submitLabel: string;
  onSubmit: (input: TripInput, selectedTravellerIds: string[]) => Promise<void>;
  /**
   * After the fields, in the scroll — a destructive action such as Delete, kept away from the
   * Save button pinned below.
   */
  secondaryActions?: ReactNode;
};

export function TripForm({
  defaultValues,
  defaultTravellerIds,
  submitLabel,
  onSubmit,
  secondaryActions,
}: Props) {
  const db = useSQLiteContext();
  const { data: profiles = [] } = useLiveQuery(listTravellers, TRAVELLER_TABLES);
  const { meId } = useMe();
  const [selectedTravellerIds, setSelectedTravellerIds] = useState<string[]>(
    defaultTravellerIds ?? [],
  );

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripInput>({
    resolver: zodResolver(tripInputSchema),
    defaultValues,
    mode: 'onBlur',
  });

  return (
    <FormScroll
      footer={
        <Button
          label={submitLabel}
          busy={isSubmitting}
          onPress={handleSubmit(async (values) => {
            await onSubmit(values, selectedTravellerIds);
          })}
        />
      }>
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

      {/* Not a Controller: one field writes two values. */}
      <Field label="Dates" error={errors.startDate?.message ?? errors.endDate?.message}>
        <DateRangeField
          start={watch('startDate')}
          end={watch('endDate')}
          onChange={(start, end) => {
            setValue('startDate', start, { shouldDirty: true, shouldValidate: true });
            setValue('endDate', end, { shouldDirty: true, shouldValidate: true });
          }}
          invalid={!!errors.startDate || !!errors.endDate}
        />
      </Field>

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

      <Field
        label="Travelling with"
        hint={
          selectedTravellerIds.length > 0
            ? `${selectedTravellerIds.length} ${
                selectedTravellerIds.length === 1 ? 'person' : 'people'
              } selected`
            : 'Select saved profiles or add travellers'
        }>
        <TravellerPicker
          profiles={profiles}
          selectedIds={selectedTravellerIds}
          onChange={setSelectedTravellerIds}
          onAddNewProfile={async (name, classification) => {
            return await createTraveller(db, name, classification);
          }}
          legacyNames={defaultValues.travellers ?? []}
          meId={meId}
        />
      </Field>

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

      {secondaryActions}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 100, textAlignVertical: 'top' },
});
