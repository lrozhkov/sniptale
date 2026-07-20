import { describe, expect, it, vi } from 'vitest';
import { createCancelAiPromptHandler, createAiPickControllerRuntimeContext } from './context';
import type { AiSubmitRequestGate } from './submit/gate';

const { handleResumeAiPickModeMock } = vi.hoisted(() => ({
  handleResumeAiPickModeMock: vi.fn(),
}));

vi.mock('./mode', async (importOriginal) => ({
  ...(await importOriginal()),
  handleResumeAiPickMode: handleResumeAiPickModeMock,
}));

function verifyCancelAiPromptHandler() {
  const cancelActiveAiRequest = vi.fn();
  const setIsAILoading = vi.fn();

  createCancelAiPromptHandler({
    cancelActiveAiRequest,
    setIsAILoading,
  })();

  expect(cancelActiveAiRequest).toHaveBeenCalledTimes(1);
  expect(setIsAILoading).toHaveBeenCalledWith(false);
}

function createRuntimeContextArgs() {
  const beginAiPickEnableSession = vi.fn(() => 7);
  const cancelActiveAiRequest = vi.fn();
  const invalidateAiPickEnableSession = vi.fn();
  const isCurrentAiPickEnableSession = vi.fn(() => true);
  const setAiPickMode = vi.fn();
  const setHighlighterMode = vi.fn();
  const setQuickEditDocumentMode = vi.fn();
  const setQuickEditMode = vi.fn();
  const setIsAIModalOpen = vi.fn();
  const setIsAILoading = vi.fn();
  const setTreeData = vi.fn();
  const preloadAIModal = vi.fn(async () => undefined);
  const requestGate: AiSubmitRequestGate = {
    begin: vi.fn(() => 1),
    cancel: vi.fn(),
    finish: vi.fn(() => true),
    isCurrent: vi.fn(() => true),
  };
  const treeData = { context: 'page', sections: [], structure: [], title: 'Test page' };

  return {
    beginAiPickEnableSession,
    cancelActiveAiRequest,
    invalidateAiPickEnableSession,
    isCurrentAiPickEnableSession,
    preloadAIModal,
    requestGate,
    setAiPickMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
    setIsAIModalOpen,
    setIsAILoading,
    setTreeData,
    treeData,
  };
}

function verifyRuntimeContextShape() {
  const args = createRuntimeContextArgs();
  const context = createAiPickControllerRuntimeContext({
    aiPickMode: true,
    aiState: {
      beginAiPickEnableSession: args.beginAiPickEnableSession,
      isAILoading: true,
      invalidateAiPickEnableSession: args.invalidateAiPickEnableSession,
      isCurrentAiPickEnableSession: args.isCurrentAiPickEnableSession,
      requestGate: args.requestGate,
      setIsAIModalOpen: args.setIsAIModalOpen,
      setIsAILoading: args.setIsAILoading,
      setTreeData: args.setTreeData,
      treeData: args.treeData,
    },
    cancelActiveAiRequest: args.cancelActiveAiRequest,
    preloadAIModal: args.preloadAIModal,
    setAiPickMode: args.setAiPickMode,
    setHighlighterMode: args.setHighlighterMode,
    setQuickEditDocumentMode: args.setQuickEditDocumentMode,
    setQuickEditMode: args.setQuickEditMode,
  });

  expectRuntimeContext(context, args);

  context.resumeAiPickMode?.();

  expectResumeAiPickModeCall(args);
}

function expectRuntimeContext(
  context: ReturnType<typeof createAiPickControllerRuntimeContext>,
  args: ReturnType<typeof createRuntimeContextArgs>
) {
  expect(context).toEqual(
    expect.objectContaining({
      aiPickMode: true,
      beginAiPickEnableSession: args.beginAiPickEnableSession,
      cancelActiveAiRequest: args.cancelActiveAiRequest,
      invalidateAiPickEnableSession: args.invalidateAiPickEnableSession,
      isCurrentAiPickEnableSession: args.isCurrentAiPickEnableSession,
      isAILoading: true,
      preloadAIModal: args.preloadAIModal,
      requestGate: args.requestGate,
      setAiPickMode: args.setAiPickMode,
      setHighlighterMode: args.setHighlighterMode,
      setQuickEditDocumentMode: args.setQuickEditDocumentMode,
      setQuickEditMode: args.setQuickEditMode,
      setIsAIModalOpen: args.setIsAIModalOpen,
      setIsAILoading: args.setIsAILoading,
      setTreeData: args.setTreeData,
    })
  );
}

function expectResumeAiPickModeCall(args: ReturnType<typeof createRuntimeContextArgs>) {
  expect(handleResumeAiPickModeMock).toHaveBeenCalledWith({
    aiPickMode: true,
    aiPickSource: undefined,
    beginAiPickEnableSession: args.beginAiPickEnableSession,
    cancelActiveAiRequest: args.cancelActiveAiRequest,
    invalidateAiPickEnableSession: args.invalidateAiPickEnableSession,
    isCurrentAiPickEnableSession: args.isCurrentAiPickEnableSession,
    isAILoading: true,
    preloadAIModal: args.preloadAIModal,
    requestGate: args.requestGate,
    resumeAiPickMode: expect.any(Function),
    setAiPickMode: args.setAiPickMode,
    setHighlighterMode: args.setHighlighterMode,
    setQuickEditDocumentMode: args.setQuickEditDocumentMode,
    setQuickEditMode: args.setQuickEditMode,
    setIsAIModalOpen: args.setIsAIModalOpen,
    setIsAILoading: args.setIsAILoading,
    setTreeData: args.setTreeData,
    treeData: args.treeData,
  });
}

describe('ai-pick-controller context helpers', () => {
  it('cancels the active request and clears ai loading state', verifyCancelAiPromptHandler);

  it(
    'creates a runtime context that forwards state and resumes through the mode handler',
    verifyRuntimeContextShape
  );
});
