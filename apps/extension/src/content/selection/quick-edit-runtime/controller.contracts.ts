import type { EditableElement } from '../../../features/highlighter/contracts';
import type { QuickEditOverlayState } from './helpers';

export interface QuickEditModeEventHandlers {
  handleBlur: (event: FocusEvent, iframe?: HTMLIFrameElement) => void;
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleKeyDown: (event: KeyboardEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseLeave: () => void;
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleOutsideClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
}

interface QuickEditModeOverlayActions {
  createBlockingOverlay: () => void;
  createHoverOverlay: () => void;
  disconnectResizeObserver: () => void;
  hideHoverOverlay: () => void;
  removeBlockingOverlay: () => void;
  removeHoverOverlay: () => void;
}

export interface QuickEditModeListenerRegistrationProps extends QuickEditModeEventHandlers {
  createBlockingOverlay: () => void;
  createHoverOverlay: () => void;
  hideHoverOverlay: () => void;
  overlayState: QuickEditOverlayState;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
}

export interface QuickEditModeHelpersProps {
  editingElements: Map<string, EditableElement>;
  finishEditing: (element: HTMLElement) => void;
  getCleanupEventListeners: () => (() => void) | null;
  getIsQuickEditMode: () => boolean;
  overlayActions: Pick<
    QuickEditModeOverlayActions,
    'disconnectResizeObserver' | 'removeBlockingOverlay' | 'removeHoverOverlay'
  >;
  overlayState: QuickEditOverlayState;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setIsQuickEditMode: (value: boolean) => void;
}

export interface QuickEditModeToggleProps extends QuickEditModeEventHandlers {
  disableDocumentMode: () => void;
  editingElements: Map<string, EditableElement>;
  finishEditing: (element: HTMLElement) => void;
  getCleanupEventListeners: () => (() => void) | null;
  getIsQuickEditMode: () => boolean;
  overlayActions: QuickEditModeOverlayActions;
  overlayState: QuickEditOverlayState;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setIsQuickEditMode: (value: boolean) => void;
}
