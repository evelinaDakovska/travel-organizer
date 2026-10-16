import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from '../../domain/spending';
import { deviceToday } from '../../domain/trip';
import { DEFAULT_CURRENCY } from '../../domain/tripItem';
import { createExpense } from '../../repositories/expenses';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { Icon } from '../../ui/components/Icon';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { Sheet } from '../../ui/components/Sheet';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  defaultCurrency?: string;
};

export function QuickExpenseSheet({
  visible,
  onClose,
  tripId,
  defaultCurrency = DEFAULT_CURRENCY,
}: Props) {
  const c = useColors();
  const db = useSQLiteContext();

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [notes, setNotes] = useState('');
  const [label, setLabel] = useState('');
  const [spentOn, setSpentOn] = useState(() => deviceToday());
  const [showMore, setShowMore] = useState(false);

  const [amountError, setAmountError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync default currency when opened
  useEffect(() => {
    if (visible) {
      setCurrency(defaultCurrency);
      setSpentOn(deviceToday());
      setErrorMessage(null);
      setAmountError(null);
    }
  }, [visible, defaultCurrency]);

  const resetForm = () => {
    setAmount(undefined);
    setNotes('');
    setLabel('');
    setShowMore(false);
    setAmountError(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    if (submitting) return;

    if (amount === undefined || Number.isNaN(amount) || amount <= 0) {
      setAmountError('Enter an amount above zero');
      return;
    }
    setAmountError(null);

    const validCurrency = currency?.trim().toUpperCase();
    if (!validCurrency || validCurrency.length !== 3) {
      setErrorMessage('Use a 3-letter currency code like EUR');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await createExpense(
        db,
        tripId,
        {
          category,
          amount,
          currency: validCurrency,
          spentOn,
          label: label.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        [],
      );
      resetForm();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} title="Add expense" onClose={handleClose}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {errorMessage ? (
          <View style={[styles.errorBox, { backgroundColor: c.dangerSoft, borderColor: c.danger }]}>
            <Text style={[type.caption, { color: c.danger }]}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.moneyRow}>
          <View style={styles.grow}>
            <Field label="Amount" error={amountError ?? undefined}>
              <AmountInput
                value={amount}
                onChange={(next) => {
                  setAmount(next);
                  if (amountError) setAmountError(null);
                }}
                onBlur={() => {}}
                invalid={!!amountError}
                autoFocus
              />
            </Field>
          </View>

          <View style={styles.currency}>
            <Field label="Currency">
              <CurrencyInput
                value={currency}
                onChange={(next) => setCurrency(next ?? DEFAULT_CURRENCY)}
                onBlur={() => {}}
                invalid={false}
              />
            </Field>
          </View>
        </View>

        <Field label="Category">
          <ChoiceField
            value={category}
            options={EXPENSE_CATEGORIES}
            labelFor={categoryLabel}
            onChange={(next) => next && setCategory(next)}
          />
        </Field>

        <Field label="Note" hint="Optional description or place">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Lunch at bistro"
          />
        </Field>

        {!showMore ? (
          <Pressable
            onPress={() => setShowMore(true)}
            style={styles.moreToggle}
            accessibilityRole="button"
            accessibilityLabel="Show more fields">
            <Icon name="more" size={16} color={c.accentText} />
            <Text style={[type.label, { color: c.accentText }]}>More details (date, label)</Text>
          </Pressable>
        ) : (
          <View style={styles.moreSection}>
            <Field label="Date">
              <DateField value={spentOn} onChange={setSpentOn} invalid={false} />
            </Field>

            <Field label="Specific label" hint="Optional short title">
              <Input
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Taxi to hotel"
              />
            </Field>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Button
            label="Save expense"
            busy={submitting}
            onPress={handleSave}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  grow: {
    flex: 1,
  },
  currency: {
    width: 100,
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  moreSection: {
    gap: spacing.md,
  },
  buttonRow: {
    marginTop: spacing.sm,
  },
});
