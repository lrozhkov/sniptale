import type { EditableElement } from '../../../features/highlighter/contracts';
import { createQuickEditOverlayState } from './helpers';
import { createQuickEditModeToggles } from './controller';
import { createQuickEditDocumentMode } from './document-mode';
import { createQuickEditEditingActions } from './editing';
import { createQuickEditRuntimeEvents } from './runtime.events';
import { createQuickEditOverlayActions } from './overlays';
import { isQuickEditStyleInspectorModeEnabled } from './page-style-inspection';
import type {
  QuickEditRuntimeController,
  QuickEditRuntimeEditingSurface,
  QuickEditRuntimeOptions,
} from './types';

function createQuickEditStateAccessors(props: {
  editingElements: Map<string, EditableElement>;
}): QuickEditRuntimeEditingSurface {
  return {
    getEditingElements: () => props.editingElements,
  };
}

function createQuickEditCleanupSetter(props: {
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setIsQuickEditMode: (value: boolean) => void;
}) {
  return {
    setCleanupEventListeners: props.setCleanupEventListeners,
    setIsQuickEditMode: props.setIsQuickEditMode,
  };
}

type QuickEditEditingActions = ReturnType<typeof createQuickEditEditingActions>;
type QuickEditDocumentMode = ReturnType<typeof createQuickEditDocumentMode>;
type QuickEditRuntimeEvents = ReturnType<typeof createQuickEditRuntimeEvents>;

function createQuickEditRuntimeParts(props: {
  editingElements: Map<string, EditableElement>;
  getCleanupEventListeners: () => (() => void) | null;
  getIsQuickEditMode: () => boolean;
  onDisableRequested: () => void;
  overlayActions: ReturnType<typeof createQuickEditOverlayActions>;
  overlayState: ReturnType<typeof createQuickEditOverlayState>;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setIsQuickEditMode: (value: boolean) => void;
  updateBlockingOverlayShape: (element: HTMLElement) => void;
}) {
  const editingActions = createQuickEditEditingActions({
    editingElements: props.editingElements,
    overlayActions: props.overlayActions,
    updateBlockingOverlayShape: props.updateBlockingOverlayShape,
  });
  const documentMode = createQuickEditDocumentMode({
    editingElements: props.editingElements,
    finishEditing: editingActions.finishEditing,
    getIsQuickEditMode: props.getIsQuickEditMode,
    hideBlockingOverlay: props.overlayActions.hideBlockingOverlay,
    hideHoverOverlay: props.overlayActions.hideHoverOverlay,
  });
  const runtimeEventHandlers = createRuntimeEventHandlers(props, editingActions, documentMode);
  const modeToggles = createModeToggles(props, editingActions, documentMode, runtimeEventHandlers);

  return {
    ...modeToggles,
    disableDocumentMode: documentMode.disable,
    enableDocumentMode: documentMode.enable,
    isDocumentModeEnabled: documentMode.isEnabled,
  };
}

function createRuntimeEventHandlers(
  props: Parameters<typeof createQuickEditRuntimeParts>[0],
  editingActions: QuickEditEditingActions,
  documentMode: QuickEditDocumentMode
): QuickEditRuntimeEvents {
  return createQuickEditRuntimeEvents({
    cancelEditing: editingActions.cancelEditing,
    disableDocumentMode: documentMode.disable,
    disableRequested: props.onDisableRequested,
    editingElements: props.editingElements,
    finishEditing: editingActions.finishEditing,
    hideHoverOverlay: props.overlayActions.hideHoverOverlay,
    isDocumentModeEnabled: documentMode.isEnabled,
    isEnabled: props.getIsQuickEditMode,
    isStyleInspectorModeEnabled: isQuickEditStyleInspectorModeEnabled,
    makeElementEditable: editingActions.makeElementEditable,
    showHoverOverlay: props.overlayActions.showHoverOverlay,
  });
}

function createModeToggles(
  props: Parameters<typeof createQuickEditRuntimeParts>[0],
  editingActions: QuickEditEditingActions,
  documentMode: QuickEditDocumentMode,
  runtimeEventHandlers: QuickEditRuntimeEvents
) {
  return createQuickEditModeToggles({
    disableDocumentMode: documentMode.disable,
    editingElements: props.editingElements,
    finishEditing: editingActions.finishEditing,
    getCleanupEventListeners: props.getCleanupEventListeners,
    getIsQuickEditMode: props.getIsQuickEditMode,
    handleBlur: runtimeEventHandlers.handleBlur,
    handleClick: runtimeEventHandlers.handleClick,
    handleKeyDown: runtimeEventHandlers.handleKeyDown,
    handleMouseLeave: runtimeEventHandlers.handleMouseLeave,
    handleMouseMove: runtimeEventHandlers.handleMouseMove,
    handleOutsideClick: runtimeEventHandlers.handleOutsideClick,
    overlayActions: props.overlayActions,
    overlayState: props.overlayState,
    setCleanupEventListeners: props.setCleanupEventListeners,
    setIsQuickEditMode: props.setIsQuickEditMode,
  });
}

export function createQuickEditRuntimeController(
  options: QuickEditRuntimeOptions
): QuickEditRuntimeController {
  let isQuickEditMode = false;
  const editingElements = new Map<string, EditableElement>();
  let cleanupEventListeners: (() => void) | null = null;
  const overlayState = createQuickEditOverlayState();
  const overlayActions = createQuickEditOverlayActions(overlayState);
  const modeToggles = createQuickEditRuntimeParts({
    editingElements,
    getCleanupEventListeners: () => cleanupEventListeners,
    getIsQuickEditMode: () => isQuickEditMode,
    onDisableRequested: options.onDisableRequested,
    overlayActions,
    overlayState,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
    ...createQuickEditCleanupSetter({
      setCleanupEventListeners: (cleanup) => {
        cleanupEventListeners = cleanup;
      },
      setIsQuickEditMode: (value) => {
        isQuickEditMode = value;
      },
    }),
  });
  const stateAccessors = createQuickEditStateAccessors({
    editingElements,
  });

  return {
    documentMode: {
      enable: modeToggles.enableDocumentMode,
      disable: modeToggles.disableDocumentMode,
      isEnabled: modeToggles.isDocumentModeEnabled,
    },
    editing: stateAccessors,
    mode: {
      enable: modeToggles.enable,
      disable: modeToggles.disable,
      isEnabled: () => isQuickEditMode,
    },
  };
}
