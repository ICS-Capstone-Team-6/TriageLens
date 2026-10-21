// Triage zones for one condition (TRD 7.2, ADR-20). Pure and tested: src/lib/triage.test.ts.
// Rules:
//  - a failed quality check gives no zone, only a retake reason (zone 'retake' in the record);
//  - score at or above the refer threshold -> refer_now;
//  - score strictly below the screen-out threshold -> low_risk (a tie goes to unsure,
//    toward refer, never toward reassurance);
//  - anything else, or any invalid input, -> unsure.
// Thresholds come only from the versioned thresholds file (config.ts), never literals here.

export type Zone = 'refer_now' | 'unsure' | 'low_risk' | 'retake';

export interface Thresholds {
  version: string;
  screenOut: number; // probability
  refer: number; // probability
}

export function sigmoid(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

export function zoneFor(probability: number, t: Thresholds, qualityPassed: boolean): Zone {
  if (!qualityPassed) return 'retake';
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return 'unsure';
  if (!validThresholds(t)) return 'unsure';
  if (probability >= t.refer) return 'refer_now';
  if (probability < t.screenOut) return 'low_risk';
  return 'unsure';
}

export function validThresholds(t: Pick<Thresholds, 'screenOut' | 'refer'>): boolean {
  return (
    Number.isFinite(t.screenOut) && Number.isFinite(t.refer) &&
    t.screenOut > 0 && t.refer < 1 && t.screenOut <= t.refer
  );
}
