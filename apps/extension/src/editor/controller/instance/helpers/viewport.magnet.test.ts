import { describe, expect, it, vi } from 'vitest';

const storeState = {
  workspace: {
    backgroundColor: '#ffffff',
    gridColor: '#d1d5db',
    gridEnabled: true,
    gridSize: 24,
    gridSnapEnabled: true,
    magnetEnabled: false,
  },
};

const mocks = vi.hoisted(() => ({
  applyGridSnapMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
}));

vi.mock('../../viewport/grid', () => ({
  applyEditorGridSnap: mocks.applyGridSnapMock,
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

import { applyGridSnapForController } from './viewport';

describe('editor controller viewport magnet fallback', () => {
  it('skips grid snapping only while magnet mode has an active alignment and falls back otherwise', () => {
    const object = { id: 'object' } as never;
    const controller = {
      magnetManager: {
        hasActiveGuides: vi.fn(() => true),
      },
    };

    storeState.workspace.magnetEnabled = true;
    applyGridSnapForController(controller as never, object);
    expect(mocks.applyGridSnapMock).not.toHaveBeenCalled();

    controller.magnetManager.hasActiveGuides.mockReturnValue(false);
    applyGridSnapForController(controller as never, object);
    expect(mocks.applyGridSnapMock).toHaveBeenCalledWith(object, storeState.workspace);

    storeState.workspace.magnetEnabled = false;
    applyGridSnapForController(controller as never, object);
    expect(mocks.applyGridSnapMock).toHaveBeenCalledTimes(2);
  });
});
