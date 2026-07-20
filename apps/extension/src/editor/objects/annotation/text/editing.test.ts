import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTextLayoutMock: vi.fn(),
}));

vi.mock('./layout', () => ({
  applyTextLayout: mocks.applyTextLayoutMock,
  attachTextLayoutLifecycle: vi.fn(),
}));

import { attachTextCalloutEditingLifecycle } from './editing';

describe('text callout editing lifecycle', () => {
  it('attaches the editing lifecycle once, hides resize controls, and reapplies layout', () => {
    const textbox = {
      _setEditingProps: vi.fn(function setEditingProps(this: { hasControls: boolean }) {
        this.hasControls = false;
      }),
      hasControls: false,
      initDimensions: vi.fn(),
      sniptaleTextCalloutEditingAttached: false,
      sniptaleTextCalloutFormat: 'panel',
      sniptaleTextLayoutMode: 'fixed-width',
      set: vi.fn(),
    };

    attachTextCalloutEditingLifecycle(textbox as never);
    attachTextCalloutEditingLifecycle(textbox as never);
    textbox._setEditingProps?.();

    expect(textbox.sniptaleTextCalloutEditingAttached).toBe(true);
    expect(textbox.hasControls).toBe(false);
    expect(textbox._setEditingProps).toEqual(expect.any(Function));
    expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(textbox);
  });

  it('skips attachment when the textbox has no editable lifecycle hook', () => {
    const textbox = {
      sniptaleTextCalloutEditingAttached: false,
    };

    attachTextCalloutEditingLifecycle(textbox as never);

    expect(textbox.sniptaleTextCalloutEditingAttached).toBe(false);
  });
});
