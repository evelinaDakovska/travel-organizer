import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import {
  buildPlanningContext,
  CUSTOM_REQUEST_MAX,
  DEFAULT_PLANNING_OPTIONS,
  PLANNING_INTENTIONS,
  type PlanningOptions,
} from '../../../src/domain/planningContext';
import { queryView } from '../../../src/hooks/queryView';
import { useBusy } from '../../../src/hooks/useBusy';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { PLANNING_TABLES, readPlanningInput } from '../../../src/repositories/planningContext';
import { Button } from '../../../src/ui/components/Button';
import { CheckBox } from '../../../src/ui/components/CheckBox';
import { Field, Input } from '../../../src/ui/components/Field';
import { FormScroll } from '../../../src/ui/components/FormScroll';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { Notice } from '../../../src/ui/components/Notice';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../../src/ui/tokens';

type Toggle = 'ideas' | 'stays' | 'travellers';

const TOGGLES: { key: Toggle; title: string; subtitle: string }[] = [
  { key: 'ideas', title: 'Ideas not decided yet', subtitle: 'Saved places, marked as ideas' },
  { key: 'stays', title: 'Where we stay', subtitle: 'The place name for each night — never the address' },
  { key: 'travellers', title: 'Who is travelling', subtitle: 'Numbers only: adults and children, no names' },
];

/**
 * Plan with AI (2D): this trip as text for ChatGPT or any assistant — what is planned, what is
 * only an idea, and what to help with. The person sees exactly what will leave the phone; Copy and
 * Share use that very string, unchanged. Nothing is written: choices are not saved, the trip is
 * only read, and nothing is sent anywhere unless the person copies or shares it.
 */
export default function PlanWithAiScreen() {
  const c = useColors();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [options, setOptions] = useState<PlanningOptions>(DEFAULT_PLANNING_OPTIONS);
  const [copied, setCopied] = useState(false);
  const [busy, run] = useBusy();

  const query = useLiveQuery(
    useCallback((database) => readPlanningInput(database, tripId), [tripId]),
    PLANNING_TABLES,
    [tripId],
  );
  const input = query.data;
  // The one string that is previewed, copied and shared.
  const text = useMemo(() => (input ? buildPlanningContext(input, options) : ''), [input, options]);

  const view = queryView(query);
  if (view !== 'ready' || !input) {
    return (
      <QueryScreen
        title="Plan with AI"
        view={view}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={query.refetch}
      />
    );
  }

  const set = (next: Partial<PlanningOptions>) => {
    setCopied(false);
    setOptions((now) => ({ ...now, ...next }));
  };

  const copy = () =>
    run(async () => {
      try {
        await Clipboard.setStringAsync(text);
        setCopied(true);
      } catch (error) {
        console.warn('Copy failed', error);
        Alert.alert('Could not copy', 'Try Share instead.');
      }
    });

  const share = () =>
    run(async () => {
      try {
        await Share.share({ message: text });
      } catch (error) {
        console.warn('Share failed', error);
        Alert.alert('Could not share', 'Try Copy instead.');
      }
    });

  return (
    <Screen>
      <ScreenHeader title="Plan with AI" context={input.trip.destination || input.trip.name} />
      <FormScroll
        contentStyle={styles.content}
        footer={
          // Stacked, full width: side by side, "Copy for ChatGPT" was cut short even at 1.0.
          <>
            <Button label={copied ? 'Copied' : 'Copy for ChatGPT'} busy={busy} onPress={() => void copy()} />
            <Button label="Share" variant="secondary" busy={busy} onPress={() => void share()} />
          </>
        }>
        <Text style={[type.body, { color: c.textMuted }]}>
          A summary of this trip to paste into ChatGPT or another assistant, so it knows what you
          already plan. The app sends nothing itself — you copy or share it.
        </Text>

        <View style={styles.section}>
          <SectionLabel>What would you like help with?</SectionLabel>
          <Rows>
            {PLANNING_INTENTIONS.map((intention) => {
              const chosen = options.intention === intention.key;
              return (
                <Pressable
                  key={intention.key}
                  onPress={() => set({ intention: intention.key })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  accessibilityLabel={intention.label}>
                  <ListRow
                    title={intention.label}
                    leading={
                      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <CheckBox
                          checked={chosen}
                          onToggle={() => set({ intention: intention.key })}
                          accessibilityLabel={intention.label}
                        />
                      </View>
                    }
                  />
                </Pressable>
              );
            })}
          </Rows>
          {options.intention === 'custom' ? (
            <Field
              label="Your request"
              hint={`${options.customRequest.length}/${CUSTOM_REQUEST_MAX} · shared exactly as you type it`}>
              <Input
                value={options.customRequest}
                onChangeText={(value) => set({ customRequest: value.slice(0, CUSTOM_REQUEST_MAX) })}
                placeholder="e.g. We arrive tired on day one — keep that evening free"
                multiline
                maxLength={CUSTOM_REQUEST_MAX}
              />
            </Field>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionLabel>What to include</SectionLabel>
          <Text style={[type.body, { color: c.textMuted }]}>
            Always: the destination, the dates and what is planned, day by day — titles, times,
            kinds and place names.
          </Text>
          <Rows>
            {TOGGLES.map((toggle) => {
              const on = options[toggle.key];
              return (
                <Pressable
                  key={toggle.key}
                  onPress={() => set({ [toggle.key]: !on })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${toggle.title}. ${toggle.subtitle}`}>
                  <ListRow
                    title={toggle.title}
                    subtitle={toggle.subtitle}
                    leading={
                      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <CheckBox
                          checked={on}
                          onToggle={() => set({ [toggle.key]: !on })}
                          accessibilityLabel={toggle.title}
                        />
                      </View>
                    }
                  />
                </Pressable>
              );
            })}
          </Rows>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Never included: names, booking references, prices and payments, notes, addresses,
            documents, links, lists and to-dos.
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>Exactly what will be shared</SectionLabel>
          <Notice title="Review this text before sharing" icon="warning">
            Activity titles and place names may contain personal information.
          </Notice>
          <View
            style={[styles.preview, { borderColor: c.border, backgroundColor: c.surface }]}
            accessibilityLabel="Text to be shared">
            <Text selectable style={[type.caption, { color: c.text }]}>
              {text}
            </Text>
          </View>
          <Text style={[type.caption, { color: c.textMuted }]}>{`${text.length} characters`}</Text>
          {copied ? (
            <Notice title="Copied" tone="info" icon="check">
              Paste it into ChatGPT, then ask for what you need.
            </Notice>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionLabel>Suggestions you can import</SectionLabel>
          <Text style={[type.body, { color: c.textMuted }]}>
            Ask the assistant for “activities to import”, save its reply as a .json file, then
            choose it in Import activities. You decide what is added.
          </Text>
          <Button
            label="Import activities"
            variant="secondary"
            onPress={() => router.push(`/trip/${tripId}/import-activities`)}
          />
        </View>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  section: { gap: spacing.sm },
  preview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.md },
});
