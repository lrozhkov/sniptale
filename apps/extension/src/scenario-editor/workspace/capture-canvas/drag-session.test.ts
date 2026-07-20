import { describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import type { ScenarioWorkspacePanDragState } from './helpers';

const { applyWorkspaceDragPatchMock, toPointerPreviewPointMock } = vi.hoisted(() => ({
  applyWorkspaceDragPatchMock: vi.fn(),
  toPointerPreviewPointMock: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  applyWorkspaceDragPatch: applyWorkspaceDragPatchMock,
}));

vi.mock('../drag-preview/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../drag-preview/frame')>()),
  toPointerPreviewPoint: toPointerPreviewPointMock,
}));

import {
  clearCanvasDragPreview,
  commitCanvasDragPatch,
  previewCanvasDragPatch,
} from './drag-session';

function createDragState(): ScenarioWorkspacePanDragState {
  return {
    origin: { x: 10, y: 20 },
    snapshot: createScenarioCaptureStep({ assetId: 'asset-1' }),
  };
}

describe('workspace drag session helpers', () => {
  it('clears preview patches through a transition-safe null update', () => {
    const onDragPreview = vi.fn();

    clearCanvasDragPreview(onDragPreview);

    expect(onDragPreview).toHaveBeenCalledWith(null);
  });

  it('commits and previews drag patches only when helper output exists', () => {
    const dragState = createDragState();
    const patch = { imageTransform: { x: 1, y: 2, scale: 1 } };
    const onDragCommit = vi.fn();
    const onDragPreview = vi.fn();
    toPointerPreviewPointMock.mockReturnValue({ clientX: 12, clientY: 24 });
    applyWorkspaceDragPatchMock.mockReturnValueOnce(patch).mockReturnValueOnce(patch);

    commitCanvasDragPatch(dragState, { clientX: 12, clientY: 24 }, onDragCommit, 1);
    previewCanvasDragPatch(dragState, { clientX: 12, clientY: 24 }, onDragPreview, 1);

    expect(onDragCommit).toHaveBeenCalledWith(patch);
    expect(onDragPreview).toHaveBeenCalledWith(patch);
  });

  it('skips commit and preview callbacks when the drag patch helper returns null', () => {
    const dragState = createDragState();
    const onDragCommit = vi.fn();
    const onDragPreview = vi.fn();
    toPointerPreviewPointMock.mockReturnValue({ clientX: 12, clientY: 24 });
    applyWorkspaceDragPatchMock.mockReturnValue(null);

    commitCanvasDragPatch(dragState, { clientX: 12, clientY: 24 }, onDragCommit, 1);
    previewCanvasDragPatch(dragState, { clientX: 12, clientY: 24 }, onDragPreview, 1);

    expect(onDragCommit).not.toHaveBeenCalled();
    expect(onDragPreview).not.toHaveBeenCalled();
  });
});
