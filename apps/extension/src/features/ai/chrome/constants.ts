import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { AIProviderSelectorEntry } from '../../../contracts/messaging/ai-settings-runtime';

const CHROME_AI_PROVIDER_ID = 'chrome-ai-google-provider';
export const CHROME_AI_MODEL_ID = 'chrome-ai-google-model';
const CHROME_AI_PROVIDER_NAME = 'Google';
const CHROME_AI_MODEL_NAME = 'Google Chrome AI';
const CHROME_AI_MODEL_CODE = 'chrome-prompt-api';

export function isChromeAiModelId(modelId: string | null | undefined): modelId is string {
  return modelId === CHROME_AI_MODEL_ID;
}

export function isChromeAiProviderId(providerId: string): boolean {
  return providerId === CHROME_AI_PROVIDER_ID;
}

function createChromeAiProvider(): AIProvider {
  return {
    id: CHROME_AI_PROVIDER_ID,
    name: CHROME_AI_PROVIDER_NAME,
    connectionType: 'chrome-built-in',
    baseUrl: 'chrome://built-in-ai',
    hasStoredApiKey: false,
    createdAt: 0,
  };
}

function createChromeAiProviderSelectorEntry(): AIProviderSelectorEntry {
  return {
    id: CHROME_AI_PROVIDER_ID,
    name: CHROME_AI_PROVIDER_NAME,
    connectionType: 'chrome-built-in',
    createdAt: 0,
    destinationKind: 'chrome-built-in',
    hasStoredApiKey: false,
  };
}

function createChromeAiModel(): AIModel {
  return {
    id: CHROME_AI_MODEL_ID,
    providerId: CHROME_AI_PROVIDER_ID,
    modelCode: CHROME_AI_MODEL_CODE,
    displayName: CHROME_AI_MODEL_NAME,
  };
}

export function mergeChromeAiSelectorEntries(args: {
  models: AIModel[];
  providers: AIProvider[];
}): {
  models: AIModel[];
  providers: AIProvider[];
} {
  return {
    providers: args.providers.some((provider) => isChromeAiProviderId(provider.id))
      ? args.providers
      : [...args.providers, createChromeAiProvider()],
    models: args.models.some((model) => isChromeAiModelId(model.id))
      ? args.models
      : [...args.models, createChromeAiModel()],
  };
}

export function mergeChromeAiProviderSelectorEntries(args: {
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
}): {
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
} {
  return {
    providers: args.providers.some((provider) => isChromeAiProviderId(provider.id))
      ? args.providers
      : [...args.providers, createChromeAiProviderSelectorEntry()],
    models: args.models.some((model) => isChromeAiModelId(model.id))
      ? args.models
      : [...args.models, createChromeAiModel()],
  };
}

export function filterChromeAiSelectorEntries<TEntry extends AIModel | AIProvider>(
  entries: TEntry[],
  matcher: (entry: TEntry) => boolean
): TEntry[] {
  return entries.filter((entry) => !matcher(entry));
}
