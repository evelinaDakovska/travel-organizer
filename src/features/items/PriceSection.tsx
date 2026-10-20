import { useRef, useState } from 'react';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { refundableOf, withRefundable } from '../../domain/bookingCosts';
import { formatMoney } from '../../domain/format';
import {
  AUDIENCE_LABEL,
  AUDIENCES,
  lineText,
  lineType,
  pricedFor,
  priceForWhosGoing,
  pricingFromDraft,
  pricingOf,
  pricingText,
  pricingTotal,
  suggestPricingLines,
  withPricing,
  type DraftRateLine,
  type GoingSuggestion,
  type LineType,
  type RateLine,
} from '../../domain/pricing';
import type { TripItemFormValues } from '../../domain/tripItem';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Disclosure } from '../../ui/components/Disclosure';
import { Field, Input } from '../../ui/components/Field';
import { Icon } from '../../ui/components/Icon';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { opacity, radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

type Classification = 'adult' | 'child' | 'unspecified';

type Props = {
  control: Control<TripItemFormValues>;
  errors: FieldErrors<TripItemFormValues>;
  setValue: UseFormSetValue<TripItemFormValues>;
  getValues: UseFormGetValues<TripItemFormValues>;
  /** Starts open: the item already has a price, or is marked paid. */
  initiallyOpen: boolean;
  /** People ticked as going (C2): a per-person price starts priced for them. */
  goingCount: number;
  /** Participants going on this item with their classifications, for non-destructive rate suggestions. */
  participants?: readonly { classification: Classification }[];
  /** The price and paid state as saved, on an edit: a paid booking's price is protected (3C). */
  saved: { priceAmount: number | undefined; isPaid: boolean };
};

/**
 * A rate line as the form edits it: the price may be half-typed (NaN) or not yet there. `key`
 * keeps each line's own typed text with it when another line is removed; who it is for, and
 * whether it is a group price or an extra, travel with it (3C).
 */
type DraftLine = DraftRateLine & { key: number; label: string };

const TYPE_TITLE: Record<LineType, string> = {
  person: 'Rate for people',
  group: 'Group price',
  extra: 'Extra',
};

const PLACEHOLDER: Record<LineType, string> = {
  person: 'Adult',
  group: 'Family ticket',
  extra: 'Sled hire',
};

/**
 * Price & payment (B10, C3, 3C): a total, or a breakdown — rates for people (each for an adult,
 * a child or anyone), group prices and extras — the total worked out as they are typed. Whatever
 * is shown is what is saved: the breakdown goes in `details.pricing` and its total in the price,
 * and the item's schema refuses the two disagreeing. Nothing here re-prices on its own: *Price for
 * who's going* is a suggestion, applied only when confirmed, and never to a booking marked paid.
 */
export function PriceSection({
  control,
  errors,
  setValue,
  getValues,
  initiallyOpen,
  goingCount,
  participants,
  saved,
}: Props) {
  const c = useColors();
  const [priceAmount, priceCurrency, isPaid, details, status] = useWatch({
    control,
    name: ['priceAmount', 'priceCurrency', 'isPaid', 'details', 'status'],
  });
  // Keys are counted here, not in the module, so they stay unique however the module reloads.
  const keys = useRef(0);
  const previousTotalRef = useRef<number | undefined>(getValues('priceAmount'));
  const newLine = (line: Omit<DraftLine, 'key' | 'label'> & { label?: string }): DraftLine => ({
    ...line,
    key: keys.current++,
    label: line.label ?? '',
  });
  const [lines, setLines] = useState<DraftLine[]>(
    () => pricingOf(getValues('details'))?.lines.map((line) => newLine(line)) ?? [],
  );
  const [suggesting, setSuggesting] = useState(false);
  const perPerson = lines.length > 0;
  const refundable = refundableOf(details);
  const currency = priceCurrency ?? 'EUR';
  const estimate = status === 'idea';
  // A booking marked paid, as saved or as chosen now: Paid records no amount, so its price is
  // never re-worked for it (3C, P-4).
  const paid = isPaid || saved.isPaid;
  const going =
    participants && participants.length > 0
      ? participants
      : Array.from({ length: goingCount }, () => ({ classification: 'unspecified' as const }));

  /**
   * Writes the breakdown and the total it makes, together, into the form. Until every rate has a
   * price there is no total, and the item's schema says which rate is missing one.
   */
  const applyLines = (next: DraftLine[]) => {
    setLines(next);
    setSuggesting(false);
    const rates = next.flatMap((line) =>
      line.unitAmount !== undefined && Number.isFinite(line.unitAmount)
        ? [{ quantity: line.quantity, unitAmount: line.unitAmount }]
        : [],
    );
    const total = rates.length === next.length ? pricingTotal(rates) : null;
    setValue('details', withPricing(getValues('details'), pricingFromDraft(next)), {
      shouldDirty: true,
    });
    setValue('priceAmount', total ?? undefined, {
      shouldDirty: true,
      shouldValidate: !!errors.priceAmount,
    });
  };

  const switchTo = (mode: 'total' | 'perPerson') => {
    if (mode === 'total') {
      // Switching to total: preserve breakdown removal and restore prior total if currently cleared
      setLines([]);
      setSuggesting(false);
      setValue('details', withPricing(getValues('details'), null), { shouldDirty: true });
      const current = getValues('priceAmount');
      if (current === undefined && previousTotalRef.current !== undefined) {
        setValue('priceAmount', previousTotalRef.current, { shouldDirty: true });
      }
      return;
    }
    // Switching to perPerson: save prior total
    const current = getValues('priceAmount');
    if (current !== undefined) {
      previousTotalRef.current = current;
    }
    // Never touch existing/saved lines when switching
    if (lines.length > 0) return;

    const suggested = suggestPricingLines({
      participants: going.length > 0 ? going : [{ classification: 'unspecified' }],
    });
    applyLines(suggested.map((s) => newLine(s)));
  };

  const updateLine = (index: number, change: Partial<DraftLine>) =>
    applyLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  // The breakdown as saved would be, once every rate has a price: what a suggestion starts from.
  const complete: RateLine[] | null = lines.every(
    (line) => line.unitAmount !== undefined && Number.isFinite(line.unitAmount),
  )
    ? (pricingFromDraft(lines).lines as RateLine[])
    : null;
  const priced = pricedFor({ lines });
  const hasPersonRates = lines.some((line) => lineType(line) === 'person');
  const suggestion: GoingSuggestion | null =
    perPerson && complete && goingCount > 0 ? priceForWhosGoing(complete, going) : null;
  // Said only when the count is off, or the rates would change for who is going; a legacy
  // breakdown that already counts everyone is left alone.
  const offerSuggestion = suggestion?.kind === 'proposal';
  // Changing the price of a booking saved as paid: Paid stays, and so it now covers this price.
  const paidPriceChanged =
    saved.isPaid &&
    saved.priceAmount !== undefined &&
    priceAmount !== undefined &&
    Number.isFinite(priceAmount) &&
    priceAmount !== saved.priceAmount;

  const breakdownSummary = !perPerson
    ? null
    : lines.some((line) => lineType(line) === 'group')
      ? priced > 0
        ? `group price, for ${priced} more`
        : 'group price'
      : `per person, for ${priced}`;
  const summary = [
    priceAmount !== undefined && Number.isFinite(priceAmount)
      ? formatMoney(priceAmount, currency)
      : null,
    breakdownSummary,
    estimate ? 'Estimate' : null,
    isPaid ? 'Paid' : null,
    refundable === null ? null : refundable ? 'Refundable' : 'Not refundable',
  ]
    .filter(Boolean)
    .join(' · ');

  const paidWarning = paidPriceChanged ? (
    <Text style={[type.caption, { color: c.attention }]}>
      Marked paid. The app keeps no record of the amount paid, so this new price will count as
      paid too. Paid stays as it is unless you change it.
    </Text>
  ) : null;

  return (
    <Disclosure
      title="Price & payment"
      summary={summary || 'Optional'}
      initiallyOpen={initiallyOpen}
      forceOpen={!!errors.priceAmount || !!errors.priceCurrency}>
      <ChoiceField
        value={perPerson ? 'perPerson' : 'total'}
        options={['total', 'perPerson'] as const}
        labelFor={(mode) => (mode === 'total' ? 'Total price' : 'Breakdown')}
        onChange={(mode) => mode && switchTo(mode)}
      />

      {perPerson ? (
        <View style={styles.rates}>
          {lines.map((line, index) => {
            const kind = lineType(line);
            const name = line.label.trim() || (kind === 'person' ? 'people' : TYPE_TITLE[kind]);
            return (
              <View key={line.key} style={[styles.rate, { borderColor: c.border }]}>
                <View style={styles.row}>
                  <Text style={[type.caption, styles.grow, { color: c.textMuted }]}>
                    {TYPE_TITLE[kind]}
                  </Text>
                  {lines.length > 1 ? (
                    <Pressable
                      onPress={() => applyLines(lines.filter((_, i) => i !== index))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the rate ${line.label.trim() || index + 1}`}
                      style={styles.remove}>
                      <Text style={[type.label, { color: c.danger }]}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                {kind === 'person' ? (
                  <Field label="For">
                    <ChoiceField
                      value={line.for ?? null}
                      options={AUDIENCES}
                      labelFor={(audience) => AUDIENCE_LABEL[audience]}
                      onChange={(audience) => updateLine(index, { for: audience ?? undefined })}
                      clearable
                    />
                  </Field>
                ) : null}
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Field label={kind === 'person' ? 'Rate, optional' : 'Name, optional'}>
                      <Input
                        value={line.label}
                        onChangeText={(label) => updateLine(index, { label })}
                        placeholder={
                          kind === 'person'
                            ? line.for
                              ? AUDIENCE_LABEL[line.for]
                              : index === 0
                                ? 'Adult'
                                : 'Child'
                            : PLACEHOLDER[kind]
                        }
                        maxLength={40}
                      />
                    </Field>
                  </View>
                  <View style={styles.amount}>
                    <Field label={kind === 'group' ? `Price, ${currency}` : `Each, ${currency}`}>
                      <AmountInput
                        value={line.unitAmount}
                        onChange={(unitAmount) => updateLine(index, { unitAmount })}
                        onBlur={() => undefined}
                        invalid={line.unitAmount !== undefined && !Number.isFinite(line.unitAmount)}
                      />
                    </Field>
                  </View>
                </View>
                {kind === 'group' ? null : (
                  <Stepper
                    value={line.quantity}
                    onChange={(quantity) => updateLine(index, { quantity })}
                    label={name}
                  />
                )}
              </View>
            );
          })}
          <View style={styles.adds}>
            <AddLine
              label="Add a rate"
              onPress={() => applyLines([...lines, newLine({ quantity: 1, unitAmount: undefined })])}
            />
            <AddLine
              label="Add a group price"
              onPress={() =>
                applyLines([...lines, newLine({ quantity: 1, unitAmount: undefined, group: true })])
              }
            />
            <AddLine
              label="Add an extra"
              onPress={() =>
                applyLines([...lines, newLine({ quantity: 1, unitAmount: undefined, extra: true })])
              }
            />
          </View>

          <View style={styles.total}>
            <Text style={[type.caption, { color: c.textMuted }]}>
              {estimate ? 'Estimated total' : 'Total'}
            </Text>
            <Text style={[type.display, { color: c.text }]}>
              {priceAmount !== undefined && Number.isFinite(priceAmount)
                ? formatMoney(priceAmount, currency)
                : '—'}
            </Text>
            {errors.priceAmount?.message ? (
              <Text style={[type.caption, { color: c.danger }]}>
                {errors.priceAmount.message}
              </Text>
            ) : null}
            {paidWarning}
            {/* Who is going may change after the price was set: say so, never re-price (C3). */}
            {goingCount > 0 && hasPersonRates && (priced !== goingCount || offerSuggestion) ? (
              // Stacked, not side by side: at a large font a row squeezes the words to one per line.
              <View>
                <Text style={[type.caption, { color: c.attention }]}>
                  {priced !== goingCount
                    ? `Priced for ${priced}; ${goingCount} ${goingCount === 1 ? 'is' : 'are'} going.`
                    : 'The rates do not match who is going.'}
                </Text>
                {suggestion ? (
                  <Pressable
                    onPress={() => setSuggesting((open) => !open)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: suggesting }}
                    style={styles.addRate}>
                    <Text style={[type.label, { color: c.accentText }]}>
                      Price for who's going
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {suggesting && suggestion && complete ? (
              <SuggestionPanel
                suggestion={suggestion}
                current={complete}
                currency={currency}
                paid={paid}
                onApply={(next) => applyLines(next.map((line) => newLine(line)))}
                onKeep={() => setSuggesting(false)}
              />
            ) : null}
          </View>

          <Controller
            control={control}
            name="priceCurrency"
            render={({ field }) => (
              <Field label="Currency" error={errors.priceCurrency?.message}>
                <View style={styles.currency}>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.priceCurrency}
                  />
                </View>
              </Field>
            )}
          />
        </View>
      ) : (
        <View style={styles.rates}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Controller
                control={control}
                name="priceAmount"
                render={({ field }) => (
                  <Field
                    label={estimate ? 'Estimated price' : 'Price'}
                    error={errors.priceAmount?.message}>
                    <AmountInput
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
                    <CurrencyInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!errors.priceCurrency}
                    />
                  </Field>
                )}
              />
            </View>
          </View>
          {paidWarning}
        </View>
      )}

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

      {priceAmount !== undefined && (
        // Not a second Controller: `details` already has one in TransportFields.
        <Field
          label="Refundable"
          hint="Optional. A cancelled booking that is not refundable still counts in the expenses">
          <ChoiceField
            value={refundable === null ? null : refundable ? 'yes' : 'no'}
            options={['yes', 'no'] as const}
            labelFor={(v) => (v === 'yes' ? 'Refundable' : 'Not refundable')}
            onChange={(next) => {
              const value = next === null ? null : next === 'yes';
              setValue('details', withRefundable(getValues('details'), value), {
                shouldDirty: true,
              });
            }}
            clearable
          />
        </Field>
      )}
    </Disclosure>
  );
}

function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.addRate, { opacity: pressed ? opacity.pressed : 1 }]}>
      <Icon name="add" size={18} color={c.accentText} />
      <Text style={[type.label, { color: c.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const AN_ANYONE_RATE = 'an Anyone rate';

/** Why there is no suggestion, in words: what to change so there can be one. */
function whyNot(suggestion: GoingSuggestion): string | null {
  switch (suggestion.kind) {
    case 'untagged':
      return "Set who each rate is for — Adult, Child or Anyone — to price for who's going.";
    case 'ambiguous':
      return `More than one rate is for ${AUDIENCE_LABEL[suggestion.audience]}. Keep one, to price for who's going.`;
    case 'unpriced': {
      const missing = [
        suggestion.adults > 0
          ? `${suggestion.adults} ${suggestion.adults === 1 ? 'adult' : 'adults'} (add an Adult rate or ${AN_ANYONE_RATE})`
          : null,
        suggestion.children > 0
          ? `${suggestion.children} ${suggestion.children === 1 ? 'child' : 'children'} (add a Child rate or ${AN_ANYONE_RATE})`
          : null,
        suggestion.unspecified > 0
          ? `${suggestion.unspecified} ${suggestion.unspecified === 1 ? 'person' : 'people'} not set as adult or child (add ${AN_ANYONE_RATE})`
          : null,
      ].filter(Boolean);
      return `No rate yet for ${missing.join(', ')}.`;
    }
    case 'overflow':
      return 'That total is too large to work out.';
    default:
      return null;
  }
}

/**
 * The suggestion beside what is there now: the old and new working and total, the rates it would
 * remove, and Apply — offered only on a booking not marked paid (3C, P-4).
 */
function SuggestionPanel({
  suggestion,
  current,
  currency,
  paid,
  onApply,
  onKeep,
}: {
  suggestion: GoingSuggestion;
  current: RateLine[];
  currency: string;
  paid: boolean;
  onApply: (lines: RateLine[]) => void;
  onKeep: () => void;
}) {
  const c = useColors();
  const reason = whyNot(suggestion);
  return (
    <View style={[styles.panel, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      {suggestion.kind === 'proposal' ? (
        <>
          <Text style={[type.caption, { color: c.textMuted }]}>Now</Text>
          <Text style={[type.body, { color: c.text }]}>
            {pricingText({ mode: 'perPerson', lines: current }, currency)}
          </Text>
          <Text style={[type.caption, { color: c.textMuted }]}>For who's going</Text>
          <Text style={[type.bodyStrong, { color: c.text }]}>
            {pricingText({ mode: 'perPerson', lines: suggestion.lines }, currency)}
          </Text>
          {suggestion.removed.length > 0 ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Removed, nobody going is on it:{' '}
              {suggestion.removed.map((line) => lineText(line, currency)).join(', ')}
            </Text>
          ) : null}
          {paid ? (
            <Text style={[type.caption, { color: c.attention }]}>
              This booking is marked Paid. The app does not record how much was paid, so a new
              total is not applied for you. Change the rates yourself if the price really changed.
            </Text>
          ) : (
            <View style={styles.actions}>
              <Button
                label={`Apply ${formatMoney(suggestion.total, currency)}`}
                onPress={() => onApply(suggestion.lines)}
                compact
              />
              <Button label="Keep current" variant="secondary" onPress={onKeep} compact />
            </View>
          )}
        </>
      ) : (
        <Text style={[type.caption, { color: c.text }]}>{reason}</Text>
      )}
    </View>
  );
}

/** − n + for a whole number of people, never below one. */
function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  /** What is counted, for a screen reader: 'Adult', 'people'. */
  label: string;
}) {
  const c = useColors();
  const step = (delta: 1 | -1, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(value + delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'One more' : 'One fewer'}, ${label}`}
      style={[styles.step, { borderColor: c.border, opacity: disabled ? opacity.disabled : 1 }]}>
      <Text style={[type.section, { color: c.accentText }]}>{delta > 0 ? '+' : '−'}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${value} ${label}`}>
      {step(-1, value <= 1)}
      <Text style={[type.figure, styles.count, { color: c.text }]}>{value}</Text>
      {step(1, false)}
    </View>
  );
}

const styles = StyleSheet.create({
  rates: { gap: spacing.md },
  rate: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  amount: { width: 130 },
  currency: { width: 110 },
  remove: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
  adds: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg },
  addRate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    alignSelf: 'flex-start',
  },
  total: { gap: 2 },
  panel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: touchTarget,
    height: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { minWidth: 28, textAlign: 'center' },
});
