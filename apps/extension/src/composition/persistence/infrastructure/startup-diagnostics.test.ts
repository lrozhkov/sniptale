import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { debug, warn, error } = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug, warn, error }),
}));
import { runStorageStartupPhase } from './startup-diagnostics';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('keeps fast work quiet and returns the original result', async () => {
  const result = { privateContents: 'never logged' };
  await expect(runStorageStartupPhase('database-open', async () => result)).resolves.toBe(result);
  await vi.advanceTimersByTimeAsync(5000);
  expect(debug).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['completed', 'failed'] as const)(
  'identifies pending work and its %s outcome without contents',
  async (status) => {
    let resolve!: (value: string) => void;
    let reject!: (error: Error) => void;
    const work = new Promise<string>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const error = new Error('private source URL and credentials');
    const pending = runStorageStartupPhase('database-url-maintenance', () => work);
    const observed = pending.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(3000);
    expect(debug).toHaveBeenCalledWith('Slow storage startup phase', {
      phase: 'database-url-maintenance',
      status: 'pending',
      durationMs: 3000,
    });
    await vi.advanceTimersByTimeAsync(2000);
    if (status === 'completed') resolve('private result');
    else reject(error);
    expect(await observed).toBe(status === 'completed' ? 'private result' : error);
    expect(debug).toHaveBeenLastCalledWith('Slow storage startup phase', {
      phase: 'database-url-maintenance',
      status,
      durationMs: 5000,
    });
    expect(debug).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(debug.mock.calls)).not.toContain('private');
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('preserves synchronous failures and clears their timer', async () => {
  const error = new Error('failure');
  await expect(
    runStorageStartupPhase('database-open', () => {
      throw error;
    })
  ).rejects.toBe(error);
  expect(vi.getTimerCount()).toBe(0);
  expect(debug).not.toHaveBeenCalled();
});
