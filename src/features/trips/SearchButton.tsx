import { useRouter } from 'expo-router';

import { HeaderAction } from '../../ui/components/HeaderAction';

/** The header action on every trip tab. Search reaches cancelled items, which no tab shows. */
export function SearchButton({ tripId }: { tripId: string }) {
  const router = useRouter();
  return (
    <HeaderAction
      icon="search"
      accessibilityLabel="Search this trip"
      onPress={() => router.push({ pathname: '/trip/[tripId]/search', params: { tripId } })}
    />
  );
}
