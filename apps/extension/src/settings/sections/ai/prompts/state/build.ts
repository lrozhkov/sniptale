import type { AiProvidersPromptSource, AiProvidersPromptsState } from './types';
import { useAiProvidersGlobalPromptState } from './global';
import { useAiProvidersScenarioEditorPromptState } from './scenario-editor';

export function useAiProvidersPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptsState {
  return {
    global: useAiProvidersGlobalPromptState(dataState),
    scenarioEditor: useAiProvidersScenarioEditorPromptState(dataState),
  };
}
