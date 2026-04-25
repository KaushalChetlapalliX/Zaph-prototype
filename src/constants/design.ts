import type { TextStyle } from 'react-native';

export const Colors = {
  bg: {
    base: '#000000',
    card: '#1C1C1E',
    cardActive: '#2C2C2E',
    input: '#000000',
    subtle: '#111111',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#8E8E93',
    disabled: '#48484A',
  },
  brand: {
    green: '#3DAA6A',
    greenBright: '#39D353',
    greenText: '#FFFFFF',
  },
  accent: {
    gold: '#FFB800',
    silver: '#A8A9AD',
    bronze: '#CD7F32',
    blue: '#5DADE2',
    pink: '#FF375F',
  },
  border: '#2C2C2E',
  toggleOff: '#3A3A3C',
  progressTrack: '#2C2C2E',
  onCardGradient: '#1C1C1E',
} as const;

export const ProgressGradient = [
  '#39D353',
  '#30D5C8',
  '#5DADE2',
  '#BF5AF2',
  '#FF375F',
] as const;

export const CardGradients = {
  mint: ['rgba(180,235,210,0.92)', 'rgba(200,235,225,0.92)'],
  lavender: ['rgba(210,200,240,0.92)', 'rgba(220,215,245,0.92)'],
  peach: ['rgba(255,210,180,0.92)', 'rgba(255,220,200,0.92)'],
} as const;

export const Spacing = {
  screenHorizontal: 20,
  screenTop: 16,
  sectionGap: 28,
  cardPadding: 16,
  gridGap: 12,
  rowGap: 12,
  inlineGap: 10,
} as const;

export const Radius = {
  pill: 999,
  card: 16,
  cardSm: 12,
  icon: 10,
  tag: 20,
} as const;

export const Typography = {
  hero:     { fontSize: 72, fontWeight: '800', color: Colors.text.primary },
  display:  { fontSize: 40, fontWeight: '700', color: Colors.text.primary },
  title:    { fontSize: 20, fontWeight: '600', color: Colors.text.primary },
  section:  { fontSize: 17, fontWeight: '600', color: Colors.text.primary },
  body:     { fontSize: 17, fontWeight: '400', color: Colors.text.primary },
  label:    { fontSize: 14, fontWeight: '400', color: Colors.text.secondary },
  caption:  { fontSize: 12, fontWeight: '400', color: Colors.text.secondary },
  overline: { fontSize: 11, fontWeight: '600', color: Colors.text.secondary },
} as const satisfies Record<string, TextStyle>;

export type SpacingToken = keyof typeof Spacing;
export type RadiusToken = keyof typeof Radius;
export type TypographyToken = keyof typeof Typography;
