import { saveAiProvidersGlobalPrompt } from '../../save';
import { useAiProvidersPromptResize } from '../../prompt-resize';
import type { AiProvidersPromptSource, AiProvidersPromptViewState } from './types';
import { useAiProvidersPromptState } from './shared';

export function useAiProvidersGlobalPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptViewState {
  const handleResizeStart = useAiProvidersPromptResize(dataState.globalPromptRef);

  return useAiProvidersPromptState({
    handleResizeStart,
    persist: saveAiProvidersGlobalPrompt,
    setSourceValue: dataState.setGlobalPromptState,
    textareaRef: dataState.globalPromptRef,
    value: dataState.globalPrompt,
  });
}
