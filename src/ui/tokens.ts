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

/** Organic over-rounds: cards near 32, every control a pill. */
export const radius = { sm: 8, md: 16, lg: 28, xl: 32, pill: 999 } as const;

/**
 * Family names as registered in `app/_layout.tsx`. Android chooses a face by family, not by
 * `fontWeight`, so each weight is its own family and no style below sets a weight.
 */
export const fonts = {
  heading: 'Caprasimo_400Regular',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  title: { fontFamily: fonts.heading, fontSize: 23, lineHeight: 28, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  tag: { fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.9 },
} as const;

/** Android draws shadows from `elevation`; pair with `shadowColor: c.shadow` to tint them. */
export const elevation = {
  sm: { elevation: 2, shadowOpacity: 0.14, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  md: { elevation: 6, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
} as const;

export const opacity = {
  pressed: 0.8,
  disabled: 0.45,
  /** A cancelled item in a list. */
  dimmed: 0.55,
  scrim: 0.45,
} as const;
