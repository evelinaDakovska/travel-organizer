import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  areEndpointsEqual,
  buildGoogleMapsUrl,
  formatEndpointQuery,
  resolveItemEndpoint,
  type DirectionEndpoint,
  type OriginChoice,
  type TravelMode,
} from '../../domain/directions';
import type { TripItem } from '../../domain/tripItem';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/components/Sheet';
import { radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  destination: DirectionEndpoint;
  initialOrigin?: OriginChoice;
  previousEndpoint?: DirectionEndpoint | null;
  hotel?: TripItem | null;
  savedPlaces?: readonly DirectionEndpoint[];
};

type ModeOption = {
  label: string;
  value: TravelMode | null;
};

const MODE_OPTIONS: readonly ModeOption[] = [
  { label: 'Any', value: null },
  { label: 'Walking', value: 'walking' },
  { label: 'Driving', value: 'driving' },
  { label: 'Transit', value: 'transit' },
];

/**
 * Bottom sheet to review endpoints and launch Google Maps (Spec §8.2).
 * Shows resolved From and To, lets user switch origin, choose travel mode,
 * and open Google Maps with safe fallback.
 */
export function DirectionsSheet({
  visible,
  onClose,
  destination,
  initialOrigin,
  previousEndpoint,
  hotel,
  savedPlaces = [],
}: Props) {
  const c = useColors();

  const [origin, setOrigin] = useState<OriginChoice>(
    initialOrigin ?? { type: 'current_location' },
  );
  const [mode, setMode] = useState<TravelMode | null>(null);
  const [pickingOrigin, setPickingOrigin] = useState(false);

  // Sync state if initialOrigin changes or sheet reopens
  const hotelEndpoint = useMemo(() => {
    if (!hotel) return null;
    return resolveItemEndpoint(hotel, 'origin');
  }, [hotel]);

  // Compute origin title and address text
  const originDisplay = useMemo(() => {
    if (origin.type === 'current_location') {
      return {
        title: 'Current location',
        subtitle: 'Resolved by Google Maps on device',
      };
    }
    return {
      title: origin.endpoint.title || 'Saved place',
      subtitle: origin.endpoint.address ?? null,
    };
  }, [origin]);

  const destinationAddress = destination.address ?? null;

  const handleOpenMaps = async () => {
    const url = buildGoogleMapsUrl({
      origin,
      destination,
      travelMode: mode,
    });

    if (!url) {
      Alert.alert(
        'Missing location',
        'Could not find a valid address or coordinates for this destination.',
      );
      return;
    }

    try {
      await Linking.openURL(url);
      onClose();
    } catch (error) {
      console.warn('Could not open directions link', error);
      const query = formatEndpointQuery(destination) ?? destination.title;
      Alert.alert(
        'Could not open Maps',
        'Google Maps could not be launched on this phone. You can copy the destination address instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Copy address',
            onPress: () => {
              void Clipboard.setStringAsync(query);
            },
          },
        ],
      );
    }
  };

  const copyDestinationText = async () => {
    const text = formatEndpointQuery(destination) ?? destination.title;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Destination copied to clipboard.');
  };

  return (
    <Sheet visible={visible} title="Get directions" onClose={onClose} closeLabel="Cancel">
      <View style={styles.container}>
        {/* Destination (To) */}
        <View style={[styles.card, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[type.overline, { color: c.textMuted }]}>TO</Text>
            <Pressable
              onPress={() => void copyDestinationText()}
              accessibilityRole="button"
              accessibilityLabel="Copy destination"
              hitSlop={8}>
              <Text style={[type.caption, { color: c.accentText }]}>Copy</Text>
            </Pressable>
          </View>
          <Text style={[type.heading, { color: c.text }]}>{destination.title}</Text>
          {destinationAddress ? (
            <Text style={[type.caption, { color: c.textMuted }]}>{destinationAddress}</Text>
          ) : null}
        </View>

        {/* Origin (From) */}
        <View style={[styles.card, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[type.overline, { color: c.textMuted }]}>FROM</Text>
            <Pressable
              onPress={() => setPickingOrigin(!pickingOrigin)}
              accessibilityRole="button"
              accessibilityLabel={pickingOrigin ? 'Done changing origin' : 'Change starting point'}
              hitSlop={8}>
              <Text style={[type.caption, { color: c.accentText }]}>
                {pickingOrigin ? 'Done' : 'Change'}
              </Text>
            </Pressable>
          </View>

          {!pickingOrigin ? (
            <>
              <Text style={[type.heading, { color: c.text }]}>{originDisplay.title}</Text>
              {originDisplay.subtitle ? (
                <Text style={[type.caption, { color: c.textMuted }]}>{originDisplay.subtitle}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.optionsList}>
              {/* Option: Current Location */}
              <Pressable
                onPress={() => {
                  setOrigin({ type: 'current_location' });
                  setPickingOrigin(false);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  origin.type === 'current_location' && { backgroundColor: c.surface },
                  pressed && { opacity: 0.7 },
                ]}>
                <View style={styles.optionContent}>
                  <Text style={[type.bodyStrong, { color: c.text }]}>Current location</Text>
                  <Text style={[type.caption, { color: c.textMuted }]}>
                    Resolved by Google Maps
                  </Text>
                </View>
                {origin.type === 'current_location' ? (
                  <Icon name="check" size={18} color={c.accentText} />
                ) : null}
              </Pressable>

              {/* Option: Previous Stop (if available and distinct from destination) */}
              {previousEndpoint && !areEndpointsEqual(previousEndpoint, destination) ? (
                <Pressable
                  onPress={() => {
                    setOrigin({ type: 'endpoint', endpoint: previousEndpoint });
                    setPickingOrigin(false);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    origin.type === 'endpoint' &&
                      areEndpointsEqual(origin.endpoint, previousEndpoint) && {
                        backgroundColor: c.surface,
                      },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <View style={styles.optionContent}>
                    <Text style={[type.bodyStrong, { color: c.text }]}>
                      Previous stop: {previousEndpoint.title}
                    </Text>
                    {previousEndpoint.address ? (
                      <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
                        {previousEndpoint.address}
                      </Text>
                    ) : null}
                  </View>
                  {origin.type === 'endpoint' &&
                  areEndpointsEqual(origin.endpoint, previousEndpoint) ? (
                    <Icon name="check" size={18} color={c.accentText} />
                  ) : null}
                </Pressable>
              ) : null}

              {/* Option: Hotel / Base (if available and distinct from destination) */}
              {hotelEndpoint && !areEndpointsEqual(hotelEndpoint, destination) ? (
                <Pressable
                  onPress={() => {
                    setOrigin({ type: 'endpoint', endpoint: hotelEndpoint });
                    setPickingOrigin(false);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    origin.type === 'endpoint' &&
                      areEndpointsEqual(origin.endpoint, hotelEndpoint) && {
                        backgroundColor: c.surface,
                      },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <View style={styles.optionContent}>
                    <Text style={[type.bodyStrong, { color: c.text }]}>
                      Hotel: {hotelEndpoint.title}
                    </Text>
                    {hotelEndpoint.address ? (
                      <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
                        {hotelEndpoint.address}
                      </Text>
                    ) : null}
                  </View>
                  {origin.type === 'endpoint' &&
                  areEndpointsEqual(origin.endpoint, hotelEndpoint) ? (
                    <Icon name="check" size={18} color={c.accentText} />
                  ) : null}
                </Pressable>
              ) : null}

              {/* Option: Other saved places */}
              {savedPlaces
                .filter(
                  (sp) =>
                    !areEndpointsEqual(sp, destination) &&
                    (!previousEndpoint || !areEndpointsEqual(sp, previousEndpoint)) &&
                    (!hotelEndpoint || !areEndpointsEqual(sp, hotelEndpoint)),
                )
                .slice(0, 4)
                .map((place, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      setOrigin({ type: 'endpoint', endpoint: place });
                      setPickingOrigin(false);
                    }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      origin.type === 'endpoint' &&
                        areEndpointsEqual(origin.endpoint, place) && {
                          backgroundColor: c.surface,
                        },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <View style={styles.optionContent}>
                      <Text style={[type.bodyStrong, { color: c.text }]}>{place.title}</Text>
                      {place.address ? (
                        <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
                          {place.address}
                        </Text>
                      ) : null}
                    </View>
                    {origin.type === 'endpoint' && areEndpointsEqual(origin.endpoint, place) ? (
                      <Icon name="check" size={18} color={c.accentText} />
                    ) : null}
                  </Pressable>
                ))}
            </View>
          )}
        </View>

        {/* Travel Mode Selector */}
        <View style={styles.modeSection}>
          <Text style={[type.overline, { color: c.textMuted }]}>TRAVEL MODE</Text>
          <View style={styles.modeRow}>
            {MODE_OPTIONS.map((opt) => {
              const selected = mode === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => setMode(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Travel mode ${opt.label}`}
                  style={[
                    styles.modeChip,
                    {
                      borderColor: selected ? c.accent : c.border,
                      backgroundColor: selected ? c.accentSoft : c.surface,
                    },
                  ]}>
                  <Text
                    style={[
                      type.label,
                      { color: selected ? c.accentText : c.text },
                    ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Primary Action */}
        <Button
          label="Open in Google Maps"
          variant="primary"
          onPress={() => void handleOpenMaps()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  optionsList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minHeight: touchTarget,
  },
  optionContent: {
    flex: 1,
    gap: 2,
  },
  modeSection: {
    gap: spacing.xs,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    paddingHorizontal: spacing.xs,
  },
});
