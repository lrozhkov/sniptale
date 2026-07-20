import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSourceObject: vi.fn(() => null),
  syncSourceStateFromObject: vi.fn(() => ({ id: 'source-image', left: 5, top: 7 })),
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  getSourceObject: mocks.getSourceObject,
}));

vi.mock('../../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceStateFromObject,
}));

import { createPostCropSourceState, runEditorCropSelection } from './scene';

function createObject(overrides: Record<string, unknown> = {}) {
  return {
    left: 10,
    sniptaleRole: 'annotation',
    set: vi.fn(function set(this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
    top: 12,
    ...overrides,
  };
}

function registerSceneMutationTest() {
  it('shifts user objects and updates canvas/source state', async () => {
    const shape = createObject();
    const frame = createObject({ sniptaleRole: 'frame' });
    const canvas = {
      getObjects: vi.fn(() => [shape, frame]),
      setDimensions: vi.fn(),
    };
    const setCanvasDocumentSize = vi.fn();
    const setSource = vi.fn();

    await runEditorCropSelection({
      canvas: canvas as never,
      crop: { height: 20, left: 3, top: 4, width: 30 },
      rebuildFrameDecorations: vi.fn(async () => undefined),
      setCanvasDocumentSize,
      setSource,
      source: { id: 'source-image', left: 10, top: 12 } as never,
      syncViewportTransform: vi.fn(),
    });

    expect(shape.set).toHaveBeenCalledWith({ left: 7, top: 8 });
    expect(frame.set).not.toHaveBeenCalled();
    expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 20, width: 30 });
    expect(setCanvasDocumentSize).toHaveBeenCalledWith({ height: 20, width: 30 });
    expect(setSource).toHaveBeenCalledWith(expect.objectContaining({ left: 7, top: 8 }));
  });
}

function registerSourceObjectTest() {
  it('syncs source state from source object when present', () => {
    const sourceObject = createObject({ sniptaleRole: 'source' });
    mocks.getSourceObject.mockReturnValue(sourceObject as never);

    expect(
      createPostCropSourceState({} as never, { id: 'source-image' } as never, {
        height: 1,
        left: 2,
        top: 3,
        width: 4,
      })
    ).toEqual({ id: 'source-image', left: 5, top: 7 });
    expect(mocks.syncSourceStateFromObject).toHaveBeenCalledWith(
      { id: 'source-image' },
      sourceObject
    );
  });
}

function runCropApplySceneSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSourceObject.mockReturnValue(null);
  });

  registerSceneMutationTest();
  registerSourceObjectTest();
}

describe('crop apply scene owner', runCropApplySceneSuite);
