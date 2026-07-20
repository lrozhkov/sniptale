// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiPickController } from '.';
import { clickControl, createTree, readOutput } from './test-support';

const {
  addPagePreparationHistoryAppliedListenerMock,
  clearAllSniptaleIdsMock,
  disableAiPickModeMock,
  disableHighlighterModeMock,
  disableQuickEditDocumentModeMock,
  disableQuickEditModeMock,
  enableAiPickModeDeferredMock,
  historyAppliedListenerState,
  markSelectedInTreeMock,
  preloadAiPickRuntimeMock,
  preloadAiPickSubmitMock,
  preloadAIModalMock,
  showToastMock,
  submitAiPickPromptMock,
} = vi.hoisted(() => ({
  addPagePreparationHistoryAppliedListenerMock: vi.fn(),
  clearAllSniptaleIdsMock: vi.fn(),
  disableAiPickModeMock: vi.fn(),
  disableHighlighterModeMock: vi.fn(),
  disableQuickEditDocumentModeMock: vi.fn(),
  disableQuickEditModeMock: vi.fn(),
  enableAiPickModeDeferredMock: vi.fn(),
  historyAppliedListenerState: {
    cleanup: vi.fn(),
    listener: null as null | (() => void),
  },
  markSelectedInTreeMock: vi.fn(),
  preloadAiPickRuntimeMock: vi.fn(async () => undefined),
  preloadAiPickSubmitMock: vi.fn(async () => undefined),
  preloadAIModalMock: vi.fn(async () => undefined),
  showToastMock: vi.fn(),
  submitAiPickPromptMock: vi.fn(),
}));

vi.mock('../runtime/lazy', () => ({
  disableAiPickModeIfLoaded: disableAiPickModeMock,
  enableAiPickModeDeferred: enableAiPickModeDeferredMock,
  preloadAiPickRuntime: preloadAiPickRuntimeMock,
}));

vi.mock('../../../../selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../selection/highlighter')>()),
  disableHighlighterMode: disableHighlighterModeMock,
}));

vi.mock('../../../../selection/quick-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../selection/quick-edit')>()),
  disableQuickEditDocumentMode: disableQuickEditDocumentModeMock,
  disableQuickEditMode: disableQuickEditModeMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    log: vi.fn(),
  }),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  clearAllSniptaleIds: clearAllSniptaleIdsMock,
}));

vi.mock('../runtime/dom-apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/dom-apply')>()),
  markSelectedInTree: markSelectedInTreeMock,
}));

vi.mock('./submit/lazy', () => ({
  preloadAiPickSubmit: preloadAiPickSubmitMock,
  submitAiPickPromptDeferred: submitAiPickPromptMock,
}));

vi.mock('../../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../parser/page-preparation/history')>()),
  addPagePreparationHistoryAppliedListener:
    addPagePreparationHistoryAppliedListenerMock.mockImplementation((listener: () => void) => {
      historyAppliedListenerState.listener = listener;
      return historyAppliedListenerState.cleanup;
    }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferredPromise() {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

function Harness(props: {
  aiPickMode: boolean;
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditDocumentMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
}) {
  const controller = useAiPickController({ ...props, preloadAIModal: preloadAIModalMock });

  return (
    <>
      <button
        type="button"
        data-ui="test.ai-pick-trigger"
        onClick={() => controller.handleAiPickContentStart()}
      />
      <button
        type="button"
        data-ui="test.ai-pick-disable"
        onClick={() => controller.handleDisableAiPickMode()}
      />
      <output data-ui="test.ai-pick-modal-open">{String(controller.isAIModalOpen)}</output>
      <output data-ui="test.ai-pick-has-tree">{String(Boolean(controller.treeData))}</output>
    </>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0]) {
  act(() => {
    root?.render(<Harness {...props} />);
  });
}

function createControllerProps() {
  const callOrder: string[] = [];
  return {
    callOrder,
    props: {
      aiPickMode: false,
      setAiPickMode: (enabled: boolean) => {
        callOrder.push(`ai:${String(enabled)}`);
      },
      setHighlighterMode: (enabled: boolean) => {
        callOrder.push(`highlighter:${String(enabled)}`);
      },
      setQuickEditDocumentMode: (enabled: boolean) => {
        callOrder.push(`quickedit-document:${String(enabled)}`);
      },
      setQuickEditMode: (enabled: boolean) => {
        callOrder.push(`quickedit:${String(enabled)}`);
      },
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  historyAppliedListenerState.listener = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function expectAiPickStartFlow() {
  const { callOrder, props } = createControllerProps();
  const deferred = createDeferredPromise();
  const tree = createTree();
  markSelectedInTreeMock.mockReturnValue(tree);

  enableAiPickModeDeferredMock.mockImplementation(async (onSelected) => {
    onSelected(tree as never, new Set(['field-1']));
    await deferred.promise;
  });

  renderHarness(props);
  clickControl('[data-ui="test.ai-pick-trigger"]');

  expect(callOrder.slice(0, 4)).toEqual([
    'highlighter:false',
    'quickedit-document:false',
    'quickedit:false',
    'ai:true',
  ]);
  expect(disableHighlighterModeMock).toHaveBeenCalledTimes(1);
  expect(disableQuickEditDocumentModeMock).toHaveBeenCalledTimes(1);
  expect(disableQuickEditModeMock).toHaveBeenCalledTimes(1);
  expect(preloadAIModalMock).toHaveBeenCalledTimes(1);
  expect(preloadAiPickRuntimeMock).toHaveBeenCalledTimes(1);
  expect(markSelectedInTreeMock).toHaveBeenCalledWith(tree, new Set(['field-1']));
  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(preloadAiPickSubmitMock).toHaveBeenCalledTimes(1);
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('true');
  expect(readOutput('[data-ui="test.ai-pick-has-tree"]')).toBe('true');

  return act(async () => {
    deferred.resolve();
    await deferred.promise;
    await Promise.resolve();
    expect(showToastMock).not.toHaveBeenCalled();
  });
}

function expectAiPickDisableFlow() {
  renderHarness({
    aiPickMode: true,
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
  });

  clickControl('[data-ui="test.ai-pick-trigger"]');

  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(showToastMock).not.toHaveBeenCalled();
}

function expectDirectDisableControlFlow() {
  const setAiPickMode = vi.fn();

  renderHarness({
    aiPickMode: true,
    setAiPickMode,
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
  });

  clickControl('[data-ui="test.ai-pick-disable"]');

  expect(setAiPickMode).toHaveBeenCalledWith(false);
  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(showToastMock).not.toHaveBeenCalled();
}

function runUseAiPickControllerSuite() {
  it('enables AI mode after disabling sibling modes', async () => {
    await expectAiPickStartFlow();
  });

  it('disables AI pick mode when the owner is already active', () => {
    expectAiPickDisableFlow();
  });

  it('routes the dedicated disable control through the AI disable seam', () => {
    expectDirectDisableControlFlow();
  });
}

describe('useAiPickController', runUseAiPickControllerSuite);
