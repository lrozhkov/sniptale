// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { resolveRasterOverlayObject } from '../raster/object';
import { resolveRasterTargetState } from '../raster/target';
import {
  clearEditorRasterHoverCursor,
  clearEditorRasterSelection,
  clearEditorRasterTransientState,
  createEditorRasterToolSession,
  notifyEditorRasterOverlay,
  setEditorRasterSelection,
  subscribeEditorRasterOverlay,
  syncEditorRasterSelectionSession,
} from './session';

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: vi.fn(),
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  resolveRasterTargetState: vi.fn(),
}));

function createSelection() {
  const maskCanvas = document.createElement('canvas');
  return {
    maskCanvas,
    reference: { kind: 'object' as const, objectId: 'layer-1', objectName: 'Layer 1' },
  };
}

function createReadyTargetState(layerId: string, layerName: string) {
  return {
    summary: {
      status: 'ready' as const,
      layerId,
      layerName,
    },
    target: {
      object: { id: layerId } as never,
      reference: { kind: 'object' as const, objectId: layerId, objectName: layerName },
    },
  };
}

function expectRasterTargetSummary(layerId: string | null, layerName: string | null) {
  expect(useEditorStore.getState().rasterTarget).toEqual({
    status: layerId ? 'ready' : 'missing',
    layerId,
    layerName,
  });
}

function registerCreateAndNotifyTest() {
  beforeEach(() => {
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
  });

  it('creates a clean session and notifies subscribed overlays', () => {
    const session = createEditorRasterToolSession();
    const listener = vi.fn();
    const unsubscribe = subscribeEditorRasterOverlay(session, listener);

    notifyEditorRasterOverlay(session);
    unsubscribe();
    notifyEditorRasterOverlay(session);

    expect(session).toEqual(
      expect.objectContaining({
        brushDraft: null,
        eraserDraft: null,
        gradientDraft: null,
        hoverCursor: null,
        lassoDraft: null,
        marqueeDraft: null,
        selection: null,
      })
    );
    expect(listener).toHaveBeenCalledOnce();
  });
}

function registerTransientClearTest() {
  it('clears transient hover and full transient state with deterministic change reporting', () => {
    const session = createEditorRasterToolSession();
    session.hoverCursor = { scenePoint: { x: 18, y: 24 } as never, tool: 'eraser' };
    session.marqueeDraft = {} as never;
    const listener = vi.fn();
    subscribeEditorRasterOverlay(session, listener);

    expect(clearEditorRasterHoverCursor(session)).toBe(true);
    expect(clearEditorRasterHoverCursor(session)).toBe(false);
    expect(clearEditorRasterTransientState(session)).toBe(true);
    expect(clearEditorRasterTransientState(session)).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });
}

function registerSelectionSyncTest() {
  it('syncs raster target summaries and clears stale selections when active-layer authority changes', () => {
    const session = createEditorRasterToolSession();
    setEditorRasterSelection(session, createSelection());

    expect(useEditorStore.getState().rasterSelection).toEqual({
      hasSelection: true,
      targetLayerId: 'layer-1',
      targetLayerName: 'Layer 1',
    });
    vi.mocked(resolveRasterTargetState).mockReturnValueOnce(
      createReadyTargetState('layer-1', 'Layer 1')
    );

    vi.mocked(resolveRasterOverlayObject).mockReturnValueOnce({ id: 'layer-1' } as never);
    syncEditorRasterSelectionSession({ canvas: {} as never, session });
    expectRasterTargetSummary('layer-1', 'Layer 1');
    expect(useEditorStore.getState().rasterSelection.hasSelection).toBe(true);

    vi.mocked(resolveRasterTargetState).mockReturnValueOnce(
      createReadyTargetState('layer-2', 'Layer 2')
    );
    vi.mocked(resolveRasterOverlayObject).mockReturnValueOnce({ id: 'layer-1' } as never);
    syncEditorRasterSelectionSession({ canvas: {} as never, session });
    expect(session.selection).toBeNull();
    expect(useEditorStore.getState().rasterSelection).toEqual({
      hasSelection: false,
      targetLayerId: null,
      targetLayerName: null,
    });
    expectRasterTargetSummary('layer-2', 'Layer 2');
  });
}

function registerSelectionClearTest() {
  it('clears persisted selection state and transients together', () => {
    const session = createEditorRasterToolSession();
    session.selection = createSelection();
    session.gradientDraft = {} as never;
    session.hoverCursor = { scenePoint: { x: 8, y: 12 } as never, tool: 'eraser' };
    const listener = vi.fn();
    subscribeEditorRasterOverlay(session, listener);

    expect(clearEditorRasterSelection(session)).toBe(true);
    expect(clearEditorRasterSelection(session)).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });
}

describe('editor-controller/raster-tools/session', () => {
  registerCreateAndNotifyTest();
  registerTransientClearTest();
  registerSelectionSyncTest();
  registerSelectionClearTest();
});
