import { zodResolver } from '@hookform/resolvers/zod';
import { randomUUID } from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  firstReturnLeg,
  isMultiLeg,
  journeyItemValues,
  journeyProblems,
  mergeToDirect,
  nextLeg,
  type Journey,
  type Leg,
  type LegProblem,
} from '../../domain/journey';
import { suggestPlaces, type KnownPlace } from '../../domain/places';
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
  type TripItemStatus,
} from '../../domain/tripItem';
import { CLASSIFICATION_LABELS, travellerLabel, type Traveller } from '../../domain/traveller';
import { useMe } from '../travellers/useMe';
import { followPlace, lastKnownPlace } from '../../domain/zoneHints';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Disclosure } from '../../ui/components/Disclosure';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { Icon } from '../../ui/components/Icon';
import { KindTile } from '../../ui/components/KindTile';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { MomentField } from '../../ui/components/MomentField';
import { MultiChoiceField } from '../../ui/components/MultiChoiceField';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { SelectField } from '../../ui/components/SelectField';
import { Sheet } from '../../ui/components/Sheet';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';
import { JourneyFields } from './JourneyFields';
import { PriceSection } from './PriceSection';

type Props = {
  defaultValues: TripItemFormValues;
  defaultTz: string;
  /** 'YYYY-MM-DD' that "Add a date" fills in — the trip's, not today's (`defaultItemDate`). */
  defaultDate: string;
  /** Place names written before, offered while typing one. */
  knownPlaces?: readonly KnownPlace[];
  submitLabel: string;
  /** Editing an existing item: *Cancelled* is offered as a status too. */
  editing?: boolean;
  /** The trip's travellers, offered as *Who's going* (C2). None: the question is not asked. */
  travellers?: readonly Traveller[];
  /** Who takes part already, on an edit. */
  defaultParticipants?: readonly string[];
  /** The item and who takes part in it; none ticked means not specified. */
  onSubmit: (input: TripItemInput, participants: string[]) => Promise<void>;
  /** Offered only when creating: connections and a return save one item per leg (U7). */
  onSubmitJourney?: (inputs: TripItemInput[], participants: string[]) => Promise<void>;
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Commitment in words (B10): *confirmed* means decided, booked or not. */
const STATUS_LABELS: Record<TripItemStatus, string> = {
  confirmed: 'In my itinerary',
  idea: 'Saved idea',
  cancelled: 'Cancelled',
};

const STATUS_HINTS: Record<TripItemStatus, string> = {
  idea: 'Saved to Places until you decide on it',
  confirmed: 'It shows on the Timeline and the Overview',
  cancelled: 'Kept for its documents, hidden from the Timeline',
};

/** A title worth copying, per kind: the form opens on it (B10). */
const TITLE_PLACEHOLDERS: Record<TripItemKind, string> = {
  transport: 'Flight to Bergamo',
  stay: 'Hotel Brera',
  activity: 'Duomo rooftop tour',
  food: 'Trattoria da Mario',
  task: 'Print the car rental voucher',
  other: 'Travel insurance',
};

/**
 * Add or edit an item (B10). The kind was chosen before the form opened (AddSheet) and is only
 * changed here; title first, then when and where; price, payment and the reminder fold away
 * until wanted — and open by themselves when they hold something, so nothing saved is hidden.
 */
export function ItemForm({
  defaultValues,
  defaultTz,
  defaultDate,
  knownPlaces = [],
  submitLabel,
  editing = false,
  travellers = [],
  defaultParticipants = [],
  onSubmit,
  onSubmitJourney,
}: Props) {
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
  const subkind = watch('subkind');
  // A journey's ends read as what they are; a car is collected, not boarded.
  const [startLabel, endLabel] =
    kind !== 'transport'
      ? ['Starts', 'Ends']
      : subkind === 'car'
        ? ['Pick up', 'Drop off']
        : ['Departs', 'Arrives'];
  const start = watch('start');
  const end = watch('end');
  const details = watch('details') as Record<string, unknown> | undefined;
  const routeEnd = (key: 'from' | 'to') => {
    const value = details?.[key];
    return kind === 'transport' && typeof value === 'string' ? value : undefined;
  };
  const from = routeEnd('from');
  const to = routeEnd('to');
  const reminder = reminderSetting(watch('details'));
  const subkinds = subkindsFor(kind);
  const c = useColors();

  const [choosingKind, setChoosingKind] = useState(false);
  const { meId } = useMe();
  // Only the trip's travellers can be ticked; one taken off the trip since is left out on save.
  const [participants, setParticipants] = useState<string[]>(() =>
    defaultParticipants.filter((id) => travellers.some((traveller) => traveller.id === id)),
  );
  const selectedParticipants = useMemo(
    () => travellers.filter((traveller) => participants.includes(traveller.id)),
    [travellers, participants],
  );
  // Null is the ordinary form; a journey replaces its When and route with a list of legs.
  const [journey, setJourney] = useState<Journey | null>(null);
  const [problems, setProblems] = useState<LegProblem[]>([]);
  const [journeyError, setJourneyError] = useState<string | null>(null);

  // A city in From or To fills that end's zone when it keeps another clock (N6), and a zone filled
  // from the old city follows a new one (A6). Also on opening an item saved without one: the hint
  // under the time says so, and nothing is written until Save.
  const knownCities = useRef({ from: lastKnownPlace(null, from), to: lastKnownPlace(null, to) });
  useEffect(() => {
    const before = knownCities.current;
    knownCities.current = {
      from: lastKnownPlace(before.from, from),
      to: lastKnownPlace(before.to, to),
    };
    if (journey) return;
    const filledStart = followPlace(before.from, from, start, defaultTz);
    if (filledStart !== start) setValue('start', filledStart, { shouldDirty: true });
    const filledEnd = followPlace(before.to, to, end, defaultTz);
    if (filledEnd !== end) setValue('end', filledEnd, { shouldDirty: true });
  }, [journey, from, to, start, end, defaultTz, setValue]);

  /** The ordinary form's single trip, as the first leg. */
  const legFromForm = (): Leg => {
    const values = getValues();
    const details = (values.details ?? {}) as Record<string, unknown>;
    const text = (key: string) =>
      typeof details[key] === 'string' ? (details[key] as string) : undefined;
    return {
      from: text('from'),
      to: text('to'),
      number: text('number'),
      seat: text('seat'),
      departs: values.start,
      arrives: values.end,
    };
  };

  /**
   * Keeps the form and the legs from disagreeing: back to one direct leg, that leg goes into the
   * ordinary fields; into legs, the ordinary fields are emptied so they cannot fail validation
   * while hidden.
   */
  const applyJourney = (next: Journey) => {
    setProblems([]);
    setJourneyError(null);
    const shared = detailsForKind(getValues('details'), 'other');

    if (!isMultiLeg(next)) {
      const [leg] = next.outbound;
      setValue('start', leg?.departs);
      setValue('end', leg?.arrives);
      const details = { ...shared, ...(leg ? routeOf(leg) : {}) };
      setValue('details', Object.keys(details).length > 0 ? details : undefined);
      setJourney(null);
      return;
    }
    setValue('start', undefined);
    setValue('end', undefined);
    setValue('details', shared);
    setJourney(next);
  };

  const current = (): Journey => journey ?? { outbound: [legFromForm()], returning: [] };

  const setConnections = (on: boolean) => {
    const now = current();
    const [first] = now.outbound;
    const outbound = on
      ? now.outbound.length > 1
        ? now.outbound
        : [first, nextLeg(first)]
      : [mergeToDirect(now.outbound)];
    applyJourney({ ...now, outbound });
  };

  const setReturn = (on: boolean) => {
    const now = current();
    const returning = on
      ? now.returning.length > 0
        ? now.returning
        : [firstReturnLeg(now.outbound)]
      : [];
    applyJourney({ ...now, returning });
  };

  /** Every leg checked before anything is written; then all of them in one transaction. */
  const submitJourney = async (legs: Journey) => {
    const found = journeyProblems(legs, defaultTz);
    setProblems(found);
    if (found.length > 0) {
      setJourneyError('Check the legs marked above');
      return;
    }
    const values = journeyItemValues(getValues(), legs, randomUUID());
    const parsed = values.map((value) => schema.safeParse(value));
    const failed = parsed.findIndex((result) => !result.success);
    if (failed >= 0) {
      const issue = parsed[failed].error?.issues[0]?.message ?? 'Something is not right';
      setJourneyError(`${values[failed].title}: ${issue}`);
      return;
    }
    setJourneyError(null);
    await onSubmitJourney?.(
      parsed.map((result) => result.data!),
      participants,
    );
  };

  /** Changing kind keeps everything but what belongs to the old kind only. */
  const changeKind = (next: TripItemKind) => {
    setChoosingKind(false);
    if (next === kind) return;
    setValue('kind', next, { shouldDirty: true });
    // A subkind belongs to one kind, and the route only to transport. Everything else in details
    // — the reminder, refundable — belongs to every kind.
    setValue('subkind', null);
    // Legs are travel only; leaving travel folds them back into one.
    if (journey && next !== 'transport') {
      applyJourney({ outbound: [mergeToDirect(journey.outbound)], returning: [] });
    }
    setValue('details', detailsForKind(getValues('details'), next));
  };

  const reminderText = reminderHint(kind, start, defaultTz, reminder);

  return (
    <FormScroll
      footer={
        <>
          {journeyError ? (
            <Text style={[type.body, styles.error, { color: c.danger }]}>{journeyError}</Text>
          ) : null}
          <Button
            label={submitLabel}
            busy={isSubmitting}
            onPress={handleSubmit(async (values) => {
              if (journey) await submitJourney(journey);
              else await onSubmit(values, participants);
            })}
          />
        </>
      }>
      <Pressable
        onPress={() => setChoosingKind(true)}
        accessibilityRole="button"
        accessibilityLabel={`Kind: ${kindLabel(kind)}. Change`}
        style={({ pressed }) => [styles.kindRow, { opacity: pressed ? opacity.pressed : 1 }]}>
        <KindTile kind={kind} subkind={null} size={32} />
        <Text style={[type.heading, styles.grow, { color: c.text }]}>{kindLabel(kind)}</Text>
        <Text style={[type.label, { color: c.accentText }]}>Change</Text>
      </Pressable>
      <Sheet visible={choosingKind} title="What is it" onClose={() => setChoosingKind(false)}>
        <Rows>
          {TRIP_ITEM_KINDS.map((option) => (
            <ListRow
              key={option}
              title={kindLabel(option)}
              leading={<KindTile kind={option} subkind={null} size={32} />}
              trailing={option === kind ? <Icon name="check" color={c.accentText} /> : null}
              onPress={() => changeKind(option)}
            />
          ))}
        </Rows>
      </Sheet>

      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <Field label="Title" error={errors.title?.message}>
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder={TITLE_PLACEHOLDERS[kind]}
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
              <SelectField
                value={(field.value as string | null) ?? null}
                options={subkinds}
                labelFor={subkindLabel}
                onChange={field.onChange}
                title={`Type of ${kindLabel(kind).toLowerCase()}`}
                noneLabel="Not specified"
              />
            </Field>
          )}
        />
      )}

      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <Field label="Commitment" hint={STATUS_HINTS[status ?? 'idea']}>
            <ChoiceField
              value={field.value ?? 'idea'}
              // Cancelling is on the item's More menu; here only an item already cancelled, or
              // being edited, can be set to it.
              options={editing ? TRIP_ITEM_STATUSES : (['confirmed', 'idea'] as const)}
              labelFor={(value) => STATUS_LABELS[value]}
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

      {travellers.length > 0 && (
        <Field
          label="Who's going"
          hint={
            participants.length === 0
              ? 'None ticked: not specified'
              : `${participants.length} of ${travellers.length}`
          }>
          <MultiChoiceField
            options={travellers.map((traveller) => ({
              id: traveller.id,
              // *Evelina (Me)*; a classification is shown for anyone else, to tell namesakes apart.
              label:
                traveller.id !== meId && traveller.classification !== 'unspecified'
                  ? `${traveller.name} (${CLASSIFICATION_LABELS[traveller.classification]})`
                  : travellerLabel(traveller, meId),
            }))}
            selected={participants}
            onChange={setParticipants}
          />
        </Field>
      )}

      {onSubmitJourney && kind === 'transport' && (
        <>
          <Field label="Route">
            <ChoiceField
              value={journey && journey.outbound.length > 1 ? 'connections' : 'direct'}
              options={['direct', 'connections'] as const}
              labelFor={(v) => (v === 'direct' ? 'Direct' : 'With connections')}
              onChange={(next) => next && setConnections(next === 'connections')}
            />
          </Field>
          <Field
            label="Return"
            hint={journey ? 'Each leg is saved as its own item, with its own times' : undefined}>
            <ChoiceField
              value={journey && journey.returning.length > 0 ? 'return' : 'oneway'}
              options={['oneway', 'return'] as const}
              labelFor={(v) => (v === 'oneway' ? 'One way' : 'With return')}
              onChange={(next) => next && setReturn(next === 'return')}
            />
          </Field>
        </>
      )}

      {journey ? (
        <JourneyFields
          journey={journey}
          onChange={applyJourney}
          defaultTz={defaultTz}
          defaultDate={defaultDate}
          problems={problems}
        />
      ) : (
        <>
          <SectionLabel>When</SectionLabel>

          <Controller
            control={control}
            name="start"
            render={({ field }) => (
              <Field label={startLabel} error={errors.start?.message}>
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
                  place={from}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="end"
            render={({ field }) => (
              <Field
                label={endLabel}
                error={errors.end?.message}
                hint={
                  kind === 'transport'
                    ? 'Each end is in the local time where it happens. Check both zones'
                    : 'One that ends on a later day shows on that day too'
                }>
                <MomentField
                  value={field.value}
                  onChange={field.onChange}
                  defaultTz={defaultTz}
                  addLabel="Add an end"
                  place={to}
                  initial={start?.local ?? defaultDate}
                  minDate={start?.local.slice(0, 10)}
                />
              </Field>
            )}
          />
        </>
      )}

      {kind === 'transport' && !journey && <TransportFields control={control} />}

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
            <PlaceSuggestions
              places={suggestPlaces(knownPlaces, field.value ?? '')}
              onPick={(place) => {
                field.onChange(place.name);
                // Only an empty address is filled: one typed by hand is never overwritten.
                if (place.address && !getValues('address')) {
                  setValue('address', place.address, { shouldDirty: true });
                }
              }}
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

      <Controller
        control={control}
        name="confirmationCode"
        render={({ field }) => (
          <Field label="Booking reference" error={errors.confirmationCode?.message} hint="Optional">
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

      {/* Folded until wanted; open from the start when it holds anything, and on an error. */}
      <PriceSection
        control={control}
        errors={errors}
        setValue={setValue}
        getValues={getValues}
        initiallyOpen={defaultValues.priceAmount !== undefined || defaultValues.isPaid === true}
        goingCount={participants.length}
        participants={selectedParticipants}
        saved={{ priceAmount: defaultValues.priceAmount, isPaid: defaultValues.isPaid === true }}
      />

      {status === 'confirmed' && (
        <Disclosure title="Reminder" summary={reminderText} initiallyOpen={reminder !== 'default'}>
          {/* Not a second Controller: `details` already has one in TransportFields. */}
          <Field label="Remind me" hint={reminderText}>
            <SelectField
              value={reminder}
              options={REMINDER_SETTINGS}
              labelFor={reminderSettingLabel}
              title="Remind me"
              onChange={(next) =>
                next &&
                setValue('details', withReminderSetting(getValues('details'), next), {
                  shouldDirty: true,
                })
              }
            />
          </Field>
        </Disclosure>
      )}
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

/** Names written before that match what is being typed; a tap fills the place in. */
function PlaceSuggestions({
  places,
  onPick,
}: {
  places: readonly KnownPlace[];
  onPick: (place: KnownPlace) => void;
}) {
  const c = useColors();
  if (places.length === 0) return null;

  return (
    <View style={styles.suggestions}>
      {places.map((place) => (
        <Pressable
          key={place.name}
          onPress={() => onPick(place)}
          accessibilityRole="button"
          accessibilityLabel={`Use ${place.name}`}
          style={({ pressed }) => [
            styles.suggestion,
            { backgroundColor: c.surfaceSunken, opacity: pressed ? opacity.pressed : 1 },
          ]}>
          <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
            {place.name}
          </Text>
          {place.address ? (
            <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
              {place.address}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The route fields a leg fills in the ordinary form's `details`. */
function routeOf(leg: Leg): Record<string, string> {
  const route: Record<string, string> = {};
  for (const key of ['from', 'to', 'number', 'seat'] as const) {
    const value = leg[key]?.trim();
    if (value) route[key] = value;
  }
  return route;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.lg },
  currency: { width: 110 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  suggestions: { gap: spacing.xs },
  suggestion: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { textAlign: 'center' },
});
