/**
 * Semantic colour roles for each scheme. Components ask for a role ("the text on a tinted tag"),
 * never for a swatch, so changing the palette never means editing a screen.
 *
 * Pure TypeScript — no React Native — so `roles.test.ts` can check contrast in node.
 */

import { dark, light, type Swatches } from './palette';

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

  /** The one action colour: primary buttons, links, selection, the active tab. */
  accent: string;
  accentPressed: string;
  /** Label on an accent fill. */
  onAccent: string;
  /** A tinted ground for the selected day, an icon tile, an informational tag. */
  accentSoft: string;
  /** Accent-coloured text: links, the active tab, text on `accentSoft`. */
  accentText: string;

  /** What needs doing: money still owed, a zone to confirm, a stale screen. Never every item. */
  attention: string;
  attentionSoft: string;
  /** What is settled: paid, happening now. Quieter than attention. */
  success: string;
  successSoft: string;

  neutralSoft: string;
  neutralText: string;

  /** Destructive actions and a file that has gone missing. */
  danger: string;
  dangerSoft: string;

  /** The destination cover on Trips. */
  cover: string;
  onCover: string;
  onCoverMuted: string;

  shadow: string;
  scrim: string;
  tabInactive: string;
};

function rolesFrom(s: Swatches): ColorRoles {
  return {
    background: s.canvas,
    surface: s.surface,
    surfaceSunken: s.sunken,
    border: s.border,
    text: s.ink,
    textMuted: s.secondary,
    textFaint: s.faint,

    accent: s.action,
    accentPressed: s.actionPressed,
    onAccent: s.onAction,
    accentSoft: s.tint,
    accentText: s.tintText,

    attention: s.attention,
    attentionSoft: s.attentionSoft,
    success: s.success,
    successSoft: s.successSoft,

    neutralSoft: s.neutralSoft,
    neutralText: s.neutralText,

    danger: s.danger,
    dangerSoft: s.dangerSoft,

    cover: s.cover,
    onCover: s.onCover,
    onCoverMuted: s.onCoverMuted,

    shadow: s.shadow,
    scrim: s.scrim,
    tabInactive: s.secondary,
  };
}

export const lightRoles: ColorRoles = rolesFrom(light);
export const darkRoles: ColorRoles = rolesFrom(dark);

export const colorRoles = { light: lightRoles, dark: darkRoles } as const;

/** WCAG relative luminance of a '#rrggbb' colour. */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
