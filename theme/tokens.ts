import type { TextStyle } from 'react-native';

// Dark luxe palette. One signature accent (volt) per screen; gold is reserved for prizes and wins.
export const color = {
  bg: '#07080A',
  surface: '#0E1013',
  raised: '#15181D',
  hairline: 'rgba(255,255,255,0.06)',
  highlight: 'rgba(255,255,255,0.09)',
  text: '#F4F1EA',
  muted: '#8A8F98',
  faint: '#4A4F57',
  volt: '#D7FF3A',
  voltDim: 'rgba(215,255,58,0.14)',
  gold: '#E8C36A',
  goldDim: 'rgba(232,195,106,0.14)',
  danger: '#FF5A4E',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const font = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const type = {
  hero: { fontFamily: font.display, fontSize: 64, letterSpacing: -2.5, color: color.text },
  title: { fontFamily: font.display, fontSize: 30, letterSpacing: -1, color: color.text },
  heading: { fontFamily: font.displayMedium, fontSize: 20, letterSpacing: -0.4, color: color.text },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: color.text },
  label: { fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: color.muted },
  caption: { fontFamily: font.bodyMedium, fontSize: 13, color: color.muted },
  num: { fontFamily: font.display, fontVariant: ['tabular-nums'], color: color.text },
} satisfies Record<string, TextStyle>;
