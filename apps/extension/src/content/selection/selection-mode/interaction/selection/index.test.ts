// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setupSelectionModeSizePanelListenersMock } = vi.hoisted(() => ({
  setupSelectionModeSizePanelListenersMock: vi.fn(),
}));

vi.mock('../../ui/size-panel', async (importOriginal) => ({
  ...(await importOriginal()),
  setupSelectionModeSizePanelListeners: setupSelectionModeSizePanelListenersMock,
}));

import { constrainSelection, setupSizePanelListeners } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode interactions seam', () => {
  it('re-exports frame helpers through the canonical interactions owner', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 300, innerHeight: 200 },
    });

    expect(constrainSelection({ x: 280, y: -10, width: 40, height: 50 })).toEqual({
      x: 260,
      y: 0,
      width: 40,
      height: 50,
    });
  });

  it('forwards size-panel setup to the dedicated owner seam', () => {
    const args = {
      constrainSelection: vi.fn(),
      dom: {} as never,
      getAspectRatio: vi.fn(),
      getCurrentSelection: vi.fn(),
      getMaintainAspectRatio: vi.fn(),
      getMaxSelectionHeight: vi.fn(),
      getMaxSelectionWidth: vi.fn(),
      minSelectionSize: 20,
      setAspectRatio: vi.fn(),
      setCurrentSelection: vi.fn(),
      setMaintainAspectRatio: vi.fn(),
      updateFinalFrame: vi.fn(),
    };

    setupSizePanelListeners(args);

    expect(setupSelectionModeSizePanelListenersMock).toHaveBeenCalledTimes(1);
    expect(setupSelectionModeSizePanelListenersMock).toHaveBeenCalledWith(args);
  });
});
