import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  finalizeEditorSceneMutationMock: vi.fn(),
}));

vi.mock('../helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers')>()),
  finalizeEditorSceneMutation: mocks.finalizeEditorSceneMutationMock,
}));

import { finalizeSceneResizeMutation, getViewportDevicePixelRatioBaselinePatch } from './finalize';

function createFinalizeOptions() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    ensureReachableObjects: vi.fn(() => true),
    getCanvasDocumentSize: vi.fn(() => ({ height: 200, width: 300 })),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncRuntimeState: vi.fn(),
    zoomLevel: 1.25,
  };
}

describe('scene resize finalize helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only includes viewport baseline when provided', () => {
    expect(getViewportDevicePixelRatioBaselinePatch()).toEqual({});
    expect(getViewportDevicePixelRatioBaselinePatch(2)).toEqual({
      viewportDevicePixelRatioBaseline: 2,
    });
  });

  it('finalizes scene resize mutations with the shared scene finalizer', () => {
    const options = createFinalizeOptions();

    finalizeSceneResizeMutation({
      ...options,
      viewportDevicePixelRatioBaseline: 2,
    } as never);

    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledWith({
      ...options,
      viewportDevicePixelRatioBaseline: 2,
    });
  });

  it('does not finalize when the canvas owner is gone', () => {
    finalizeSceneResizeMutation({ ...createFinalizeOptions(), canvas: null } as never);

    expect(mocks.finalizeEditorSceneMutationMock).not.toHaveBeenCalled();
  });
});
