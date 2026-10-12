import { expect, it, vi } from 'vitest';
import { abortIndexedDbMutation } from './transaction';

it.each([false, true])(
  'preserves the operation failure while draining a failed transaction (closed=%s)',
  async (closed) => {
    const original = new Error('operation failed');
    const abort = vi.fn(() => {
      if (closed) throw new Error('already closed');
    });
    const done = Promise.reject(new Error('transaction failed'));
    await expect(abortIndexedDbMutation({ abort, done }, original)).rejects.toBe(original);
    expect(abort).toHaveBeenCalledOnce();
  }
);
it('waits for transaction completion before propagating the original error', async () => {
  const error = new Error('mutation failed');
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let propagated = false;
  const result = abortIndexedDbMutation({ abort() {}, done }, error).catch((failure) => {
    propagated = true;
    expect(failure).toBe(error);
  });
  await Promise.resolve();
  expect(propagated).toBe(false);
  complete();
  await result;
  expect(propagated).toBe(true);
});
