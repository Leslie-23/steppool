import * as Haptics from 'expo-haptics';

// One vocabulary of haptics for the whole app. Fire-and-forget; failures are irrelevant.
const run = (p: Promise<void>) => void p.catch(() => {});

export const haptic = {
  /** Count-up ticks, ring progress every 10%. */
  tick: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Tab changes, segmented controls. */
  select: () => run(Haptics.selectionAsync()),
  /** Joining a challenge, confirming a hold. */
  commit: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Overtaking someone or being overtaken. */
  overtake: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Goal hit, prize won. */
  success: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
