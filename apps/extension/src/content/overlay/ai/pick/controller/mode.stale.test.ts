import { beforeEach, expect, it, vi } from 'vitest';
import { createAiSubmitRequestGate } from './submit/gate';
import type { AiPickControllerContext } from './types';

const mocks = vi.hoisted(() => ({
  clearAllSniptaleIds: vi.fn(),
  disableAiPickMode: vi.fn(),
  disableHighlighterMode: vi.fn(),
  disableQuickEditDocumentMode: vi.fn(),
  disableQuickEditMode: vi.fn(),
  enableAiPickModeDeferred: vi.fn(),
  markSelectedInTree: vi.fn(),
  preloadAIModal: vi.fn(async () => undefined),
  preloadAiPickRuntime: vi.fn(async () => undefined),
  preloadAiPickSubmit: vi.fn(async () => undefined),
  showToast: vi.fn(),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  clearAllSniptaleIds: mocks.clearAllSniptaleIds,
}));

vi.mock('../runtime/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/lazy')>()),
  disableAiPickModeIfLoaded: mocks.disableAiPickMode,
  enableAiPickModeDeferred: mocks.enableAiPickModeDeferred,
  preloadAiPickRuntime: mocks.preloadAiPickRuntime,
}));

vi.mock('../../../../selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../selection/highlighter')>()),
  disableHighlighterMode: mocks.disableHighlighterMode,
}));

vi.mock('../../../../selection/quick-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../selection/quick-edit')>()),
  disableQuickEditDocumentMode: mocks.disableQuickEditDocumentMode,
  disableQuickEditMode: mocks.disableQuickEditMode,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: mocks.showToast,
}));

vi.mock('./submit/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./submit/lazy')>()),
  preloadAiPickSubmit: mocks.preloadAiPickSubmit,
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../runtime/dom-apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/dom-apply')>()),
  markSelectedInTree: mocks.markSelectedInTree,
}));

function createContext(): AiPickControllerContext {
  return {
    aiPickMode: false,
    beginAiPickEnableSession: vi.fn(() => 1),
    cancelActiveAiRequest: vi.fn(),
    invalidateAiPickEnableSession: vi.fn(),
    isCurrentAiPickEnableSession: vi.fn(() => false),
    isAILoading: false,
    preloadAIModal: mocks.preloadAIModal,
    requestGate: createAiSubmitRequestGate(),
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setIsAILoading: vi.fn(),
    setTreeData: vi.fn(),
    treeData: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('ignores stale ai-pick selection callbacks after the enable epoch changes', async () => {
  const { handleAiPickContentStart } = await import('./mode');
  const context = createContext();
  const tree = {
    context: 'test',
    sections: [],
    structure: [],
    title: 'Test page',
  };
  mocks.enableAiPickModeDeferred.mockImplementation(async (onSelected) => {
    onSelected(tree as never, new Set(['field-1']));
  });

  handleAiPickContentStart(context);
  await Promise.resolve();

  expect(context.beginAiPickEnableSession).toHaveBeenCalledTimes(1);
  expect(context.isCurrentAiPickEnableSession).toHaveBeenCalledWith(1);
  expect(mocks.markSelectedInTree).not.toHaveBeenCalled();
  expect(mocks.disableAiPickMode).not.toHaveBeenCalled();
  expect(mocks.preloadAiPickSubmit).not.toHaveBeenCalled();
  expect(context.setTreeData).not.toHaveBeenCalled();
  expect(context.setIsAIModalOpen).not.toHaveBeenCalled();
});
