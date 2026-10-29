import type React from 'react';
import { isTrustedDomEvent } from '../../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../../platform/trusted-events/synthetic-mouse';

import type { AIModalProps } from './types';
import { canSubmitAiPickPrompt } from '../../pick/controller/submit/preconditions';
import type { useAIModalState } from '../session';

export function createAIModalSubmitHandler(
  onSubmit: AIModalProps['onSubmit'],
  isLoading: boolean | undefined,
  prompt: string,
  selectedData: ReturnType<typeof useAIModalState>['selectedData'],
  selectedModelId: string | null
) {
  return () => {
    const submitGuardArgs = {
      prompt,
      selectedModelId,
      ...(isLoading === undefined ? {} : { isLoading }),
    };
    if (!canSubmitAiPickPrompt(submitGuardArgs)) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    onSubmit(trimmedPrompt, selectedData, selectedModelId);
  };
}

export function createAIModalKeyDownHandler(props: {
  canSubmit: boolean;
  handleSubmit: () => void;
}) {
  return (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (!isTrustedDomEvent(event.nativeEvent)) return;
      event.preventDefault();
      if (props.canSubmit) {
        props.handleSubmit();
      }
    }
  };
}

export function getAIModalFooterProps(
  handleSubmit: () => void,
  isLoading: boolean | undefined,
  onClose: () => void,
  state: ReturnType<typeof useAIModalState>
) {
  const submitGuardArgs = {
    prompt: state.prompt,
    selectedModelId: state.selectedModelId,
    isLoading: Boolean(isLoading) || state.modelSelection.selectionPending,
  };

  return {
    availableModels: state.availableModels,
    disabledSubmit: !canSubmitAiPickPrompt(submitGuardArgs),
    isLoading: isLoading ?? false,
    onClose,
    onSelectModel: state.handleModelSelect,
    onSubmit: handleSubmit,
    providers: state.providers,
    selectedData: state.selectedData,
    selectedModelId: state.selectedModelId,
    totalTokens: state.totalTokens,
    modelSelection: state.modelSelection,
  };
}

/** Admits native input and the existing synchronous private mouse bridge. */
export function requireTrustedAIModalInteraction(event: React.SyntheticEvent): boolean {
  if (isTrustedDomEvent(event.nativeEvent) || isBridgedMouseEvent(event.nativeEvent)) return true;
  event.preventDefault();
  event.stopPropagation();
  return false;
}
