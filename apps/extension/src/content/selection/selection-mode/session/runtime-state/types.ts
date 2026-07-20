import type { SelectionModeMutableRefs, SelectionModeRuntimeState } from '../locals-contract';

export interface SelectionModeRuntimePointerHandlers {
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseDown: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseLeave: () => void;
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseUp: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
}

export interface SelectionModeRuntimeArgsInput extends SelectionModeRuntimePointerHandlers {
  createDragFrame: () => void;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  refs: SelectionModeMutableRefs;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setCleanupScrollListeners: (cleanup: (() => void) | null) => void;
  showFinalFrame: () => void;
  updateFinalFrame: () => void;
  zIndexBase: number;
}

export type { SelectionModeRuntimeState };
