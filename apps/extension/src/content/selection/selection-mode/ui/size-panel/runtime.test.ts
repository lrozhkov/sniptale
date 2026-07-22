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
    const session = {
      aspectRatio: 2,
      currentSelection: { x: 10, y: 20, width: 300, height: 150 },
      dom: { sizePanel: document.createElement('div') },
      maintainAspectRatio: true,
    };
    const constrainSelection = vi.fn();
    const getMaxSelectionWidth = vi.fn(() => 1200);
    const getMaxSelectionHeight = vi.fn(() => 900);
    const updateFinalFrame = vi.fn();

    const setup = createSelectionModeSizePanelSetup({
      constrainSelection,
      getMaxSelectionHeight,
      getMaxSelectionWidth,
      session: session as never,
      updateFinalFrame,
    });

    setup();

    expect(setupSelectionModeSizePanelListenersMock).toHaveBeenCalledWith({
      constrainSelection,
      dom: session.dom,
      getAspectRatio: expect.any(Function),
      getCurrentSelection: expect.any(Function),
      getMaintainAspectRatio: expect.any(Function),
      getMaxSelectionHeight,
      getMaxSelectionWidth,
      minSelectionSize: MIN_SELECTION_SIZE,
      setAspectRatio: expect.any(Function),
      setCurrentSelection: expect.any(Function),
      setMaintainAspectRatio: expect.any(Function),
      updateFinalFrame,
    });

    const args = setupSelectionModeSizePanelListenersMock.mock.calls[0]?.[0];
    if (!args) throw new Error('Expected size-panel listener args');
    expect(args.getAspectRatio()).toBe(2);
    expect(args.getCurrentSelection()).toEqual(session.currentSelection);
    expect(args.getMaintainAspectRatio()).toBe(true);

    const nextSelection = { x: 1, y: 2, width: 3, height: 4 };
    args.setAspectRatio(1.5);
    args.setCurrentSelection(nextSelection);
    args.setMaintainAspectRatio(false);
    expect(session).toMatchObject({
      aspectRatio: 1.5,
      currentSelection: nextSelection,
      maintainAspectRatio: false,
    });
  });
});
