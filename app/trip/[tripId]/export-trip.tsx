import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';

import { formatFileSize, listPhrase } from '../../../src/domain/format';
import {
  checkTripFiles,
  createTripArchive,
  shareTripArchive,
  type ExportedTrip,
} from '../../../src/files/tripArchiveFiles';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { RESOURCE_TABLES } from '../../../src/repositories/resources';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { CheckBox } from '../../../src/ui/components/CheckBox';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { Notice } from '../../../src/ui/components/Notice';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../../src/ui/tokens';

type Mode = 'complete' | 'withoutFiles';

/**
 * Export trip (2B): this one trip as a file, to import on another phone as a new trip. Complete
 * by default; without attachments on request, which the file itself then says. A document whose
 * file is already missing here is named before anything is made, and the export goes ahead only
 * if the person agrees to it being partial.
 */
export default function ExportTripScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [mode, setMode] = useState<Mode>('complete');
  const [result, setResult] = useState<ExportedTrip | null>(null);
  const [busy, run] = useBusy();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const filesQuery = useLiveQuery(
    useCallback((database) => checkTripFiles(database, tripId), [tripId]),
    RESOURCE_TABLES,
    [tripId],
  );
  const trip = tripQuery.data;
  const view = queryView(tripQuery);
  if (view !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Export trip"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const files = filesQuery.data;
  const missing = files?.missingLabels ?? [];

  const make = () =>
    run(async () => {
      try {
        const exported = await createTripArchive(db, trip.id, mode === 'complete');
        setResult(exported);
        await shareTripArchive(exported.uri);
      } catch (error) {
        console.warn('Trip export failed', error);
        Alert.alert('Could not export the trip', 'Nothing was shared. Try again.');
      }
    });

  const start = () => {
    if (mode === 'complete' && missing.length > 0) {
      Alert.alert(
        missing.length === 1 ? 'A document is missing' : `${missing.length} documents are missing`,
        `${listPhrase(missing)} ${missing.length === 1 ? 'is' : 'are'} no longer on this phone. ` +
          'The export will say so, and they will arrive as missing. Everything else goes in.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Export without them', onPress: () => void make() },
        ],
      );
    } else {
      void make();
    }
  };

  const option = (key: Mode, title: string, subtitle: string) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      accessibilityLabel={`${title}${mode === key ? ', selected' : ''}`}
      leading={
        <CheckBox checked={mode === key} onToggle={() => setMode(key)} accessibilityLabel={title} />
      }
    />
  );

  return (
    <Screen>
      <ScreenHeader title="Export trip" subtitle={trip.name} />
      <FormScroll
        footer={<Button label="Create and share" busy={busy} onPress={start} />}>
        <Text style={[type.body, { color: c.textMuted }]}>
          A file with this trip in it — plans, bookings, notes, lists, travellers, expenses — to
          import on another phone, where it becomes a new trip. Your other trips, your backups and
          who you are on this phone are not in it.
        </Text>
        <Rows>
          {option(
            'complete',
            'Complete trip',
            files
              ? files.files > 0
                ? `With every document and receipt photo (${files.files} ${files.files === 1 ? 'file' : 'files'}, ${formatFileSize(files.totalBytes)})`
                : 'This trip has no documents or photos'
              : 'With every document and receipt photo',
          )}
          {option(
            'withoutFiles',
            'Without attachments',
            'Records only; documents arrive as missing.',
          )}
        </Rows>
        {missing.length > 0 ? (
          <Notice
            title={
              missing.length === 1
                ? 'One document is no longer on this phone'
                : `${missing.length} documents are no longer on this phone`
            }>
            {`${listPhrase(missing)}. They will be marked missing in the export.`}
          </Notice>
        ) : null}
        <Notice title="Share it with care" tone="info">
          Whoever has the file can read everything in the trip: booking references, notes, names
          and documents.
        </Notice>
        {result ? (
          <Notice
            title={result.manifest.partial ? 'Archive created — partial' : 'Archive created'}
            tone={result.manifest.partial ? 'attention' : 'info'}
            icon="check">
            {result.manifest.attachments === 'excluded'
              ? 'Without attachments: documents and photos are listed but not included.'
              : result.missingLabels.length > 0
                ? `Without ${listPhrase(result.missingLabels)}, already missing on this phone.`
                : 'Everything in the trip is in it. Save it somewhere off this phone, or send it.'}
          </Notice>
        ) : null}
      </FormScroll>
    </Screen>
  );
}
