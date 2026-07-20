import { expect, it, vi } from 'vitest';
import {
  buildArrangeItems,
  buildTransformItems,
  buildViewItems,
  withMenuClose,
} from './submenu-items';
import type { CanvasContextMenuController } from './types';

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
