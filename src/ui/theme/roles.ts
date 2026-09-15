/**
 * Semantic colour roles for each scheme. Components ask for a role ("the text on a tinted tag"),
 * never for a ramp step, so changing the palette never means editing a screen.
 *
 * Pure TypeScript — no React Native — so `roles.test.ts` can check contrast in node.
 * The light scheme is the design; the dark one is derived from the same ramps.
 */

import { grounds, ramps } from './palette';

export type ColorRoles = {
  background: string;
  surface: string;
  /** Wells and empty states, a step below the ground. */
  surfaceSunken: string;
  border: string;
  text: string;
  /** Secondary text. Must still pass 4.5:1 — it carries dates and locations. */
  textMuted: string;
  /** Placeholders and decoration only. Not held to body-text contrast. */
  textFaint: string;

  /** Filled controls: primary buttons, the add button, selected chips. */
  accent: string;
  accentPressed: string;
  /** Label on an accent fill. Held to 3:1 (large text and controls). */
  onAccent: string;
  accentSoft: string;
  /** Accent-coloured text: section labels, links, the active tab. */
  accentText: string;

  accent2: string;
  accent2Soft: string;
  accent2Text: string;

  neutralSoft: string;
  neutralText: string;

  danger: string;
  dangerSoft: string;
  warning: string;

  shadow: string;
  scrim: string;
  tabInactive: string;
};

export const lightRoles: ColorRoles = {
  background: grounds.cream,
  surface: grounds.sand,
  surfaceSunken: grounds.creamShade,
  border: grounds.creamRule,
  text: grounds.ink,
  textMuted: ramps.neutral[700],
  textFaint: ramps.neutral[600],

  accent: grounds.accentBase,
  accentPressed: ramps.accent[600],
  onAccent: grounds.cream,
  accentSoft: ramps.accent[100],
  accentText: ramps.accent[700],

  accent2: grounds.accent2Base,
  accent2Soft: ramps.accent2[100],
  accent2Text: ramps.accent2[800],

  neutralSoft: ramps.neutral[100],
  neutralText: ramps.neutral[800],

  danger: ramps.danger[700],
  dangerSoft: ramps.danger[100],
  warning: ramps.accent2[700],

  shadow: ramps.neutral[900],
  scrim: ramps.neutral[900],
  tabInactive: ramps.neutral[600],
};

export const darkRoles: ColorRoles = {
  background: grounds.ink,
  surface: ramps.neutral[900],
  surfaceSunken: grounds.inkShade,
  border: ramps.neutral[800],
  text: ramps.neutral[100],
  textMuted: ramps.neutral[400],
  textFaint: ramps.neutral[500],

  accent: ramps.accent[400],
  accentPressed: ramps.accent[300],
  onAccent: ramps.accent[900],
  accentSoft: ramps.accent[900],
  accentText: ramps.accent[300],

  accent2: ramps.accent2[400],
  accent2Soft: ramps.accent2[900],
  accent2Text: ramps.accent2[300],

  neutralSoft: ramps.neutral[800],
  neutralText: ramps.neutral[200],

  danger: ramps.danger[300],
  dangerSoft: ramps.danger[900],
  warning: ramps.accent2[300],

  shadow: '#000000',
  scrim: '#000000',
  tabInactive: ramps.neutral[500],
};

export const colorRoles = { light: lightRoles, dark: darkRoles } as const;

/** WCAG relative luminance of a '#rrggbb' colour. */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
