import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { addPagePreparationHistoryAppliedListener } from '../../../../parser/page-preparation/history';
import { createAiPickControllerRuntimeContext, createCancelAiPromptHandler } from './context';
import { handleCloseAIModal, resetAiPickControllerAfterHistoryApply } from './lifecycle';
import { handleAiPickContentStart, handleDisableAiPickMode } from './mode';
import { createAiSubmitRequestGate } from './submit/gate';
import { submitAiPickPromptDeferred } from './submit/lazy';
import type {
  AiPickControllerContext,
  UseAiPickControllerParams,
  UseAiPickControllerResult,
} from './types';

function useAiPickControllerState() {
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [treeData, setTreeData] = useState<ParsedDOMTree | null>(null);
  const requestGateRef = useRef(createAiSubmitRequestGate());
  const enableSessionRef = useRef({ enabled: false, epoch: 0 });
  const beginAiPickEnableSession = useCallback(() => {
    const epoch = enableSessionRef.current.epoch + 1;
    enableSessionRef.current = { enabled: true, epoch };
    return epoch;
  }, []);
  const invalidateAiPickEnableSession = useCallback(() => {
    enableSessionRef.current = {
      enabled: false,
      epoch: enableSessionRef.current.epoch + 1,
    };
  }, []);
  const isCurrentAiPickEnableSession = useCallback((epoch: number) => {
    return enableSessionRef.current.enabled && enableSessionRef.current.epoch === epoch;
  }, []);

  return {
    beginAiPickEnableSession,
    isAILoading,
    isAIModalOpen,
    invalidateAiPickEnableSession,
    isCurrentAiPickEnableSession,
    requestGate: requestGateRef.current,
    setIsAILoading,
    setIsAIModalOpen,
    setTreeData,
    treeData,
  };
}

function useAiPickHistoryResetEffect(
  cancelActiveAiRequest: () => void,
  invalidateAiPickEnableSession: () => void,
  setIsAILoading: (value: boolean) => void,
  setIsAIModalOpen: (value: boolean) => void,
  setTreeData: (tree: ParsedDOMTree | null) => void
) {
  useEffect(() => {
    return addPagePreparationHistoryAppliedListener(() =>
      resetAiPickControllerAfterHistoryApply({
        cancelActiveAiRequest,
        invalidateAiPickEnableSession,
        setIsAILoading,
        setIsAIModalOpen,
        setTreeData,
      })
    );
  }, [
    cancelActiveAiRequest,
    invalidateAiPickEnableSession,
    setIsAILoading,
    setIsAIModalOpen,
    setTreeData,
  ]);
}

function useAiPickRuntimeContext(
  params: UseAiPickControllerParams,
  aiState: ReturnType<typeof useAiPickControllerState>,
  cancelActiveAiRequest: () => void
) {
  const context = createAiPickControllerRuntimeContext({
    aiPickSource: params.aiPickSource,
    aiPickMode: params.aiPickMode,
    aiState,
    cancelActiveAiRequest,
    preloadAIModal: params.preloadAIModal,
    setAiPickMode: params.setAiPickMode,
    setHighlighterMode: params.setHighlighterMode,
    setQuickEditDocumentMode: params.setQuickEditDocumentMode,
    setQuickEditMode: params.setQuickEditMode,
  });
  const { invalidateAiPickEnableSession } = aiState;

  useAiPickHistoryResetEffect(
    cancelActiveAiRequest,
    invalidateAiPickEnableSession,
    aiState.setIsAILoading,
    aiState.setIsAIModalOpen,
    aiState.setTreeData
  );

  useEffect(() => {
    if (!params.aiPickMode) {
      invalidateAiPickEnableSession();
    }
  }, [params.aiPickMode, invalidateAiPickEnableSession]);

  return context;
}

export function useAiPickController({
  aiPickSource,
  aiPickMode,
  preloadAIModal,
  setAiPickMode,
  setHighlighterMode,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: UseAiPickControllerParams): UseAiPickControllerResult {
  const aiState = useAiPickControllerState();
  const cancelActiveAiRequest = () => aiState.requestGate.cancel();
  const context = useAiPickRuntimeContext(
    {
      aiPickSource,
      aiPickMode,
      preloadAIModal,
      setAiPickMode,
      setHighlighterMode,
      setQuickEditDocumentMode,
      setQuickEditMode,
    },
    aiState,
    cancelActiveAiRequest
  );

  const handleDisableAiPickModeAction = () => handleDisableAiPickMode(context);
  const handleAiPickContentStartAction = () => handleAiPickContentStart(context);
  const handleCancelAIPromptAction = createCancelAiPromptHandler({
    cancelActiveAiRequest,
    setIsAILoading: aiState.setIsAILoading,
  });
  const handleCloseAIModalAction = () => handleCloseAIModal(context);
  const handleSubmitAIPrompt = (prompt: string, selectedData?: string, modelId?: string | null) =>
    handleSubmitAIPromptImpl(context, prompt, selectedData, modelId);

  return {
    handleAiPickContentStart: handleAiPickContentStartAction,
    handleCancelAIPrompt: handleCancelAIPromptAction,
    handleCloseAIModal: handleCloseAIModalAction,
    handleDisableAiPickMode: handleDisableAiPickModeAction,
    handleSubmitAIPrompt,
    isAILoading: aiState.isAILoading,
    isAIModalOpen: aiState.isAIModalOpen,
    treeData: aiState.treeData,
  };
}

async function handleSubmitAIPromptImpl(
  context: AiPickControllerContext,
  prompt: string,
  selectedData?: string,
  modelId?: string | null
) {
  await submitAiPickPromptDeferred(context, prompt, selectedData, modelId);
}
