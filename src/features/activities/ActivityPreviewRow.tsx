import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PreviewRow } from '../../domain/activityImport';
import { formatMoney, formatShortMoment } from '../../domain/format';
import { localPrecision } from '../../domain/time';
import { kindLabel, routeLabel, subkindLabel, type TransportDetails } from '../../domain/tripItem';
import { CheckBox } from '../../ui/components/CheckBox';
import { KindTile } from '../../ui/components/KindTile';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  row: PreviewRow;
  selected: boolean;
  onToggle: (index: number) => void;
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** 'Sat 21 Nov, 13:00–16:00'; nothing when the file gave no date. */
function whenText(row: PreviewRow): string | null {
  const start = row.input?.start;
  if (!start) return null;
  const precision = localPrecision(start.local) ?? 'date';
  let text = formatShortMoment(start.local, precision);
  const end = row.input?.end;
  if (end) {
    const sameDay = end.local.slice(0, 10) === start.local.slice(0, 10);
    const endPrecision = localPrecision(end.local) ?? 'date';
    text += sameDay && endPrecision === 'time' ? `–${end.local.slice(11, 16)}` : ` → ${formatShortMoment(end.local, endPrecision)}`;
  }
  return text;
}

/**
 * One entry of an activities file in the import preview: what it is, when and where, and every
 * reason it may not be wanted — invalid (cannot be ticked), a possible duplicate, a warning, the
 * fields left out. The whole row toggles, not only the box.
 */
export const ActivityPreviewRow = memo(function ActivityPreviewRow({ row, selected, onToggle }: Props) {
  const c = useColors();
  const input = row.input;
  const valid = input !== null;

  const status = input
    ? input.status === 'confirmed'
      ? 'Planned'
      : ['Idea', input.priority ? capitalise(input.priority) : null].filter(Boolean).join(' · ')
    : null;
  const kind = input ? (input.subkind ? subkindLabel(input.subkind) : kindLabel(input.kind)) : null;
  const detail = [kind, status, whenText(row)].filter(Boolean).join(' · ');
  const route = input?.kind === 'transport' ? routeLabel((input.details ?? null) as TransportDetails | null) : null;
  const where = route ?? [input?.locationName, input?.address].filter(Boolean).join(', ');
  const price =
    input?.priceAmount !== undefined && input.priceCurrency
      ? formatMoney(input.priceAmount, input.priceCurrency)
      : null;
  const links = row.links.length;
  const linksText = links > 0 ? `${links} ${links === 1 ? 'link' : 'links'}` : null;
  const ignoredText =
    row.ignored.length > 0
      ? `Not imported: ${row.ignored.map((field) => `${field.field} (${field.reason})`).join('; ')}`
      : null;
  const duplicateText = row.duplicate ? `Possible duplicate — ${row.duplicate.reason}` : null;
  // The row is one element to a screen reader, so its label says everything the row shows —
  // above all why an entry cannot be added.
  const label = [
    row.title,
    valid ? null : 'Invalid, cannot be added',
    detail,
    where,
    price,
    linksText,
    ...row.errors,
    duplicateText,
    ...row.warnings,
    ignoredText,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={valid ? () => onToggle(row.index) : undefined}
      disabled={!valid}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !valid }}
      accessibilityLabel={label}
      style={styles.row}>
      {valid ? (
        // Visual and a tap target only: the row itself is the checkbox a screen reader announces.
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <CheckBox
            checked={selected}
            onToggle={() => onToggle(row.index)}
            accessibilityLabel={`Add ${row.title}`}
          />
        </View>
      ) : (
        <View style={styles.boxSpace} />
      )}
      <View style={styles.body}>
        {/* Only what describes the entry is dimmed; the reasons it cannot be added stay legible. */}
        <View style={[styles.head, !valid && styles.dimmed]}>
          {input ? <KindTile kind={input.kind} subkind={input.subkind ?? null} size={32} /> : null}
          <View style={styles.text}>
            <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={3}>
              {row.title}
            </Text>
            {detail ? (
              <Text style={[type.caption, { color: c.textMuted }]}>{detail}</Text>
            ) : null}
            {where ? (
              <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={2}>
                {where}
              </Text>
            ) : null}
            {price || links > 0 ? (
              <Text style={[type.caption, { color: c.textMuted }]}>
                {[price, linksText].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
        {row.errors.map((error) => (
          <Text key={error} style={[type.caption, { color: c.danger }]}>
            {error}
          </Text>
        ))}
        {duplicateText ? (
          <Text style={[type.caption, { color: c.attention }]}>{duplicateText}</Text>
        ) : null}
        {row.warnings.map((warning) => (
          <Text key={warning} style={[type.caption, { color: c.attention }]}>
            {warning}
          </Text>
        ))}
        {ignoredText ? (
          <Text style={[type.caption, { color: c.textMuted }]}>{ignoredText}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.sm },
  boxSpace: { width: 48 },
  body: { flex: 1, minWidth: 0, gap: spacing.xs, paddingTop: spacing.sm },
  head: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  dimmed: { opacity: 0.6 },
});
