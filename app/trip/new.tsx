import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { isResolvableTimezone } from '../../src/domain/timezones';
import { TripForm } from '../../src/features/trips/TripForm';
import { listTemplates } from '../../src/repositories/templates';
import { createTripWithMembers } from '../../src/repositories/trips';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

export default function NewTrip() {
  const db = useSQLiteContext();
  const router = useRouter();

  return (
    <Screen>
      <ScreenHeader title="New trip" />
      <TripForm
        submitLabel="Create trip"
        defaultValues={{
          name: '',
          destination: undefined,
          startDate: today(),
          endDate: today(),
          defaultTz: deviceTimezone(),
          travellers: undefined,
          travellerCount: undefined,
          notes: undefined,
        }}
        onSubmit={async (input, selectedTravellerIds) => {
          const id = await createTripWithMembers(
            db,
            { ...input, travellers: undefined },
            selectedTravellerIds,
          );
          // With templates kept, the next step offers one; it can be skipped (C5).
          const hasTemplates = (await listTemplates(db)).some((template) => template.content);
          router.replace(hasTemplates ? `/trip/${id}/use-template?fresh=1` : `/trip/${id}`);
        }}
      />
    </Screen>
  );
}

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function deviceTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isResolvableTimezone(zone) ? zone : 'UTC';
}
