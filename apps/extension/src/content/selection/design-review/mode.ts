// policyStateIds: [] - disposable picker lifecycle listeners grant no capability or authorization.
import {
  deactivateOtherContentModes,
  registerContentMode,
  setContentModeEnabled,
} from '../../application/mode-session';
import {
  dispatchContentModeDisabled,
  dispatchContentModeEnabled,
} from '../../platform/page-context/mode-events';
import {
  startDesignReviewPicker,
  type DesignReviewPickerRuntime,
  type DesignReviewSelection,
} from './picker';

export interface DesignReviewModeState {
  enabled: boolean;
  selection: DesignReviewSelection | null;
}

type DesignReviewModeListener = () => void;
type DesignReviewInspectorDismissRequestHandler = () => boolean;

let pickerRuntime: DesignReviewPickerRuntime | null = null;
let state: DesignReviewModeState = { enabled: false, selection: null };
const listeners = new Set<DesignReviewModeListener>();
let inspectorDismissRequestHandler: DesignReviewInspectorDismissRequestHandler | null = null;

function publish(): void {
  listeners.forEach((listener) => listener());
}

function setSelection(selection: DesignReviewSelection): void {
  state = { ...state, selection };
  publish();
}

function requestInspectorDismiss(): boolean {
  return inspectorDismissRequestHandler?.() ?? false;
}

export function dismissDesignReviewSelection(): void {
  pickerRuntime?.dismissSelection();
  if (!state.selection) {
    return;
  }
  state = { ...state, selection: null };
  publish();
}

export function registerDesignReviewInspectorDismissRequestHandler(
  handler: DesignReviewInspectorDismissRequestHandler
): () => void {
  inspectorDismissRequestHandler = handler;
  return () => {
    if (inspectorDismissRequestHandler === handler) {
      inspectorDismissRequestHandler = null;
    }
  };
}

function disableDesignReviewModeInternal(dispatchDisabled: boolean): void {
  if (!state.enabled) {
    return;
  }
  pickerRuntime?.dispose();
  pickerRuntime = null;
  state = { enabled: false, selection: null };
  setContentModeEnabled('design-review', false);
  publish();
  if (dispatchDisabled) {
    dispatchContentModeDisabled({ mode: 'design-review' });
  }
}

export function enableDesignReviewMode(): void {
  if (state.enabled) {
    return;
  }
  deactivateOtherContentModes('design-review');
  pickerRuntime = startDesignReviewPicker({
    onDisableRequested: () => disableDesignReviewModeInternal(true),
    onInspectorDismissRequested: requestInspectorDismiss,
    onSelection: setSelection,
  });
  state = { enabled: true, selection: null };
  setContentModeEnabled('design-review', true);
  publish();
  dispatchContentModeEnabled({ mode: 'design-review' });
}

export function openDesignReviewTarget(target: Element): boolean {
  if (!state.enabled || !target.isConnected || !pickerRuntime) {
    return false;
  }
  let current: Element | null = target;
  let attempts = 0;
  while (current && attempts < 10) {
    attempts += 1;
    current.scrollIntoView({ block: 'center', inline: 'center' });
    current = current.ownerDocument.defaultView?.frameElement ?? null;
  }
  return pickerRuntime.selectElement(target);
}

export function disableDesignReviewMode(): void {
  disableDesignReviewModeInternal(true);
}

export function getDesignReviewModeState(): DesignReviewModeState {
  return state;
}

export function subscribeToDesignReviewMode(listener: DesignReviewModeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

registerContentMode('design-review', disableDesignReviewMode);
