import type { AISettings } from '../../../contracts/settings';
import {
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
    chromeAiEnabled,
  ] = await Promise.all([
    loadAIProviders(),
    loadAIModels(),
    loadDefaultModelId(),
    loadGlobalSystemPrompt(),
    loadScenarioEditorSystemPrompt(),
    loadChromeAiEnabled(),
  ]);

  return {
    chromeAiEnabled,
    providers,
    models,
    defaultModelId,
    globalSystemPrompt,
    scenarioEditorSystemPrompt,
  };
}
