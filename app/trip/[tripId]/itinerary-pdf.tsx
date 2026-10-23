import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';

import {
  DEFAULT_PDF_OPTIONS,
  itineraryHtml,
  type PdfOptions,
} from '../../../src/domain/itineraryHtml';
import { groupResourcesByItem } from '../../../src/domain/resource';
import { shareItineraryPdf } from '../../../src/files/itineraryPdf';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listListItems, listTripLists } from '../../../src/repositories/lists';
import { listItemResourcesForTrip } from '../../../src/repositories/resources';
import { listTripTravellers } from '../../../src/repositories/travellers';
import { listTripItems } from '../../../src/repositories/tripItems';
import { conversionRecords } from '../../../src/repositories/rates';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { CheckBox } from '../../../src/ui/components/CheckBox';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../../src/ui/tokens';

const CHOICES: readonly { key: keyof PdfOptions; title: string; subtitle: string }[] = [
  { key: 'notes', title: 'Notes on each plan', subtitle: 'What you wrote on bookings and plans' },
  {
    key: 'references',
    title: 'Booking references',
    subtitle: 'Whoever has the PDF can use them — off unless you need it',
  },
  { key: 'travellers', title: 'Who is going', subtitle: 'Names on the first page' },
  { key: 'tasks', title: 'To do', subtitle: 'Open tasks, at the end' },
  { key: 'lists', title: 'Packing and shopping lists', subtitle: 'At the end, ticked as they are' },
  { key: 'costs', title: 'Booking costs', subtitle: 'Per currency: expected, paid, to pay' },
];

/**
 * Share the itinerary as a PDF (C4): a printable copy of the plan, day by day, for sharing or
 * paper. What goes in is chosen here; nothing private is in it unless switched on (FB-18).
 */
export default function ItineraryPdfScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [options, setOptions] = useState<PdfOptions>(DEFAULT_PDF_OPTIONS);
  const [busy, run] = useBusy();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const trip = tripQuery.data;
  const view = queryView(tripQuery);
  if (view !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Itinerary PDF"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  /** Read everything at the moment of making it: the PDF is a snapshot. */
  const makePdf = async () => {
    const [items, travellers, resources, lists, conversion] = await Promise.all([
      listTripItems(db, trip.id),
      listTripTravellers(db, trip.id),
      listItemResourcesForTrip(db, trip.id),
      listTripLists(db, trip.id),
      conversionRecords(db, trip.id),
    ]);
    const withItems = await Promise.all(
      lists.map(async (list) => ({ list, items: await listListItems(db, list.id) })),
    );
    const now = new Date();
    const html = itineraryHtml(
      {
        trip,
        items,
        travellers,
        documents: groupResourcesByItem(resources),
        lists: withItems,
        generatedAt: now,
        conversion,
      },
      options,
    );
    await shareItineraryPdf(html, trip.name, now);
  };

  const create = () =>
    run(async () => {
      try {
        await makePdf();
      } catch (error) {
        console.warn('Itinerary PDF failed', error);
        Alert.alert('Could not make the PDF', 'Nothing was shared. Try again.');
      }
    });

  return (
    <Screen>
      <ScreenHeader title="Itinerary PDF" subtitle={trip.name} />
      <FormScroll footer={<Button label="Create PDF" busy={busy} onPress={() => void create()} />}>
        <Text style={[type.body, { color: c.textMuted }]}>
          Every day of the trip with its times, places and zones, stays and travel at the start.
          Tickets are named, not attached. Made on this phone, offline.
        </Text>
        <Rows>
          {CHOICES.map(({ key, title, subtitle }) => (
            <ListRow
              key={key}
              title={title}
              subtitle={subtitle}
              leading={
                <CheckBox
                  checked={options[key]}
                  onToggle={() => setOptions((now) => ({ ...now, [key]: !now[key] }))}
                  accessibilityLabel={title}
                />
              }
            />
          ))}
        </Rows>
      </FormScroll>
    </Screen>
  );
}
