// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas, Rect } from 'fabric';
import { createEditorMagnetManager } from '../../magnet/manager';

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

import {
  applyGridSnapForController,
  snapExternalEditorRectForController,
  snapExternalEditorResizeRectForController,
} from './viewport';

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

it('snaps resize edges when the grid is hidden and snapping remains enabled', () => {
  storeState.workspace.gridEnabled = false;
  storeState.workspace.gridSnapEnabled = true;
  storeState.workspace.magnetEnabled = false;
  const result = snapExternalEditorResizeRectForController({} as never, {
    direction: 'se',
    minimumSize: 4,
    rect: { x: 0, y: 0, width: 43, height: 50 },
  });
  expect(result).toEqual({ x: 0, y: 0, width: 48, height: 48 });
});

it('lets accepted relation-only feedback outrank grid without changing grid admission', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { width: 1000, height: 800 });
  const make = (id: string, left: number, width: number, top = 0, height = 100) => {
    const object = new Rect({
      left,
      top,
      width,
      height,
      originX: 'left',
      originY: 'top',
      strokeWidth: 0,
    });
    object.sniptaleId = id;
    object.sniptaleType = 'shape';
    canvas.add(object);
    return object;
  };
  const source = make('S', 35, 40, 30, 10);
  make('A', 0, 20);
  make('B', 100, 30);
  storeState.workspace.magnetEnabled = true;
  const manager = createEditorMagnetManager({
    canvas,
    getActiveTool: () => 'select',
    getCanvasDocumentSize: () => ({ width: 1000, height: 800 }),
    getCropGuide: () => null,
    getWorkspace: () => ({ ...storeState.workspace, hideSelectionWhileDragging: true }),
  });
  try {
    const result = manager.snapRect({
      excludeId: 'S',
      rect: { x: 35, y: 30, width: 40, height: 10 },
    });
    expect(result.x).toBe(40);
    expect(manager.getVisualFeedback().guides).toEqual([]);
    expect(manager.getVisualFeedback().relations).toMatchObject([{ kind: 'gap', value: 20 }]);
    mocks.applyGridSnapMock.mockClear();
    applyGridSnapForController({ magnetManager: manager } as never, source);
    expect(mocks.applyGridSnapMock).not.toHaveBeenCalled();
    manager.clearGuides();
    applyGridSnapForController({ magnetManager: manager } as never, source);
    expect(mocks.applyGridSnapMock).toHaveBeenCalledOnce();
  } finally {
    manager.dispose();
    await canvas.dispose();
  }
});
