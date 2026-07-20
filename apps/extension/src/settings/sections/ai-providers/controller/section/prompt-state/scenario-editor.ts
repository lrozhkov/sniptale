import { saveAiProvidersScenarioEditorPrompt } from '../../save';
import { useAiProvidersPromptResize } from '../../prompt-resize';
import type { AiProvidersPromptSource, AiProvidersPromptViewState } from './types';
import { useAiProvidersPromptState } from './shared';

export function useAiProvidersScenarioEditorPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptViewState {
  const handleResizeStart = useAiProvidersPromptResize(dataState.scenarioEditorPromptRef);

  return useAiProvidersPromptState({
    handleResizeStart,
    persist: saveAiProvidersScenarioEditorPrompt,
    setSourceValue: dataState.setScenarioEditorPromptState,
    textareaRef: dataState.scenarioEditorPromptRef,
    value: dataState.scenarioEditorPrompt,
  });
}
