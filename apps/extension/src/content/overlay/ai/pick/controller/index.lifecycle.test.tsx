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
        data-ui="test.ai-pick-close"
        onClick={() => controller.handleCloseAIModal()}
      />
      <button
        type="button"
        data-ui="test.ai-pick-cancel"
        onClick={() => controller.handleCancelAIPrompt()}
      />
      <button
        type="button"
        data-ui="test.ai-pick-submit"
        onClick={() => {
          void controller.handleSubmitAIPrompt('Prompt', 'Selected data', 'model-1');
        }}
      />
      <output data-ui="test.ai-pick-loading">{String(controller.isAILoading)}</output>
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
      setHighlighterMode: () => {},
      setQuickEditDocumentMode: vi.fn(),
      setQuickEditMode: () => {},
    },
  };
}

function openAiPickModal() {
  const { props } = createControllerProps();
  const tree = createTree();
  markSelectedInTreeMock.mockReturnValue(tree);
  enableAiPickModeDeferredMock.mockImplementation(async (onSelected) => {
    onSelected(tree as never, new Set(['field-1']));
  });
  renderHarness(props);
  clickControl('[data-ui="test.ai-pick-trigger"]');
  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('true');
  expect(readOutput('[data-ui="test.ai-pick-has-tree"]')).toBe('true');
}

async function expectSubmissionDelegationAfterEnableFailure() {
  const { callOrder, props } = createControllerProps();
  enableAiPickModeDeferredMock.mockRejectedValue(new Error('boom'));
  renderHarness(props);
  clickControl('[data-ui="test.ai-pick-trigger"]');
  await act(async () => {
    await Promise.resolve();
  });
  expect(callOrder).toContain('ai:false');
  expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiNoData', 'error');
  clickControl('[data-ui="test.ai-pick-submit"]');
  expect(submitAiPickPromptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      requestGate: expect.objectContaining({
        begin: expect.any(Function),
        cancel: expect.any(Function),
        finish: expect.any(Function),
        isCurrent: expect.any(Function),
      }),
      setIsAILoading: expect.any(Function),
      setIsAIModalOpen: expect.any(Function),
      setTreeData: expect.any(Function),
      treeData: null,
    }),
    'Prompt',
    'Selected data',
    'model-1'
  );
}

async function expectCancelToKeepModalOpen() {
  openAiPickModal();
  submitAiPickPromptMock.mockImplementation(
    async (context: { setIsAILoading: (value: boolean) => void }) => {
      context.setIsAILoading(true);
    }
  );
  clickControl('[data-ui="test.ai-pick-submit"]');
  expect(readOutput('[data-ui="test.ai-pick-loading"]')).toBe('true');
  clickControl('[data-ui="test.ai-pick-cancel"]');
  expect(readOutput('[data-ui="test.ai-pick-loading"]')).toBe('false');
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('true');
  expect(readOutput('[data-ui="test.ai-pick-has-tree"]')).toBe('true');
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

describe('useAiPickController lifecycle', () => {
  it('invokes the history-applied listener reset path', async () => {
    openAiPickModal();
    await act(async () => {
      historyAppliedListenerState.listener?.();
      await Promise.resolve();
    });
    expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
  });

  it('invokes the close handler side effect when the AI modal closes', async () => {
    openAiPickModal();
    await act(async () => {
      clickControl('[data-ui="test.ai-pick-close"]');
      await Promise.resolve();
    });
    expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
  });

  it(
    'delegates prompt submission after enable failure',
    expectSubmissionDelegationAfterEnableFailure
  );

  it('cancels the active loading state without closing the modal', expectCancelToKeepModalOpen);

  it('cleans up the page-preparation listener on unmount', () => {
    renderHarness(createControllerProps().props);
    act(() => root?.unmount());
    expect(historyAppliedListenerState.cleanup).toHaveBeenCalledTimes(1);
    root = createRoot(container as HTMLDivElement);
  });
});
