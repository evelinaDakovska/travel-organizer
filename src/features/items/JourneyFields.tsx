import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  legDefaultDate,
  nextLeg,
  type Journey,
  type Leg,
  type LegProblem,
} from '../../domain/journey';
import { followStart } from '../../domain/tripItem';
import { lastKnownPlace, withLegZones } from '../../domain/zoneHints';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Field, Input } from '../../ui/components/Field';
import { MomentField } from '../../ui/components/MomentField';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  journey: Journey;
  onChange: (journey: Journey) => void;
  defaultTz: string;
  defaultDate: string;
  problems: readonly LegProblem[];
};

/**
 * The legs of a journey, way out then way back. Each becomes its own item on save, so each has
 * its own times and zones: a flight leaves Sofia on Sofia time and lands in Vienna on Vienna's.
 */
export function JourneyFields({ journey, onChange, defaultTz, defaultDate, problems }: Props) {
  const part = (name: keyof Journey, title: string, minimum: number) => {
    const legs = journey[name];
    const set = (next: Leg[]) => onChange({ ...journey, [name]: next });

    return (
      <View style={styles.part}>
        <SectionLabel>{title}</SectionLabel>
        {legs.map((leg, index) => (
          <LegCard
            key={index}
            title={legs.length > 1 ? `Leg ${index + 1} of ${legs.length}` : 'Direct'}
            leg={leg}
            onChange={(next) => set(legs.map((l, i) => (i === index ? next : l)))}
            onRemove={
              legs.length > minimum ? () => set(legs.filter((_, i) => i !== index)) : undefined
            }
            defaultTz={defaultTz}
            defaultDate={legDefaultDate(legs, index, defaultDate)}
            problem={problems.find((p) => p.part === name && p.index === index)?.message}
          />
        ))}
        <Button
          label="+ Add a connection"
          variant="secondary"
          compact
          onPress={() => set([...legs, nextLeg(legs[legs.length - 1])])}
        />
      </View>
    );
  };

  return (
    <View style={styles.stack}>
      {part('outbound', 'Way out', 1)}
      {journey.returning.length > 0 ? part('returning', 'Way back', 1) : null}
    </View>
  );
}

type LegProps = {
  title: string;
  leg: Leg;
  onChange: (leg: Leg) => void;
  onRemove?: () => void;
  defaultTz: string;
  defaultDate: string;
  problem?: string;
};

function LegCard({ title, leg, onChange, onRemove, defaultTz, defaultDate, problem }: LegProps) {
  const c = useColors();
  // Every change passes through here, so a city typed in From or To fills that end's zone (N6),
  // and a zone filled from the last city known there follows a new one (A6). Cards are keyed by
  // position, so a leg this card did not produce (one moved up by a removal) starts afresh.
  const memory = useRef<{ sent: Leg | null; from: string | null; to: string | null }>({
    sent: null,
    from: null,
    to: null,
  });
  const change = (next: Leg) => {
    const own = memory.current.sent === leg;
    const before = {
      from: own ? memory.current.from : lastKnownPlace(null, leg.from),
      to: own ? memory.current.to : lastKnownPlace(null, leg.to),
    };
    const result = withLegZones(before, next, defaultTz);
    memory.current = {
      sent: result,
      from: lastKnownPlace(before.from, next.from),
      to: lastKnownPlace(before.to, next.to),
    };
    onChange(result);
  };
  const text = (key: 'from' | 'to' | 'number' | 'seat') => (value: string) =>
    change({ ...leg, [key]: value === '' ? undefined : value });

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[type.heading, { color: c.text }]}>{title}</Text>
        {onRemove ? (
          <Pressable onPress={onRemove} hitSlop={12} accessibilityRole="button">
            <Text style={[type.caption, { color: c.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={styles.grow}>
          <Field label="From">
            <Input value={leg.from ?? ''} onChangeText={text('from')} placeholder="Sofia" />
          </Field>
        </View>
        <View style={styles.grow}>
          <Field label="To">
            <Input value={leg.to ?? ''} onChangeText={text('to')} placeholder="Vienna" />
          </Field>
        </View>
      </View>

      <Field label="Departs" error={problem}>
        <MomentField
          value={leg.departs}
          onChange={(departs) =>
            change({ ...leg, departs, arrives: followStart(departs, leg.arrives) })
          }
          defaultTz={defaultTz}
          place={leg.from}
          addLabel="Add the departure"
          initial={defaultDate}
        />
      </Field>

      <Field label="Arrives" hint="Optional. Each end is in the local time where it happens. Check both zones">
        <MomentField
          value={leg.arrives}
          onChange={(arrives) => change({ ...leg, arrives })}
          defaultTz={defaultTz}
          place={leg.to}
          addLabel="Add the arrival"
          initial={leg.departs?.local ?? defaultDate}
          minDate={leg.departs?.local.slice(0, 10)}
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.grow}>
          <Field label="Number">
            <Input
              value={leg.number ?? ''}
              onChangeText={text('number')}
              autoCapitalize="characters"
              placeholder="OS 796"
            />
          </Field>
        </View>
        <View style={styles.grow}>
          <Field label="Seat">
            <Input value={leg.seat ?? ''} onChangeText={text('seat')} placeholder="12A" />
          </Field>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  part: { gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
  grow: { flex: 1 },
});
