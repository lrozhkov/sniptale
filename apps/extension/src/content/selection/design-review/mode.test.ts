// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

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
}));

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
  disableDesignReviewMode,
  enableDesignReviewMode,
  getDesignReviewModeState,
  openDesignReviewTarget,
  registerDesignReviewInspectorDismissRequestHandler,
  subscribeToDesignReviewMode,
} from './mode';
import type { PageStyleSelectionSnapshot } from './snapshot';

afterEach(() => {
  disableDesignReviewMode();
  vi.clearAllMocks();
});

it('registers and owns the standalone Design Review mode lifecycle', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
    selectElement: mocks.selectElement,
  });
  const listener = vi.fn();
  const unsubscribe = subscribeToDesignReviewMode(listener);

  enableDesignReviewMode();

  expect(mocks.registerContentMode).toHaveBeenCalledWith('design-review', disableDesignReviewMode);
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
    selectElement: mocks.selectElement,
  });
  const target = document.createElement('button');
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  document.body.append(target);
  enableDesignReviewMode();

  expect(openDesignReviewTarget(target)).toBe(true);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'center' });
  expect(mocks.selectElement).toHaveBeenCalledWith(target);
});

it('scrolls nested iframe containers before selecting an inner feedback target', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
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
  expect(mocks.selectElement).toHaveBeenCalledWith(target);
});

it('routes picker outside-dismiss through the registered inspector owner', () => {
  mocks.startDesignReviewPicker.mockReturnValue({
    dismissSelection: mocks.dismissSelection,
    dispose: mocks.disposePicker,
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
