import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { convertAmount, rateText, rateTextSchema, type ExchangeRate } from '../../../src/domain/conversion';
import { CURRENCY_CODE } from '../../../src/domain/currencies';
import { formatMoney, formatShortDate } from '../../../src/domain/format';
import { deviceToday } from '../../../src/domain/trip';
import { currenciesToConvert } from '../../../src/domain/tripConversion';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { CONVERSION_TABLES, conversionInput, saveCurrencySettings } from '../../../src/repositories/rates';
import { getTrip } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { ChoiceField } from '../../../src/ui/components/ChoiceField';
import { Field, Input } from '../../../src/ui/components/Field';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { CurrencyInput } from '../../../src/ui/components/MoneyInputs';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

const NONE = 'none';

/**
 * Converting a trip to one currency (Phase 4, `docs/phase4-plan.md` §6): the reporting currency,
 * and a rate typed in for each other currency the trip uses. Nothing recorded is changed: the
 * expected total gains one converted line, worked out from these each time.
 */
export default function CurrencyRates() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const [trip, input] = await Promise.all([getTrip(database, tripId), conversionInput(database, tripId)]);
        return trip ? { trip, input } : null;
      },
      [tripId],
    ),
    CONVERSION_TABLES,
    [tripId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen
        title="Currencies"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={query.refetch}
      />
    );
  }
  // Keyed by what was saved: a save elsewhere starts the form again from the stored values.
  return (
    <RatesForm
      key={`${data.trip.reportCurrency}|${data.input.rates.map((r) => `${r.currency}${r.rate}${r.baseCurrency}`).join()}`}
      tripId={tripId}
      tripName={data.trip.name}
      savedBase={data.trip.reportCurrency}
      saved={data.input.rates}
      costs={data.input}
    />
  );
}

type FormProps = {
  tripId: string;
  tripName: string;
  savedBase: string | null;
  saved: readonly ExchangeRate[];
  costs: Parameters<typeof currenciesToConvert>[0];
};

function RatesForm({ tripId, tripName, savedBase, saved, costs }: FormProps) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [base, setBase] = useState<string | null>(savedBase);
  const [other, setOther] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Every rate is a pair (review P1): this currency's rate to the chosen base, if one was saved.
  const savedFor = (currency: string) =>
    saved.find((rate) => rate.currency === currency && rate.baseCurrency === base) ?? null;
  const textFor = (currency: string) => drafts[currency] ?? savedFor(currency)?.rate ?? '';
  // Rates to other reporting currencies: kept, never changed here, used again on switching back.
  const kept = base ? saved.filter((rate) => rate.baseCurrency !== base) : [];

  const used = currenciesToConvert(costs, null);
  // Alphabetical, so a chip stays where it was after a save.
  const baseOptions = [...new Set([...(savedBase ? [savedBase] : []), ...used.map((line) => line.currency)])].sort();
  const covered = new Map(currenciesToConvert(costs, base).map((line) => [line.currency, line.amount]));
  // Every other currency the trip uses, and any with a saved rate, so a rate can be removed.
  const rows = base
    ? [...new Set([...covered.keys(), ...saved.filter((rate) => rate.baseCurrency === base).map((rate) => rate.currency)])]
        .filter((currency) => currency !== base)
    : [];

  const chooseBase = (next: string | null) => {
    setBase(next);
    setDrafts({});
  };

  const save = async () => {
    // A blank field removes a rate set against this base; one set for another base is left alone.
    const rates = rows
      .filter((currency) => textFor(currency).trim() !== '' || savedFor(currency) !== null)
      .map((currency) => ({ currency, rate: textFor(currency) }));
    setSaving(true);
    try {
      await saveCurrencySettings(db, tripId, { reportCurrency: base, rates, today: deviceToday() });
      router.back();
    } catch (error) {
      Alert.alert('Not saved', error instanceof Error ? error.message : 'Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Currencies" subtitle={tripName} />
      <FormScroll footer={<Button label="Save" busy={saving} onPress={save} />}>
        <Text style={[type.body, { color: c.text }]}>
          Show the trip&apos;s cost in one currency as well. Every amount stays as it was recorded; the converted
          total is an estimate at the rates below, except where you enter what a payment actually cost.
        </Text>

        <Field label="Reporting currency">
          <ChoiceField
            value={base ?? NONE}
            options={[NONE, ...baseOptions, ...(base && !baseOptions.includes(base) ? [base] : [])]}
            labelFor={(option) => (option === NONE ? "Don't convert" : option)}
            onChange={(next) => chooseBase(next === NONE || next === null ? null : next)}
          />
        </Field>
        <Field label="Or another currency" hint="Three letters, like EUR">
          <CurrencyInput
            value={other}
            onChange={(next) => {
              setOther(next ?? '');
              if (next && CURRENCY_CODE.test(next)) chooseBase(next);
            }}
            onBlur={() => undefined}
            invalid={false}
            placeholder="Code"
          />
        </Field>

        {base ? (
          <View style={styles.rates}>
            <SectionLabel>{`Rates to ${base}`}</SectionLabel>
            {rows.length === 0 ? (
              <Text style={[type.body, { color: c.textMuted }]}>
                Everything on this trip is in {base}: nothing to convert.
              </Text>
            ) : (
              rows.map((currency) => {
                const text = textFor(currency);
                const parsed = rateTextSchema.safeParse(text);
                const amount = covered.get(currency);
                const pair = savedFor(currency);
                const unchanged = pair && pair.rate === text.trim();
                const hint = [
                  amount !== undefined
                    ? parsed.success
                      ? `${formatMoney(amount, currency)} ≈ ${formatMoney(convertAmount(amount, parsed.data, base), base)}`
                      : `${formatMoney(amount, currency)} on this trip`
                    : 'Not used on this trip any more: clear it to remove it',
                  unchanged ? `set ${formatShortDate(pair.rateDate)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Field
                    key={currency}
                    label={`1 ${currency} = … ${base}`}
                    hint={hint}
                    error={text.trim() !== '' && !parsed.success ? parsed.error.issues[0]?.message : undefined}>
                    <Input
                      value={text}
                      onChangeText={(next) => setDrafts((all) => ({ ...all, [currency]: next }))}
                      keyboardType="decimal-pad"
                      placeholder="No rate"
                      invalid={text.trim() !== '' && !parsed.success}
                      accessibilityLabel={`Rate from ${currency} to ${base}`}
                    />
                  </Field>
                );
              })
            )}
            <Text style={[type.caption, { color: c.textMuted }]}>
              A currency without a rate is left out of the converted total and named beside it, never guessed.
            </Text>
            {kept.length > 0 ? (
              <Text style={[type.caption, { color: c.textMuted }]}>
                Kept for other reporting currencies, not used with {base}:{' '}
                {kept.map((rate) => `${rateText(rate)} (${formatShortDate(rate.rateDate)})`).join(', ')}.
              </Text>
            ) : null}
          </View>
        ) : null}
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rates: { gap: spacing.lg },
});
