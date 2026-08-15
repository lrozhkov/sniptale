import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { applyGridSnapForController, snapExternalEditorRectForController } from './viewport';

describe('editor controller viewport magnet fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(mocks.applyGridSnapMock).toHaveBeenCalledWith(object, storeState.workspace);
    expect(mocks.applyGridSnapMock).toHaveBeenCalledTimes(2);
  });

  it('falls through to grid snap when an external rect has no magnet alignment', () => {
    const snapped = { x: 40, y: 48, width: 20, height: 20 };
    const controller = {
      magnetManager: {
        hasActiveGuides: vi.fn(() => false),
        snapRect: vi.fn(() => snapped),
      },
    };
    storeState.workspace.magnetEnabled = true;

    expect(
      Reflect.apply(snapExternalEditorRectForController, null, [
        controller,
        {
          excludeId: 'frame-1',
          rect: { x: 43, y: 50, width: 20, height: 20 },
        },
      ])
    ).toEqual(snapped);
    expect(mocks.applyGridSnapMock).toHaveBeenCalledOnce();
  });
});
