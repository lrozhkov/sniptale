import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { debug, warn, error, sanitize } = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  sanitize: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug, warn, error }),
}));
vi.mock('@sniptale/platform/observability/diagnostics/sanitizer', () => ({
  sanitizeDiagnosticData: sanitize,
}));
import { runStorageStartupPhase } from './startup-diagnostics';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  debug.mockReset();
  sanitize.mockReset().mockImplementation((value) => value);
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
    expect(debug).toHaveBeenCalledWith(
      'Slow storage startup phase: database-url-maintenance pending 3000ms',
      {
        phase: 'database-url-maintenance',
        status: 'pending',
        durationMs: 3000,
      }
    );
    await vi.advanceTimersByTimeAsync(2000);
    if (status === 'completed') resolve('private result');
    else reject(error);
    expect(await observed).toBe(status === 'completed' ? 'private result' : error);
    expect(debug).toHaveBeenLastCalledWith(
      `Slow storage startup phase: database-url-maintenance ${status} 5000ms`,
      {
        phase: 'database-url-maintenance',
        status,
        durationMs: 5000,
      }
    );
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

it.each(['sanitizer', 'logger', 'clock'] as const)(
  'contains failing %s diagnostics and preserves both storage outcomes',
  async (failure) => {
    for (const status of ['completed', 'failed'] as const) {
      let resolve!: (value: object) => void;
      let reject!: (reason: Error) => void;
      const work = new Promise<object>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const result = { privateResult: 'unchanged' };
      const original = new Error('original storage failure');
      const pending = runStorageStartupPhase('database-open', () => work);
      const observed = pending.catch((reason: unknown) => reason);
      const diagnosticFailure = () => {
        throw new Error('unavailable diagnostics');
      };
      const clock =
        failure === 'clock'
          ? vi.spyOn(performance, 'now').mockImplementation(diagnosticFailure)
          : null;
      if (failure === 'sanitizer') sanitize.mockImplementation(diagnosticFailure);
      if (failure === 'logger') debug.mockImplementation(diagnosticFailure);
      try {
        await expect(vi.advanceTimersByTimeAsync(3000)).resolves.toBe(vi);
        if (status === 'completed') resolve(result);
        else reject(original);
        expect(await observed).toBe(status === 'completed' ? result : original);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        clock?.mockRestore();
      }
    }
  }
);
