import { expect, it, vi } from 'vitest';
import { createReviewSpeechEditGuard } from './speech-edit-guard';

it('keeps ordinary gestures synchronous and blocks navigation after a failed text write', async () => {
  const failure = vi.fn();
  const guard = createReviewSpeechEditGuard(failure);
  const action = vi.fn(() => 42);
  expect(guard.perform(action)).toBe(42);
  let dirty = true;
  const flush = vi
    .fn()
    .mockRejectedValueOnce(new Error('quota'))
    .mockImplementationOnce(async () => {
      dirty = false;
    });
  guard.register({ hasPending: () => dirty, flush });
  action.mockClear();
  await guard.perform(action);
  expect(action).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledOnce();
  expect(await guard.perform(action)).toBe(42);
  expect(action).toHaveBeenCalledOnce();
});

it('admits one continuation and refuses stale selection after an asynchronous flush', async () => {
  let resolve!: () => void;
  const guard = createReviewSpeechEditGuard(vi.fn());
  const unregister = guard.register({
    hasPending: () => true,
    flush: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  });
  const action = vi.fn();
  const flight = guard.perform(action);
  guard.perform(action);
  unregister();
  resolve();
  await flight;
  expect(action).not.toHaveBeenCalled();
});
