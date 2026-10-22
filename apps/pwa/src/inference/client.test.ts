import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceClient } from './client';

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.last = this; }
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('InferenceClient worker failures', () => {
  it('rejects initialization when the worker crashes, rather than loading forever', async () => {
    const client = new InferenceClient();
    const result = expect(client.init('/model.onnx', 'sha')).rejects.toMatchObject({ code: 'model_load' });
    FakeWorker.last.onerror!();
    await result;
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
  });

  it('rejects unreadable worker messages', async () => {
    const client = new InferenceClient();
    const result = expect(client.init('/model.onnx', 'sha')).rejects.toMatchObject({ code: 'model_load' });
    FakeWorker.last.onmessageerror!();
    await result;
  });

  it('bounds initialization time and refuses reuse after a fatal timeout', async () => {
    const client = new InferenceClient();
    const result = expect(client.init('/model.onnx', 'sha')).rejects.toMatchObject({ code: 'model_load' });
    await vi.advanceTimersByTimeAsync(180_000);
    await result;
    await expect(client.init('/model.onnx', 'sha')).rejects.toMatchObject({ code: 'model_load' });
    expect(FakeWorker.last.postMessage).toHaveBeenCalledTimes(1);
  });

  it('clears the timeout when the worker is ready', async () => {
    const client = new InferenceClient();
    const pending = client.init('/model.onnx', 'sha');
    FakeWorker.last.onmessage!({ data: { type: 'ready', threads: 4, modelSha256: 'sha', crossOriginIsolated: true } } as MessageEvent);
    await expect(pending).resolves.toMatchObject({ threads: 4 });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(FakeWorker.last.terminate).not.toHaveBeenCalled();
  });
});
