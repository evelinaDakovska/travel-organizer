/**
 * Raw colours — the only place hex values live. Nothing outside `src/ui/theme/` imports this file:
 * screens read semantic roles through `useColors()`. To re-theme the app, edit these swatches (or
 * point `roles.ts` at different ones) and run the contrast test in `roles.test.ts`.
 *
 * Source: the Fieldbook design (owner's design review, 12 Oct 2026, B1). A quiet cool neutral
 * instead of beige, one blue for action and selection, burnt orange for what needs attention
 * (money owed, a zone to confirm), green for what is settled. Personality lives in the trip's
 * name and cover, not in the colours.
 */

export type Swatches = {
  canvas: string;
  surface: string;
  /** A step below the canvas: wells, empty states, a pressed row. */
  sunken: string;
  border: string;
  ink: string;
  secondary: string;
  faint: string;

  action: string;
  actionPressed: string;
  onAction: string;
  tint: string;
  tintText: string;

  attention: string;
  attentionSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;

  neutralSoft: string;
  neutralText: string;

  /** The destination cover: a deep blue in both schemes, with light text on it. */
  cover: string;
  onCover: string;
  onCoverMuted: string;

  shadow: string;
  scrim: string;
};

export const light: Swatches = {
  canvas: '#f5f7fa',
  surface: '#ffffff',
  sunken: '#e9edf2',
  border: '#dce3eb',
  ink: '#172331',
  secondary: '#536477',
  faint: '#7a8899',

  action: '#13616b',
  actionPressed: '#0e4a52',
  onAction: '#ffffff',
  tint: '#e6f3f5',
  tintText: '#13616b',

  attention: '#8b431e',
  attentionSoft: '#fff0e5',
  success: '#23664c',
  successSoft: '#eaf5ee',
  danger: '#a8321f',
  dangerSoft: '#fdeeeb',

  neutralSoft: '#edf1f5',
  neutralText: '#3c4a5a',

  cover: '#182f43',
  onCover: '#ffffff',
  onCoverMuted: '#c9d8e4',

  shadow: '#172331',
  scrim: '#0b1118',
};

export const dark: Swatches = {
  canvas: '#111821',
  surface: '#1b2530',
  sunken: '#0c1219',
  border: '#344251',
  ink: '#eef3fa',
  secondary: '#b1bdcc',
  faint: '#8796a8',

  action: '#78d0d8',
  actionPressed: '#9fe1e7',
  onAction: '#111821',
  tint: '#16353b',
  tintText: '#78d0d8',

  attention: '#ffd1a8',
  attentionSoft: '#38291e',
  success: '#a3e0be',
  successSoft: '#20382b',
  danger: '#ffb4a9',
  dangerSoft: '#3d1f1b',

  neutralSoft: '#26313d',
  neutralText: '#d3dbe5',

  cover: '#243d52',
  onCover: '#ffffff',
  onCoverMuted: '#c9d8e4',

  shadow: '#000000',
  scrim: '#000000',
};
