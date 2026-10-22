import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type DefaultValues } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  balancesHeading,
  netText,
  previewSettlement,
  settlementInputSchema,
  settlementRefusal,
  type BalanceInput,
  type CurrencyBalances,
  type SettlementFormValues,
  type SettlementInput,
} from '../../domain/balances';
import type { Member } from '../../domain/costShares';
import { formatMoney } from '../../domain/format';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { Notice } from '../../ui/components/Notice';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  /** The trip's balances as they are now: what the preview and the rules are worked from. */
  balances: BalanceInput;
  members: readonly Member[];
  defaultValues: DefaultValues<SettlementFormValues>;
  /** When editing: the settlement's own id, so its old values are left out of the preview. */
  editingId?: string;
  submitLabel: string;
  onSubmit: (input: SettlementInput) => Promise<void>;
  secondaryActions?: ReactNode;
};

/** The balances in one currency as lines: who, and where they would stand. */
export function resultLines(after: CurrencyBalances, members: readonly Member[]): string[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  return after.people.map((row) => {
    const member = byId.get(row.travellerId);
    return `${member?.name ?? 'Someone'} ${netText(row, after.currency, after.state, member?.classification === 'child')}`;
  });
}

/**
 * A settlement (3E, `docs/phase3e-plan.md` §7): who gave whom how much, in which currency, when.
 * Below the fields, the balances as they would be once it is saved — under *Balances so far* when
 * a cost in that currency waits. Saving more than was owed, or in a currency with no costs, asks
 * first with that result; leaving a child owing is refused, here and again by the repository.
 */
export function SettlementForm({
  balances,
  members,
  defaultValues,
  editingId,
  submitLabel,
  onSubmit,
  secondaryActions,
}: Props) {
  const c = useColors();
  const names = new Map(members.map((member) => [member.id, member.name]));
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettlementFormValues, unknown, SettlementInput>({
    resolver: zodResolver(settlementInputSchema),
    defaultValues,
    mode: 'onBlur',
  });
  const [fromId, toId, amount, currency] = useWatch({ control, name: ['fromId', 'toId', 'amount', 'currency'] });

  const draft = useMemo(() => {
    if (!fromId || !toId || fromId === toId) return null;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return null;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
    return { fromId, toId, amount, currency };
  }, [fromId, toId, amount, currency]);
  const refusal = useMemo(
    () => (draft ? settlementRefusal(balances, draft, editingId) : null),
    [balances, draft, editingId],
  );
  const preview = useMemo(
    () => (draft && !refusal ? previewSettlement(balances, draft, editingId) : null),
    [balances, draft, editingId, refusal],
  );

  const save = handleSubmit(async (values) => {
    const result = previewSettlement(balances, values, editingId);
    const warnings = [
      result.noCosts
        ? `There are no ${values.currency} costs in the balances. This settlement will show on its own, and nothing will be suggested in ${values.currency}.`
        : null,
      !result.noCosts && result.overBy > 0 && result.after.state === 'final'
        ? `That is ${formatMoney(result.overBy, values.currency)} more than ${names.get(values.fromId)} owes ${names.get(values.toId)}.`
        : null,
    ].filter((line): line is string => line !== null);
    if (warnings.length === 0) return onSubmit(values);
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Save this settlement?',
        [...warnings, '', `${balancesHeading(result.after)}:`, ...resultLines(result.after, members)].join('\n'),
        [
          { text: 'Go back', style: 'cancel', onPress: () => resolve() },
          { text: 'Save anyway', onPress: () => void onSubmit(values).finally(resolve) },
        ],
        { cancelable: true, onDismiss: () => resolve() },
      );
    });
  });

  const memberIds = members.map((member) => member.id);
  return (
    <FormScroll footer={<Button label={submitLabel} busy={isSubmitting} disabled={!!refusal} onPress={save} />}>
      <Controller
        control={control}
        name="fromId"
        render={({ field }) => (
          <Field label="From — who paid" error={errors.fromId?.message}>
            <ChoiceField
              value={field.value || null}
              options={memberIds}
              labelFor={(id) => names.get(id) ?? id}
              onChange={(id) => field.onChange(id ?? '')}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="toId"
        render={({ field }) => (
          <Field label="To — who received it" error={errors.toId?.message}>
            <ChoiceField
              value={field.value || null}
              options={memberIds}
              labelFor={(id) => names.get(id) ?? id}
              onChange={(id) => field.onChange(id ?? '')}
            />
          </Field>
        )}
      />

      <View style={styles.row}>
        <View style={styles.grow}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Field label="Amount" error={errors.amount?.message}>
                <AmountInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.amount}
                  autoFocus={defaultValues.amount === undefined}
                />
              </Field>
            )}
          />
        </View>
        <View style={styles.currency}>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Field label="Currency" error={errors.currency?.message}>
                <CurrencyInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.currency}
                />
              </Field>
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="settledOn"
        render={({ field }) => (
          <Field label="Date" error={errors.settledOn?.message}>
            <DateField value={field.value ?? ''} onChange={field.onChange} invalid={!!errors.settledOn} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="note"
        render={({ field }) => (
          <Field label="Note" error={errors.note?.message} hint="Optional">
            <Input value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Bank transfer" />
          </Field>
        )}
      />

      {refusal ? <Notice title="This cannot be saved">{refusal}</Notice> : null}
      {preview ? (
        <View style={styles.preview} accessibilityLabel="After saving">
          <Text style={[type.label, { color: c.text }]}>After saving · {balancesHeading(preview.after)}</Text>
          {resultLines(preview.after, members).map((line) => (
            <Text key={line} style={[type.caption, { color: c.textMuted }]}>
              {line}
            </Text>
          ))}
          {preview.noCosts ? (
            <Text style={[type.caption, { color: c.attention }]}>
              No {preview.after.currency} costs are in the balances: nothing is suggested in {preview.after.currency}.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[type.caption, { color: c.textMuted }]}>
        Money between travellers squares up what they owe each other. It is not a cost: the trip total and
        what each booking has paid stay as they are.
      </Text>

      {secondaryActions}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1 },
  currency: { width: 110 },
  preview: { gap: spacing.xs },
});
