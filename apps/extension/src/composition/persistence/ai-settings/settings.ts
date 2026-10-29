import type { AISettings } from '../../../contracts/settings';
import {
  loadAudioTranscriptionSystemPrompt,
  loadVoiceInputCorrectionSystemPrompt,
  loadAIModels,
  loadAIProviders,
  loadChromeAiEnabled,
  loadGlobalSystemPrompt,
  loadScenarioEditorSystemPrompt,
} from './core';

export async function loadAISettings(): Promise<AISettings> {
  const [
    providers,
    models,
    globalSystemPrompt,
    scenarioEditorSystemPrompt,
    audioTranscriptionSystemPrompt,
    voiceInputCorrectionSystemPrompt,
    chromeAiEnabled,
  ] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
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
    globalSystemPrompt,
    scenarioEditorSystemPrompt,
    audioTranscriptionSystemPrompt,
    voiceInputCorrectionSystemPrompt,
  };
}
