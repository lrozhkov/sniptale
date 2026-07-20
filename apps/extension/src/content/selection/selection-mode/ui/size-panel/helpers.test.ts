// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getContentSizeTooltipRatioButtonStyle } from '@sniptale/ui/content-size-tooltip/styles';
import { bindAspectRatioToggle, createAdjustSize, createSelectionSync } from './helpers';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function expectSelectionSyncLifecycle() {
  const setCurrentSelection = vi.fn();
  const constrainSelection = vi.fn();
  const updateFinalFrame = vi.fn();
  const syncSelection = createSelectionSync(
    setCurrentSelection,
    constrainSelection,
    updateFinalFrame
  );
  const nextSelection = { x: 10, y: 20, width: 300, height: 180 };

  syncSelection(nextSelection);

  expect(setCurrentSelection).toHaveBeenCalledWith(nextSelection);
  expect(constrainSelection).toHaveBeenCalledTimes(1);
  expect(updateFinalFrame).toHaveBeenCalledTimes(1);
}

function expectAdjustSizeLifecycle() {
  const syncSelection = vi.fn();
  let currentSelection = { x: 100, y: 120, width: 320, height: 160 };
  const adjustSize = createAdjustSize({
    aspectRatio: () => 2,
    getCurrentSelection: () => currentSelection,
    maintainAspectRatio: () => true,
    maxHeight: 500,
    maxWidth: 600,
    minSelectionSize: 100,
    syncSelection: (selection) => {
      currentSelection = selection;
      syncSelection(selection);
    },
  });

  adjustSize('width', 80);
  adjustSize('height', 40);

  expect(syncSelection).toHaveBeenNthCalledWith(1, {
    x: 60,
    y: 100,
    width: 400,
    height: 200,
  });
  expect(syncSelection).toHaveBeenNthCalledWith(2, {
    x: 20,
    y: 80,
    width: 480,
    height: 240,
  });
}

function expectAspectRatioToggleLifecycle() {
  const button = document.createElement('button');
  const activeStyle = getContentSizeTooltipRatioButtonStyle({ active: true });
  const inactiveStyle = getContentSizeTooltipRatioButtonStyle({ active: false });
  let maintainAspectRatio = false;
  const setMaintainAspectRatio = vi.fn((value: boolean) => {
    maintainAspectRatio = value;
  });
  const setAspectRatio = vi.fn();

  bindAspectRatioToggle(
    button,
    () => ({ x: 0, y: 0, width: 300, height: 150 }),
    setAspectRatio,
    setMaintainAspectRatio,
    () => maintainAspectRatio
  );

  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.style.getPropertyValue('background')).toBe(String(activeStyle['background']));
  expect(button.style.getPropertyValue('color')).toBe(String(activeStyle['color']));

  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(setMaintainAspectRatio).toHaveBeenNthCalledWith(1, true);
  expect(setMaintainAspectRatio).toHaveBeenNthCalledWith(2, false);
  expect(setAspectRatio).toHaveBeenCalledTimes(1);
  expect(setAspectRatio).toHaveBeenCalledWith(2);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.style.getPropertyValue('background')).toBe(String(inactiveStyle['background']));
  expect(button.style.getPropertyValue('color')).toBe(String(inactiveStyle['color']));
}

describe('selection-mode size-panel sync helper', () => {
  it(
    'syncs selection updates through state, constraints, and final-frame refresh',
    expectSelectionSyncLifecycle
  );
});

describe('selection-mode size-panel adjust helper', () => {
  it('adjusts width and height using the current aspect-ratio policy', expectAdjustSizeLifecycle);
});

describe('selection-mode size-panel aspect-ratio toggle', () => {
  it(
    'toggles maintain-aspect-ratio state and snapshots the current ratio only when enabling',
    expectAspectRatioToggleLifecycle
  );
});
