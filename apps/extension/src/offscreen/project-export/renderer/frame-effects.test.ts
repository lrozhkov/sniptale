import { expect, it } from 'vitest';

import { resolveExportEffectDrawState } from './frame-effects';

it('reuses the draw state for every contribution at the same render time', () => {
  const states = new Map();
  const first = resolveExportEffectDrawState(states, 1.5);
  const second = resolveExportEffectDrawState(states, 1.5);
  const third = resolveExportEffectDrawState(states, 2);

  expect(second).toBe(first);
  expect(third).not.toBe(first);
  expect(states).toEqual(
    new Map([
      [1.5, first],
      [2, third],
    ])
  );
});
