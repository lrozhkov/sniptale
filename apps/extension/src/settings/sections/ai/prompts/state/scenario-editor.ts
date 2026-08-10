import { resetAiProvidersScenarioEditorPrompt, saveAiProvidersScenarioEditorPrompt } from '../save';
import { useAiProvidersPromptResize } from './resize';
import type { AiProvidersPromptSource, AiProvidersPromptViewState } from './types';
import { useAiProvidersPromptState } from './shared';
import { DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT } from '../../../../../composition/persistence/ai-settings/constants';

export function useAiProvidersScenarioEditorPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptViewState {
  const handleResizeStart = useAiProvidersPromptResize(dataState.scenarioEditorPromptRef);

  return useAiProvidersPromptState({
    defaultValue: DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT,
    handleResizeStart,
    persist: saveAiProvidersScenarioEditorPrompt,
    persistedValue: dataState.persistedScenarioEditorPrompt,
    reset: resetAiProvidersScenarioEditorPrompt,
    setSourceValue: dataState.setScenarioEditorPromptState,
    setPersistedValue: dataState.setPersistedScenarioEditorPrompt,
    textareaRef: dataState.scenarioEditorPromptRef,
    value: dataState.scenarioEditorPrompt,
  });
}
