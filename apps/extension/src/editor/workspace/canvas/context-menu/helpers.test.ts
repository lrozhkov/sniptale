/* eslint-disable max-lines-per-function --
   helper proofs keep request derivation and placement assertions grouped by seam */
import { describe, expect, it, vi } from 'vitest';
import {
  resolveCanvasContextMenuRequest,
  resolveCanvasContextMenuState,
  shouldUseNativeCanvasContextMenu,
} from './helpers';
import type { CanvasContextMenuController } from './types';

const contextMenuEvent = {} as MouseEvent;

function createController(
  overrides: Partial<Pick<CanvasContextMenuController, 'canvas'>> = {}
): CanvasContextMenuController {
  const withHistoryMuted = vi.fn(<T>(callback: () => T) => callback());

  return {
    canvas: null,
    clearSelection: vi.fn(),
    selectLayer: vi.fn(),
    withHistoryMuted:
      withHistoryMuted as unknown as CanvasContextMenuController['withHistoryMuted'],
    applyLayerTransformation: vi.fn(async () => undefined),
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    mergeSelectedLayers: vi.fn(async () => undefined),
    resetZoom: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    toggleLayerLock: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
    ...overrides,
  };
}

describe('canvas context-menu helpers', () => {
  it('returns the no-image request without selection side effects', () => {
    const controller = createController();

    const request = resolveCanvasContextMenuRequest({
      controller,
      event: contextMenuEvent,
      hasImage: false,
      layers: [],
      selection: {
        hasSelection: false,
        selectedObjectCount: 0,
        selectedObjectHeight: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedObjectType: null,
        selectedObjectWidth: null,
      },
    });

    expect(request).toEqual({ kind: 'no-image', layer: null });
    expect(controller.withHistoryMuted).not.toHaveBeenCalled();
  });

  it('keeps native browser ownership when inline text editing is active', () => {
    const controller = createController({
      canvas: {
        getActiveObject: () =>
          ({
            isEditing: true,
            sniptaleId: 'text-1',
            sniptaleType: 'text',
            type: 'textbox',
          }) as never,
      },
    });

    expect(shouldUseNativeCanvasContextMenu(controller)).toBe(true);
    expect(
      resolveCanvasContextMenuRequest({
        controller,
        event: contextMenuEvent,
        hasImage: true,
        layers: [],
        selection: {
          hasSelection: false,
          selectedObjectCount: 0,
          selectedObjectHeight: null,
          selectedObjectId: null,
          selectedObjectIds: [],
          selectedObjectType: null,
          selectedObjectWidth: null,
        },
      })
    ).toBeNull();
  });

  it('retargets right-click to an unselected layer through muted history', () => {
    const controller = createController({
      canvas: {
        findTarget: () =>
          ({
            sniptaleId: 'layer-2',
            type: 'rect',
          }) as never,
        getActiveObject: () => null,
        getActiveObjects: () => [],
      },
    });

    const request = resolveCanvasContextMenuRequest({
      controller,
      event: contextMenuEvent,
      hasImage: true,
      layers: [
        {
          effectCount: 0,
          effects: [],
          id: 'layer-2',
          immutable: false,
          locked: true,
          name: 'Layer 2',
          previewColor: '#00aa55',
          previewDataUrl: null,
          previewTransparent: false,
          raster: false,
          selected: false,
          selectedCount: 0,
          type: 'rectangle',
          typeLabel: 'Rectangle',
          visible: false,
        },
      ],
      selection: {
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectHeight: 120,
        selectedObjectId: 'layer-1',
        selectedObjectIds: ['layer-1'],
        selectedObjectType: 'rectangle',
        selectedObjectWidth: 160,
      },
    });

    expect(controller.withHistoryMuted).toHaveBeenCalledOnce();
    expect(controller.selectLayer).toHaveBeenCalledWith('layer-2');
    expect(request).toEqual({
      kind: 'single',
      layer: {
        id: 'layer-2',
        immutable: false,
        locked: true,
        visible: false,
      },
    });
  });

  it('keeps the current selection request when the right-click target is already selected', () => {
    const activeObject = { sniptaleId: 'layer-1', type: 'rect' };
    const controller = createController({
      canvas: {
        findTarget: () => activeObject as never,
        getActiveObject: () => activeObject as never,
        getActiveObjects: () => [],
      },
    });

    expect(
      resolveCanvasContextMenuRequest({
        controller,
        event: contextMenuEvent,
        hasImage: true,
        layers: [],
        selection: {
          hasSelection: true,
          selectedObjectCount: 1,
          selectedObjectHeight: 120,
          selectedObjectId: 'layer-1',
          selectedObjectIds: ['layer-1'],
          selectedObjectType: 'rectangle',
          selectedObjectWidth: 160,
        },
      })
    ).toEqual({ kind: 'single', layer: null });
    expect(controller.selectLayer).not.toHaveBeenCalled();
  });

  it('clears selection on blank-canvas right-click and clamps menu placement', () => {
    const controller = createController({
      canvas: {
        findTarget: () => null,
        getActiveObject: () => null,
        getActiveObjects: () => [],
      },
    });

    const request = resolveCanvasContextMenuRequest({
      controller,
      event: contextMenuEvent,
      hasImage: true,
      layers: [],
      selection: {
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectHeight: 120,
        selectedObjectId: 'layer-1',
        selectedObjectIds: ['layer-1'],
        selectedObjectType: 'rectangle',
        selectedObjectWidth: 160,
      },
    });

    const state = resolveCanvasContextMenuState({
      anchor: { x: 400, y: 300 },
      request: request!,
      wrapperElement: {
        getBoundingClientRect: () => ({
          bottom: 180,
          height: 180,
          left: 0,
          right: 260,
          top: 0,
          width: 260,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      } as HTMLElement,
    });

    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(request).toEqual({ kind: 'blank', layer: null });
    expect(state.style).toEqual({ left: 12, top: 68 });
    expect(state.submenuSide).toBe('left');
  });
});
