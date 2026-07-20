import type { EditableElement } from '../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { buildEditableElementRecord } from './helpers';
import { createQuickEditHistoryTracker } from './history';
import { cancelEditableElement, finishEditableElement } from './editing-session';
import { activateEditableElement, clearEditableElementState } from './session';

const logger = createLogger({ namespace: 'ContentQuickEditRuntime' });

type QuickEditEditingOverlayActions = {
  disconnectResizeObserver: () => void;
  hideBlockingOverlay: () => void;
  setupResizeObserver: (target: HTMLElement, onResize: () => void) => void;
  showBlockingOverlay: () => void;
  updateBlockingOverlayShape: (element: HTMLElement) => void;
};

type QuickEditEditingActionProps = {
  editingElements: Map<string, EditableElement>;
  overlayActions: QuickEditEditingOverlayActions;
  updateBlockingOverlayShape: (element: HTMLElement) => void;
};

function preventChildLinkClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function createOverlayResizeObserverBinder(props: QuickEditEditingActionProps) {
  return (target: HTMLElement) => {
    props.overlayActions.setupResizeObserver(target, () => {
      props.updateBlockingOverlayShape(target);
    });
  };
}

function createEditableElementOverlayBindings(
  props: QuickEditEditingActionProps,
  element: HTMLElement
) {
  const bindResizeObserver = createOverlayResizeObserverBinder(props);

  return {
    editingElements: props.editingElements,
    handleChildLinkClick: preventChildLinkClick,
    hideBlockingOverlay: () => props.overlayActions.hideBlockingOverlay(),
    showBlockingOverlay: () => props.overlayActions.showBlockingOverlay(),
    updateBlockingOverlayShape: props.updateBlockingOverlayShape,
    setupResizeObserver: () => bindResizeObserver(element),
    disconnectResizeObserver: () => props.overlayActions.disconnectResizeObserver(),
  };
}

function createClearElementEditingState(props: QuickEditEditingActionProps) {
  return (element: HTMLElement, id: string): void => {
    clearEditableElementState(element, id, createEditableElementOverlayBindings(props, element));
  };
}

export function createQuickEditEditingActions(props: QuickEditEditingActionProps) {
  const historyTracker = createQuickEditHistoryTracker();
  const clearElementEditingState = createClearElementEditingState(props);

  function makeElementEditable(element: HTMLElement): void {
    const id = `sniptale-editable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const editableRecord = buildEditableElementRecord(element);
    historyTracker.begin(element, id);

    activateEditableElement(element, id, editableRecord, {
      ...createEditableElementOverlayBindings(props, element),
    });
    logger.log('Element made editable', id);
  }

  function finishEditing(element: HTMLElement): void {
    const id = element.dataset['sniptaleEditableId'];

    finishEditableElement(props.editingElements, clearElementEditingState, element);
    historyTracker.commit(element, id);
  }

  function cancelEditing(element: HTMLElement): void {
    const id = element.dataset['sniptaleEditableId'];

    cancelEditableElement(props.editingElements, clearElementEditingState, element);
    historyTracker.cancel(id);
  }

  return { cancelEditing, finishEditing, makeElementEditable };
}
