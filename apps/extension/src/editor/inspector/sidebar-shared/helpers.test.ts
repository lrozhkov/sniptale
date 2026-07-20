import { describe, expect, it, vi } from 'vitest';

import { createDimensionDraftActions } from './dimension-input.helpers';
import { toNumber } from './helpers';

describe('sidebar shared helpers', () => {
  it('parses finite numbers and falls back when values are invalid', () => {
    expect(toNumber('12', 1)).toBe(12);
    expect(toNumber('oops', 5)).toBe(5);
  });

  it('commits and steps dimension drafts with min clamping', () => {
    const onChange = vi.fn();
    const setDraft = vi.fn();
    const blankDraft = createDimensionDraftActions({
      draft: '   ',
      min: 10,
      onChange,
      setDraft,
      step: 5,
      value: 20,
    });
    blankDraft.commitDraft();
    blankDraft.applyStep(-1);

    const filledDraft = createDimensionDraftActions({
      draft: '3',
      min: 10,
      onChange,
      setDraft,
      step: 4,
      value: 20,
    });
    filledDraft.commitDraft();
    filledDraft.applyStep(1);

    expect(setDraft).toHaveBeenCalledWith('20');
    expect(onChange).toHaveBeenCalledWith(15);
    expect(onChange).toHaveBeenCalledWith(10);
    expect(onChange).toHaveBeenCalledWith(14);
  });
});
