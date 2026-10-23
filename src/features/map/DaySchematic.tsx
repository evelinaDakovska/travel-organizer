import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { schematicLayout, type RouteStop } from '../../domain/dayRoute';
import { fonts, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { stops: readonly RouteStop[] };

const HEIGHT = 260;
const PADDING = 32;
const PIN = 14;

/**
 * The day's stops that have coordinates, drawn where they are relative to each other — numbered as
 * in the list, joined in order by dashed straight lines — on a plain ground with north up. Not a map:
 * no streets, no scale, no distances; the caption under it says so (plan §3.2). Drawn
 * in the app from the plans' own coordinates: nothing is fetched, so it works offline.
 */
export function DaySchematic({ stops }: Props) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const layout = width > 0 ? schematicLayout(stops, width, HEIGHT, PADDING) : { points: [], path: [] };
  const placed = stops.filter((stop) => stop.coordinates !== null);
  const summary = `Drawing of ${placed.length} of ${stops.length} stops: ${placed.map((stop) => stop.label).join(', ')}.`;

  return (
    <View style={styles.block}>
      <View
        style={[styles.box, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Rect x={0} y={0} width={width} height={HEIGHT} fill="transparent" />
            {layout.path.length > 1 ? (
              <Polyline
                points={layout.path.map((index) => `${layout.points[index].x},${layout.points[index].y}`).join(' ')}
                fill="none"
                stroke={c.textMuted}
                strokeWidth={2}
                strokeDasharray="6 6"
                strokeLinejoin="round"
              />
            ) : null}
            {layout.points.map((point) => {
              const label = point.numbers.join(' · ');
              const pillWidth = Math.max(PIN * 2, label.length * 7 + 14);
              return (
                <G key={label}>
                  {point.numbers.length === 1 ? (
                    <Circle cx={point.x} cy={point.y} r={PIN} fill={c.accent} stroke={c.surface} strokeWidth={2} />
                  ) : (
                    <Rect
                      x={point.x - pillWidth / 2}
                      y={point.y - PIN}
                      width={pillWidth}
                      height={PIN * 2}
                      rx={PIN}
                      fill={c.accent}
                      stroke={c.surface}
                      strokeWidth={2}
                    />
                  )}
                  <SvgText
                    x={point.x}
                    y={point.y + 4}
                    fill={c.onAccent}
                    fontSize={12}
                    fontFamily={fonts.bodyBold}
                    textAnchor="middle"
                  >
                    {label}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>
      {/* Under the drawing, never over a pin, and read with it. */}
      <Text style={[type.caption, { color: c.textMuted }]}>
        North is up. Straight lines show the order, not the way: no streets, no distances.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: HEIGHT,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  block: { gap: spacing.xs },
});
