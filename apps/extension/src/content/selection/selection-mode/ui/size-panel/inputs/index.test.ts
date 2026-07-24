// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindSelectionHeightInput, bindSelectionWidthInput } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('selection-mode size-panel inputs', () => {
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

describe('selection-mode size-panel height input', () => {
  it('ignores under-min live input, then clamps on blur for height changes', () => {
    const heightInput = document.createElement('input');
    const widthInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindSelectionHeightInput(heightInput, widthInput, syncSelection, {
      minSelectionSize: 100,
      maxWidth: 900,
      maxHeight: 700,
      getCurrentSelection: () => currentSelection,
      getMaintainAspectRatio: () => false,
      getAspectRatio: () => null,
    });

    heightInput.value = '20';
    heightInput.dispatchEvent(new Event('input', { bubbles: true }));
    heightInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(syncSelection).toHaveBeenCalledTimes(1);
    expect(syncSelection).toHaveBeenCalledWith({
      x: 100,
      y: 145,
      width: 300,
      height: 100,
    });
    expect(heightInput.value).toBe('100');
  });

  it('syncs the paired width input when aspect ratio is maintained', () => {
    const heightInput = document.createElement('input');
    const widthInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindSelectionHeightInput(heightInput, widthInput, syncSelection, {
      minSelectionSize: 100,
      maxWidth: 900,
      maxHeight: 700,
      getCurrentSelection: () => currentSelection,
      getMaintainAspectRatio: () => true,
      getAspectRatio: () => 2,
    });

    heightInput.value = '200';
    heightInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(syncSelection).toHaveBeenCalledWith({
      x: 50,
      y: 95,
      width: 400,
      height: 200,
    });
    expect(widthInput.value).toBe('400');
  });
});
