// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { selectLayerObject } from '../../../controller/layer-actions/state/selection';
import { expect, it, vi } from 'vitest';
import {
  buildArrangeItems,
  buildTransformItems,
  buildViewItems,
  withMenuClose,
} from './submenu-items';
import type { CanvasContextMenuController } from './types';
import { resolveCanvasContextMenuRequest, resolveCanvasContextMenuState } from './helpers';

function createController(): CanvasContextMenuController {
  const withHistoryMuted = vi.fn(<T>(callback: () => T) => callback());

  return {
    applyLayerTransformation: vi.fn(async () => undefined),
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    canvas: null,
    clearSelection: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    copyVectorSelection: vi.fn(async () => true),
    pasteVectorSelection: vi.fn(async () => true),
    getVectorClipboardAvailability: vi.fn(() => ({ canCopy: false, canPaste: false })),
    mergeSelectedLayers: vi.fn(async () => undefined),
    resetZoom: vi.fn(),
    selectLayer: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    toggleLayerLock: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    withHistoryMuted:
      withHistoryMuted as unknown as CanvasContextMenuController['withHistoryMuted'],
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
  };
}

it('wraps actions with close-on-select ownership', () => {
  const onClose = vi.fn();
  const onSelect = vi.fn();

  const item = withMenuClose(
    {
      id: 'wrapped',
      label: 'Wrapped',
      onSelect,
    },
    onClose
  );

  item.onSelect();

  expect(onClose).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledOnce();
});

it('builds arrange and view actions through existing controller methods', () => {
  const controller = createController();
  const onClose = vi.fn();

  const arrangeItems = buildArrangeItems(controller, false, onClose);
  const viewItems = buildViewItems(controller, onClose);

  arrangeItems[0]?.onSelect();
  arrangeItems[1]?.onSelect();
  arrangeItems[2]?.onSelect();
  arrangeItems[3]?.onSelect();
  viewItems[0]?.onSelect();
  viewItems[1]?.onSelect();
  viewItems[2]?.onSelect();
  viewItems[3]?.onSelect();

  expect(controller.bringSelectionToFront).toHaveBeenCalledOnce();
  expect(controller.bringForwardSelection).toHaveBeenCalledOnce();
  expect(controller.sendBackwardSelection).toHaveBeenCalledOnce();
  expect(controller.sendSelectionToBack).toHaveBeenCalledOnce();
  expect(controller.zoomToFit).toHaveBeenCalledOnce();
  expect(controller.resetZoom).toHaveBeenCalledOnce();
  expect(controller.zoomIn).toHaveBeenCalledOnce();
  expect(controller.zoomOut).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledTimes(8);
});

it('builds transform actions through the async layer transformation seam', async () => {
  const controller = createController();

  const items = buildTransformItems(controller, 'layer-7', false, vi.fn());
  items[0]?.onSelect();
  items[1]?.onSelect();
  items[2]?.onSelect();
  items[3]?.onSelect();
  await Promise.resolve();

  expect(controller.applyLayerTransformation).toHaveBeenNthCalledWith(
    1,
    'layer-7',
    'flip-horizontal'
  );
  expect(controller.applyLayerTransformation).toHaveBeenNthCalledWith(
    2,
    'layer-7',
    'flip-vertical'
  );
  expect(controller.applyLayerTransformation).toHaveBeenNthCalledWith(3, 'layer-7', 'rotate-left');
  expect(controller.applyLayerTransformation).toHaveBeenNthCalledWith(4, 'layer-7', 'rotate-right');
});

const layer = {
  effectCount: 0,
  effects: [],
  id: 'layer-1',
  immutable: false,
  locked: false,
  name: 'Layer',
  previewColor: null,
  previewDataUrl: null,
  previewTransparent: true,
  raster: false,
  selected: true,
  selectedCount: 1,
  type: 'shape' as const,
  typeLabel: 'Shape',
  visible: true,
};
const selection = {
  hasSelection: true,
  selectedObjectCount: 1,
  selectedObjectHeight: 40,
  selectedObjectId: 'layer-1',
  selectedObjectIds: ['layer-1'],
  selectedObjectType: 'shape' as const,
  selectedObjectWidth: 80,
};

it('resolves empty, selected, and directly targeted canvas context requests', () => {
  const controller = createController();
  const target = new Rect({ width: 80, height: 40 });
  target.sniptaleId = 'layer-1';
  target.sniptaleRole = 'annotation';
  target.sniptaleType = 'shape';
  const canvas = {
    findTarget: vi.fn<Canvas['findTarget']>(() => ({
      target,
      subTargets: [],
      currentSubTargets: [],
    })),
    getActiveObject: vi.fn(() => undefined),
    getActiveObjects: vi.fn(() => [target]),
  };
  controller.canvas = canvas;

  expect(
    resolveCanvasContextMenuRequest({
      controller,
      event: new MouseEvent('contextmenu'),
      hasImage: false,
      layers: [layer],
      selection,
    })
  ).toEqual({ kind: 'no-image', layer: null });
  expect(
    resolveCanvasContextMenuRequest({
      controller,
      event: new MouseEvent('contextmenu'),
      hasImage: true,
      layers: [layer],
      selection,
    })
  ).toEqual(expect.objectContaining({ kind: 'single' }));

  canvas.findTarget.mockReturnValue({ subTargets: [], currentSubTargets: [] });
  expect(
    resolveCanvasContextMenuRequest({
      controller,
      event: new MouseEvent('contextmenu'),
      hasImage: true,
      layers: [layer],
      selection,
    })
  ).toEqual({ kind: 'blank', layer: null });
  expect(controller.clearSelection).toHaveBeenCalledOnce();
});

it('targets the frame annotation under a DOM context menu event', () => {
  const controller = createController();
  const frameLayer = { ...layer, id: 'frame-1', type: 'frame-annotation' as const };
  const frame = document.createElement('div');
  frame.dataset['frameId'] = frameLayer.id;
  let request: ReturnType<typeof resolveCanvasContextMenuRequest> = null;
  frame.addEventListener('contextmenu', (event) => {
    request = resolveCanvasContextMenuRequest({
      controller,
      event,
      hasImage: true,
      layers: [frameLayer],
      selection,
    });
  });

  frame.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

  expect(request).toEqual(
    expect.objectContaining({ kind: 'single', layer: expect.objectContaining({ id: 'frame-1' }) })
  );
  expect(controller.selectLayer).toHaveBeenCalledWith('frame-1', { focusViewport: false });
});

it('clamps menu placement and chooses a submenu side from available space', () => {
  const wrapperElement = document.createElement('div');
  vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue({
    bottom: 400,
    height: 400,
    left: 0,
    right: 800,
    toJSON: () => ({}),
    top: 0,
    width: 800,
    x: 0,
    y: 0,
  });
  expect(
    resolveCanvasContextMenuState({
      anchor: { x: 20, y: 390 },
      request: { kind: 'single', layer },
      wrapperElement,
    })
  ).toEqual(expect.objectContaining({ style: { left: 20, top: 44 }, submenuSide: 'right' }));
  expect(
    resolveCanvasContextMenuState({
      anchor: { x: 790, y: 10 },
      request: { kind: 'multi', layer: null },
      wrapperElement,
    }).submenuSide
  ).toBe('left');
});

it('selects the real Fabric 7 hit target from its result container', async () => {
  const canvas = new Canvas(undefined, { width: 300, height: 200, renderOnAddRemove: false });
  try {
    const target = new Rect({ left: 30, top: 40, width: 80, height: 40, fill: '#ff0000' });
    target.sniptaleId = 'layer-1';
    target.sniptaleType = 'shape';
    target.sniptaleRole = 'annotation';
    canvas.add(target);
    canvas.calcOffset();
    const event = new MouseEvent('contextmenu', { clientX: 50, clientY: 60, button: 2 });
    expect(canvas.findTarget(event).target).toBe(target);
    const controller = createController();
    controller.canvas = canvas;
    controller.selectLayer = vi.fn((id: string, options?: { focusViewport?: boolean }) => {
      selectLayerObject(
        canvas,
        id,
        options ?? {},
        () => false,
        () => canvas.setViewportTransform([1, 0, 0, 1, -60, -40])
      );
    });
    const viewport = [...canvas.viewportTransform];
    const request = resolveCanvasContextMenuRequest({
      controller,
      event,
      hasImage: true,
      layers: [layer],
      selection: { ...selection, hasSelection: false, selectedObjectIds: [] },
    });
    expect(request).toMatchObject({ kind: 'single', layer: { id: 'layer-1' } });
    expect(controller.selectLayer).toHaveBeenCalledWith('layer-1', { focusViewport: false });
    expect(canvas.getActiveObject()).toBe(target);
    expect(canvas.viewportTransform).toEqual(viewport);
  } finally {
    await canvas.dispose();
  }
});
