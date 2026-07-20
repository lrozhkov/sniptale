// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindSelectionWidthInput } from './width-binding';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('size-panel-inputs width binding', () => {
  it('commits width input changes and syncs the paired height when aspect ratio is locked', () => {
    const widthInput = document.createElement('input');
    const heightInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindSelectionWidthInput(widthInput, heightInput, syncSelection, {
      minSelectionSize: 100,
      maxWidth: 800,
      maxHeight: 500,
      getCurrentSelection: () => currentSelection,
      getMaintainAspectRatio: () => true,
      getAspectRatio: () => 2,
    });

    widthInput.value = '420';
    widthInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(syncSelection).toHaveBeenCalledWith({
      x: 40,
      y: 90,
      width: 420,
      height: 210,
    });
    expect(heightInput.value).toBe('210');
  });
});
