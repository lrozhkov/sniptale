// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dismissSelection: vi.fn(),
  disposePicker: vi.fn(),
  deactivateOtherContentModes: vi.fn(),
  dispatchContentModeDisabled: vi.fn(),
  dispatchContentModeEnabled: vi.fn(),
  registerContentMode: vi.fn(),
  setContentModeEnabled: vi.fn(),
  selectElement: vi.fn(() => true),
  startDesignReviewPicker: vi.fn(),
  setTextEditing: vi.fn(),
  canEditQuickEditTarget: vi.fn(() => true),
  canResetQuickEditText: vi.fn(() => true),
  createQuickEditTargetSession: vi.fn(),
  resetQuickEditText: vi.fn(() => true),
  showToast: vi.fn(),
}));

vi.mock('../quick-edit-runtime', () => ({
  canEditQuickEditTarget: mocks.canEditQuickEditTarget,
  canResetQuickEditText: mocks.canResetQuickEditText,
  createQuickEditTargetSession: mocks.createQuickEditTargetSession,
  resetQuickEditText: mocks.resetQuickEditText,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.showToast }));
vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));

vi.mock('../../application/mode-session', () => ({
  deactivateOtherContentModes: mocks.deactivateOtherContentModes,
  registerContentMode: mocks.registerContentMode,
  setContentModeEnabled: mocks.setContentModeEnabled,
}));

vi.mock('../../platform/page-context/mode-events', () => ({
  addContentModeDisabledListener: vi.fn(),
  addContentModeEnabledListener: vi.fn(),
  addExitFrameEditingListener: vi.fn(),
  addHighlighterModeChangedListener: vi.fn(),
  dispatchContentModeDisabled: mocks.dispatchContentModeDisabled,
  dispatchContentModeEnabled: mocks.dispatchContentModeEnabled,
  dispatchExitFrameEditing: vi.fn(),
  dispatchHighlighterModeChanged: vi.fn(),
}));

vi.mock('./picker', () => ({
  DesignReviewPickerRuntime: undefined,
  DesignReviewSelection: undefined,
  startDesignReviewPicker: mocks.startDesignReviewPicker,
}));

import {
  dismissDesignReviewSelection,
  beginDesignReviewMeasureSelection,
  cancelTransientDesignReviewMeasure,
  dismissDesignReviewMeasureLayer,
  setDesignReviewTool,
  openDesignReviewChecks,
  closeDesignReviewChecks,
  registerDesignReviewToolSwitchRequestHandler,
  disableDesignReviewMode,
  enableDesignReviewMode,
  finalizeDesignReviewTextEditing,
  getDesignReviewModeState,
  openDesignReviewTarget,
  registerDesignReviewInspectorDismissRequestHandler,
  subscribeToDesignReviewMode,
  toggleDesignReviewMeasurements,
  toggleDesignReviewMeasurementDetails,
  startDesignReviewTextEditing,
  canEditDesignReviewText,
  canResetDesignReviewText,
  resetDesignReviewText,
} from './mode';
import type { PageStyleSelectionSnapshot } from './snapshot';

beforeEach(() => {
  mocks.canEditQuickEditTarget.mockReturnValue(true);
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
    setTextEditing: mocks.setTextEditing,
  });
});

afterEach(() => {
  disableDesignReviewMode();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function selectTextTarget(): HTMLElement {
  const target = document.createElement('p');
  target.textContent = 'Original';
  document.body.append(target);
  enableDesignReviewMode();
  const snapshot: PageStyleSelectionSnapshot = {
    domPath: 'html > body > p',
    element: target,
    kind: 'text',
    patch: { declarations: [] },
    selectorLabel: 'p',
    tagName: 'p',
    textPreview: 'Original',
  };
  mocks.startDesignReviewPicker.mock.calls
    .at(-1)?.[0]
    .onSelection({ anchor: { x: 1, y: 2 }, snapshot });
  return target;
}

it('registers the Design Review mode disposer', () => {
  expect(mocks.registerContentMode).toHaveBeenCalledWith('design-review', disableDesignReviewMode);
});

it('edits only the selected target and restores the same snapshot after completion', () => {
  const target = selectTextTarget();
  const session = { finish: vi.fn(), dispose: vi.fn() };
  mocks.createQuickEditTargetSession.mockReturnValue(session);
  expect(startDesignReviewTextEditing()).toBe(true);
  expect(getDesignReviewModeState()).toMatchObject({ enabled: true, editingText: true });
  expect(mocks.setTextEditing).toHaveBeenLastCalledWith(true);
  expect(startDesignReviewTextEditing()).toBe(false);
  const args = mocks.createQuickEditTargetSession.mock.calls.at(-1)?.[0];
  expect(args.target).toBe(target);
  args.onFinish();
  expect(mocks.setTextEditing).toHaveBeenLastCalledWith(false);
  expect(mocks.selectElement).toHaveBeenLastCalledWith(target, 'tool');
  expect(getDesignReviewModeState().editingText).toBe(false);
  expect(mocks.deactivateOtherContentModes).toHaveBeenCalledTimes(1);
});

it('accepts an isolated-world text target when the owning window exposes a different constructor', () => {
  const target = selectTextTarget();
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const descriptor = Object.getOwnPropertyDescriptor(document, 'defaultView');
  Object.defineProperty(document, 'defaultView', {
    configurable: true,
    value: iframe.contentWindow,
  });
  mocks.createQuickEditTargetSession.mockReturnValue({ finish: vi.fn(), dispose: vi.fn() });
  try {
    expect(target instanceof HTMLElement).toBe(true);
    expect(target instanceof target.ownerDocument.defaultView!.HTMLElement).toBe(false);
    expect(startDesignReviewTextEditing()).toBe(true);
  } finally {
    if (descriptor) Object.defineProperty(document, 'defaultView', descriptor);
    else Reflect.deleteProperty(document, 'defaultView');
  }
});

it('refuses unsupported text and compensates activation failure without dropping selection', () => {
  const target = selectTextTarget();
  mocks.canEditQuickEditTarget.mockReturnValue(false);
  expect(canEditDesignReviewText(target)).toBe(false);
  expect(startDesignReviewTextEditing()).toBe(false);
  mocks.canEditQuickEditTarget.mockReturnValue(true);
  mocks.createQuickEditTargetSession.mockImplementationOnce(() => {
    throw new Error('refused');
  });
  expect(startDesignReviewTextEditing()).toBe(false);
  expect(getDesignReviewModeState()).toMatchObject({ enabled: true, editingText: false });
  expect(getDesignReviewModeState().selection?.snapshot.element).toBe(target);
  expect(mocks.showToast).toHaveBeenCalledWith('content.designReview.textEditFailed', 'error');
});

it('finishes mode exit once and ignores its stale completion callback', () => {
  selectTextTarget();
  const finish = vi.fn(() => mocks.createQuickEditTargetSession.mock.calls.at(-1)?.[0].onFinish());
  const dispose = vi.fn();
  mocks.createQuickEditTargetSession.mockReturnValue({ finish, dispose });
  startDesignReviewTextEditing();
  disableDesignReviewMode();
  expect(finish).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(mocks.selectElement).not.toHaveBeenCalled();
  expect(getDesignReviewModeState()).toMatchObject({
    enabled: false,
    editingText: false,
    selection: null,
  });
});

it('does not reopen a removed text target', () => {
  const target = selectTextTarget();
  mocks.createQuickEditTargetSession.mockReturnValue({ finish: vi.fn(), dispose: vi.fn() });
  startDesignReviewTextEditing();
  target.remove();
  mocks.createQuickEditTargetSession.mock.calls.at(-1)?.[0].onFinish();
  expect(getDesignReviewModeState().selection).toBeNull();
  expect(mocks.selectElement).not.toHaveBeenCalled();
});

it('finishes dismissal once and ignores an old session after a new mode activation', () => {
  selectTextTarget();
  const finish = vi.fn();
  const dispose = vi.fn();
  mocks.createQuickEditTargetSession.mockReturnValue({ finish, dispose });
  startDesignReviewTextEditing();
  const oldCompletion = mocks.createQuickEditTargetSession.mock.calls.at(-1)?.[0].onFinish;
  dismissDesignReviewSelection();
  expect(finish).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(getDesignReviewModeState()).toMatchObject({ editingText: false, selection: null });
  disableDesignReviewMode();
  const nextTarget = selectTextTarget();
  oldCompletion();
  expect(getDesignReviewModeState().selection?.snapshot.element).toBe(nextTarget);
  expect(mocks.selectElement).not.toHaveBeenCalled();
});

it('reports commit failure and lets the session completion restore the selected target', () => {
  const target = selectTextTarget();
  mocks.createQuickEditTargetSession.mockReturnValue({ finish: vi.fn(), dispose: vi.fn() });
  startDesignReviewTextEditing();
  const callbacks = mocks.createQuickEditTargetSession.mock.calls.at(-1)?.[0];
  callbacks.onError(new Error('commit failed'));
  callbacks.onFinish();
  expect(mocks.showToast).toHaveBeenCalledWith('content.designReview.textEditFailed', 'error');
  expect(mocks.selectElement).toHaveBeenLastCalledWith(target, 'tool');
  expect(getDesignReviewModeState()).toMatchObject({ enabled: true, editingText: false });
});

it('resets only the selected text and refreshes its snapshot', () => {
  const target = selectTextTarget();
  expect(canResetDesignReviewText(target)).toBe(true);
  expect(resetDesignReviewText(document.createElement('p'))).toBe(false);
  expect(resetDesignReviewText(target)).toBe(true);
  expect(mocks.resetQuickEditText).toHaveBeenCalledWith(target);
  expect(mocks.selectElement).toHaveBeenLastCalledWith(target, 'tool');
  mocks.resetQuickEditText.mockImplementationOnce(() => {
    throw new Error('reset failed');
  });
  expect(resetDesignReviewText(target)).toBe(false);
  expect(mocks.showToast).toHaveBeenCalledWith('content.designReview.textResetFailed', 'error');
});

it('registers and owns the standalone Design Review mode lifecycle', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
  });
  const listener = vi.fn();
  const unsubscribe = subscribeToDesignReviewMode(listener);

  enableDesignReviewMode();

  expect(mocks.deactivateOtherContentModes).toHaveBeenCalledWith('design-review');
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('design-review', true);
  expect(mocks.dispatchContentModeEnabled).toHaveBeenCalledWith({ mode: 'design-review' });
  expect(getDesignReviewModeState()).toMatchObject({ enabled: true, selection: null });

  disableDesignReviewMode();

  expect(mocks.disposePicker).toHaveBeenCalledOnce();
  expect(mocks.setContentModeEnabled).toHaveBeenCalledWith('design-review', false);
  expect(mocks.dispatchContentModeDisabled).toHaveBeenCalledWith({ mode: 'design-review' });
  expect(getDesignReviewModeState()).toMatchObject({ enabled: false, selection: null });
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('scrolls a live target into view and delegates programmatic selection to the active picker', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
  });
  const target = document.createElement('button');
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  document.body.append(target);
  enableDesignReviewMode();

  expect(openDesignReviewTarget(target)).toBe(true);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  expect(mocks.selectElement).toHaveBeenCalledWith(target, 'tree');
});

it('scrolls nested iframe containers before selecting an inner feedback target', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
  });
  const iframe = document.createElement('iframe');
  const iframeScroll = vi.fn();
  const targetScroll = vi.fn();
  Object.defineProperty(iframe, 'scrollIntoView', { configurable: true, value: iframeScroll });
  document.body.append(iframe);
  const target = iframe.contentDocument!.createElement('button');
  Object.defineProperty(target, 'scrollIntoView', { configurable: true, value: targetScroll });
  iframe.contentDocument!.body.append(target);
  enableDesignReviewMode();

  expect(openDesignReviewTarget(target)).toBe(true);
  expect(targetScroll).toHaveBeenCalledOnce();
  expect(iframeScroll).toHaveBeenCalledOnce();
  expect(mocks.selectElement).toHaveBeenCalledWith(target, 'tree');
});

it('routes picker outside-dismiss through the registered inspector owner', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
  });
  const dismissHandler = vi.fn(() => true);
  const unregister = registerDesignReviewInspectorDismissRequestHandler(dismissHandler);
  enableDesignReviewMode();

  const pickerArgs = mocks.startDesignReviewPicker.mock.calls[0]?.[0];

  expect(pickerArgs?.onInspectorDismissRequested()).toBe(true);
  expect(dismissHandler).toHaveBeenCalledOnce();
  unregister();
});

it('releases the active picker selection and publishes the cleared inspector state', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
  });
  const listener = vi.fn();
  const unsubscribe = subscribeToDesignReviewMode(listener);
  enableDesignReviewMode();
  const pickerArgs = mocks.startDesignReviewPicker.mock.calls[0]?.[0];
  const element = document.createElement('button');
  const snapshot: PageStyleSelectionSnapshot = {
    domPath: 'html > body > button',
    element,
    kind: 'text',
    patch: { declarations: [] },
    selectorLabel: 'button',
    tagName: 'button',
    textPreview: 'Save',
  };
  pickerArgs?.onSelection({ anchor: { x: 20, y: 30 }, snapshot });

  dismissDesignReviewSelection();

  expect(mocks.dismissSelection).toHaveBeenCalledOnce();
  expect(getDesignReviewModeState().selection).toBeNull();
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
});

it('toggles measurements without changing selection and resets them between mode sessions', () => {
  const setMeasurementsEnabled = vi.fn();
  const setMeasurementsExpanded = vi.fn();
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    refreshFrame: vi.fn(),
    selectElement: mocks.selectElement,
    setMeasurementsEnabled,
    setMeasurementsExpanded,
  });
  toggleDesignReviewMeasurements();
  expect(setMeasurementsEnabled).not.toHaveBeenCalled();
  enableDesignReviewMode();
  const selection = getDesignReviewModeState().selection;
  toggleDesignReviewMeasurementDetails();
  expect(getDesignReviewModeState()).toMatchObject({
    measurementsEnabled: false,
    measurementsExpanded: true,
  });
  toggleDesignReviewMeasurementDetails();
  setMeasurementsExpanded.mockClear();
  toggleDesignReviewMeasurements();
  expect(getDesignReviewModeState()).toMatchObject({ measurementsEnabled: true, selection });
  expect(setMeasurementsEnabled).toHaveBeenLastCalledWith(true);
  toggleDesignReviewMeasurementDetails();
  expect(getDesignReviewModeState().measurementsExpanded).toBe(true);
  expect(setMeasurementsExpanded).toHaveBeenLastCalledWith(true);
  toggleDesignReviewMeasurements();
  expect(setMeasurementsEnabled).toHaveBeenLastCalledWith(false);
  expect(getDesignReviewModeState().measurementsExpanded).toBe(true);
  expect(setMeasurementsExpanded).toHaveBeenCalledTimes(1);
  toggleDesignReviewMeasurementDetails();
  expect(getDesignReviewModeState().measurementsExpanded).toBe(false);
  expect(getDesignReviewModeState().measurementsEnabled).toBe(false);
  toggleDesignReviewMeasurements();
  disableDesignReviewMode();
  expect(getDesignReviewModeState().measurementsEnabled).toBe(false);
  enableDesignReviewMode();
  expect(getDesignReviewModeState().measurementsEnabled).toBe(false);
});

it('finalizes pending text once while preserving the active mode and selection', () => {
  selectTextTarget();
  const session = { finish: vi.fn(), dispose: vi.fn() };
  mocks.createQuickEditTargetSession.mockReturnValue(session);
  startDesignReviewTextEditing();
  const selection = getDesignReviewModeState().selection;
  finalizeDesignReviewTextEditing();
  finalizeDesignReviewTextEditing();
  expect(session.finish).toHaveBeenCalledOnce();
  expect(session.dispose).toHaveBeenCalledOnce();
  expect(getDesignReviewModeState()).toMatchObject({
    enabled: true,
    editingText: false,
    selection,
  });
});

it('switches an independent tool without discarding the selected object', () => {
  const target = selectTextTarget();
  const cleanup = registerDesignReviewInspectorDismissRequestHandler(() => true);
  try {
    expect(setDesignReviewTool('inspect')).toBe(true);
    expect(getDesignReviewModeState().tool).toBe('inspect');
    expect(getDesignReviewModeState().selection?.snapshot.element).toBe(target);
    expect(mocks.dismissSelection).not.toHaveBeenCalled();
  } finally {
    cleanup();
  }
});

it('distinguishes accepted page targets, tree previews, and finding navigation for Measure', () => {
  const a = selectTextTarget();
  const unregister = registerDesignReviewInspectorDismissRequestHandler(() => true);
  expect(setDesignReviewTool('compare')).toBe(true);
  const picker = mocks.startDesignReviewPicker.mock.calls.at(-1)![0];
  const b = document.createElement('p');
  const c = document.createElement('p');
  document.body.append(b, c);
  const snapshot = (element: HTMLElement) => ({
    anchor: { x: 0, y: 0 },
    snapshot: {
      element,
      domPath: 'p',
      kind: 'text',
      patch: { declarations: [] },
      selectorLabel: 'p',
      tagName: 'p',
      textPreview: '',
    },
  });
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b: null, slot: 'b' });
  picker.onSelection(snapshot(b), 'tree');
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b: null, preview: b });
  picker.onSelection(snapshot(b), 'page');
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b, slot: null });
  expect(picker.onSelection(snapshot(c), 'page')).toBe(false);
  picker.onSelection(snapshot(c), 'finding');
  expect(getDesignReviewModeState().selection?.snapshot.element).toBe(c);
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b, slot: null });
  beginDesignReviewMeasureSelection('b');
  picker.onHover(c);
  cancelTransientDesignReviewMeasure();
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b, preview: null, slot: null });
  expect(dismissDesignReviewMeasureLayer()).toBe(true);
  expect(getDesignReviewModeState().measure).toMatchObject({ a, b: null });
  expect(dismissDesignReviewMeasureLayer()).toBe(true);
  expect(getDesignReviewModeState().measure.a).toBeNull();
  expect(dismissDesignReviewMeasureLayer()).toBe(false);
  unregister();
});

it('guards Check and keeps accepted Measure identities after finding navigation', () => {
  const a = selectTextTarget();
  const allowInitial = registerDesignReviewToolSwitchRequestHandler(() => true);
  setDesignReviewTool('compare');
  allowInitial();
  const callback = mocks.startDesignReviewPicker.mock.calls.at(-1)?.[0].onSelection;
  const snapshot = getDesignReviewModeState().selection!.snapshot;
  const b = document.createElement('p');
  const c = document.createElement('p');
  document.body.append(b, c);
  callback({ anchor: { x: 1, y: 2 }, snapshot: { ...snapshot, element: b } }, 'page');
  beginDesignReviewMeasureSelection('b');
  const before = getDesignReviewModeState();
  const remove = registerDesignReviewToolSwitchRequestHandler(() => false);
  expect(openDesignReviewChecks()).toBe(false);
  expect(getDesignReviewModeState()).toBe(before);
  remove();
  const accept = registerDesignReviewToolSwitchRequestHandler(() => true);
  expect(openDesignReviewChecks()).toBe(true);
  expect(getDesignReviewModeState()).toMatchObject({
    tool: 'compare',
    checkOpen: true,
    measure: { a, b, preview: null, replacing: false },
  });
  callback({ anchor: { x: 1, y: 2 }, snapshot: { ...snapshot, element: c } }, 'finding');
  expect(getDesignReviewModeState()).toMatchObject({
    checkOpen: true,
    selectionOrigin: 'finding',
    measure: { a, b, preview: null },
  });
  expect(setDesignReviewTool('compare')).toBe(true);
  expect(getDesignReviewModeState()).toMatchObject({ checkOpen: false, measure: { a, b } });
  accept();
});

it('publishes explicit same-tool return from a finding after Check closes', () => {
  selectTextTarget();
  const callback = mocks.startDesignReviewPicker.mock.calls.at(-1)?.[0].onSelection;
  const selected = getDesignReviewModeState().selection!;
  const allow = registerDesignReviewToolSwitchRequestHandler(() => true);
  openDesignReviewChecks();
  callback(selected, 'finding');
  closeDesignReviewChecks();
  const notify = vi.fn();
  const unsubscribe = subscribeToDesignReviewMode(notify);
  setDesignReviewTool('comment');
  expect(notify).toHaveBeenCalledOnce();
  expect(getDesignReviewModeState()).toMatchObject({
    tool: 'comment',
    checkOpen: false,
    selectionOrigin: 'tool',
  });
  unsubscribe();
  allow();
});
