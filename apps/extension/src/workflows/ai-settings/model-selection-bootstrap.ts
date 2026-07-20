import {
  CHROME_AI_MODEL_ID,
  isChromeAiModelId,
  mergeChromeAiSelectorEntries,
} from '../../features/ai/chrome/constants';
import { resolveSelectedAIModelId } from '../../features/ai/selection';
import { loadChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';
import type { AIModel, AIProvider } from '../../contracts/settings';
import {
  loadAIModels,
  loadAIProviders,
  loadChromeAiEnabled,
  loadDefaultModelId,
  loadGlobalSystemPrompt,
  initializeAiStorageAccess,
} from '../../composition/persistence/ai-settings/index';

interface AIModelSelectionBootstrap {
  chromeAiEnabled: boolean;
  defaultModelId: string | null;
  globalSystemPrompt: string;
  models: AIModel[];
  providers: AIProvider[];
}

/**
 * Loads the canonical provider/model bootstrap payload used by AI-powered UI surfaces.
 */
export function loadAIModelSelectionBootstrap(): Promise<AIModelSelectionBootstrap> {
  return initializeAiStorageAccess()
    .then(() =>
      Promise.all([
        loadAIModels(),
        loadAIProviders(),
        loadChromeAiEnabled(),
        loadDefaultModelId(),
        loadGlobalSystemPrompt(),
      ])
    )
    .then(async ([models, providers, chromeAiEnabled, defaultModelId, globalSystemPrompt]) => {
      const availability = chromeAiEnabled ? await loadChromeAiAvailability() : 'unsupported';
      const canUseChromeAi = chromeAiEnabled && availability === 'available';
      const nextSelection = canUseChromeAi
        ? mergeChromeAiSelectorEntries({ models, providers })
        : { models, providers };
      const nextDefaultModelId =
        !canUseChromeAi && isChromeAiModelId(defaultModelId)
          ? resolveUnavailableChromeAiDefault(models)
          : defaultModelId;

      return {
        chromeAiEnabled,
        defaultModelId: nextDefaultModelId,
        globalSystemPrompt: globalSystemPrompt ?? '',
        models: nextSelection.models,
        providers: nextSelection.providers,
      };
    });
}

function resolveUnavailableChromeAiDefault(models: AIModel[]): string | null {
  const selectedModelId = resolveSelectedAIModelId(models, null);

  if (selectedModelId === CHROME_AI_MODEL_ID) {
    return null;
  }

  return selectedModelId;
}
