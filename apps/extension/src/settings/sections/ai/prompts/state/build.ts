import type { AiProvidersPromptSource, AiProvidersPromptsState } from './types';
import { useAiProvidersPromptState as usePromptState } from './shared';
import { useAiProvidersPromptResize } from './resize';
import {
  saveAiProvidersAudioTranscriptionPrompt,
  resetAiProvidersAudioTranscriptionPrompt,
} from '../save';
import { DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT } from '../../../../../composition/persistence/ai-settings/constants';
import { useAiProvidersGlobalPromptState } from './global';
import { useAiProvidersScenarioEditorPromptState } from './scenario-editor';

export function useAiProvidersPromptState(
  dataState: AiProvidersPromptSource
): AiProvidersPromptsState {
  return {
    audioTranscription: usePromptState({
      defaultValue: DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT,
      handleResizeStart: useAiProvidersPromptResize(dataState.audioTranscriptionPromptRef),
      persist: saveAiProvidersAudioTranscriptionPrompt,
      persistedValue: dataState.persistedAudioTranscriptionPrompt,
      reset: resetAiProvidersAudioTranscriptionPrompt,
      setSourceValue: dataState.setAudioTranscriptionPromptState,
      setPersistedValue: dataState.setPersistedAudioTranscriptionPrompt,
      textareaRef: dataState.audioTranscriptionPromptRef,
      value: dataState.audioTranscriptionPrompt,
    }),
    global: useAiProvidersGlobalPromptState(dataState),
    scenarioEditor: useAiProvidersScenarioEditorPromptState(dataState),
  };
}
