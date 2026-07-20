import type { enableQuickEditCursor } from './helpers';
import { disableQuickEditCursor } from './helpers';
import type { QuickEditModeHelpersProps } from './controller.contracts';
import { createQuickEditEnableGuards } from './controller-guards';

function createQuickEditDisableHelpers(props: {
  getCleanupEventListeners: () => (() => void) | null;
  disconnectResizeObserver: () => void;
  editingElements: Map<string, { element: HTMLElement }>;
  finishEditing: (element: HTMLElement) => void;
  overlayState: Parameters<typeof enableQuickEditCursor>[0];
  removeBlockingOverlay: () => void;
  removeHoverOverlay: () => void;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
}) {
  function disableEditingSessions(): void {
    Array.from(props.editingElements.values()).forEach((editable) => {
      props.finishEditing(editable.element);
    });
  }

  function cleanupModeResources(): void {
    props.getCleanupEventListeners()?.();
    props.setCleanupEventListeners(null);
    props.removeHoverOverlay();
    props.removeBlockingOverlay();
    props.disconnectResizeObserver();
    disableQuickEditCursor(props.overlayState);
  }

  return { cleanupModeResources, disableEditingSessions };
}

export function createQuickEditModeHelpers(props: QuickEditModeHelpersProps) {
  return {
    disableHelpers: createQuickEditDisableHelpers({
      getCleanupEventListeners: props.getCleanupEventListeners,
      disconnectResizeObserver: props.overlayActions.disconnectResizeObserver,
      editingElements: props.editingElements,
      finishEditing: props.finishEditing,
      overlayState: props.overlayState,
      removeBlockingOverlay: props.overlayActions.removeBlockingOverlay,
      removeHoverOverlay: props.overlayActions.removeHoverOverlay,
      setCleanupEventListeners: props.setCleanupEventListeners,
    }),
    modeGuards: createQuickEditEnableGuards({
      getIsQuickEditMode: props.getIsQuickEditMode,
    }),
  };
}
