import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { possibleDuplicates } from '../../domain/bookingPayments';
import type { ResourceInput } from '../../domain/resource';
import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from '../../domain/spending';
import { deviceToday } from '../../domain/trip';
import { DEFAULT_CURRENCY, type TripItem } from '../../domain/tripItem';
import { absoluteUriFor, deleteStoredFile } from '../../files/storage';
import { pickAndImport, type PickerKind } from '../resources/attach';
import { alertAttachError, alertIfSomeFailed } from '../resources/attachAlerts';
import { askAboutDuplicate } from '../payments/askAboutDuplicate';
import { PayerField } from '../payments/PayerField';
import { useExpenseContext } from './useExpenseContext';
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
  /** The trip's items: an expense matching a booking's price is offered as a link (3D-1). */
  bookings?: readonly TripItem[];
};

export function QuickExpenseSheet({
  visible,
  onClose,
  tripId,
  defaultCurrency = DEFAULT_CURRENCY,
  bookings = [],
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
  const [receipts, setReceipts] = useState<ResourceInput[]>([]);
  const [busyPicker, setBusyPicker] = useState<PickerKind | null>(null);
  // Not recorded unless picked; the last payer is offered, never chosen (§15 *8*, 3D-2).
  const [payerId, setPayerId] = useState<string | null>(null);
  const { data: context } = useExpenseContext(tripId);

  const [amountError, setAmountError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Track pending receipts so uncommitted files can be cleaned up if closed/unmounted
  const pendingReceiptsRef = useRef(receipts);
  pendingReceiptsRef.current = receipts;
  const savedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (savedRef.current) return;
      for (const receipt of pendingReceiptsRef.current) {
        if (receipt.kind === 'file') {
          deleteStoredFile(receipt.storedPath);
        }
      }
    };
  }, []);

  // Sync default currency when opened
  useEffect(() => {
    if (visible) {
      setCurrency(defaultCurrency);
      setSpentOn(deviceToday());
      setErrorMessage(null);
      setAmountError(null);
      setPayerId(null);
      savedRef.current = false;
    }
  }, [visible, defaultCurrency]);

  const discardUnsavedReceipts = () => {
    for (const receipt of receipts) {
      if (receipt.kind === 'file') {
        deleteStoredFile(receipt.storedPath);
      }
    }
    setReceipts([]);
    pendingReceiptsRef.current = [];
  };

  const resetFormFields = () => {
    setReceipts([]);
    pendingReceiptsRef.current = [];
    setAmount(undefined);
    setNotes('');
    setLabel('');
    setPayerId(null);
    setShowMore(false);
    setAmountError(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    if (submitting) return;
    discardUnsavedReceipts();
    resetFormFields();
    onClose();
  };

  const removeReceipt = (index: number) => {
    const receipt = receipts[index];
    const updated = receipts.filter((_, i) => i !== index);
    setReceipts(updated);
    pendingReceiptsRef.current = updated;
    if (receipt && receipt.kind === 'file') {
      deleteStoredFile(receipt.storedPath);
    }
  };

  const handlePick = async (kind: PickerKind) => {
    setBusyPicker(kind);
    try {
      const { inputs, failed } = await pickAndImport(kind);
      if (inputs.length > 0) {
        setReceipts((prev) => {
          const updated = [...prev, ...inputs];
          pendingReceiptsRef.current = updated;
          return updated;
        });
      }
      alertIfSomeFailed(inputs.length, failed);
    } catch (error) {
      alertAttachError(error);
    } finally {
      setBusyPicker(null);
    }
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

    // Never merged by itself: the person decides (§15 *10*).
    let tripItemId: string | null = null;
    const [duplicate] = possibleDuplicates({ amount, currency: validCurrency }, bookings);
    if (duplicate) {
      const choice = await askAboutDuplicate(duplicate.title);
      if (choice === 'back') return;
      if (choice === 'link') tripItemId = duplicate.id;
    }

    setSubmitting(true);
    setErrorMessage(null);
    savedRef.current = true;

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
          payerId,
          tripItemId,
        },
        receipts,
      );
      resetFormFields();
      onClose();
    } catch (error) {
      savedRef.current = false;
      setErrorMessage(error instanceof Error ? error.message : 'Could not save expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} title="Add expense" onClose={handleClose} scroll={false}>
      <ScrollView
        style={styles.scroll}
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

        {context && context.travellers.length > 0 ? (
          <PayerField
            value={payerId}
            onChange={setPayerId}
            travellers={context.travellers}
            lastPayerId={context.lastPayerId}
          />
        ) : null}

        <Field label="Note" hint="Optional description or place">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Lunch at bistro"
          />
        </Field>

        {/* Receipt Photos */}
        <View style={styles.receiptSection}>
          <View style={styles.receiptHeader}>
            <Text style={[type.label, { color: c.textMuted }]}>Receipt (optional)</Text>
            {receipts.length > 0 ? (
              <Text style={[type.caption, { color: c.textMuted }]}>
                {receipts.length} photo{receipts.length === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>

          {receipts.length > 0 ? (
            <View style={styles.receiptList}>
              {receipts.map((receipt, index) => {
                const uri = receipt.kind === 'file' ? absoluteUriFor(receipt.storedPath) : null;
                return (
                  <View
                    key={index}
                    style={[
                      styles.receiptCard,
                      { backgroundColor: c.surface, borderColor: c.border },
                    ]}>
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={styles.receiptThumb}
                        resizeMode="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={[styles.receiptThumbPlaceholder, { backgroundColor: c.accentSoft }]}>
                        <Icon name="receipt" size={20} color={c.accentText} />
                      </View>
                    )}
                    <Text
                      style={[type.body, styles.receiptLabel, { color: c.text }]}
                      numberOfLines={1}>
                      {receipt.label}
                    </Text>
                    <Pressable
                      onPress={() => removeReceipt(index)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${receipt.label}`}
                      style={styles.removeBtn}>
                      <Icon name="close" size={18} color={c.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.photoActions}>
            <View style={styles.actionCol}>
              <Button
                label="Take photo"
                variant="secondary"
                compact
                busy={busyPicker === 'camera'}
                disabled={busyPicker !== null || submitting}
                onPress={() => void handlePick('camera')}
              />
            </View>
            <View style={styles.actionCol}>
              <Button
                label="Choose photo"
                variant="secondary"
                compact
                busy={busyPicker === 'photo'}
                disabled={busyPicker !== null || submitting}
                onPress={() => void handlePick('photo')}
              />
            </View>
          </View>
        </View>

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
  scroll: {
    maxHeight: 520,
  },
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
  receiptSection: {
    gap: spacing.sm,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptList: {
    gap: spacing.xs,
  },
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  receiptThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  receiptThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptLabel: {
    flex: 1,
  },
  removeBtn: {
    padding: spacing.xs,
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCol: {
    flex: 1,
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
