// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../state/useEditorStore';
import type { EditorRasterSelectionMask, EditorRasterTargetSnapshot } from '../../raster/types';
import { resolveRasterTargetState } from '../../raster/target';
import { subscribeEditorRasterOverlay } from './overlay';
import { getEditorRasterSelectionSummary } from './selection-summary';
import { syncEditorRasterSelectionSession } from './selection';
import { createEditorRasterToolSession } from './state';
import { isEditorRasterSessionBoundToTarget } from './transient';

vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  resolveRasterTargetState: vi.fn(),
}));

function createSelection(layerId = 'layer-1'): EditorRasterSelectionMask {
  return {
    maskCanvas: document.createElement('canvas'),
    reference: { kind: 'object', objectId: layerId, objectName: `Layer ${layerId}` },
  };
}

function createSnapshot(
  layerId: string,
  layerName = `Layer ${layerId}`
): EditorRasterTargetSnapshot {
  return {
    bitmap: document.createElement('canvas'),
    reference: { kind: 'object', objectId: layerId, objectName: layerName },
    sceneBounds: {
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    },
  };
}

function createMissingTargetState() {
  return {
    summary: {
      status: 'missing' as const,
      layerId: null,
      layerName: null,
    },
    target: null,
  };
}

function createReadyTargetState(layerId: string) {
  return {
    summary: {
      status: 'ready' as const,
      layerId,
      layerName: `Layer ${layerId}`,
    },
    target: {
      object: { id: layerId } as never,
      reference: { kind: 'object' as const, objectId: layerId, objectName: `Layer ${layerId}` },
    },
  };
}

function resetRasterStore() {
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterTarget: {
      status: 'missing',
      layerId: null,
      layerName: null,
    },
    rasterSelection: {
      hasSelection: false,
      targetLayerId: null,
      targetLayerName: null,
    },
  } as never);
}

function registerSummaryTests() {
  it('owns selection summary projection without mutating session state', () => {
    const selection = createSelection();

    expect(getEditorRasterSelectionSummary(selection)).toEqual({
      hasSelection: true,
      targetLayerId: 'layer-1',
      targetLayerName: 'Layer layer-1',
    });
    expect(getEditorRasterSelectionSummary(null)).toEqual({
      hasSelection: false,
      targetLayerId: null,
      targetLayerName: null,
    });
  });
}

function registerTransientTests() {
  it('keeps transient drafts bound to the active raster target', () => {
    const session = createEditorRasterToolSession();
    session.gradientDraft = {
      snapshot: createSnapshot('layer-1', 'Layer 1'),
      startBitmapPoint: { x: 0, y: 0 },
      currentBitmapPoint: { x: 1, y: 1 },
      startScenePoint: { x: 0, y: 0 } as never,
      currentScenePoint: { x: 1, y: 1 } as never,
    };

    expect(isEditorRasterSessionBoundToTarget(session, 'layer-1')).toBe(true);
    expect(isEditorRasterSessionBoundToTarget(session, 'layer-2')).toBe(false);
    expect(isEditorRasterSessionBoundToTarget(session, null)).toBe(false);
  });
}

function registerSyncTests() {
  it('clears unowned transients when target authority changes', () => {
    const session = createEditorRasterToolSession();
    session.marqueeDraft = {
      snapshot: createSnapshot('old-layer', 'Old layer'),
      startBitmapPoint: { x: 0, y: 0 },
      currentBitmapPoint: { x: 1, y: 1 },
    };
    const listener = vi.fn();
    subscribeEditorRasterOverlay(session, listener);
    vi.mocked(resolveRasterTargetState).mockReturnValueOnce(createReadyTargetState('new-layer'));

    syncEditorRasterSelectionSession({ canvas: {} as never, session });

    expect(session.marqueeDraft).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().rasterTarget).toEqual({
      status: 'ready',
      layerId: 'new-layer',
      layerName: 'Layer new-layer',
    });
  });

  it('resets advisory selection summary when no selection is active', () => {
    const session = createEditorRasterToolSession();
    useEditorStore.setState({
      rasterSelection: {
        hasSelection: true,
        targetLayerId: 'stale-layer',
        targetLayerName: 'Stale layer',
      },
    } as never);
    vi.mocked(resolveRasterTargetState).mockReturnValueOnce(createMissingTargetState());

    syncEditorRasterSelectionSession({ canvas: null, session });

    expect(useEditorStore.getState().rasterSelection).toEqual({
      hasSelection: false,
      targetLayerId: null,
      targetLayerName: null,
    });
  });
}

describe('editor-controller/raster-tools/session owners', () => {
  beforeEach(resetRasterStore);

  registerSummaryTests();
  registerTransientTests();
  registerSyncTests();
});
