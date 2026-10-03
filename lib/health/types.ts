import type { StepSample } from '@/shared/contracts';

export type HealthAvailability = 'available' | 'needs-install' | 'unavailable';

export interface HealthSource {
  availability(): Promise<HealthAvailability>;
  /** Shows the OS permission sheet. Resolves true if step reads were granted (iOS cannot tell; it assumes yes). */
  requestAuth(): Promise<boolean>;
  /** Raw per-interval samples with their writer app, never a pre-summed total. */
  getStepSamples(from: Date, to: Date): Promise<StepSample[]>;
  openSettings?(): void;
}
