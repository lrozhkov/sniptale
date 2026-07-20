import type { ResizeDirection } from '../ui';

export interface SelectionModeInteractionState {
  aspectRatio: number | null;
  currentSelection: { x: number; y: number; width: number; height: number };
  currentState: 'idle' | 'hover' | 'drag' | 'confirmed';
  dragStartPoint: { x: number; y: number };
  dragThreshold: number;
  hasMovedEnough: boolean;
  hoveredElement: HTMLElement | null;
  isActive: boolean;
  isDragging: boolean;
  isResizing: boolean;
  maintainAspectRatio: boolean;
  mouseDownPoint: { x: number; y: number } | null;
  resizeDirection: ResizeDirection | null;
  selectionAtDragStart: { x: number; y: number; width: number; height: number };
  skipNextClick: boolean;
}

export interface SelectionModeEventOptions {
  isExtensionUIElement: (target: HTMLElement) => boolean;
  hideHoverFrame: () => void;
  showHoverFrame: (target: HTMLElement, iframe?: HTMLIFrameElement) => void;
  startDragSelection: (startX: number, startY: number) => void;
  updateDragSelection: (currentX: number, currentY: number) => void;
  finalizeDragSelection: () => void;
  handleDragMove: (event: MouseEvent) => void;
  handleResizeMove: (event: MouseEvent) => void;
  selectElement: (target: HTMLElement, iframe?: HTMLIFrameElement) => void;
  resetToIdleState: () => void;
  cancelSelection: () => void;
  confirmSelection: () => void;
}
