import { colorRoles, contrastRatio, type ColorRoles } from './roles';

const schemes = Object.entries(colorRoles) as [string, ColorRoles][];

describe('contrast ratio', () => {
  it('matches the WCAG reference points', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
});

// These guard a palette change: swap a ramp and anything that becomes unreadable fails here.
describe.each(schemes)('%s scheme', (_name, roles) => {
  const grounds = [roles.background, roles.surface];

  it('keeps body text comfortably readable on every ground', () => {
    for (const ground of grounds) expect(contrastRatio(roles.text, ground)).toBeGreaterThanOrEqual(7);
  });

  it('keeps secondary, accent and danger text at 4.5:1 or better', () => {
    for (const ground of grounds) {
      expect(contrastRatio(roles.textMuted, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(roles.accentText, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(roles.danger, ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps tag text readable on its own tint', () => {
    expect(contrastRatio(roles.accentText, roles.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(roles.accent2Text, roles.accent2Soft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(roles.neutralText, roles.neutralSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a label on the accent fill above the large-text bar', () => {
    expect(contrastRatio(roles.onAccent, roles.accent)).toBeGreaterThanOrEqual(3);
  });

  it('uses plain six-digit hex, which is what React Native parses everywhere', () => {
    for (const value of Object.values(roles)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

it('defines the same roles in both schemes', () => {
  expect(Object.keys(colorRoles.dark).sort()).toEqual(Object.keys(colorRoles.light).sort());
});
