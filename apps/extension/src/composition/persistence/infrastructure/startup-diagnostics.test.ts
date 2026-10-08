import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@sniptale/platform/observability/logger', () => ({ createLogger: () => ({ warn }) }));
import { runStorageStartupPhase } from './startup-diagnostics';

beforeEach(() => {
  vi.useFakeTimers();
  warn.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

it('keeps fast work quiet and returns the original result', async () => {
  const result = { privateContents: 'never logged' };
  await expect(runStorageStartupPhase('database-open', async () => result)).resolves.toBe(result);
  await vi.advanceTimersByTimeAsync(5000);
  expect(warn).not.toHaveBeenCalled();
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
    expect(warn).toHaveBeenCalledWith('Slow storage startup phase', {
      phase: 'database-url-maintenance',
      status: 'pending',
      durationMs: 3000,
    });
    await vi.advanceTimersByTimeAsync(2000);
    if (status === 'completed') resolve('private result');
    else reject(error);
    expect(await observed).toBe(status === 'completed' ? 'private result' : error);
    expect(warn).toHaveBeenLastCalledWith('Slow storage startup phase', {
      phase: 'database-url-maintenance',
      status,
      durationMs: 5000,
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
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
  expect(warn).not.toHaveBeenCalled();
});
