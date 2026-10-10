import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { amountText, parseAmount } from '../../domain/format';
import {
  REMINDER_SETTINGS,
  reminderLabel,
  reminderSetting,
  reminderSettingLabel,
  withReminderSetting,
  type ReminderSetting,
} from '../../domain/reminders';
import { localPrecision } from '../../domain/time';
import {
  detailsForKind,
  followStart,
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
import { FormScroll } from '../../ui/components/FormScroll';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { MomentField } from '../../ui/components/MomentField';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing } from '../../ui/tokens';

type Props = {
  defaultValues: TripItemFormValues;
  defaultTz: string;
  /** 'YYYY-MM-DD' that "Add a date" fills in — the trip's, not today's (`defaultItemDate`). */
  defaultDate: string;
  submitLabel: string;
  onSubmit: (input: TripItemInput) => Promise<void>;
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const STATUS_HINTS = {
  idea: 'Saved to Places until you book it',
  confirmed: 'Booked — it shows on the Timeline',
  cancelled: 'Kept for its documents, hidden from the Timeline',
} as const;

export function ItemForm({ defaultValues, defaultTz, defaultDate, submitLabel, onSubmit }: Props) {
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
  const reminder = reminderSetting(watch('details'));
  const subkinds = subkindsFor(kind);

  return (
    <FormScroll>
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
                // A subkind belongs to one kind, and the route only to transport. Everything
                // else in details — the reminder, refundable — belongs to every kind.
                setValue('subkind', null);
                setValue('details', detailsForKind(getValues('details'), next));
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
              onChange={(next) => {
                field.onChange(next);
                // An end left on an earlier day would only fail validation; carry it along.
                const end = getValues('end');
                const followed = followStart(next, end);
                if (followed !== end) setValue('end', followed, { shouldDirty: true });
              }}
              defaultTz={defaultTz}
              addLabel="Add a date"
              initial={defaultDate}
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
              initial={start?.local ?? defaultDate}
              minDate={start?.local.slice(0, 10)}
            />
          </Field>
        )}
      />

      {status === 'confirmed' && (
        // Not a second Controller: `details` already has one in TransportFields.
        <Field label="Reminder" hint={reminderHint(kind, start, defaultTz, reminder)}>
          <ChoiceField
            value={reminder}
            options={REMINDER_SETTINGS}
            labelFor={reminderSettingLabel}
            onChange={(next) =>
              next &&
              setValue('details', withReminderSetting(getValues('details'), next), {
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
                <PriceInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
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
    </FormScroll>
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
  setting: ReminderSetting,
): string {
  if (setting === 'off') return 'Nothing will remind you of this one';
  const precision = start ? localPrecision(start.local) : null;
  if (!start || !precision) return 'Once it has a date, it reminds you before it starts';
  const label = reminderLabel({
    id: '',
    kind,
    status: 'confirmed',
    title: '',
    start: { local: start.local, tz: start.tz ?? defaultTz, precision },
    completedAt: null,
    details: withReminderSetting(undefined, setting) ?? null,
  });
  // The usual rule is named, so "Usual" never has to be taken on trust.
  return setting === 'default' ? `Usual for this kind: ${label?.toLowerCase()}` : (label ?? '');
}

type PriceInputProps = {
  value: number | undefined;
  onChange: (minorUnits: number | undefined) => void;
  onBlur: () => void;
  invalid: boolean;
};

/**
 * Keeps the text as typed. Rendering it back from the stored minor units dropped the decimal
 * point the moment it was typed — '12.50' became 1250.00 — so the number only flows outwards.
 */
function PriceInput({ value, onChange, onBlur, invalid }: PriceInputProps) {
  const [text, setText] = useState(() => amountText(value));

  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseAmount(next));
      }}
      onBlur={onBlur}
      keyboardType="decimal-pad"
      placeholder="25.00"
      invalid={invalid}
    />
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.lg },
  currency: { width: 110 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  actions: { marginTop: spacing.sm },
});
