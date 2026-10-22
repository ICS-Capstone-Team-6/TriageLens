import type { QualityResult } from '../lib/quality';
import type { InputStats } from '../lib/stats';

export type WorkerRequest =
  | { type: 'init'; modelUrl: string; modelSha256: string }
  | { type: 'screen'; file: Blob };

export type ErrorCode = 'model_unreachable' | 'model_checksum' | 'model_load' | 'model_not_ready' | 'model_run' | 'decode';

export interface Timings { decode_ms: number; preprocess_ms: number; model_ms: number }

export interface Screened {
  type: 'screened';
  quality: QualityResult;
  stats: InputStats | null;
  logit: number | null;
  preprocess: string;
  timings: Timings;
  threads: number;
}

export type WorkerResponse =
  | { type: 'progress'; step: 1 | 2 }
  | { type: 'ready'; threads: number; modelSha256: string; crossOriginIsolated: boolean }
  | { type: 'error'; code: ErrorCode }
  | Screened;
