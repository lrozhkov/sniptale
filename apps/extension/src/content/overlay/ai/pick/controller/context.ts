import { handleResumeAiPickMode } from './mode';
import type { AiPickControllerContext, UseAiPickControllerParams } from './types';

type AiPickControllerStateSnapshot = Pick<
  AiPickControllerContext,
  | 'beginAiPickEnableSession'
  | 'isAILoading'
  | 'invalidateAiPickEnableSession'
  | 'isCurrentAiPickEnableSession'
  | 'requestGate'
  | 'setIsAIModalOpen'
  | 'setIsAILoading'
  | 'setTreeData'
  | 'treeData'
>;

type AiPickControllerRuntimeArgs = UseAiPickControllerParams &
  AiPickControllerStateSnapshot & {
    cancelActiveAiRequest: () => void;
  };

type AiPickControllerRuntimeContextArgs = {
  aiPickSource?: UseAiPickControllerParams['aiPickSource'];
  aiPickMode: boolean;
  aiState: AiPickControllerStateSnapshot;
  cancelActiveAiRequest: () => void;
  preloadAIModal: UseAiPickControllerParams['preloadAIModal'];
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditDocumentMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
};

function createAiPickControllerRuntimeArgs(
  args: AiPickControllerRuntimeContextArgs
): AiPickControllerRuntimeArgs {
  return {
    aiPickMode: args.aiPickMode,
    aiPickSource: args.aiPickSource,
    beginAiPickEnableSession: args.aiState.beginAiPickEnableSession,
    cancelActiveAiRequest: args.cancelActiveAiRequest,
    invalidateAiPickEnableSession: args.aiState.invalidateAiPickEnableSession,
    isCurrentAiPickEnableSession: args.aiState.isCurrentAiPickEnableSession,
    isAILoading: args.aiState.isAILoading,
    preloadAIModal: args.preloadAIModal,
    requestGate: args.aiState.requestGate,
    setAiPickMode: args.setAiPickMode,
    setHighlighterMode: args.setHighlighterMode,
    setQuickEditDocumentMode: args.setQuickEditDocumentMode,
    setQuickEditMode: args.setQuickEditMode,
    setIsAIModalOpen: args.aiState.setIsAIModalOpen,
    setIsAILoading: args.aiState.setIsAILoading,
    setTreeData: args.aiState.setTreeData,
    treeData: args.aiState.treeData,
  };
}

function createAiPickControllerContext(
  args: AiPickControllerRuntimeArgs & {
    resumeAiPickMode: () => void;
  }
): AiPickControllerContext {
  return {
    aiPickSource: args.aiPickSource,
    aiPickMode: args.aiPickMode,
    beginAiPickEnableSession: args.beginAiPickEnableSession,
    cancelActiveAiRequest: args.cancelActiveAiRequest,
    invalidateAiPickEnableSession: args.invalidateAiPickEnableSession,
    isCurrentAiPickEnableSession: args.isCurrentAiPickEnableSession,
    isAILoading: args.isAILoading,
    preloadAIModal: args.preloadAIModal,
    requestGate: args.requestGate,
    resumeAiPickMode: args.resumeAiPickMode,
    setAiPickMode: args.setAiPickMode,
    setHighlighterMode: args.setHighlighterMode,
    setQuickEditDocumentMode: args.setQuickEditDocumentMode,
    setQuickEditMode: args.setQuickEditMode,
    setIsAIModalOpen: args.setIsAIModalOpen,
    setIsAILoading: args.setIsAILoading,
    setTreeData: args.setTreeData,
    treeData: args.treeData,
  };
}

export function createCancelAiPromptHandler(args: {
  cancelActiveAiRequest: () => void;
  setIsAILoading: (value: boolean) => void;
}) {
  return () => {
    args.cancelActiveAiRequest();
    args.setIsAILoading(false);
  };
}

function createResumeAiPickModeHandler(
  args: {
    aiPickMode: boolean;
    cancelActiveAiRequest: () => void;
  } & Omit<AiPickControllerRuntimeArgs, 'aiPickMode' | 'cancelActiveAiRequest'>
) {
  return () =>
    handleResumeAiPickMode({
      aiPickMode: args.aiPickMode,
      aiPickSource: args.aiPickSource,
      beginAiPickEnableSession: args.beginAiPickEnableSession,
      cancelActiveAiRequest: args.cancelActiveAiRequest,
      invalidateAiPickEnableSession: args.invalidateAiPickEnableSession,
      isCurrentAiPickEnableSession: args.isCurrentAiPickEnableSession,
      isAILoading: args.isAILoading,
      preloadAIModal: args.preloadAIModal,
      requestGate: args.requestGate,
      resumeAiPickMode: () => {},
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

export function createAiPickControllerRuntimeContext(
  args: AiPickControllerRuntimeContextArgs
): AiPickControllerContext {
  const runtimeArgs = createAiPickControllerRuntimeArgs(args);
  const resumeAiPickMode = createResumeAiPickModeHandler(runtimeArgs);

  return createAiPickControllerContext({
    ...runtimeArgs,
    resumeAiPickMode,
  });
}
