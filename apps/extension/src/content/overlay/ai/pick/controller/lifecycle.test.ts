import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleCloseAIModal, resetAiPickControllerAfterHistoryApply } from './lifecycle';
import { createAiSubmitRequestGate } from './submit/gate';

const { clearAllSniptaleIdsMock, handleResumeAiPickModeMock } = vi.hoisted(() => ({
  clearAllSniptaleIdsMock: vi.fn(),
  handleResumeAiPickModeMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  clearAllSniptaleIds: clearAllSniptaleIdsMock,
}));

vi.mock('./mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mode')>()),
  handleResumeAiPickMode: handleResumeAiPickModeMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createResetContext() {
  return {
    cancelActiveAiRequest: vi.fn(),
    invalidateAiPickEnableSession: vi.fn(),
    setIsAILoading: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setTreeData: vi.fn(),
  };
}

function createCloseContext() {
  return {
    aiPickMode: false,
    beginAiPickEnableSession: vi.fn(() => 1),
    cancelActiveAiRequest: vi.fn(),
    invalidateAiPickEnableSession: vi.fn(),
    isCurrentAiPickEnableSession: vi.fn(() => true),
    isAILoading: false,
    preloadAIModal: vi.fn(async () => undefined),
    requestGate: createAiSubmitRequestGate(),
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setIsAILoading: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setTreeData: vi.fn(),
    treeData: null,
  };
}

describe('ai-pick-controller-lifecycle', () => {
  it('resets loading and modal state after page-preparation history applies', () => {
    const context = createResetContext();

    resetAiPickControllerAfterHistoryApply(context);

    expect(context.invalidateAiPickEnableSession).toHaveBeenCalledTimes(1);
    expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
    expect(context.setIsAILoading).toHaveBeenCalledWith(false);
    expect(context.setIsAIModalOpen).toHaveBeenCalledWith(false);
    expect(context.setTreeData).toHaveBeenCalledWith(null);
  });

  it('closes the ai modal without touching loading state', () => {
    const context = createCloseContext();

    handleCloseAIModal(context);

    expect(context.invalidateAiPickEnableSession).toHaveBeenCalledTimes(1);
    expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
    expect(context.setIsAIModalOpen).toHaveBeenCalledWith(false);
    expect(context.setTreeData).toHaveBeenCalledWith(null);
    expect(context.setIsAILoading).not.toHaveBeenCalled();
    expect(handleResumeAiPickModeMock).toHaveBeenCalledWith(context);
  });
});
