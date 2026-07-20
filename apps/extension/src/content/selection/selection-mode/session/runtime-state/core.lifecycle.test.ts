import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeCoreLifecycleState } from './core.lifecycle';

it('reads and writes lifecycle fields through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModeCoreLifecycleState(refs);

  refs.aspectRatio = 16 / 9;
  refs.cleanupEventListeners = () => undefined;
  refs.cleanupScrollListeners = () => undefined;

  expect(state.aspectRatio).toBe(16 / 9);
  expect(state.cleanupEventListeners).toEqual(expect.any(Function));
  expect(state.cleanupScrollListeners).toEqual(expect.any(Function));

  const cleanupEventListeners = () => undefined;
  const cleanupScrollListeners = () => undefined;

  state.aspectRatio = 4 / 3;
  state.cleanupEventListeners = cleanupEventListeners;
  state.cleanupScrollListeners = cleanupScrollListeners;

  expect(refs.aspectRatio).toBe(4 / 3);
  expect(refs.cleanupEventListeners).toBe(cleanupEventListeners);
  expect(refs.cleanupScrollListeners).toBe(cleanupScrollListeners);
});
