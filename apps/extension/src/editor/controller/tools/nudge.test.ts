import { describe, expect, it } from 'vitest';

import { createSelectionNudge, hasMatchingNudgeSignature } from './nudge';

describe('editor selection nudge helpers', () => {
  it('resolves arrow-key nudges with canonical steps', () => {
    expect(createSelectionNudge('ArrowLeft', false)).toEqual({
      code: 'ArrowLeft',
      deltaX: -1,
      deltaY: 0,
      step: 1,
    });
    expect(createSelectionNudge('ArrowUp', true)).toEqual({
      code: 'ArrowUp',
      deltaX: 0,
      deltaY: -5,
      step: 5,
    });
    expect(createSelectionNudge('KeyA', false)).toBeNull();
  });

  it('matches grouped-history signatures by arrow code and step only', () => {
    expect(
      hasMatchingNudgeSignature({ code: 'ArrowDown', step: 5 }, { code: 'ArrowDown', step: 5 })
    ).toBe(true);
    expect(
      hasMatchingNudgeSignature({ code: 'ArrowDown', step: 5 }, { code: 'ArrowDown', step: 1 })
    ).toBe(false);
    expect(hasMatchingNudgeSignature(null, { code: 'ArrowDown', step: 1 })).toBe(false);
  });
});
