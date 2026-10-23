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
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import {
  canEditQuickEditTarget,
  canResetQuickEditText,
  createQuickEditTargetSession,
  resetQuickEditText,
} from '../quick-edit-runtime';
import {
  startDesignReviewPicker,
  type DesignReviewPickerRuntime,
  type DesignReviewSelection,
} from './picker';

export interface DesignReviewModeState {
  enabled: boolean;
  editingText: boolean;
  measurementsEnabled: boolean;
  measurementsExpanded: boolean;
  selection: DesignReviewSelection | null;
}

type DesignReviewModeListener = () => void;
type DesignReviewInspectorDismissRequestHandler = () => boolean;

let pickerRuntime: DesignReviewPickerRuntime | null = null;
let textSession: ReturnType<typeof createQuickEditTargetSession> | null = null;
const logger = createLogger({ namespace: 'ContentDesignReview' });
let state: DesignReviewModeState = {
  enabled: false,
  editingText: false,
  measurementsEnabled: false,
  measurementsExpanded: false,
  selection: null,
};
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
  finishTextSession();
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
  finishTextSession();
  pickerRuntime?.dispose();
  pickerRuntime = null;
  state = {
    enabled: false,
    editingText: false,
    measurementsEnabled: false,
    measurementsExpanded: false,
    selection: null,
  };
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
  state = {
    enabled: true,
    editingText: false,
    measurementsEnabled: false,
    measurementsExpanded: false,
    selection: null,
  };
  setContentModeEnabled('design-review', true);
  publish();
  dispatchContentModeEnabled({ mode: 'design-review' });
}

export function openDesignReviewTarget(target: Element): boolean {
  if (!state.enabled || state.editingText || !target.isConnected || !pickerRuntime) {
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

function reportTextEditFailure(error: unknown, reset = false): void {
  logger.error('Failed to edit selected text', error);
  showToast(
    translate(
      reset ? 'content.designReview.textResetFailed' : 'content.designReview.textEditFailed'
    ),
    'error'
  );
}

function finishTextSession(): void {
  const session = textSession;
  textSession = null;
  if (!session) return;
  try {
    session.finish();
  } catch (error) {
    reportTextEditFailure(error);
  } finally {
    session.dispose();
    pickerRuntime?.setTextEditing(false);
    state = { ...state, editingText: false };
  }
}

/** Reports whether the selected page target supports the Content Editing interaction. */
export function canEditDesignReviewText(target: Element): boolean {
  return canEditQuickEditTarget(target);
}

/** Starts one text edit without changing the active preparation mode. */
export function startDesignReviewTextEditing(): boolean {
  const target = state.selection?.snapshot.element;
  const picker = pickerRuntime;
  if (!state.enabled || state.editingText || !picker || !target || !canEditQuickEditTarget(target))
    return false;
  const view = target.ownerDocument.defaultView;
  if (!(target instanceof HTMLElement) && (!view || !(target instanceof view.HTMLElement)))
    return false;
  state = { ...state, editingText: true };
  picker.setTextEditing(true);
  publish();
  try {
    const session = createQuickEditTargetSession({
      target,
      onError: (error) => reportTextEditFailure(error),
      onFinish: () => {
        if (textSession !== session) return;
        textSession = null;
        picker.setTextEditing(false);
        state = { ...state, editingText: false };
        if (!state.enabled || pickerRuntime !== picker) return;
        if (
          state.selection?.snapshot.element === target &&
          target.isConnected &&
          picker.selectElement(target)
        )
          return;
        dismissDesignReviewSelection();
      },
    });
    textSession = session;
    return true;
  } catch (error) {
    picker.setTextEditing(false);
    state = { ...state, editingText: false };
    publish();
    reportTextEditFailure(error);
    return false;
  }
}

/** Reports whether canonical text history provides a reset for this target. */
export function canResetDesignReviewText(target: Element): boolean {
  return canResetQuickEditText(target);
}

/** Restores only text and refreshes the selected inspector snapshot. */
export function resetDesignReviewText(target: Element): boolean {
  if (!state.enabled || state.editingText || state.selection?.snapshot.element !== target)
    return false;
  try {
    if (!resetQuickEditText(target)) return false;
    pickerRuntime?.selectElement(target);
    return true;
  } catch (error) {
    reportTextEditFailure(error, true);
    return false;
  }
}

/** Toggles ephemeral rulers without changing the current inspector selection. */
export function toggleDesignReviewMeasurements(): void {
  if (!state.enabled || !pickerRuntime) return;
  const measurementsEnabled = !state.measurementsEnabled;
  pickerRuntime.setMeasurementsEnabled(measurementsEnabled);
  state = { ...state, measurementsEnabled };
  publish();
}

/** Independently toggles container/viewport distances, axes and the container outline. */
export function toggleDesignReviewMeasurementDetails(): void {
  if (!state.enabled || !pickerRuntime) return;
  const measurementsExpanded = !state.measurementsExpanded;
  pickerRuntime.setMeasurementsExpanded(measurementsExpanded);
  state = { ...state, measurementsExpanded };
  publish();
}

export function getDesignReviewModeState(): DesignReviewModeState {
  return state;
}

export function subscribeToDesignReviewMode(listener: DesignReviewModeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

registerContentMode('design-review', disableDesignReviewMode);
