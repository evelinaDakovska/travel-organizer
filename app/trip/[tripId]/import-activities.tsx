import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { parseActivityFile } from '../../../src/domain/activityFormat';
import {
  buildImportPreview,
  previewCounts,
  selectedRows,
  selectionNotices,
  type ImportPreview,
} from '../../../src/domain/activityImport';
import { AI_INSTRUCTIONS } from '../../../src/domain/activityTemplate';
import { countOf, formatDateRange } from '../../../src/domain/format';
import type { TripItem } from '../../../src/domain/tripItem';
import { ActivityPreviewRow } from '../../../src/features/activities/ActivityPreviewRow';
import { pickActivityFile, shareActivitySchema } from '../../../src/files/activityFiles';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { askForRemindersIfAnyDue } from '../../../src/notifications/reminders';
import { importActivities } from '../../../src/repositories/activityImport';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { Rows } from '../../../src/ui/components/ListRow';
import { Notice } from '../../../src/ui/components/Notice';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

type Step =
  | { kind: 'start'; refused?: string; failed?: string }
  | { kind: 'checking' }
  | { kind: 'preview'; fileName: string; preview: ImportPreview }
  | { kind: 'done'; ids: string[]; ideas: number; plans: number; notAdded: number };

/**
 * Import activities (2C): a file in the public activities format — typically written by an AI
 * assistant — added to this trip. Nothing is written until the person has seen every entry and
 * ticked what they want; then the ticked ones go in together or not at all. Add-only: nothing
 * already in the trip is changed. One screen whose content moves through the steps.
 */
export default function ImportActivitiesScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [busy, run] = useBusy();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const trip = tripQuery.data;

  const toggle = useCallback((index: number) => {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const view = queryView(tripQuery);
  if (view !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Import activities"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  const pick = async () => {
    // Dismissing the picker leaves the screen as it was — a preview included.
    const before = step;
    setStep({ kind: 'checking' });
    try {
      const picked = await pickActivityFile();
      if (!picked) return setStep(before.kind === 'checking' ? { kind: 'start' } : before);
      if (!picked.ok) return setStep({ kind: 'start', refused: picked.reason });
      const parsed = parseActivityFile(picked.text, trip);
      if (!parsed.ok) return setStep({ kind: 'start', refused: parsed.reason });
      // Read now, not from the screen's live copy: the duplicates are checked against the trip
      // as it is at this moment.
      const existing = await listTripItems(db, trip.id);
      const preview = buildImportPreview(parsed.activities, parsed.ignored, existing);
      setSelected(new Set(preview.initiallySelected));
      setStep({ kind: 'preview', fileName: picked.name, preview });
    } catch (error) {
      console.warn('Reading an activities file failed', error);
      setStep({ kind: 'start', refused: 'This file could not be read.' });
    }
  };

  const add = (preview: ImportPreview) =>
    run(async () => {
      const chosen = selectedRows(preview.rows, selected);
      const notices = selectionNotices(chosen, trip.defaultTz, new Date());
      try {
        const ids = await importActivities(
          db,
          trip.id,
          chosen.map((row) => ({ input: row.input!, links: row.links })),
        );
        setStep({
          kind: 'done',
          ids,
          ideas: notices.ideas,
          plans: notices.plans,
          notAdded: preview.rows.length - ids.length,
        });
        if (notices.remindingPlans > 0) void askForRemindersIfAnyDue(db);
      } catch (error) {
        console.warn('Activity import failed', error);
        Alert.alert(
          'Nothing was added',
          'The activities could not be saved, so none of them were added. Your trip is as it was.',
        );
      }
    });

  const copyInstructions = async () => {
    try {
      await Clipboard.setStringAsync(AI_INSTRUCTIONS);
      Alert.alert(
        'Copied',
        'Paste it into ChatGPT or another assistant, then describe your trip. Save its answer as a .json file and choose it here.',
      );
    } catch (error) {
      console.warn('Copy failed', error);
    }
  };

  const footer =
    step.kind === 'preview' ? (
      <PreviewFooter
        preview={step.preview}
        selected={selected}
        busy={busy}
        onAdd={() => void add(step.preview)}
      />
    ) : undefined;

  return (
    <Screen>
      <ScreenHeader
        title="Import activities"
        context={trip.name}
        subtitle={formatDateRange(trip.startDate, trip.endDate)}
      />
      <FormScroll footer={footer} contentStyle={styles.content}>
        {step.kind === 'start' ? (
          <>
            <Text style={[type.body, { color: c.textMuted }]}>
              Add ideas and plans to this trip from an activities file — for example one written by
              ChatGPT. You will see every activity, and choose which to add, before anything is
              saved. Nothing already in the trip is changed.
            </Text>
            {step.refused ? (
              <Notice title="This file cannot be imported">{`${step.refused} Nothing was added.`}</Notice>
            ) : null}
            <Button
              label={step.refused ? 'Choose another file' : 'Choose a file'}
              onPress={() => void pick()}
            />
            <View style={styles.section}>
              <SectionLabel>Plan with an AI assistant</SectionLabel>
              <Text style={[type.body, { color: c.textMuted }]}>
                Give the assistant these instructions; they describe the file it should write and
                ask it not to invent dates, prices or bookings.
              </Text>
              <Button
                label="Copy instructions for ChatGPT"
                variant="secondary"
                onPress={() => void copyInstructions()}
              />
              <Button
                label="Share the format (JSON Schema)"
                variant="secondary"
                onPress={() =>
                  void shareActivitySchema().catch((error) => console.warn('Share failed', error))
                }
              />
            </View>
          </>
        ) : null}

        {step.kind === 'checking' ? (
          <Text style={[type.body, { color: c.textMuted }]}>Checking the file…</Text>
        ) : null}

        {step.kind === 'preview' ? (
          <Preview
            fileName={step.fileName}
            preview={step.preview}
            selected={selected}
            onToggle={toggle}
            onSelectAll={() =>
              setSelected(new Set(step.preview.rows.filter((r) => r.selectable).map((r) => r.index)))
            }
            onSelectNone={() => setSelected(new Set())}
            onChooseAnother={() => void pick()}
            defaultTz={trip.defaultTz}
          />
        ) : null}

        {step.kind === 'done' ? (
          <Done
            step={step}
            tripName={trip.name}
            items={itemsQuery.data ?? []}
            onOpen={(id) => router.push(`/item/${id}`)}
            onBack={() => router.back()}
          />
        ) : null}
      </FormScroll>
    </Screen>
  );
}

function Preview({
  fileName,
  preview,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onChooseAnother,
  defaultTz,
}: {
  fileName: string;
  preview: ImportPreview;
  selected: ReadonlySet<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onChooseAnother: () => void;
  defaultTz: string;
}) {
  const c = useColors();
  const counts = previewCounts(preview.rows, selected);
  const summary = [
    `${counts.total} ${counts.total === 1 ? 'activity' : 'activities'} in the file`,
    `${counts.valid} valid`,
    counts.invalid > 0 ? `${counts.invalid} invalid` : null,
    counts.duplicates > 0
      ? `${counts.duplicates} possible ${counts.duplicates === 1 ? 'duplicate' : 'duplicates'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <View style={styles.section}>
        <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={2}>
          {fileName}
        </Text>
        <Text style={[type.bodyStrong, { color: c.text }]}>{summary}</Text>
        <Text style={[type.body, { color: c.textMuted }]}>
          {`${counts.selected} selected, ${counts.excluded} not to be added.`}
          {counts.duplicates > 0 ? ' Possible duplicates start unticked; tick one to add it anyway.' : ''}
          {counts.invalid > 0 ? ' Invalid ones cannot be added until the file is corrected.' : ''}
        </Text>
      </View>
      <SelectionNotes preview={preview} selected={selected} defaultTz={defaultTz} />
      {preview.ignored.length > 0 ? (
        <Notice title="Not imported from the file" tone="info">
          {preview.ignored.map((field) => `${field.field}: ${field.reason}`).join('\n')}
        </Notice>
      ) : null}
      <View style={styles.actions}>
        <Button label="Select all" variant="secondary" compact onPress={onSelectAll} />
        <Button label="Deselect all" variant="secondary" compact onPress={onSelectNone} />
      </View>
      <Rows>
        {preview.rows.map((row) => (
          <ActivityPreviewRow
            key={row.index}
            row={row}
            selected={selected.has(row.index)}
            onToggle={onToggle}
          />
        ))}
      </Rows>
      <Button label="Choose another file" variant="secondary" onPress={onChooseAnother} />
    </>
  );
}

/** Pinned under the list: the button that adds what is ticked — nothing else, so it stays small. */
function PreviewFooter({
  preview,
  selected,
  busy,
  onAdd,
}: {
  preview: ImportPreview;
  selected: ReadonlySet<number>;
  busy: boolean;
  onAdd: () => void;
}) {
  const count = selectedRows(preview.rows, selected).length;
  return (
    <Button
      label={count === 0 ? 'Nothing selected' : `Add ${count} ${count === 1 ? 'activity' : 'activities'}`}
      disabled={count === 0}
      busy={busy}
      onPress={onAdd}
    />
  );
}

/**
 * What adding the ticked entries does beyond the entries themselves — in the list, not the pinned
 * footer, which at a large font would otherwise cover half a small screen.
 */
function SelectionNotes({
  preview,
  selected,
  defaultTz,
}: {
  preview: ImportPreview;
  selected: ReadonlySet<number>;
  defaultTz: string;
}) {
  // Recomputed per render: a toggle changes it, and 300 rows is cheap.
  const notices = selectionNotices(selectedRows(preview.rows, selected), defaultTz, new Date());
  const lines = [
    notices.pricedPlans > 0
      ? `${notices.pricedPlans === 1 ? '1 planned activity has a price and will appear' : `${notices.pricedPlans} planned activities have a price and will appear`} in Expenses as an unpaid booking cost. An estimated price is not a payment — nothing is marked paid.`
      : null,
    notices.remindingPlans > 0
      ? `${notices.remindingPlans === 1 ? '1 planned activity is' : `${notices.remindingPlans} planned activities are`} still ahead and will get the app’s usual reminders.`
      : null,
  ].filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  return (
    <Notice title="When you add the selected activities" tone="info">
      {lines.join('\n\n')}
    </Notice>
  );
}

function Done({
  step,
  tripName,
  items,
  onOpen,
  onBack,
}: {
  step: Extract<Step, { kind: 'done' }>;
  tripName: string;
  items: readonly TripItem[];
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const c = useColors();
  const created = new Set(step.ids);
  // Live: an activity deleted from its own screen drops off this list.
  const imported = items.filter((item) => created.has(item.id));
  const parts = [
    step.ideas > 0 ? `${countOf(step.ideas, 'idea')} on Places` : null,
    step.plans > 0 ? `${countOf(step.plans, 'plan')} on the Timeline` : null,
  ].filter(Boolean);
  const added = step.ids.length;

  return (
    <>
      <Notice
        title={`Added ${added} ${added === 1 ? 'activity' : 'activities'} to ${tripName}`}
        tone="info"
        icon="check">
        {`${parts.join(', ')}.${step.notAdded > 0 ? ` ${step.notAdded} from the file ${step.notAdded === 1 ? 'was' : 'were'} not added.` : ''}`}
      </Notice>
      <View style={styles.section}>
        <SectionLabel>Review imported activities</SectionLabel>
        <Text style={[type.caption, { color: c.textMuted }]}>
          Open one to check it, edit it or delete it.
        </Text>
      </View>
      {imported.length > 0 ? (
        <Rows>
          {imported.map((item) => (
            <ItemRow key={item.id} item={item} onPress={() => onOpen(item.id)} />
          ))}
        </Rows>
      ) : (
        <Text style={[type.body, { color: c.textMuted }]}>
          None of them are in the trip any more.
        </Text>
      )}
      <Button label="Back to the trip" onPress={onBack} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
