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
import { startDesignReviewPicker, type DesignReviewSelection } from './picker';

export interface DesignReviewModeState {
  enabled: boolean;
  selection: DesignReviewSelection | null;
}

type DesignReviewModeListener = () => void;

let cleanupPicker: (() => void) | null = null;
let state: DesignReviewModeState = { enabled: false, selection: null };
const listeners = new Set<DesignReviewModeListener>();

function publish(): void {
  listeners.forEach((listener) => listener());
}

function setSelection(selection: DesignReviewSelection): void {
  state = { ...state, selection };
  publish();
}

function disableDesignReviewModeInternal(dispatchDisabled: boolean): void {
  if (!state.enabled) {
    return;
  }
  cleanupPicker?.();
  cleanupPicker = null;
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
  cleanupPicker = startDesignReviewPicker({
    onDisableRequested: () => disableDesignReviewModeInternal(true),
    onSelection: setSelection,
  });
  state = { enabled: true, selection: null };
  setContentModeEnabled('design-review', true);
  publish();
  dispatchContentModeEnabled({ mode: 'design-review' });
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
