import {
  handleQuickEditBlur,
  handleQuickEditClick,
  handleQuickEditKeyDown,
  handleQuickEditMouseLeave,
  handleQuickEditMouseMove,
  handleQuickEditOutsideClick,
} from './events';

type QuickEditRuntimeEventsProps = {
  cancelEditing: (element: HTMLElement) => void;
  disableRequested: () => void;
  editingElements: Map<string, { element: HTMLElement }>;
  finishEditing: (element: HTMLElement) => void;
  hideHoverOverlay: () => void;
  isDocumentModeEnabled: () => boolean;
  isEnabled: () => boolean;
  isStyleInspectorModeEnabled: () => boolean;
  makeElementEditable: (element: HTMLElement) => void;
  showHoverOverlay: (element: HTMLElement) => void;
  disableDocumentMode: () => void;
};

function createQuickEditRuntimeEventState(props: QuickEditRuntimeEventsProps) {
  return {
    isEnabled: props.isEnabled,
    isDocumentModeEnabled: props.isDocumentModeEnabled,
    editingElementsSize: () => props.editingElements.size,
    hideHoverOverlay: props.hideHoverOverlay,
    isStyleInspectorModeEnabled: props.isStyleInspectorModeEnabled,
    showHoverOverlay: props.showHoverOverlay,
    makeElementEditable: props.makeElementEditable,
    finishEditing: props.finishEditing,
    cancelEditing: props.cancelEditing,
    disableDocumentMode: props.disableDocumentMode,
    disableRequested: props.disableRequested,
  };
}

export function createQuickEditRuntimeEvents(props: QuickEditRuntimeEventsProps) {
  const runtimeEvents = createQuickEditRuntimeEventState(props);

  return {
    handleBlur: (event: FocusEvent, iframe?: HTMLIFrameElement) => {
      handleQuickEditBlur(event, runtimeEvents, iframe);
    },
    handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      handleQuickEditClick(event, runtimeEvents, iframe);
    },
    handleKeyDown: (event: KeyboardEvent, _iframe?: HTMLIFrameElement) => {
      handleQuickEditKeyDown(event, runtimeEvents);
    },
    handleMouseLeave: () => {
      handleQuickEditMouseLeave(runtimeEvents);
    },
    handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      handleQuickEditMouseMove(event, runtimeEvents, iframe);
    },
    handleOutsideClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      handleQuickEditOutsideClick(
        event,
        runtimeEvents,
        Array.from(props.editingElements.values(), (editable) => editable.element),
        iframe
      );
    },
  };
}
