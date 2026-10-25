import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CLASSIFICATION_LABELS,
  namesakeOf,
  travellerLabel,
  travellerNameSchema,
  type Traveller,
  type TravellerClassification,
} from '../../domain/traveller';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Field, Input } from '../../ui/components/Field';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/components/Sheet';
import { Tag } from '../../ui/components/Tag';
import { confirmNamesake } from './confirmNamesake';
import { radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

export type TravellerPickerProps = {
  profiles: readonly Traveller[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  onAddNewProfile: (name: string, classification: TravellerClassification) => Promise<string>;
  legacyNames?: readonly string[];
  /** The profile that is the person using the app, shown as *Evelina (Me)* (2B-0). */
  meId?: string | null;
  /**
   * Saved profiles not offered above — people not on this trip yet. The add sheet lists them, so
   * someone already saved is linked rather than created twice.
   */
  existingToAdd?: readonly Traveller[];
  onAddExisting?: (id: string) => Promise<void>;
  /** A line under a profile's name, telling two of the same name apart (QA O-09). */
  hintFor?: (profile: Traveller) => string | undefined;
};

const CLASSIFICATION_OPTIONS: readonly { value: TravellerClassification; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'unspecified', label: 'Not specified' },
];

export function TravellerPicker({
  profiles,
  selectedIds,
  onChange,
  onAddNewProfile,
  legacyNames = [],
  meId = null,
  existingToAdd = [],
  onAddExisting,
  hintFor,
}: TravellerPickerProps) {
  const c = useColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [classification, setClassification] = useState<TravellerClassification>('unspecified');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedSet = new Set(selectedIds);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleAddExisting = async (id: string) => {
    if (!onAddExisting) return;
    setSaving(true);
    try {
      await onAddExisting(id);
      if (!selectedSet.has(id)) onChange([...selectedIds, id]);
      setSheetOpen(false);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Could not add this traveller');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNew = async () => {
    const trimmed = name.trim();
    const result = travellerNameSchema.safeParse(trimmed);
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Name is required');
      return;
    }

    // The sheet sits above the list, so the saved namesake may be out of sight (QA D-02).
    const namesake = namesakeOf(trimmed, [...profiles, ...existingToAdd]);
    if (namesake && !(await confirmNamesake(namesake.name))) return;

    setSaving(true);
    try {
      const newId = await onAddNewProfile(trimmed, classification);
      onChange([...selectedIds, newId]);
      setName('');
      setClassification('unspecified');
      setNameError(null);
      setSheetOpen(false);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Could not create profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {legacyNames.length > 0 ? (
        <View style={[styles.legacyBox, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.label, { color: c.textMuted }]}>Legacy travellers on this trip</Text>
          <Text style={[type.body, { color: c.text }]}>{legacyNames.join(', ')}</Text>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Recorded before traveller profiles. Preserved without conversion.
          </Text>
        </View>
      ) : null}

      {profiles.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.body, { color: c.textMuted }]}>
            No saved traveller profiles yet. Add people you travel with to select them for this and future trips.
          </Text>
          <Button
            label="Add new traveller"
            variant="secondary"
            onPress={() => {
              setName('');
              setNameError(null);
              setSheetOpen(true);
            }}
          />
        </View>
      ) : (
        <View style={styles.profileList}>
          {profiles.map((profile) => {
            const isSelected = selectedSet.has(profile.id);
            const classLabel = CLASSIFICATION_LABELS[profile.classification];
            const label = travellerLabel(profile, meId);
            const hint = hintFor?.(profile);
            return (
              <Pressable
                key={profile.id}
                onPress={() => toggle(profile.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={[label, classLabel, hint].filter(Boolean).join(', ')}
                style={({ pressed }) => [
                  styles.profileRow,
                  { borderColor: isSelected ? c.accent : c.border },
                  pressed && { backgroundColor: c.surfaceSunken },
                ]}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isSelected ? c.accent : c.border,
                      backgroundColor: isSelected ? c.accent : 'transparent',
                    },
                  ]}>
                  {/* onAccent, as CheckBox: accentText on an accent fill was invisible. */}
                  {isSelected ? (
                    <Icon name="check" size={16} color={c.onAccent} strokeWidth={3} />
                  ) : null}
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[type.heading, { color: c.text }]} numberOfLines={2}>
                    {label}
                  </Text>
                  {hint ? (
                    <Text style={[type.caption, { color: c.textMuted }]}>{hint}</Text>
                  ) : null}
                </View>
                <Tag label={classLabel} tone="neutral" />
              </Pressable>
            );
          })}

          <View style={styles.addActionRow}>
            <Button
              label="+ Add new traveller"
              variant="secondary"
              onPress={() => {
                setName('');
                setNameError(null);
                setSheetOpen(true);
              }}
            />
          </View>
        </View>
      )}

      <Sheet
        visible={sheetOpen}
        title="Add traveller"
        onClose={() => {
          if (!saving) {
            setSheetOpen(false);
            setNameError(null);
          }
        }}>
        <View style={styles.sheetContent}>
          {existingToAdd.length > 0 && onAddExisting ? (
            <View style={styles.existing}>
              <Text style={[type.label, { color: c.textMuted }]}>Already saved</Text>
              {existingToAdd.map((profile) => {
                const label = travellerLabel(profile, meId);
                return (
                  <Pressable
                    key={profile.id}
                    disabled={saving}
                    onPress={() => void handleAddExisting(profile.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${label}`}
                    style={({ pressed }) => [
                      styles.profileRow,
                      { borderColor: c.border },
                      pressed && { backgroundColor: c.surfaceSunken },
                    ]}>
                    <Icon name="add" size={18} color={c.accentText} />
                    <View style={styles.profileInfo}>
                      <Text style={[type.heading, { color: c.text }]} numberOfLines={2}>
                        {label}
                      </Text>
                    </View>
                    <Tag label={CLASSIFICATION_LABELS[profile.classification]} tone="neutral" />
                  </Pressable>
                );
              })}
              <Text style={[type.label, { color: c.textMuted }]}>Or someone new</Text>
            </View>
          ) : null}
          <Field label="Name" error={nameError ?? undefined}>
            <Input
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Maria"
              autoFocus
            />
          </Field>

          <Field label="Classification" hint="Used for pricing and ticket defaults">
            <ChoiceField
              value={classification}
              options={CLASSIFICATION_OPTIONS.map((o) => o.value)}
              labelFor={(val) => CLASSIFICATION_LABELS[val]}
              onChange={(next) => next && setClassification(next)}
            />
          </Field>

          <Button
            label="Save traveller"
            busy={saving}
            onPress={handleSaveNew}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  legacyBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  emptyBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  profileList: { gap: spacing.sm },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1 },
  addActionRow: { marginTop: spacing.xs },
  sheetContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  existing: { gap: spacing.sm },
});
