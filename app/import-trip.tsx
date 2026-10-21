import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, listPhrase } from '../src/domain/format';
import { CLASSIFICATION_LABELS, travellerLabel, type Traveller } from '../src/domain/traveller';
import {
  damagedLabels,
  earlierImport,
  planTripImport,
  possibleMatches,
  summariseTripArchive,
  uniqueTripName,
  unavailableLabels,
  type EarlierImport,
  type OpenedTripArchive,
  type TravellerChoice,
} from '../src/domain/tripArchive';
import { useMe } from '../src/features/travellers/useMe';
import {
  importTripArchive,
  pickTripArchive,
  type TripImportResult,
} from '../src/files/tripArchiveFiles';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { askForRemindersIfAnyDue } from '../src/notifications/reminders';
import {
  listTravellers,
  TRAVELLER_TABLES,
  travellerTripNames,
} from '../src/repositories/travellers';
import { importHistory } from '../src/repositories/tripImport';
import { listTrips, TRIP_TABLES } from '../src/repositories/trips';
import { Button } from '../src/ui/components/Button';
import { Field } from '../src/ui/components/Field';
import { Notice } from '../src/ui/components/Notice';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { SelectField } from '../src/ui/components/SelectField';
import { Tag } from '../src/ui/components/Tag';
import { gutter, spacing, type, useColors } from '../src/ui/tokens';

type Step =
  | { kind: 'start' }
  | { kind: 'checking' }
  | { kind: 'refused'; reason: string }
  | { kind: 'preview'; archive: OpenedTripArchive; earlier: EarlierImport | null }
  | { kind: 'importing' }
  | { kind: 'done'; result: TripImportResult; name: string };

const NEW = 'new';

/**
 * Import a trip (2B): a trip exported from this app, added as a **new** trip. Nothing is written
 * until the preview is confirmed; nothing already here is changed or merged; travellers become
 * new profiles unless one is linked here, by choice, to a saved profile. One screen whose content
 * moves through the steps, so Back always leaves it.
 */
export default function ImportTripScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { data: profiles = [] } = useLiveQuery(listTravellers, TRAVELLER_TABLES);
  const { data: trips = [] } = useLiveQuery(listTrips, TRIP_TABLES);
  const { data: tripsOf = {} } = useLiveQuery(travellerTripNames, [
    ...TRIP_TABLES,
    ...TRAVELLER_TABLES,
  ]);
  const { meId } = useMe();

  const pick = async () => {
    setStep({ kind: 'checking' });
    try {
      const opened = await pickTripArchive();
      if (!opened) return setStep({ kind: 'start' });
      if (!opened.ok) return setStep({ kind: 'refused', reason: opened.reason });
      const history = await importHistory(db);
      const earlier = earlierImport(
        opened.archive.manifest,
        history,
        trips.map((trip) => trip.id),
      );
      setChoices({});
      setStep({ kind: 'preview', archive: opened.archive, earlier });
    } catch (error) {
      console.warn('Reading a trip archive failed', error);
      setStep({ kind: 'refused', reason: 'This file could not be read. Nothing was imported.' });
    }
  };

  const run = async (archive: OpenedTripArchive) => {
    const tripName = uniqueTripName(
      archive.manifest.trip.name,
      trips.map((trip) => trip.name),
    );
    const travellerChoices = new Map<string, TravellerChoice>(
      archive.tables.travellers.map((traveller) => {
        const chosen = choices[traveller.id];
        return [
          traveller.id,
          chosen && chosen !== NEW ? { kind: 'existing', id: chosen } : { kind: 'new' },
        ];
      }),
    );
    setStep({ kind: 'importing' });
    try {
      const plan = planTripImport(archive, {
        newId: randomUUID,
        now: new Date().toISOString(),
        tripName,
        choices: travellerChoices,
      });
      const result = await importTripArchive(db, archive, plan);
      setStep({ kind: 'done', result, name: tripName });
      // As after a restore: a trip with reminders to come asks for permission once.
      if (result.ok) void askForRemindersIfAnyDue(db);
    } catch (error) {
      console.warn('Trip import failed', error);
      setStep({
        kind: 'done',
        name: tripName,
        result: { ok: false, stage: 'database', reason: String(error) },
      });
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Import a trip" subtitle="Added as a new trip" />
      <ScrollView contentContainerStyle={styles.content}>
        {step.kind === 'start' || step.kind === 'refused' ? (
          <>
            <Text style={[type.body, { color: c.textMuted }]}>
              Choose a trip exported from Travel Organizer (a .zip from Export trip). You will see
              what is in it before anything is added. A full backup is restored from Backup &
              restore instead.
            </Text>
            {step.kind === 'refused' ? (
              <Notice title="This file cannot be imported">{`${step.reason} Nothing was imported.`}</Notice>
            ) : null}
            <Button
              label={step.kind === 'refused' ? 'Choose another file' : 'Choose a trip file'}
              onPress={() => void pick()}
            />
          </>
        ) : null}

        {step.kind === 'checking' || step.kind === 'importing' ? (
          <Text style={[type.body, { color: c.textMuted }]}>
            {step.kind === 'checking' ? 'Checking the file…' : 'Importing…'}
          </Text>
        ) : null}

        {step.kind === 'preview' ? (
          <Preview
            archive={step.archive}
            earlier={step.earlier}
            profiles={profiles}
            tripsOf={tripsOf}
            meId={meId}
            tripName={uniqueTripName(
              step.archive.manifest.trip.name,
              trips.map((trip) => trip.name),
            )}
            earlierName={
              step.earlier ? trips.find((trip) => trip.id === step.earlier!.tripId)?.name : undefined
            }
            choices={choices}
            onChoose={(id, value) => setChoices((now) => ({ ...now, [id]: value }))}
            onCancel={() => setStep({ kind: 'start' })}
            onImport={() => {
              const archive = step.archive;
              const earlier = step.earlier;
              const confirmCopy = () => {
                if (!earlier) return void run(archive);
                Alert.alert(
                  earlier.kind === 'original' ? 'Already on this phone' : 'Imported before',
                  earlier.kind === 'original'
                    ? 'This trip was exported from this phone and is still here. Importing will ' +
                        'create an independent copy; the original is not changed.'
                    : 'This trip appears to have been imported before. Importing again will ' +
                        'create another independent copy.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Import another copy', onPress: () => void run(archive) },
                  ],
                );
              };
              // A file the archive says it includes, but that arrived damaged or not at all: the
              // trip goes in without it only if the person agrees to that.
              const damaged = damagedLabels(archive);
              if (damaged.length === 0) return confirmCopy();
              // Counted by file, named by document: one ticket shared by two legs is one file.
              const files = archive.damaged.length;
              const one = damaged.length === 1;
              Alert.alert(
                files === 1 ? 'A file is damaged' : `${files} files are damaged`,
                `${listPhrase(damaged)} did not arrive intact — missing from the file, or not ` +
                  `matching its checksum. Import the trip without ${one ? 'it' : 'them'}? ` +
                  `${one ? 'It' : 'They'} will be listed as missing.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Import without them', onPress: confirmCopy },
                ],
              );
            }}
          />
        ) : null}

        {step.kind === 'done' ? (
          step.result.ok ? (
            <>
              <Notice
                title={`“${step.name}” was added`}
                tone={step.result.check.ok ? 'info' : 'attention'}
                icon="check">
                {step.result.check.ok
                  ? `Every record and ${step.result.filesWritten} ${step.result.filesWritten === 1 ? 'file' : 'files'} checked after saving.`
                  : `It was saved, but a check afterwards found: ${step.result.check.problems.join('; ')}. The trip has been kept as it is — look through it before relying on it.`}
              </Notice>
              <Button
                label="Open the trip"
                onPress={() => {
                  if (step.result.ok) router.replace(`/trip/${step.result.tripId}`);
                }}
              />
              <Button label="Done" variant="secondary" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Notice title="Nothing was imported">
                {step.result.stage === 'files'
                  ? `A file could not be saved (${step.result.reason}). The files this import had written were removed; your trips are as they were.`
                  : `The trip could not be saved (${step.result.reason}). Nothing was added and the files this import had written were removed; your trips are as they were.`}
              </Notice>
              <Button label="Choose a file" onPress={() => setStep({ kind: 'start' })} />
            </>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Preview({
  archive,
  earlier,
  earlierName,
  profiles,
  tripsOf,
  meId,
  tripName,
  choices,
  onChoose,
  onCancel,
  onImport,
}: {
  archive: OpenedTripArchive;
  earlier: EarlierImport | null;
  earlierName: string | undefined;
  profiles: readonly Traveller[];
  /** Each profile's trips, to tell two people of the same name apart. */
  tripsOf: Record<string, string[]>;
  meId: string | null;
  tripName: string;
  choices: Record<string, string>;
  onChoose: (archiveTravellerId: string, value: string) => void;
  onCancel: () => void;
  onImport: () => void;
}) {
  const c = useColors();
  const summary = useMemo(() => summariseTripArchive(archive), [archive]);
  const missing = useMemo(() => unavailableLabels(archive), [archive]);
  const { manifest } = archive;

  // One saved profile cannot stand for two people in the file.
  const linked = Object.values(choices).filter((value) => value && value !== NEW);
  const clash = new Set(linked).size !== linked.length;

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const lines = [
    `${plural(summary.plans, 'plan')} — ${summary.bookings} in the itinerary, ${plural(summary.places, 'saved place')}` +
      (summary.tasks > 0 ? ` · ${plural(summary.tasks, 'task')}` : ''),
    plural(summary.travellers, 'traveller'),
    `${plural(summary.lists, 'list')}, ${plural(summary.listItems, 'item')}`,
    plural(summary.notes, 'note'),
    `${plural(summary.documents, 'document')}, ${plural(summary.links, 'link')}, ${plural(summary.receipts, 'receipt photo')}`,
    // Payments on bookings (3D-1); the old name-based table is named only if a file has rows.
    `${plural(summary.expenses, 'expense')}, ${plural(summary.bookingPayments, 'payment')} on bookings` +
      (summary.payments > 0 ? `, ${plural(summary.payments, 'older payment record')}` : ''),
  ];

  return (
    <>
      <View style={styles.section}>
        <Text style={[type.section, { color: c.text }]}>{manifest.trip.name}</Text>
        <Text style={[type.caption, { color: c.textMuted }]}>
          {[manifest.trip.destination, formatDateRange(manifest.trip.startDate, manifest.trip.endDate)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {tripName !== manifest.trip.name ? (
          <Text style={[type.caption, { color: c.textMuted }]}>{`Will be added as “${tripName}”.`}</Text>
        ) : null}
        {lines.map((line) => (
          <Text key={line} style={[type.body, { color: c.text }]}>
            {line}
          </Text>
        ))}
        <Text style={[type.caption, { color: c.textMuted }]}>
          {manifest.attachments === 'included'
            ? `Documents and photos included: ${plural(summary.filesIncluded, 'file')}.`
            : 'Exported without attachments: documents and photos are listed, without their files.'}
        </Text>
      </View>

      {earlier ? (
        <Notice title={earlier.kind === 'original' ? 'Already on this phone' : 'Imported before'}>
          {earlier.kind === 'original'
            ? `This trip was exported from this phone and is still here${earlierName ? ` as “${earlierName}”` : ''}. Importing makes an independent copy; the original is not changed.`
            : `This trip appears to have been imported before${earlierName ? ` (as “${earlierName}”)` : ''}. Importing again will create another independent copy.`}
        </Notice>
      ) : null}

      {missing.length > 0 ? (
        <Notice
          title={
            manifest.attachments === 'excluded'
              ? 'Files not included'
              : `${plural(missing.length, 'document')} will arrive without ${missing.length === 1 ? 'its file' : 'their files'}`
          }>
          {`${listPhrase(missing)} — shown as missing, to attach again.`}
        </Notice>
      ) : null}

      {archive.tables.travellers.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Travellers</SectionLabel>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Each becomes a new traveller unless you link them to someone saved here. Nobody is
            linked by name alone.
          </Text>
          {archive.tables.travellers.map((traveller) => {
            const matches = possibleMatches(traveller.name, profiles);
            const value = choices[traveller.id] ?? NEW;
            return (
              <View key={traveller.id} style={styles.traveller}>
                <View style={styles.travellerHead}>
                  <Text style={[type.heading, styles.grow, { color: c.text }]} numberOfLines={2}>
                    {traveller.name}
                  </Text>
                  <Tag label={CLASSIFICATION_LABELS[traveller.classification]} tone="neutral" />
                </View>
                <Field
                  label="In this phone"
                  hint={
                    matches.length > 0 && value === NEW
                      ? matchHint(matches, traveller.name, meId)
                      : undefined
                  }>
                  <SelectField
                    value={value}
                    options={[NEW, ...profiles.map((profile) => profile.id)]}
                    labelFor={(id) => {
                      if (id === NEW) return 'A new traveller';
                      const profile = profiles.find((p) => p.id === id);
                      return profile ? `Link to ${travellerLabel(profile, meId)}` : id;
                    }}
                    detailFor={(id) => {
                      const profile = profiles.find((p) => p.id === id);
                      if (!profile) return null;
                      const on = tripsOf[id] ?? [];
                      return `${CLASSIFICATION_LABELS[profile.classification]} · ${on.length > 0 ? `on ${listPhrase(on)}` : 'on no trip'}`;
                    }}
                    onChange={(next) => onChoose(traveller.id, next ?? NEW)}
                    title={`${traveller.name} is`}
                  />
                </Field>
              </View>
            );
          })}
          {clash ? (
            <Notice title="One saved traveller is linked twice">
              Each traveller in the file needs their own person here. Change one of the links.
            </Notice>
          ) : null}
        </View>
      ) : null}

      <Button label="Import as a new trip" disabled={clash} onPress={onImport} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </>
  );
}

/** Offered, never assumed: *You have 3 saved travellers named Misho*, *one of them you*. */
function matchHint(matches: readonly Traveller[], name: string, meId: string | null): string {
  const said =
    matches.length === 1
      ? `You have a saved ${travellerLabel(matches[0], meId)}.`
      : `You have ${matches.length} saved travellers named ${name}` +
        `${matches.some((match) => match.id === meId) ? ', one of them you' : ''}.`;
  return `${said} Link only if it is the same person.`;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
  traveller: { gap: spacing.sm, paddingTop: spacing.sm },
  travellerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
});
