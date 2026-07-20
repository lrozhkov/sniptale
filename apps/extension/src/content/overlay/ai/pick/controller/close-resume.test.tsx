// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiPickController } from '.';

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
  submitAiPickPromptDeferred: vi.fn(),
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

function createTree() {
  return {
    context: 'test',
    sections: [],
    structure: [],
    title: 'Test page',
  };
}

function StatefulHarness() {
  const [aiPickMode, setAiPickMode] = useState(false);
  const controller = useAiPickController({
    aiPickMode,
    preloadAIModal: preloadAIModalMock,
    setAiPickMode,
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
  });

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
      <output data-ui="test.ai-pick-modal-open">{String(controller.isAIModalOpen)}</output>
      <output data-ui="test.ai-pick-has-tree">{String(Boolean(controller.treeData))}</output>
    </>
  );
}

function clickControl(selector: string) {
  const trigger = document.querySelector(selector);

  act(() => {
    trigger?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

function readOutput(selector: string) {
  return document.querySelector(selector)?.textContent;
}

async function expectCloseToResumeAiPickRuntime() {
  const tree = createTree();
  let latestSelectionHandler: ((treeData: typeof tree, selectedIds: Set<string>) => void) | null =
    null;

  markSelectedInTreeMock.mockReturnValue(tree);
  enableAiPickModeDeferredMock.mockImplementation(async (onSelected) => {
    latestSelectionHandler = onSelected as typeof latestSelectionHandler;
  });

  await act(async () => {
    root?.render(<StatefulHarness />);
  });

  clickControl('[data-ui="test.ai-pick-trigger"]');
  expect(enableAiPickModeDeferredMock).toHaveBeenCalledTimes(1);
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('false');

  await act(async () => {
    latestSelectionHandler?.(tree, new Set(['field-1']));
    await Promise.resolve();
  });

  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('true');

  await act(async () => {
    clickControl('[data-ui="test.ai-pick-close"]');
    await Promise.resolve();
  });

  expect(enableAiPickModeDeferredMock).toHaveBeenCalledTimes(2);
  expect(readOutput('[data-ui="test.ai-pick-modal-open"]')).toBe('false');
  expect(readOutput('[data-ui="test.ai-pick-has-tree"]')).toBe('false');

  await act(async () => {
    latestSelectionHandler?.(tree, new Set(['field-1']));
    await Promise.resolve();
  });

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

describe('useAiPickController close resume', () => {
  it(
    're-enables ai-pick runtime after closing the modal and waits for the next selection',
    expectCloseToResumeAiPickRuntime
  );
});
