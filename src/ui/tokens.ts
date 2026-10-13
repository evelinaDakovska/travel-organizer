import { useColorScheme } from 'react-native';

import { colorRoles, type ColorRoles } from './theme/roles';

/**
 * Design tokens. Colours come from `theme/roles.ts` (semantic roles) over `theme/palette.ts`
 * (raw ramps); components read roles through `useColors()` and never a hex value.
 */

export type Colors = ColorRoles;

export function useColors(): Colors {
  return colorRoles[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Fieldbook radii (B1): 6 for a status label, 10 for inputs and buttons, 14 for a highlighted
 * panel, 16 for the destination cover. Rows are not rounded at all: they are separated by rules.
 */
export const radius = { sm: 6, md: 10, lg: 14, xl: 16, pill: 999 } as const;

/** Screen gutters: 20 normally, 16 on a narrow screen (B1). */
export const gutter = { normal: 20, narrow: 16 } as const;

/** The smallest touch target, in dp (B1). */
export const touchTarget = 48;

/**
 * Family names as registered in `app/_layout.tsx`. Android chooses a face by family, not by
 * `fontWeight`, so each weight is its own family and no style below sets a weight.
 */
export const fonts = {
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

/** Figures that line up in columns: times, amounts, counts. */
const tabular = { fontVariant: ['tabular-nums'] as 'tabular-nums'[] };

/**
 * One sans-serif family throughout (B1): the trip's name and the times carry the weight, not a
 * display face. Sizes are dp and grow with the phone's font scale; nothing essential is below 12.
 */
export const type = {
  /** The key time or amount on a screen: 32/38, figures aligned. */
  display: { fontFamily: fonts.bodyBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, ...tabular },
  /** A screen's title: 28/34. */
  title: { fontFamily: fonts.bodySemiBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  /** A section's heading: 18/24. */
  section: { fontFamily: fonts.bodySemiBold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  /** An item's title in a row or card: 16/22. */
  heading: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  /** A time in a row's time column, or an amount at the end of one. */
  figure: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22, ...tabular },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  /** Metadata under a title: 13/18. */
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  tag: { fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 16 },
  /** Small context above a heading ('39 DAYS TO GO'). Decoration, never the only copy of a fact. */
  overline: { fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
} as const;

/**
 * Android draws shadows from `elevation`; pair with `shadowColor: c.shadow` to tint them. Fieldbook
 * keeps shadows off peer rows and panels; only something floating over content (a sheet) has one.
 */
export const elevation = {
  md: { elevation: 6, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
} as const;

export const opacity = {
  pressed: 0.8,
  disabled: 0.45,
  /** A cancelled item in a list. */
  dimmed: 0.55,
  scrim: 0.45,
} as const;
