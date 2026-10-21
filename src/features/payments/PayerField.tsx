import { Pressable, StyleSheet, Text } from 'react-native';

import type { Traveller } from '../../domain/traveller';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field } from '../../ui/components/Field';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  value: string | null;
  onChange: (payerId: string | null) => void;
  /** The trip's members. */
  travellers: readonly Traveller[];
  /** Offered as one tap, never preselected (`phase3-plan.md` §15 *8*). */
  lastPayerId: string | null;
  error?: string;
};

/**
 * Who paid (3D-1). *Not recorded* until someone is picked — tapping the picked name clears it —
 * and never filled in by itself: the last payer is offered, not chosen.
 */
export function PayerField({ value, onChange, travellers, lastPayerId, error }: Props) {
  const c = useColors();
  const names = new Map(travellers.map((traveller) => [traveller.id, traveller.name]));
  const suggestion = lastPayerId && names.has(lastPayerId) && value !== lastPayerId ? lastPayerId : null;

  return (
    <Field label="Paid by" hint={value ? undefined : 'Not recorded'} error={error}>
      <ChoiceField
        value={value}
        options={travellers.map((traveller) => traveller.id)}
        labelFor={(id) => names.get(id) ?? id}
        onChange={onChange}
        clearable
      />
      {suggestion ? (
        <Pressable
          onPress={() => onChange(suggestion)}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.suggestion,
            { borderColor: c.border, opacity: pressed ? opacity.pressed : 1 },
          ]}>
          <Text style={[type.caption, { color: c.accentText }]}>
            {names.get(suggestion)} paid last — use
          </Text>
        </Pressable>
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  suggestion: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
});
