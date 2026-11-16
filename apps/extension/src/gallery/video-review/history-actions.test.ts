import { expect, it, vi } from 'vitest';
import { createReviewHistoryActions } from './history-actions';

it('admits Undo after local captures without waiting for native persistence', async () => {
  const order: string[] = [];
  const native = vi.fn(async () => {
    throw new Error('Native persistence must not gate Undo');
  });
  const actions = createReviewHistoryActions({
    session: {
      flush: native,
      flushAutosave: async () => {
        order.push('captures');
      },
      history: vi.fn().mockImplementation(async () => {
        order.push('undo');
      }),
    },
    flushStaged: async () => {
      order.push('fields');
    },
    reset: vi.fn(),
    run: (action) => action(),
  });
  expect(await actions.run('undo')).toBe(true);
  expect(order).toEqual(['fields', 'captures', 'undo']);
  expect(native).not.toHaveBeenCalled();
});

it('keeps the explicit flush durable and reports a failed history action', async () => {
  const native = vi.fn(async () => {
    throw new Error('Storage failure');
  });
  const run = vi.fn(async (action: () => Promise<unknown>) => {
    try {
      return await action();
    } catch {
      return undefined;
    }
  });
  const actions = createReviewHistoryActions({
    session: {
      flush: native,
      flushAutosave: vi.fn(),
      history: vi.fn(async () => {
        throw new Error('Conflict');
      }),
    },
    flushStaged: vi.fn(),
    reset: vi.fn(),
    run,
  });
  await expect(actions.flush(true)).rejects.toThrow('Storage failure');
  expect(native).toHaveBeenCalledWith({ retryHistory: true });
  expect(await actions.run('redo')).toBe(false);
});
