// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { bindSelectionHeightInput } from './height-binding';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

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
