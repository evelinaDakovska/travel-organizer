import { zodResolver } from '@hookform/resolvers/zod';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { namesakeHint } from '../../domain/traveller';
import { deviceToday, tripInputSchema, type TripInput } from '../../domain/trip';
import { TravellerPicker } from '../travellers/TravellerPicker';
import { useMe } from '../travellers/useMe';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import {
  createTraveller,
  listTravellers,
  TRAVELLER_TABLES,
  travellerTripNames,
} from '../../repositories/travellers';
import { TRIP_TABLES } from '../../repositories/trips';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
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
  // Two profiles of one name are told apart by their trips (QA O-09).
  const { data: tripsOf = {} } = useLiveQuery(travellerTripNames, [
    ...TRIP_TABLES,
    ...TRAVELLER_TABLES,
  ]);
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
  const start = watch('startDate');
  const end = watch('endDate');
  const datesSet = start !== null;
  // What *Set dates* brings back: the dates last shown, else today for one day, as a new trip starts.
  const [lastRange, setLastRange] = useState(() =>
    defaultValues.startDate !== null && defaultValues.endDate !== null
      ? { start: defaultValues.startDate, end: defaultValues.endDate }
      : { start: deviceToday(), end: deviceToday() },
  );

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

      {/* Not a Controller: one field writes two values. Dates are optional (Phase 6, P6-8): not
          decided yet stores none, and setting them later moves nothing. */}
      <Field
        label="Dates"
        error={errors.startDate?.message ?? errors.endDate?.message}
        hint={
          datesSet
            ? undefined
            : 'Plans can still have their own dates. Set the trip’s dates any time; nothing moves'
        }>
        <ChoiceField
          value={datesSet ? 'set' : 'later'}
          options={['set', 'later'] as const}
          labelFor={(choice) => (choice === 'set' ? 'Set dates' : 'Not decided yet')}
          onChange={(choice) => {
            if (!choice) return;
            const range = choice === 'set' ? lastRange : { start: null, end: null };
            if (choice === 'later' && start !== null && end !== null) setLastRange({ start, end });
            setValue('startDate', range.start, { shouldDirty: true, shouldValidate: true });
            setValue('endDate', range.end, { shouldDirty: true, shouldValidate: true });
          }}
        />
        {start !== null && end !== null ? (
          <DateRangeField
            start={start}
            end={end}
            onChange={(first, last) => {
              setValue('startDate', first, { shouldDirty: true, shouldValidate: true });
              setValue('endDate', last, { shouldDirty: true, shouldValidate: true });
            }}
            invalid={!!errors.startDate || !!errors.endDate}
          />
        ) : null}
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
          hintFor={(profile) => namesakeHint(profile, profiles, tripsOf[profile.id] ?? [])}
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
