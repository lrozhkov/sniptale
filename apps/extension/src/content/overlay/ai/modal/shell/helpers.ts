import type React from 'react';

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
  isLoading: boolean | undefined;
  onClose: () => void;
}) {
  return (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (props.canSubmit) {
        props.handleSubmit();
      }
    }

    if (event.key === 'Escape' && !props.isLoading) {
      event.preventDefault();
      props.onClose();
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
    ...(isLoading === undefined ? {} : { isLoading }),
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
  };
}
