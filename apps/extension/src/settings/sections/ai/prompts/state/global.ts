import { resetAiProvidersGlobalPrompt, saveAiProvidersGlobalPrompt } from '../save';
import { useAiProvidersPromptResize } from './resize';
import type { AiProvidersPromptSource, AiProvidersPromptViewState } from './types';
import { useAiProvidersPromptState } from './shared';
import { DEFAULT_GLOBAL_SYSTEM_PROMPT } from '../../../../../composition/persistence/ai-settings/constants';

export function useAiProvidersGlobalPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptViewState {
  const handleResizeStart = useAiProvidersPromptResize(dataState.globalPromptRef);

  return useAiProvidersPromptState({
    defaultValue: DEFAULT_GLOBAL_SYSTEM_PROMPT,
    handleResizeStart,
    persist: saveAiProvidersGlobalPrompt,
    persistedValue: dataState.persistedGlobalPrompt,
    reset: resetAiProvidersGlobalPrompt,
    setSourceValue: dataState.setGlobalPromptState,
    setPersistedValue: dataState.setPersistedGlobalPrompt,
    textareaRef: dataState.globalPromptRef,
    value: dataState.globalPrompt,
  });
}
