// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindDimensionInput } from './dimension-commit';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('size-panel-inputs dimension commit', () => {
  it('ignores under-min live input, then clamps on blur and syncs the paired input', () => {
    const input = document.createElement('input');
    const pairedInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindDimensionInput({
      input,
      pairedInput,
      maxValue: 700,
      minSelectionSize: 100,
      getSelection: () => currentSelection,
      getCurrentValue: (selection) => selection.height,
      getShouldSyncPairedInput: () => false,
      getPairedValue: (selection) => selection.width,
      apply: (selection, value) => ({
        ...selection,
        height: value,
        y: selection.y - (value - selection.height) / 2,
      }),
      syncSelection,
    });

    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(syncSelection).toHaveBeenCalledTimes(1);
    expect(syncSelection).toHaveBeenCalledWith({
      x: 100,
      y: 145,
      width: 300,
      height: 100,
    });
    expect(input.value).toBe('100');
    expect(pairedInput.value).toBe('');
  });
});

describe('size-panel-inputs empty dimension draft', () => {
  it('keeps an empty live draft from changing selection and restores the current value on blur', () => {
    const input = document.createElement('input');
    const pairedInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindDimensionInput({
      input,
      pairedInput,
      maxValue: 700,
      minSelectionSize: 10,
      getSelection: () => currentSelection,
      getCurrentValue: (selection) => selection.height,
      getShouldSyncPairedInput: () => false,
      getPairedValue: (selection) => selection.width,
      apply: (selection, value) => ({
        ...selection,
        height: value,
      }),
      syncSelection,
    });

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(syncSelection).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(syncSelection).not.toHaveBeenCalled();
    expect(input.value).toBe('150');
  });
});

describe('size-panel-inputs keyboard commit', () => {
  it('commits the current draft when Enter is pressed', () => {
    const input = document.createElement('input');
    const pairedInput = document.createElement('input');
    let currentSelection = { x: 100, y: 120, width: 300, height: 150 };
    const syncSelection = vi.fn((selection) => {
      currentSelection = selection;
    });

    bindDimensionInput({
      input,
      pairedInput,
      maxValue: 700,
      minSelectionSize: 10,
      getSelection: () => currentSelection,
      getCurrentValue: (selection) => selection.height,
      getShouldSyncPairedInput: () => false,
      getPairedValue: (selection) => selection.width,
      apply: (selection, value) => ({
        ...selection,
        height: value,
      }),
      syncSelection,
    });

    input.value = '215';
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(syncSelection).toHaveBeenCalledWith({
      x: 100,
      y: 120,
      width: 300,
      height: 215,
    });
    expect(input.value).toBe('215');
  });
});
