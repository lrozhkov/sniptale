import { afterEach, expect, it, vi } from 'vitest';
import { createRecoveryProgressReporter } from './recording-recovery-progress';

afterEach(() => vi.restoreAllMocks());

it('bounds same-stage updates and immediately reports stage changes and final counts', () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const observer = vi.fn();
  const report = createRecoveryProgressReporter(observer);
  report({ stage: 'remuxing', completed: 0 });
  clock.mockReturnValue(249);
  report({ stage: 'remuxing', completed: 100 });
  expect(observer).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(250);
  report({ stage: 'remuxing', completed: 200 });
  report({ stage: 'remuxing', completed: 201 }, true);
  report({ stage: 'validatingVideo', completed: 0 });
  expect(observer.mock.calls.map(([value]) => value)).toEqual([
    { stage: 'remuxing', completed: 0 },
    { stage: 'remuxing', completed: 200 },
    { stage: 'remuxing', completed: 201 },
    { stage: 'validatingVideo', completed: 0 },
  ]);
});

it('isolates observer failures and supports callers without progress', () => {
  const report = createRecoveryProgressReporter(() => {
    throw new Error('UI removed');
  });
  expect(() => report({ stage: 'publishing', completed: 0 })).not.toThrow();
  expect(() =>
    createRecoveryProgressReporter()({ stage: 'preparing', completed: 0 })
  ).not.toThrow();
});
