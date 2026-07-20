import type { CSSProperties } from 'react';
import type { EditorLayerItem } from '../../../../features/editor/document/types';

export const EDITOR_CANVAS_CONTEXT_ZONE_DATA_UI = 'editor.canvas.context-zone';
export const EDITOR_CANVAS_CONTEXT_MENU_DATA_UI = 'editor.canvas.context-menu';
export const EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI = 'editor.canvas.surface-hit-area';
export const EDITOR_CANVAS_VIEWPORT_DATA_UI = 'editor.canvas.viewport';
export const EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI = 'editor.canvas.empty-dropzone';

type CanvasContextMenuKind = 'no-image' | 'blank' | 'single' | 'multi';
export type CanvasContextMenuSubmenu = 'arrange' | 'transform' | 'view';
type CanvasContextMenuSubmenuSide = 'left' | 'right';

interface CanvasContextMenuLayerSnapshot {
  id: string;
  immutable: boolean;
  locked: boolean;
  visible: boolean;
}

export interface CanvasContextMenuRequest {
  kind: CanvasContextMenuKind;
  layer: CanvasContextMenuLayerSnapshot | null;
}

export interface CanvasContextMenuState {
  anchor: {
    x: number;
    y: number;
  };
  request: CanvasContextMenuRequest;
  style: CSSProperties;
  submenuSide: CanvasContextMenuSubmenuSide;
}

export interface CanvasContextMenuActionItem {
  danger?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onSelect: () => void;
}

export type CanvasContextMenuItem =
  | CanvasContextMenuActionItem
  | {
      id: string;
      items: CanvasContextMenuActionItem[];
      label: string;
      type: 'submenu';
    }
  | {
      id: string;
      type: 'divider';
    };

interface CanvasContextMenuCanvas {
  findTarget?: (event: MouseEvent) => import('fabric').FabricObject | null;
  getActiveObject?: () => import('fabric').FabricObject | null;
  getActiveObjects?: () => import('fabric').FabricObject[];
}

export interface CanvasContextMenuController {
  applyLayerTransformation: (
    id: string,
    transformationId: 'flip-horizontal' | 'flip-vertical' | 'rotate-left' | 'rotate-right'
  ) => Promise<void>;
  bringForwardSelection: () => void;
  bringSelectionToFront: () => void;
  canvas: CanvasContextMenuCanvas | null;
  clearSelection: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => Promise<void>;
  mergeSelectedLayers: () => Promise<void>;
  resetZoom: () => void;
  selectLayer: (id: string) => void;
  sendBackwardSelection: () => void;
  sendSelectionToBack: () => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  withHistoryMuted: <T>(callback: () => T) => T;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
}

export function snapshotCanvasContextMenuLayer(
  layer: EditorLayerItem | null
): CanvasContextMenuLayerSnapshot | null {
  if (!layer) {
    return null;
  }

  return {
    id: layer.id,
    immutable: Boolean(layer.immutable),
    locked: Boolean(layer.locked),
    visible: Boolean(layer.visible),
  };
}
