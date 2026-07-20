// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setupSelectionModeSizePanelListenersMock } = vi.hoisted(() => ({
  setupSelectionModeSizePanelListenersMock: vi.fn(),
}));

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  setupSelectionModeSizePanelListeners: setupSelectionModeSizePanelListenersMock,
}));

import { MIN_SELECTION_SIZE } from '../../constants';
import { createSelectionModeSizePanelSetup } from './runtime';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode runtime size-panel bridge', () => {
  it('returns a setup callback that forwards runtime-owned dependencies to shell helpers', () => {
    const state = { dom: { sizePanel: document.createElement('div') } };
    const constrainSelection = vi.fn();
    const getAspectRatio = vi.fn(() => 2);
    const getCurrentSelection = vi.fn(() => ({ x: 10, y: 20, width: 300, height: 150 }));
    const getMaintainAspectRatio = vi.fn(() => true);
    const getMaxSelectionWidth = vi.fn(() => 1200);
    const getMaxSelectionHeight = vi.fn(() => 900);
    const setAspectRatio = vi.fn();
    const setCurrentSelection = vi.fn();
    const setMaintainAspectRatio = vi.fn();
    const updateFinalFrame = vi.fn();

    const setup = createSelectionModeSizePanelSetup({
      constrainSelection,
      state: state as never,
      getAspectRatio,
      getCurrentSelection,
      getMaintainAspectRatio,
      getMaxSelectionHeight,
      getMaxSelectionWidth,
      setAspectRatio,
      setCurrentSelection,
      setMaintainAspectRatio,
      updateFinalFrame,
    });

    setup();

    expect(setupSelectionModeSizePanelListenersMock).toHaveBeenCalledWith({
      constrainSelection,
      dom: state.dom,
      getAspectRatio,
      getCurrentSelection,
      getMaintainAspectRatio,
      getMaxSelectionHeight,
      getMaxSelectionWidth,
      minSelectionSize: MIN_SELECTION_SIZE,
      setAspectRatio,
      setCurrentSelection,
      setMaintainAspectRatio,
      updateFinalFrame,
    });
  });
});
