import { expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeCoreThresholdState } from './core.threshold';

it('reads and writes the drag threshold through the mutable refs proxy', () => {
  const refs = createMutableRefs();
  const state = createSelectionModeCoreThresholdState(refs);

  refs.dragThreshold = 15;
  expect(state.dragThreshold).toBe(15);

  state.dragThreshold = 7;
  expect(refs.dragThreshold).toBe(7);
});
