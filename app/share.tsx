import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatFileSize } from '../src/domain/format';
import { findPlaceDuplicate, isGoogleMapsLink, isShortMapsLink, parseMapsLink } from '../src/domain/mapsLink';
import { linkHost } from '../src/domain/resource';
import {
  destinationLabel,
  destinationsFor,
  newItemFor,
  noteTitleFor,
  parseSharedContent,
  suggestTrip,
  type ShareDestination,
  type SharedContent,
} from '../src/domain/share';
import {
  kindLabel,
  PRIORITIES,
  TRIP_ITEM_KINDS,
  type Priority,
  type TripItemKind,
} from '../src/domain/tripItem';
import { lookUpMapsLink } from '../src/features/share/lookUpMapsLink';
import { saveShare } from '../src/features/share/saveShare';
import { queryView } from '../src/hooks/queryView';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { listTripItems, TRIP_ITEM_TABLES } from '../src/repositories/tripItems';
import { listTrips, TRIP_TABLES } from '../src/repositories/trips';
import { Button } from '../src/ui/components/Button';
import { Card } from '../src/ui/components/Card';
import { ChoiceField } from '../src/ui/components/ChoiceField';
import { CoordinatesInput } from '../src/ui/components/CoordinatesInput';
import { Field, Input } from '../src/ui/components/Field';
import { Notice } from '../src/ui/components/Notice';
import { LoadFailed } from '../src/ui/components/QueryStates';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { StatusTag } from '../src/ui/components/StatusTag';
import { gutter, radius, spacing, type, useColors } from '../src/ui/tokens';

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Where something shared from another app lands. The payload is read once and parsed through Zod
 * (`parseSharedContent`) — it comes from outside and is not trusted.
 */
export default function Share() {
  const c = useColors();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  // Read once: the share is cleared below so the same one never opens this screen twice.
  const [content] = useState(() => parseSharedContent(shareIntent));

  useEffect(() => {
    resetShareIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!content) {
    return (
      <Screen>
        <ScreenHeader title="Save to a trip" leading="close" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>Nothing here this app can keep.</Text>
        </View>
      </Screen>
    );
  }

  return <ShareForm content={content} />;
}

function ShareForm({ content }: { content: SharedContent }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();

  const tripsQuery = useLiveQuery(listTrips, TRIP_TABLES);
  const trips = tripsQuery.data;
  const [pickedTripId, setPickedTripId] = useState<string | null>(null);
  const trip = trips?.find((t) => t.id === pickedTripId) ?? (trips ? suggestTrip(trips) : null);

  const destinations = destinationsFor(content);
  const [destination, setDestination] = useState<ShareDestination>(destinations[0]);

  // A Google Maps link (Phase 7): what its URL says, shown and editable before saving (P7-3).
  const mapsUrl = content.kind === 'link' && isGoogleMapsLink(content.url) ? content.url : null;
  const [place, setPlace] = useState(() => {
    const read = mapsUrl ? parseMapsLink(mapsUrl) : null;
    return {
      address: read?.address ?? '',
      latitude: read?.latitude ?? undefined,
      longitude: read?.longitude ?? undefined,
      name: read?.name ?? null,
    };
  });
  const [lookUp, setLookUp] = useState<'idle' | 'busy' | 'done' | 'offline' | 'unreadable'>('idle');
  // Remounts the coordinates field when a lookup fills it, since it keeps its own text.
  const [coordinatesKey, setCoordinatesKey] = useState(0);

  const suggested = newItemFor(content);
  const [title, setTitle] = useState(
    content.kind === 'text'
      ? noteTitleFor(content.text)
      : content.kind === 'link' && !content.title && place.name
        ? place.name
        : suggested.title,
  );
  const [kind, setKind] = useState<TripItemKind>(content.kind === 'files' ? 'other' : 'activity');
  const [status, setStatus] = useState<'idea' | 'confirmed'>(suggested.status);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tripId = trip?.id ?? null;
  const { data: items } = useLiveQuery(
    useCallback(
      (database) => (tripId ? listTripItems(database, tripId) : Promise.resolve([])),
      [tripId],
    ),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  if (queryView(tripsQuery) === 'failed') {
    return (
      <Screen>
        <ScreenHeader title="Save to a trip" leading="close" />
        <View style={styles.centre}>
          <LoadFailed what="your trips" onRetry={tripsQuery.refetch} />
        </View>
      </Screen>
    );
  }

  if (trips && trips.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Save to a trip" leading="close" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted, textAlign: 'center' }]}>
            There is no trip to save this to yet. Add a trip first, then share it again.
          </Text>
        </View>
      </Screen>
    );
  }

  const needsTitle = destination === 'new-item' || destination === 'note';
  const showsPlace = mapsUrl !== null && destination === 'new-item';
  const coordinatesBad = place.latitude !== undefined && Number.isNaN(place.latitude);
  const canSave =
    trip !== null &&
    !busy &&
    (!needsTitle || title.trim().length > 0) &&
    (destination !== 'item' || itemId !== null) &&
    !(showsPlace && coordinatesBad);
  const duplicate = showsPlace
    ? findPlaceDuplicate(
        { title, latitude: place.latitude ?? null, longitude: place.longitude ?? null },
        items ?? [],
      )
    : null;

  const runLookUp = async () => {
    if (!mapsUrl) return;
    setLookUp('busy');
    const result = await lookUpMapsLink(mapsUrl);
    if (!result.ok) {
      setLookUp(result.reason);
      return;
    }
    // Fills only what is still empty: anything the person typed stays theirs.
    const found = result.place;
    setPlace((current) => ({
      address: current.address.trim() ? current.address : (found.address ?? ''),
      latitude: current.latitude ?? found.latitude ?? undefined,
      longitude: current.longitude ?? found.longitude ?? undefined,
      name: current.name ?? found.name,
    }));
    if (!title.trim() && found.name) setTitle(found.name);
    setCoordinatesKey((key) => key + 1);
    setLookUp('done');
  };

  const save = async () => {
    if (!trip) return;
    setBusy(true);
    const itemTitle = items?.find((item) => item.id === itemId)?.title ?? 'the same item';
    try {
      const { href, message } = await saveShare(
        db,
        trip,
        content,
        destination === 'new-item'
          ? {
              to: 'new-item',
              kind,
              status,
              priority,
              title,
              place: showsPlace
                ? {
                    locationName: (place.name ?? title).trim() || undefined,
                    address: place.address.trim() || undefined,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  }
                : undefined,
            }
          : destination === 'item'
            ? { to: 'item', itemId: itemId!, itemTitle }
            : destination === 'note'
              ? { to: 'note', title }
              : { to: 'trip-documents' },
      );
      if (!message) {
        router.replace(href!);
        return;
      }
      // Said before anything else, and only then on to what was saved (R5).
      Alert.alert(
        message.title,
        message.body,
        [
          {
            text: 'OK',
            onPress: () => {
              if (href) router.replace(href);
              else setBusy(false);
            },
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      // The rows go in one transaction and the copies are deleted, so this is true.
      console.warn('Saving a share failed', error);
      Alert.alert('Could not save it', 'Nothing was saved. Try again.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Save to a trip" leading="close" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SharedSummary content={content} />

        {trips && trips.length > 0 ? (
          <Field label="Trip">
            <ChoiceField
              value={trip?.id ?? null}
              options={trips.map((t) => t.id)}
              labelFor={(id) => trips.find((t) => t.id === id)?.name ?? ''}
              onChange={(next) => {
                if (!next) return;
                setPickedTripId(next);
                setItemId(null);
              }}
            />
          </Field>
        ) : null}

        {destinations.length > 1 ? (
          <Field label="Save as">
            <ChoiceField
              value={destination}
              options={destinations}
              labelFor={(d) => destinationLabel(d, content)}
              onChange={(next) => next && setDestination(next)}
            />
          </Field>
        ) : null}

        {needsTitle ? (
          <Field label="Title">
            <Input value={title} onChangeText={setTitle} placeholder="What is it" />
          </Field>
        ) : null}

        {showsPlace ? (
          <>
            {mapsUrl && isShortMapsLink(mapsUrl) && lookUp !== 'done' ? (
              <View style={styles.lookUp}>
                <Button
                  label="Look up address and coordinates"
                  variant="secondary"
                  busy={lookUp === 'busy'}
                  onPress={() => void runLookUp()}
                />
                <Text style={[type.caption, { color: c.textMuted }]}>
                  {lookUp === 'offline'
                    ? 'No answer — perhaps no connection. Save it with the link, and add the rest later.'
                    : lookUp === 'unreadable'
                      ? 'Google did not say where this link points. Save it with the link, and add the rest later.'
                      : 'Asks Google where this short link points. Nothing else is sent.'}
                </Text>
              </View>
            ) : null}
            <Field label="Address" hint="Optional">
              <Input
                value={place.address}
                onChangeText={(address) => setPlace((current) => ({ ...current, address }))}
                placeholder="Street, town"
              />
            </Field>
            <Field
              label="Coordinates"
              hint={coordinatesBad ? undefined : 'Optional. They put it on the day map'}
              error={coordinatesBad ? 'Enter coordinates like 66.5115, 25.7311' : undefined}>
              <CoordinatesInput
                key={coordinatesKey}
                latitude={place.latitude}
                longitude={place.longitude}
                onChange={(latitude, longitude) => setPlace((current) => ({ ...current, latitude, longitude }))}
                onBlur={() => undefined}
                invalid={coordinatesBad}
              />
            </Field>
            {duplicate ? (
              // A warning, never a block (P7-4): two visits to one place can be meant.
              <Notice title="Already in this trip" tone="info" icon="places">
                {`“${duplicate.title}” (${
                  duplicate.status === 'idea' ? 'saved place' : duplicate.status === 'cancelled' ? 'cancelled' : 'in the itinerary'
                }) has ${duplicate.reason === 'title' ? 'the same name' : 'a place within 100 m'}. Saving adds another.`}
              </Notice>
            ) : null}
          </>
        ) : null}

        {destination === 'new-item' ? (
          <>
            <Field label="What is it">
              <ChoiceField
                value={kind}
                options={TRIP_ITEM_KINDS}
                labelFor={kindLabel}
                onChange={(next) => next && setKind(next)}
              />
            </Field>
            <Field
              label="Status"
              hint={
                status === 'idea'
                  ? 'Saved to Places until you decide on it'
                  : 'In your itinerary — add its date from the item'
              }>
              <ChoiceField
                value={status}
                options={['idea', 'confirmed'] as const}
                labelFor={capitalise}
                onChange={(next) => next && setStatus(next)}
              />
            </Field>
            {status === 'idea' ? (
              <Field label="How much do you want it" hint="Optional">
                <ChoiceField
                  value={priority}
                  options={PRIORITIES}
                  labelFor={capitalise}
                  onChange={setPriority}
                  clearable
                />
              </Field>
            ) : null}
          </>
        ) : null}

        {destination === 'item' ? (
          <Field label="Which item">
            {items && items.length > 0 ? (
              <View style={styles.items}>
                {items.map((item) => {
                  const selected = item.id === itemId;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setItemId(item.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.title}
                      style={[
                        styles.itemRow,
                        {
                          borderColor: selected ? c.accent : c.border,
                          backgroundColor: selected ? c.accentSoft : c.surface,
                        },
                      ]}>
                      <Text
                        style={[type.bodyStrong, styles.grow, { color: c.text }]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      <StatusTag status={item.status} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[type.body, { color: c.textMuted }]}>
                This trip has no items yet — save it as a new one instead.
              </Text>
            )}
          </Field>
        ) : null}

        <Button label="Save" busy={busy} disabled={!canSave} onPress={() => void save()} />
      </ScrollView>
    </Screen>
  );
}

/** What arrived, so the person can see it is the thing they meant to share. */
function SharedSummary({ content }: { content: SharedContent }) {
  const c = useColors();
  const lines =
    content.kind === 'files'
      ? content.files.map((f) =>
          [f.fileName ?? 'Shared file', f.sizeBytes !== null ? formatFileSize(f.sizeBytes) : null]
            .filter(Boolean)
            .join(' · '),
        )
      : content.kind === 'link'
        ? [content.title, linkHost(content.url) ?? content.url].filter((l): l is string => !!l)
        : [content.text.length > 200 ? `${content.text.slice(0, 199)}…` : content.text];

  const heading =
    content.kind === 'files'
      ? content.files.length === 1
        ? 'A file'
        : `${content.files.length} files`
      : content.kind === 'link'
        ? 'A link'
        : 'Some text';

  return (
    <Card>
      <Text style={[type.overline, { color: c.textMuted }]}>{heading.toUpperCase()}</Text>
      {lines.map((line, i) => (
        <Text
          key={i}
          style={[
            i === 0 ? type.bodyStrong : type.body,
            { color: i === 0 ? c.text : c.textMuted },
          ]}>
          {line}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  items: { gap: spacing.sm },
  lookUp: { gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  grow: { flex: 1 },
});
