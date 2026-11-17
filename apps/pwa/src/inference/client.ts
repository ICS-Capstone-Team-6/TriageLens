// Promise wrapper around the inference worker. One request at a time (one model, 2 GB phones).
import type { ErrorCode, Screened, WorkerRequest, WorkerResponse } from './messages';

export class ModelError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

export interface Ready { threads: number; modelSha256: string; crossOriginIsolated: boolean }

export class InferenceClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private pending: ((m: WorkerResponse) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private failed = false;
  private onProgress: ((step: 1 | 2) => void) | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') return this.onProgress?.(e.data.step);
      if (this.timeout !== null) clearTimeout(this.timeout);
      this.timeout = null;
      const done = this.pending;
      this.pending = null;
      done?.(e.data);
    };
    this.worker.onerror = () => this.fail();
    this.worker.onmessageerror = () => this.fail();
  }

  private fail() {
    this.failed = true;
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
    const done = this.pending;
    this.pending = null;
    this.onProgress = null;
    this.worker.terminate();
    done?.({ type: 'error', code: 'model_load' });
  }

  private ask(msg: WorkerRequest): Promise<WorkerResponse> {
    if (this.failed) return Promise.resolve({ type: 'error', code: 'model_load' });
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timeout = setTimeout(() => this.fail(), msg.type === 'init' ? 180_000 : 60_000);
      this.worker.postMessage(msg);
    });
  }

  async init(modelUrl: string, modelSha256: string): Promise<Ready> {
    const r = await this.ask({ type: 'init', modelUrl, modelSha256 });
    if (r.type === 'ready') return r;
    throw new ModelError(r.type === 'error' ? r.code : 'model_load');
  }

  async screen(file: Blob, onProgress: (step: 1 | 2) => void): Promise<Screened> {
    this.onProgress = onProgress;
    const r = await this.ask({ type: 'screen', file });
    this.onProgress = null;
    if (r.type === 'screened') return r;
    throw new ModelError(r.type === 'error' ? r.code : 'model_run');
  }
}
