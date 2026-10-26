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
  type DesignReviewSelectionOrigin,
} from './picker';

import {
  createDesignReviewMeasureState,
  chooseMeasureTarget,
  previewMeasureTarget,
  replaceMeasureTarget,
  cancelMeasurePreview,
  clearMeasureB,
  swapMeasureTargets,
  escapeMeasureState,
  type DesignReviewMeasureState,
} from './measure';
export type { DesignReviewSelectionOrigin } from './picker';

export type DesignReviewTool = 'comment' | 'inspect' | 'compare' | 'move';

export interface DesignReviewModeState {
  tool: DesignReviewTool;
  checkOpen: boolean;
  selectionOrigin: DesignReviewSelectionOrigin | null;
  measure: DesignReviewMeasureState;
  enabled: boolean;
  editingText: boolean;
  measurementsEnabled: boolean;
  measurementsExpanded: boolean;
  selection: DesignReviewSelection | null;
}

type DesignReviewModeListener = () => void;
type DesignReviewInspectorDismissRequestHandler = (event?: KeyboardEvent) => boolean;

let pickerRuntime: DesignReviewPickerRuntime | null = null;
let textSession: ReturnType<typeof createQuickEditTargetSession> | null = null;
const logger = createLogger({ namespace: 'ContentDesignReview' });
let state: DesignReviewModeState = {
  tool: 'comment',
  checkOpen: false,
  selectionOrigin: null,
  measure: createDesignReviewMeasureState(),
  enabled: false,
  editingText: false,
  measurementsEnabled: false,
  measurementsExpanded: false,
  selection: null,
};
const listeners = new Set<DesignReviewModeListener>();
let inspectorDismissRequestHandler: DesignReviewInspectorDismissRequestHandler | null = null;
let toolSwitchRequestHandler: ((tool: DesignReviewTool) => boolean) | null = null;

function publish(): void {
  listeners.forEach((listener) => listener());
}

function setSelection(
  selection: DesignReviewSelection,
  origin: DesignReviewSelectionOrigin = 'page'
): boolean {
  let measure = state.measure;
  if (state.tool === 'compare' && origin === 'page') {
    measure = chooseMeasureTarget(measure, selection.snapshot.element);
    if (measure === state.measure && !state.checkOpen) return false;
  } else if (state.tool === 'compare' && origin === 'tree') {
    measure = previewMeasureTarget(measure, selection.snapshot.element);
  }
  state = {
    ...state,
    selection,
    measure,
    selectionOrigin: origin,
    checkOpen: origin === 'page' || origin === 'tree' ? false : state.checkOpen,
  };
  publish();
  return true;
}

function requestInspectorDismiss(event?: KeyboardEvent): boolean {
  return inspectorDismissRequestHandler?.(event) ?? false;
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

/** Separates leaving an editor from dismissing the selected page object. */
export function registerDesignReviewToolSwitchRequestHandler(
  handler: (tool: DesignReviewTool) => boolean
): () => void {
  toolSwitchRequestHandler = handler;
  return () => {
    if (toolSwitchRequestHandler === handler) toolSwitchRequestHandler = null;
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
    tool: 'comment',
    checkOpen: false,
    selectionOrigin: null,
    measure: createDesignReviewMeasureState(),
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
    hasInspector: () => state.checkOpen,
    onSelection: setSelection,
    replaceSelectionOnClick: () => state.tool !== 'comment',
    trackHover: () => !state.checkOpen && state.tool === 'compare',
    isFrameSuppressed: () =>
      !state.checkOpen && state.tool === 'compare' && Boolean(state.measure.a),
    onHover: (element) => {
      if (state.tool !== 'compare' || state.checkOpen) return;
      const measure = previewMeasureTarget(state.measure, element);
      if (measure === state.measure) return;
      state = { ...state, measure };
      publish();
    },
  });
  state = {
    tool: 'comment',
    checkOpen: false,
    selectionOrigin: null,
    measure: createDesignReviewMeasureState(),
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

export function openDesignReviewTarget(
  target: Element,
  origin: DesignReviewSelectionOrigin = 'tree'
): boolean {
  if (!state.enabled || state.editingText || !target.isConnected || !pickerRuntime) {
    return false;
  }
  let current: Element | null = target;
  let attempts = 0;
  while (current && attempts < 10) {
    attempts += 1;
    current.scrollIntoView({
      block: origin === 'finding' || origin === 'feedback' ? 'center' : 'nearest',
      inline: 'nearest',
    });
    current = current.ownerDocument.defaultView?.frameElement ?? null;
  }
  return pickerRuntime.selectElement(target, origin);
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

/** Commits the current inline text session before page capture or reset. */
export function finalizeDesignReviewTextEditing(): void {
  finishTextSession();
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
          picker.selectElement(target, 'tool')
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
    pickerRuntime?.selectElement(target, 'tool');
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

/** Switches one page tool only after the existing comment owner accepts dismissal. */
export function setDesignReviewTool(tool: DesignReviewTool): boolean {
  if (!state.enabled) return false;
  if (toolSwitchRequestHandler) {
    if (!toolSwitchRequestHandler(tool)) return false;
  } else if (state.selection && !requestInspectorDismiss()) return false;
  const wasCheckOpen = state.checkOpen;
  const originChanged = state.selectionOrigin !== 'tool';
  state = { ...state, checkOpen: false, selectionOrigin: 'tool' };
  if (state.tool === tool) {
    if (tool === 'compare') {
      const target = state.measure.b ?? state.measure.a;
      if (target?.isConnected) pickerRuntime?.selectElement(target, 'tool');
    }
    if (wasCheckOpen || originChanged) {
      pickerRuntime?.refreshFrame();
      publish();
    }
    return true;
  }
  finishTextSession();
  let measure = state.tool === 'compare' ? cancelMeasurePreview(state.measure) : state.measure;
  if (tool === 'compare' && !measure.a && state.selection?.snapshot.element.isConnected)
    measure = chooseMeasureTarget(measure, state.selection.snapshot.element);
  state = { ...state, tool, measure };
  if (tool === 'compare') {
    const target = measure.b ?? measure.a;
    if (target?.isConnected) pickerRuntime?.selectElement(target, 'tool');
  }
  pickerRuntime?.refreshFrame();
  publish();
  return true;
}

function publishMeasure(measure: DesignReviewMeasureState, restoreTarget = false): void {
  state = { ...state, measure };
  if (restoreTarget) {
    const target = measure.b ?? measure.a;
    if (target?.isConnected) pickerRuntime?.selectElement(target, 'tool');
    else if (!target) {
      pickerRuntime?.dismissSelection();
      state = { ...state, selection: null };
    }
  }
  pickerRuntime?.refreshFrame();
  publish();
}

/** Chooses which accepted identity the next page click can replace. */
export function beginDesignReviewMeasureSelection(slot: 'a' | 'b'): void {
  if (state.enabled) publishMeasure(replaceMeasureTarget(state.measure, slot));
}

/** Keyboard/tree navigation previews a target; this action explicitly accepts it. */
export function acceptDesignReviewMeasureSelection(): boolean {
  const target = state.selection?.snapshot.element;
  if (!state.enabled || state.tool !== 'compare' || !target) return false;
  const measure = chooseMeasureTarget(state.measure, target);
  if (measure === state.measure) return false;
  publishMeasure(measure, true);
  return true;
}

export function swapDesignReviewMeasureTargets(): void {
  if (state.enabled) publishMeasure(swapMeasureTargets(state.measure), true);
}

export function clearDesignReviewMeasureB(): void {
  if (state.enabled) publishMeasure(clearMeasureB(state.measure), true);
}

export function clearDesignReviewMeasure(): void {
  if (state.enabled) publishMeasure(createDesignReviewMeasureState(), true);
}

/** Check/tool presentation can cancel a preview while retaining accepted A/B. */
export function cancelTransientDesignReviewMeasure(): void {
  if (state.enabled) publishMeasure(cancelMeasurePreview(state.measure));
}

export function dismissDesignReviewMeasureLayer(): boolean {
  if (!state.enabled || state.checkOpen || state.tool !== 'compare') return false;
  const measure = escapeMeasureState(state.measure);
  if (!measure) return false;
  publishMeasure(measure, true);
  return true;
}

export function getDesignReviewModeState(): DesignReviewModeState {
  return state;
}

export function subscribeToDesignReviewMode(listener: DesignReviewModeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

registerContentMode('design-review', disableDesignReviewMode);

/** Opens a workspace command after the same guard used by page tool switches. */
export function openDesignReviewChecks(): boolean {
  if (!state.enabled || state.editingText) return false;
  if (toolSwitchRequestHandler) {
    if (!toolSwitchRequestHandler(state.tool)) return false;
  } else if (state.selection && !requestInspectorDismiss()) return false;
  state = { ...state, checkOpen: true, measure: cancelMeasurePreview(state.measure) };
  pickerRuntime?.refreshFrame();
  publish();
  return true;
}

/** Closes Check presentation without replacing its selected identity or page tool. */
export function closeDesignReviewChecks(): void {
  if (!state.checkOpen) return;
  state = { ...state, checkOpen: false };
  pickerRuntime?.refreshFrame();
  publish();
}
