import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../../features/editor/document/types';
import { isTextTarget } from '../../../controller/events/text-target';
import { isTargetInCurrentSelection } from '../../../controller/selection/target';
import { isEditableObject } from '../../../document/model';
import {
  type CanvasContextMenuController,
  type CanvasContextMenuRequest,
  snapshotCanvasContextMenuLayer,
} from './types';

const CONTEXT_MENU_ESTIMATED_WIDTH = 240;
const CONTEXT_SUBMENU_ESTIMATED_WIDTH = 220;
const CONTEXT_MENU_GAP = 8;
const CONTEXT_MENU_MARGIN = 8;

type EditableTarget = import('fabric').FabricObject & {
  isEditing?: boolean;
  sniptaleId?: string;
};

function clampValue(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function getEstimatedMenuHeight(kind: CanvasContextMenuRequest['kind']) {
  switch (kind) {
    case 'no-image':
      return 64;
    case 'blank':
      return 104;
    case 'single':
      return 252;
    case 'multi':
      return 204;
  }
}

function getSelectionIds(selection: EditorSelectionState, layers: EditorLayerItem[]) {
  if (selection.selectedObjectIds.length > 0) {
    return selection.selectedObjectIds;
  }

  return layers.filter((layer) => layer.selected).map((layer) => layer.id);
}

function findLayer(layers: EditorLayerItem[], id: string | null | undefined) {
  return typeof id === 'string' ? (layers.find((layer) => layer.id === id) ?? null) : null;
}

function buildSelectionRequest(
  selectedIds: readonly string[],
  layers: EditorLayerItem[]
): CanvasContextMenuRequest {
  if (selectedIds.length <= 1) {
    return {
      kind: selectedIds.length === 0 ? 'blank' : 'single',
      layer: snapshotCanvasContextMenuLayer(findLayer(layers, selectedIds[0] ?? null)),
    };
  }

  return {
    kind: 'multi',
    layer: null,
  };
}

function resolveCanvasTarget(
  controller: CanvasContextMenuController,
  event: MouseEvent
): EditableTarget | null {
  const canvas = controller.canvas;
  if (!canvas || typeof canvas.findTarget !== 'function') {
    return null;
  }

  return (canvas.findTarget(event) as EditableTarget | null) ?? null;
}

function isEditingTextTarget(target: EditableTarget | null) {
  return Boolean(target?.isEditing && isTextTarget(target));
}

export function shouldUseNativeCanvasContextMenu(controller: CanvasContextMenuController): boolean {
  const activeObject = (controller.canvas?.getActiveObject?.() as EditableTarget | null) ?? null;
  return isEditingTextTarget(activeObject);
}

export function resolveCanvasContextMenuRequest(args: {
  controller: CanvasContextMenuController;
  event: MouseEvent;
  hasImage: boolean;
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
}): CanvasContextMenuRequest | null {
  const { controller, event, hasImage, layers, selection } = args;
  if (!hasImage) {
    return { kind: 'no-image', layer: null };
  }

  if (shouldUseNativeCanvasContextMenu(controller)) {
    return null;
  }

  const selectionIds = getSelectionIds(selection, layers);
  const target = resolveCanvasTarget(controller, event);
  if (target && controller.canvas && isTargetInCurrentSelection(controller.canvas, target)) {
    return buildSelectionRequest(selectionIds, layers);
  }

  if (
    target &&
    isEditableObject(target) &&
    typeof target.sniptaleId === 'string' &&
    target.sniptaleId.length > 0
  ) {
    controller.withHistoryMuted(() => {
      controller.selectLayer(target.sniptaleId as string);
    });

    return buildSelectionRequest([target.sniptaleId], layers);
  }

  if (selection.hasSelection) {
    controller.withHistoryMuted(() => {
      controller.clearSelection();
    });
  }

  return { kind: 'blank', layer: null };
}

export function resolveCanvasContextMenuState(args: {
  anchor: { x: number; y: number };
  request: CanvasContextMenuRequest;
  wrapperElement: HTMLElement | null;
}) {
  const wrapperRect = args.wrapperElement?.getBoundingClientRect();
  const wrapperWidth = wrapperRect?.width ?? 0;
  const wrapperHeight = wrapperRect?.height ?? 0;
  const menuHeight = getEstimatedMenuHeight(args.request.kind);
  const left = clampValue(
    args.anchor.x,
    CONTEXT_MENU_MARGIN,
    wrapperWidth - CONTEXT_MENU_ESTIMATED_WIDTH - CONTEXT_MENU_MARGIN
  );
  const top = clampValue(
    args.anchor.y,
    CONTEXT_MENU_MARGIN,
    wrapperHeight - menuHeight - CONTEXT_MENU_MARGIN
  );
  const rightSpace = wrapperWidth - left - CONTEXT_MENU_ESTIMATED_WIDTH - CONTEXT_MENU_MARGIN;
  const submenuSide =
    rightSpace >= CONTEXT_SUBMENU_ESTIMATED_WIDTH + CONTEXT_MENU_GAP
      ? ('right' as const)
      : ('left' as const);

  return {
    request: args.request,
    style: {
      left,
      top,
    },
    submenuSide,
  };
}
