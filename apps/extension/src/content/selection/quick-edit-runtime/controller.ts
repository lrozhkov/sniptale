import type { QuickEditModeToggleProps } from './controller.contracts';
import {
  createQuickEditModeListenerProps,
  createQuickEditModeListenerRegistration,
  createQuickEditModeHandlers,
  createQuickEditModeHelpers,
} from './controller.helpers';
import type { QuickEditRuntimeModeSurface } from './types';

export function createQuickEditModeToggles(
  props: QuickEditModeToggleProps
): Pick<QuickEditRuntimeModeSurface, 'disable' | 'enable'> {
  const { disableHelpers, modeGuards } = createQuickEditModeHelpers({
    editingElements: props.editingElements,
    finishEditing: props.finishEditing,
    getCleanupEventListeners: props.getCleanupEventListeners,
    getIsQuickEditMode: props.getIsQuickEditMode,
    overlayActions: props.overlayActions,
    overlayState: props.overlayState,
    setCleanupEventListeners: props.setCleanupEventListeners,
    setIsQuickEditMode: props.setIsQuickEditMode,
  });
  const enableModeListeners = createQuickEditModeListenerRegistration(
    createQuickEditModeListenerProps(props)
  );

  return createQuickEditModeHandlers({
    cleanupModeResources: disableHelpers.cleanupModeResources,
    disableDocumentMode: props.disableDocumentMode,
    disableEditingSessions: disableHelpers.disableEditingSessions,
    disableMode: modeGuards.startDisableFlow,
    enableMode: modeGuards.startEnableFlow,
    enableModeListeners,
    setIsQuickEditMode: props.setIsQuickEditMode,
  });
}
