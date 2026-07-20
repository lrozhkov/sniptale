// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindSelectionHeightInput,
  bindSelectionWidthInput,
  resizeSelectionHeight,
  resizeSelectionWidth,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('selection-mode size-panel resizing', () => {
  it('clamps width changes and updates height when aspect ratio is locked', () => {
    const selection = { x: 100, y: 80, width: 200, height: 100 };

    expect(
      resizeSelectionWidth(selection, {
        nextValue: 700,
        minSelectionSize: 100,
        maxWidth: 500,
        maxHeight: 260,
        maintainAspectRatio: true,
        aspectRatio: 2,
      })
    ).toEqual({
      x: -50,
      y: 5,
      width: 500,
      height: 250,
    });
  });

  it('clamps height changes and updates width when aspect ratio is locked', () => {
    const selection = { x: 120, y: 100, width: 180, height: 120 };

    expect(
      resizeSelectionHeight(selection, {
        nextValue: 50,
        minSelectionSize: 100,
        maxWidth: 260,
        maxHeight: 500,
        maintainAspectRatio: true,
        aspectRatio: 1.5,
      })
    ).toEqual({
      x: 135,
      y: 110,
      width: 150,
      height: 100,
    });
  });
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
});
