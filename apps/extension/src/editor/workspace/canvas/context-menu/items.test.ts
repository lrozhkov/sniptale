/* eslint-disable max-lines-per-function --
   item builder proofs keep menu contracts and async action assertions together */
import { describe, expect, it, vi } from 'vitest';
import { buildCanvasContextMenuItems, resolveCanvasContextMenuEnabledSnapshot } from './items';
import type {
  CanvasContextMenuActionItem,
  CanvasContextMenuController,
  CanvasContextMenuItem,
} from './types';

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

function getActionItem(items: CanvasContextMenuItem[], id: string): CanvasContextMenuActionItem {
  const item = items.find(
    (candidate): candidate is CanvasContextMenuActionItem =>
      !('type' in candidate) && candidate.id === id
  );
  if (!item) {
    throw new Error(`Expected action item ${id}`);
  }

  return item;
}

function getSubmenuItem(
  items: CanvasContextMenuItem[],
  id: string
): Extract<CanvasContextMenuItem, { type: 'submenu' }> {
  const item = items.find(
    (candidate): candidate is Extract<CanvasContextMenuItem, { type: 'submenu' }> =>
      'type' in candidate && candidate.type === 'submenu' && candidate.id === id
  );
  if (!item) {
    throw new Error(`Expected submenu item ${id}`);
  }

  return item;
}

function getMenuLabels(items: CanvasContextMenuItem[]) {
  return items.map((item) => ('label' in item ? item.label : item.type));
}

function registerBlankCanvasItemsTest() {
  it('builds the blank-canvas launcher and view submenu', async () => {
    const controller = createController();
    const onClose = vi.fn();
    const onOpenImage = vi.fn();
    const items = buildCanvasContextMenuItems({
      controller,
      enabledSnapshot: resolveCanvasContextMenuEnabledSnapshot([], {
        kind: 'blank',
        layer: null,
      }),
      onClose,
      onOpenImage,
      request: {
        kind: 'blank',
        layer: null,
      },
    });

    expect(getMenuLabels(items)).toEqual(['Вставить изображение…', 'Вид']);
    expect(getSubmenuItem(items, 'view')).toMatchObject({
      id: 'view',
      type: 'submenu',
    });

    getActionItem(items, 'insert-image').onSelect();
    getSubmenuItem(items, 'view').items[0]?.onSelect();
    await Promise.resolve();

    expect(onOpenImage).toHaveBeenCalledOnce();
    expect(controller.zoomToFit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
}

function registerNoImageItemsTest() {
  it('builds the empty-editor open-image action and closes after selection', () => {
    const onClose = vi.fn();
    const onOpenImage = vi.fn();
    const items = buildCanvasContextMenuItems({
      controller: createController(),
      enabledSnapshot: resolveCanvasContextMenuEnabledSnapshot([], {
        kind: 'no-image',
        layer: null,
      }),
      onClose,
      onOpenImage,
      request: {
        kind: 'no-image',
        layer: null,
      },
    });

    expect(getMenuLabels(items)).toEqual(['Открыть изображение…']);

    getActionItem(items, 'open-image').onSelect();

    expect(onOpenImage).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
}

function registerSingleLayerItemsTest() {
  it('derives single-layer labels from the request snapshot and executes actions', async () => {
    const controller = createController();
    const request = {
      kind: 'single' as const,
      layer: {
        id: 'layer-2',
        immutable: false,
        locked: true,
        visible: false,
      },
    };
    const items = buildCanvasContextMenuItems({
      controller,
      enabledSnapshot: resolveCanvasContextMenuEnabledSnapshot(
        [
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
            type: 'rectangle' as const,
            typeLabel: 'Rectangle',
            visible: false,
          },
        ],
        request
      ),
      onClose: vi.fn(),
      onOpenImage: vi.fn(),
      request,
    });

    expect(getMenuLabels(items)).toContain('Показать слой');
    expect(getMenuLabels(items)).toContain('Разблокировать слой');
    expect(getActionItem(items, 'toggle-visibility').disabled).toBe(true);
    expect(getSubmenuItem(items, 'transform').items.every((item) => item.disabled)).toBe(true);

    getActionItem(items, 'toggle-lock').onSelect();
    await Promise.resolve();

    expect(controller.toggleLayerVisibility).not.toHaveBeenCalled();
    expect(controller.toggleLayerLock).toHaveBeenCalledWith('layer-2');
    expect(controller.applyLayerTransformation).not.toHaveBeenCalled();
  });
}

function registerMultiSelectionItemsTest() {
  it('builds multi-selection actions with disabled policy states from the enabled snapshot', async () => {
    const controller = createController();
    const onClose = vi.fn();
    const items = buildCanvasContextMenuItems({
      controller,
      enabledSnapshot: {
        canDelete: false,
        canDuplicate: false,
        canMerge: false,
        canReorder: false,
      },
      onClose,
      onOpenImage: vi.fn(),
      request: {
        kind: 'multi',
        layer: null,
      },
    });

    expect(getActionItem(items, 'duplicate-selection').disabled).toBe(true);
    expect(getActionItem(items, 'merge-layers').disabled).toBe(true);
    expect(getSubmenuItem(items, 'arrange').items.every((item) => item.disabled)).toBe(true);
    expect(getActionItem(items, 'delete-selection').disabled).toBe(true);

    getActionItem(items, 'duplicate-selection').onSelect();
    getActionItem(items, 'merge-layers').onSelect();
    await Promise.resolve();

    expect(controller.duplicateSelection).toHaveBeenCalledOnce();
    expect(controller.mergeSelectedLayers).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
}

function registerSelectionPolicyTest() {
  it('keeps duplicate and delete enabled for a retargeted single layer', () => {
    const enabledSnapshot = resolveCanvasContextMenuEnabledSnapshot(
      [
        {
          effectCount: 0,
          effects: [],
          id: 'source-image',
          immutable: true,
          locked: false,
          name: 'Source',
          previewColor: '#ff5500',
          previewDataUrl: null,
          previewTransparent: false,
          raster: false,
          selected: false,
          selectedCount: 0,
          type: 'source-image' as const,
          typeLabel: 'Image',
          visible: true,
        },
      ],
      {
        kind: 'single',
        layer: {
          id: 'source-image',
          immutable: true,
          locked: false,
          visible: true,
        },
      }
    );

    expect(enabledSnapshot.canDuplicate).toBe(true);
    expect(enabledSnapshot.canDelete).toBe(false);
  });
}

describe('canvas context-menu items', () => {
  registerBlankCanvasItemsTest();
  registerNoImageItemsTest();
  registerSingleLayerItemsTest();
  registerMultiSelectionItemsTest();
  registerSelectionPolicyTest();
});
