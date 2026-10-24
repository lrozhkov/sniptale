import type { AISettings } from '../../../contracts/settings';
import {
  loadAudioTranscriptionSystemPrompt,
  loadVoiceInputCorrectionSystemPrompt,
  loadAIModels,
  loadAIProviders,
  loadChromeAiEnabled,
  loadDefaultModelId,
  loadGlobalSystemPrompt,
  loadScenarioEditorSystemPrompt,
} from './core';

export async function loadAISettings(): Promise<AISettings> {
  const [
    providers,
    models,
    defaultModelId,
    globalSystemPrompt,
    scenarioEditorSystemPrompt,
    audioTranscriptionSystemPrompt,
    voiceInputCorrectionSystemPrompt,
    chromeAiEnabled,
  ] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
    loadDefaultModelId(),
    loadGlobalSystemPrompt(),
    loadScenarioEditorSystemPrompt(),
    loadAudioTranscriptionSystemPrompt(),
    loadVoiceInputCorrectionSystemPrompt(),
    loadChromeAiEnabled(),
  ]);

  return {
    chromeAiEnabled,
    providers,
    models,
    defaultModelId,
    globalSystemPrompt,
    scenarioEditorSystemPrompt,
    audioTranscriptionSystemPrompt,
    voiceInputCorrectionSystemPrompt,
  };
}
