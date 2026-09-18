import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { isReminderOn, reminderLabel, withReminder } from '../../domain/reminders';
import { localPrecision } from '../../domain/time';
import {
  kindLabel,
  PRIORITIES,
  subkindLabel,
  subkindsFor,
  TRIP_ITEM_KINDS,
  TRIP_ITEM_STATUSES,
  tripItemInputSchema,
  type MomentInput,
  type TripItemFormValues,
  type TripItemInput,
  type TripItemKind,
} from '../../domain/tripItem';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { MomentField } from '../../ui/components/MomentField';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing } from '../../ui/tokens';

type Props = {
  defaultValues: TripItemFormValues;
  defaultTz: string;
  submitLabel: string;
  onSubmit: (input: TripItemInput) => Promise<void>;
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const STATUS_HINTS = {
  idea: 'Saved to Places until you book it',
  confirmed: 'Booked — it shows on the Timeline',
  cancelled: 'Kept for its documents, hidden from the Timeline',
} as const;

export function ItemForm({ defaultValues, defaultTz, submitLabel, onSubmit }: Props) {
  // The schema closes over the trip's zone, so it must not be rebuilt on every render.
  const schema = useMemo(() => tripItemInputSchema(defaultTz), [defaultTz]);

  const {
    control,
    watch,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripItemFormValues, unknown, TripItemInput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
  });

  const kind = watch('kind');
  const status = watch('status');
  const start = watch('start');
  const remind = isReminderOn(watch('details'));
  const subkinds = subkindsFor(kind);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <Field label="What is it">
              <ChoiceField
                value={field.value ?? 'other'}
                options={TRIP_ITEM_KINDS}
                labelFor={kindLabel}
                onChange={(next) => {
                  if (!next) return;
                  field.onChange(next);
                  // A subkind belongs to one kind, and route details only to transport. The
                  // reminder switch belongs to every kind, so it survives the change.
                  setValue('subkind', null);
                  if (next !== 'transport') {
                    setValue('details', withReminder(undefined, isReminderOn(getValues('details'))));
                  }
                }}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <Field label="Title" error={errors.title?.message}>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder={kind === 'transport' ? 'Flight to Bergamo' : 'Duomo Fast Track'}
                invalid={!!errors.title}
                autoFocus={!defaultValues.title}
              />
            </Field>
          )}
        />

        {subkinds.length > 0 && (
          <Controller
            control={control}
            name="subkind"
            render={({ field }) => (
              <Field label="Type" error={errors.subkind?.message} hint="Optional">
                <ChoiceField
                  value={(field.value as string | null) ?? null}
                  options={subkinds}
                  labelFor={subkindLabel}
                  onChange={field.onChange}
                  clearable
                />
              </Field>
            )}
          />
        )}

        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Field label="Status" hint={STATUS_HINTS[status ?? 'idea']}>
              <ChoiceField
                value={field.value ?? 'idea'}
                options={TRIP_ITEM_STATUSES}
                labelFor={capitalise}
                onChange={(next) => next && field.onChange(next)}
              />
            </Field>
          )}
        />

        {status === 'idea' && (
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Field label="How much do you want it" hint="Optional">
                <ChoiceField
                  value={(field.value as string | null) ?? null}
                  options={PRIORITIES}
                  labelFor={capitalise}
                  onChange={field.onChange}
                  clearable
                />
              </Field>
            )}
          />
        )}

        <SectionLabel>When</SectionLabel>

        <Controller
          control={control}
          name="start"
          render={({ field }) => (
            <Field label="Starts" error={errors.start?.message}>
              <MomentField
                value={field.value}
                onChange={field.onChange}
                defaultTz={defaultTz}
                addLabel="Add a date"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="end"
          render={({ field }) => (
            <Field
              label="Ends"
              error={errors.end?.message}
              hint="A stay or a journey that finishes on another day gets its own timeline entry">
              <MomentField
                value={field.value}
                onChange={field.onChange}
                defaultTz={defaultTz}
                addLabel="Add an end"
              />
            </Field>
          )}
        />

        {status === 'confirmed' && (
          // Not a second Controller: `details` already has one in TransportFields.
          <Field label="Reminder" hint={reminderHint(kind, start, defaultTz, remind)}>
            <ChoiceField
              value={remind ? 'on' : 'off'}
              options={['on', 'off'] as const}
              labelFor={(v) => (v === 'on' ? 'Remind me' : 'No reminder')}
              onChange={(next) =>
                next &&
                setValue('details', withReminder(getValues('details'), next === 'on'), {
                  shouldDirty: true,
                })
              }
            />
          </Field>
        )}

        {kind === 'transport' && <TransportFields control={control} />}

        <SectionLabel>Where</SectionLabel>

        <Controller
          control={control}
          name="locationName"
          render={({ field }) => (
            <Field label="Place" error={errors.locationName?.message} hint="Optional">
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="Piazza del Duomo"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <Field label="Address" error={errors.address?.message} hint="Optional">
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="Via Roma 1, Milano"
              />
            </Field>
          )}
        />

        <SectionLabel>Booking</SectionLabel>

        <Controller
          control={control}
          name="confirmationCode"
          render={({ field }) => (
            <Field label="Confirmation" error={errors.confirmationCode?.message} hint="Optional">
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="characters"
                placeholder="ABC123"
              />
            </Field>
          )}
        />

        <View style={styles.row}>
          <View style={styles.grow}>
            <Controller
              control={control}
              name="priceAmount"
              render={({ field }) => (
                <Field label="Price" error={errors.priceAmount?.message} hint="Optional">
                  <Input
                    value={field.value === undefined ? '' : String(field.value / 100)}
                    onChangeText={(text) => field.onChange(toMinorUnits(text))}
                    onBlur={field.onBlur}
                    keyboardType="decimal-pad"
                    placeholder="25.00"
                    invalid={!!errors.priceAmount}
                  />
                </Field>
              )}
            />
          </View>
          <View style={styles.currency}>
            <Controller
              control={control}
              name="priceCurrency"
              render={({ field }) => (
                <Field label="Currency" error={errors.priceCurrency?.message}>
                  <Input
                    value={field.value ?? ''}
                    onChangeText={(text) =>
                      field.onChange(text.toUpperCase().slice(0, 3) || undefined)
                    }
                    onBlur={field.onBlur}
                    autoCapitalize="characters"
                    maxLength={3}
                    placeholder="EUR"
                    invalid={!!errors.priceCurrency}
                  />
                </Field>
              )}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="isPaid"
          render={({ field }) => (
            <Field label="Paid">
              <ChoiceField
                value={field.value ? 'paid' : 'unpaid'}
                options={['unpaid', 'paid'] as const}
                labelFor={(v) => (v === 'paid' ? 'Paid' : 'Not paid yet')}
                onChange={(next) => field.onChange(next === 'paid')}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Transport has two endpoints, which no single location column can hold. */
function TransportFields({ control }: { control: Control<TripItemFormValues> }) {
  return (
    <Controller
      control={control}
      name="details"
      render={({ field }) => {
        const details = (field.value ?? {}) as Record<string, string | undefined>;
        const set = (key: string) => (text: string) =>
          field.onChange({ ...details, [key]: text.trim() === '' ? undefined : text });

        return (
          <>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Field label="From">
                  <Input value={details.from ?? ''} onChangeText={set('from')} placeholder="Sofia" />
                </Field>
              </View>
              <View style={styles.grow}>
                <Field label="To">
                  <Input value={details.to ?? ''} onChangeText={set('to')} placeholder="Bergamo" />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.grow}>
                <Field label="Number" hint="Optional">
                  <Input
                    value={details.number ?? ''}
                    onChangeText={set('number')}
                    autoCapitalize="characters"
                    placeholder="W6 4315"
                  />
                </Field>
              </View>
              <View style={styles.grow}>
                <Field label="Seat" hint="Optional">
                  <Input value={details.seat ?? ''} onChangeText={set('seat')} placeholder="12A" />
                </Field>
              </View>
            </View>
          </>
        );
      }}
    />
  );
}

/** The rule for this item in words, so "Remind me" never has to be taken on trust. */
function reminderHint(
  kind: TripItemKind,
  start: MomentInput | undefined,
  defaultTz: string,
  on: boolean,
): string {
  if (!on) return 'Nothing will remind you of this one';
  const precision = start ? localPrecision(start.local) : null;
  if (!start || !precision) return 'Once it has a date, it reminds you before it starts';
  const label = reminderLabel({
    id: '',
    kind,
    status: 'confirmed',
    title: '',
    start: { local: start.local, tz: start.tz ?? defaultTz, precision },
    completedAt: null,
    details: null,
  });
  return label ?? '';
}

/** Money is stored in minor units, so the form's 25.00 becomes 2500 and never a float. */
function toMinorUnits(text: string): number | undefined {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '') return undefined;
  return Math.round(Number(cleaned) * 100);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', gap: spacing.lg },
  currency: { width: 110 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  actions: { marginTop: spacing.sm },
});
