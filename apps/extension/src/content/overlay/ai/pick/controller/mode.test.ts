import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAiPickContentStart, handleDisableAiPickMode } from './mode';
import { createAiSubmitRequestGate } from './submit/gate';
import type { AiPickControllerContext } from './types';

const {
  clearAllSniptaleIdsMock,
  disableAiPickModeMock,
  disableHighlighterModeMock,
  disableQuickEditDocumentModeMock,
  disableQuickEditModeMock,
  enableAiPickModeDeferredMock,
  loggerWarnMock,
  markSelectedInTreeMock,
  preloadAIModalMock,
  preloadAiPickRuntimeMock,
  preloadAiPickSubmitMock,
  showToastMock,
} = vi.hoisted(() => ({
  clearAllSniptaleIdsMock: vi.fn(),
  disableAiPickModeMock: vi.fn(),
  disableHighlighterModeMock: vi.fn(),
  disableQuickEditDocumentModeMock: vi.fn(),
  disableQuickEditModeMock: vi.fn(),
  enableAiPickModeDeferredMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  markSelectedInTreeMock: vi.fn(),
  preloadAIModalMock: vi.fn(async () => undefined),
  preloadAiPickRuntimeMock: vi.fn(async () => undefined),
  preloadAiPickSubmitMock: vi.fn(async () => undefined),
  showToastMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  clearAllSniptaleIds: clearAllSniptaleIdsMock,
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

vi.mock('./submit/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./submit/lazy')>()),
  preloadAiPickSubmit: preloadAiPickSubmitMock,
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../runtime/dom-apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/dom-apply')>()),
  markSelectedInTree: markSelectedInTreeMock,
}));

function createTree() {
  return {
    context: 'test',
    sections: [],
    structure: [],
    title: 'Test page',
  };
}

function createContext(overrides: Partial<AiPickControllerContext> = {}): AiPickControllerContext {
  return {
    aiPickMode: false,
    beginAiPickEnableSession: vi.fn(() => 1),
    cancelActiveAiRequest: vi.fn(),
    invalidateAiPickEnableSession: vi.fn(),
    isCurrentAiPickEnableSession: vi.fn(() => true),
    isAILoading: false,
    preloadAIModal: preloadAIModalMock,
    requestGate: createAiSubmitRequestGate(),
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setIsAILoading: vi.fn(),
    setTreeData: vi.fn(),
    treeData: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function expectStartFlowEnablesAiPickAndOpensModal() {
  const tree = createTree();
  const markedTree = { ...tree, title: 'Marked page' };
  const context = createContext();
  markSelectedInTreeMock.mockReturnValue(markedTree);
  enableAiPickModeDeferredMock.mockImplementation(async (onSelected) => {
    onSelected(tree as never, new Set(['field-1']));
  });

  handleAiPickContentStart(context);
  await Promise.resolve();

  expect(context.setAiPickMode).toHaveBeenCalledWith(true);
  expect(preloadAIModalMock).toHaveBeenCalledTimes(1);
  expect(preloadAiPickRuntimeMock).toHaveBeenCalledTimes(1);
  expect(disableHighlighterModeMock).toHaveBeenCalledTimes(1);
  expect(context.setHighlighterMode).toHaveBeenCalledWith(false);
  expect(disableQuickEditDocumentModeMock).toHaveBeenCalledTimes(1);
  expect(disableQuickEditModeMock).toHaveBeenCalledTimes(1);
  expect(disableQuickEditDocumentModeMock.mock.invocationCallOrder[0]).toBeLessThan(
    disableQuickEditModeMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(context.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
  expect(context.setQuickEditMode).toHaveBeenCalledWith(false);
  expect(markSelectedInTreeMock).toHaveBeenCalledWith(tree, new Set(['field-1']));
  expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
  expect(preloadAiPickSubmitMock).toHaveBeenCalledTimes(1);
  expect(context.setAiPickMode).toHaveBeenCalledTimes(1);
  expect(context.setTreeData).toHaveBeenCalledWith(markedTree);
  expect(context.setIsAIModalOpen).toHaveBeenCalledWith(true);
  expect(showToastMock).not.toHaveBeenCalled();
}

async function expectStartFailureRestoresModeAndShowsError() {
  const context = createContext();
  enableAiPickModeDeferredMock.mockRejectedValue(new Error('boom'));

  handleAiPickContentStart(context);
  await Promise.resolve();
  await Promise.resolve();

  expect(context.setAiPickMode).toHaveBeenCalledWith(true);
  expect(preloadAIModalMock).toHaveBeenCalledTimes(1);
  expect(preloadAiPickRuntimeMock).toHaveBeenCalledTimes(1);
  expect(context.setAiPickMode).toHaveBeenCalledWith(false);
  expect(showToastMock).toHaveBeenCalledWith('content.toolbar.aiNoData', 'error');
}

function expectDocumentModeCleanupFailureBlocksAiActivation() {
  const context = createContext();
  disableQuickEditDocumentModeMock.mockImplementationOnce(() => {
    throw new Error('restore failed');
  });

  expect(() => handleAiPickContentStart(context)).toThrow('restore failed');

  expect(context.setAiPickMode).not.toHaveBeenCalled();
  expect(enableAiPickModeDeferredMock).not.toHaveBeenCalled();
}

function registerAiPickDisableTests() {
  it('disables ai-pick mode and shows the shared disabled toast', () => {
    const context = createContext({ aiPickMode: true });

    handleDisableAiPickMode(context);

    expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
    expect(context.cancelActiveAiRequest).toHaveBeenCalledTimes(1);
    expect(context.setIsAILoading).toHaveBeenCalledWith(false);
    expect(context.setIsAIModalOpen).toHaveBeenCalledWith(false);
    expect(context.setTreeData).toHaveBeenCalledWith(null);
    expect(context.setAiPickMode).toHaveBeenCalledWith(false);
    expect(disableAiPickModeMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).not.toHaveBeenCalled();
  });
}

function registerAiPickStartTests() {
  it(
    'enables ai-pick mode, disables sibling modes, and opens the modal with marked tree data',
    expectStartFlowEnablesAiPickAndOpensModal
  );

  it('restores ai-pick mode state and shows an error toast when enable fails', async () => {
    await expectStartFailureRestoresModeAndShowsError();
  });

  it(
    'does not enable ai-pick state when document-mode cleanup fails',
    expectDocumentModeCleanupFailureBlocksAiActivation
  );
}

function registerAiPickSourceTests() {
  it('passes an optional AI pick source into the runtime enable call', async () => {
    const aiPickSource = vi.fn(() => ({
      acceptsTarget: vi.fn(),
      snapshotSource: { document },
      targetIframe: document.createElement('iframe'),
    }));
    const context = createContext({ aiPickSource });
    enableAiPickModeDeferredMock.mockResolvedValue(undefined);

    handleAiPickContentStart(context);
    await Promise.resolve();

    expect(enableAiPickModeDeferredMock).toHaveBeenCalledWith(expect.any(Function), {
      source: aiPickSource,
    });
  });

  it('keeps regular content AI-pick on the default parser source', async () => {
    const context = createContext();
    enableAiPickModeDeferredMock.mockResolvedValue(undefined);

    handleAiPickContentStart(context);
    await Promise.resolve();

    expect(enableAiPickModeDeferredMock).toHaveBeenCalledWith(expect.any(Function));
  });
}

function registerAiPickWarmupTests() {
  it('swallows AI modal preload failures and logs a warning', async () => {
    const context = createContext();
    preloadAIModalMock.mockRejectedValueOnce(new Error('chunk failed'));
    enableAiPickModeDeferredMock.mockResolvedValue(undefined);

    expect(() => handleAiPickContentStart(context)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to preload AI modal chunk',
      expect.any(Error)
    );
  });

  it('swallows AI runtime preload failures and logs a warning', async () => {
    const context = createContext();
    preloadAiPickRuntimeMock.mockRejectedValueOnce(new Error('chunk failed'));
    enableAiPickModeDeferredMock.mockResolvedValue(undefined);

    expect(() => handleAiPickContentStart(context)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to preload AI pick runtime chunk',
      expect.any(Error)
    );
  });
}

describe('ai-pick-controller-mode', () => {
  registerAiPickDisableTests();
  registerAiPickStartTests();
  registerAiPickSourceTests();
  registerAiPickWarmupTests();
});
