// Per-screening state rules (hazard H5, TRD 3.2). The age band belongs to one person:
// it is kept only for a retake of the same image, and cleared when a screening ends,
// so the next person's age is always asked again.
import type { AgeBand } from './records';

export type Age = AgeBand | 'under15' | null;
export type EndAction = 'retake' | 'done' | 'cancel' | 'error';

export function ageAfter(action: EndAction, age: Age): Age {
  return action === 'retake' ? age : null;
}

/** Screening may start only with a model, valid thresholds and an adult age band. */
export function canScreen(modelReady: boolean, thresholdsOk: boolean, age: Age): boolean {
  return modelReady && thresholdsOk && age !== null && age !== 'under15';
}
