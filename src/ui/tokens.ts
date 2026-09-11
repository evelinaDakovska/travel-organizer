import { useColorScheme } from 'react-native';

const palette = {
  light: {
    background: '#FBFAF8',
    surface: '#FFFFFF',
    surfaceSunken: '#F2F0EC',
    border: '#E5E1DA',
    text: '#1A1917',
    textMuted: '#6B6862',
    textFaint: '#9C9890',
    accent: '#1F6F5C',
    accentSoft: '#E4F0EC',
    danger: '#B3261E',
    warning: '#8A5A00',
    onAccent: '#FFFFFF',
  },
  dark: {
    background: '#141413',
    surface: '#1E1D1B',
    surfaceSunken: '#272623',
    border: '#343330',
    text: '#F5F3EF',
    textMuted: '#A8A49C',
    textFaint: '#7A766E',
    accent: '#6FC0A8',
    accentSoft: '#1C2E29',
    danger: '#F2B8B5',
    warning: '#E8B45F',
    onAccent: '#0E1A17',
  },
} as const;

export type Colors = Record<keyof (typeof palette)['light'], string>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
  overline: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1 },
} as const;

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
