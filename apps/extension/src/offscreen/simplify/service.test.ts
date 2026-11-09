import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./worker?worker', () => ({ default: vi.fn() }));
import { createSimplifyService } from './service';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function worker() {
  return {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent<unknown>) => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn(),
  };
}
afterEach(() => vi.useRealTimers());
it('terminates CPU work immediately on cancellation and isolates a late response from a new session', async () => {
  vi.useFakeTimers();
  const first = worker(),
    second = worker();
  const service = createSimplifyService({
    createWorker: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
  });
  const pending = service.execute({ operation: 'prepare', dataUrl: png, sessionId: 'first' });
  const rejected = expect(pending).rejects.toThrow('cancelled');
  const late = first.onmessage;
  await service.execute({ operation: 'cancel', sessionId: 'first' });
  await rejected;
  expect(first.terminate).toHaveBeenCalledOnce();
  const next = service.execute({ operation: 'prepare', dataUrl: png, sessionId: 'second' });
  late?.(
    new MessageEvent('message', {
      data: {
        requestId: 1,
        completion: { sessionId: 'first', width: 1, height: 1, version: 'v1' },
      },
    })
  );
  second.onmessage?.(
    new MessageEvent('message', {
      data: {
        requestId: 2,
        completion: { sessionId: 'second', width: 1, height: 1, version: 'v1' },
      },
    })
  );
  await expect(next).resolves.toMatchObject({ sessionId: 'second' });
  service.dispose();
  expect(second.terminate).toHaveBeenCalledOnce();
});
it('expires pending work and rejects malformed worker completions without keeping source caches', async () => {
  vi.useFakeTimers();
  const target = worker();
  const service = createSimplifyService({ createWorker: () => target });
  const pending = service.execute({ operation: 'prepare', dataUrl: png, sessionId: 'first' });
  const rejected = expect(pending).rejects.toThrow('expired');
  await vi.advanceTimersByTimeAsync(120_000);
  await rejected;
  expect(target.terminate).toHaveBeenCalledOnce();
  const next = service.execute({ operation: 'prepare', dataUrl: png, sessionId: 'second' });
  const invalid = expect(next).rejects.toThrow('failed');
  target.onmessage?.(
    new MessageEvent('message', {
      data: {
        requestId: 2,
        completion: { sessionId: 'foreign', width: 1, height: 1, version: 'v1' },
      },
    })
  );
  await invalid;
  expect(target.terminate).toHaveBeenCalledTimes(2);
  service.dispose();
});
