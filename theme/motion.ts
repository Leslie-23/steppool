import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

// Every animation in the app draws from these so motion feels like one system.
export const spring = {
  /** Buttons, chips, toggles. */
  snappy: { damping: 18, stiffness: 320, mass: 0.7 } satisfies WithSpringConfig,
  /** Cards, sheets, list reorders. */
  soft: { damping: 22, stiffness: 160, mass: 1 } satisfies WithSpringConfig,
  /** Hero numbers and the ring: a small overshoot that settles with weight. */
  heavy: { damping: 14, stiffness: 90, mass: 1.2 } satisfies WithSpringConfig,
} as const;

export const timing = {
  quick: { duration: 180, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  base: { duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1) } satisfies WithTimingConfig,
  slow: { duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1) } satisfies WithTimingConfig,
} as const;
