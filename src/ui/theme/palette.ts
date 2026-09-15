/**
 * Raw colour ramps — the only place hex values live. Nothing outside `src/ui/theme/` imports this
 * file: screens read semantic roles through `useColors()`. To re-theme the app, edit these ramps
 * (or point `roles.ts` at different steps) and run the contrast test in `roles.test.ts`.
 *
 * Source: the Organic design system with the travel app's accents. Accent ramps were generated in
 * OKLCH on one shared lightness curve (97% → 24%), so the same step of any ramp carries the same
 * visual weight; React Native cannot parse oklch(), hence hex.
 */

type Ramp = Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

/** Organic's warm grey. */
const neutral: Ramp = {
  100: '#f9f4ed',
  200: '#eee7db',
  300: '#dcd3c4',
  400: '#c0b6a5',
  500: '#a19786',
  600: '#82796a',
  700: '#645c50',
  800: '#474238',
  900: '#2e2b25',
};

/** "Canal teal" — oklch(58% 0.09 210) at its base. */
const accent: Ramp = {
  100: '#eaf8fb',
  200: '#d2eef3',
  300: '#acdbe3',
  400: '#7bbeca',
  500: '#3c9baa',
  600: '#107c8b',
  700: '#005e6b',
  800: '#004049',
  900: '#00252b',
};

/** "Stone gold" — oklch(62% 0.09 75) at its base. */
const accent2: Ramp = {
  100: '#fdf4e7',
  200: '#f8e5cb',
  300: '#e9cca6',
  400: '#cfaa77',
  500: '#b08341',
  600: '#906520',
  700: '#6f4a06',
  800: '#4d3202',
  900: '#2d1b00',
};

/** Not in Organic. Hue 30 on the same lightness curve, a little more chroma so it reads as a warning. */
const danger: Ramp = {
  100: '#fff1ed',
  200: '#ffdfd8',
  300: '#fcc1b6',
  400: '#ea998b',
  500: '#cf6b5b',
  600: '#b1483a',
  700: '#8c2e23',
  800: '#621e16',
  900: '#3a0f09',
};

export const ramps = { neutral, accent, accent2, danger } as const;

/** The grounds the ramps sit on. */
export const grounds = {
  cream: '#f5ead8',
  /** Cream darkened by the ink at 6%, for sunken wells on the light ground. */
  creamShade: '#e8ddcc',
  sand: '#ebddc5',
  /** Ink at 16% over cream — Organic's divider. */
  creamRule: '#d3c9ba',
  ink: '#201e1d',
  inkShade: '#191716',
  /** Accent base, shared by both schemes' filled controls on the light ground. */
  accentBase: '#258998',
  accent2Base: '#a67e44',
} as const;
