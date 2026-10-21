// Per-screening state rules (hazard H5, TRD 3.2). The age band belongs to one person:
// it is kept only for a retake of the same image, and cleared when a screening ends,
// so the next person's age is always asked again.
import type { AgeBand } from './records';

export type Age = AgeBand | 'under15' | null;
export type EndAction = 'retake' | 'done' | 'cancel' | 'error';

export function ageAfter(action: EndAction, age: Age): Age {
  return action === 'retake' ? age : null;
}

/** Results only when the loaded model is the exact file the thresholds were set for (H7). */
export function modelMatches(loadedSha256: string, thresholdsSha256: string): boolean {
  return /^[0-9a-f]{64}$/.test(loadedSha256) && loadedSha256 === thresholdsSha256.toLowerCase();
}

/** Production builds must have the team backend, so only signed-in accounts can screen (H3, ADR-19). */
export function backendRequired(isProductionBuild: boolean, backendConfigured: boolean): boolean {
  return isProductionBuild && !backendConfigured;
}

/** Screening may start only with a model, valid thresholds and an adult age band. */
export function canScreen(modelReady: boolean, thresholdsOk: boolean, age: Age): boolean {
  return modelReady && thresholdsOk && age !== null && age !== 'under15';
}
