import type { AIModel, AIProvider } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  parseStoredAIModels,
  parseStoredChromeAiEnabled,
  parseStoredDefaultModelId,
  parseStoredSystemPrompt,
} from './guards';
import {
  AI_CHROME_ENABLED_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_GLOBAL_PROMPT_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SCENARIO_EDITOR_PROMPT_KEY,
  DEFAULT_GLOBAL_SYSTEM_PROMPT,
  DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT,
} from './constants';
import { warnAboutInvalidAiStorageEntries } from './warning-helpers';
import { initializeAiStorageAccess } from './init';
import {
  clearStoredAIProviderSecret,
  deleteStoredAIProviderRecord,
  loadStoredAIProviderSecret,
  loadStoredAIProviders,
  readStoredProviderMetadata,
  readStoredProviderSecrets,
  saveStoredAIProviders,
  type AIProviderUpsertInput,
  upsertStoredAIProviderRecord,
} from './provider-secrets.store.ts';
import { removeTransparentKeyIfUnused } from './provider-secret-keys.store.ts';
import {
  changeStoredAISecretPassphraseProtection,
  disableStoredAISecretPassphraseProtection,
  enableStoredAISecretPassphraseProtection,
  loadStoredAISecretProtectionStatus,
  lockStoredAISecretProtection,
  resetStoredAISecretPassphraseProtection,
  unlockStoredAISecretProtection,
  type AISecretProtectionStatus,
} from './provider-secret-protection.store.ts';

export type { AIProviderUpsertInput } from './provider-secrets.store.ts';
export type { AISecretProtectionStatus } from './provider-secret-protection.store.ts';
export {
  loadStoredAIProviderSecret as loadAIProviderSecret,
  loadStoredAIProviders as loadAIProviders,
};

const logger = createLogger({ namespace: 'SharedAiStorage' });

function saveLocalValue<T>(key: string, value: T, logMessage: string): Promise<void> {
  return browserStorage.local.set({ [key]: value }).then(() => {
    logger.info(logMessage);
  });
}

export async function saveAIProviders(providers: AIProvider[]): Promise<void> {
  await initializeAiStorageAccess();
  return saveStoredAIProviders(providers);
}

export async function upsertAIProviderRecord(input: AIProviderUpsertInput): Promise<void> {
  await initializeAiStorageAccess();
  return upsertStoredAIProviderRecord(input);
}

export async function deleteAIProviderRecord(providerId: string): Promise<void> {
  await initializeAiStorageAccess();
  return deleteStoredAIProviderRecord(providerId);
}

export async function deleteAIProviderGraphRecord(providerId: string): Promise<void> {
  await initializeAiStorageAccess();
  const [providers, secrets, models, defaultModelId] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
    loadAIModels(),
    loadDefaultModelId(),
  ]);
  const deletedModelIds = new Set(
    models.filter((model) => model.providerId === providerId).map((model) => model.id)
  );
  const nextModels = models.filter((model) => model.providerId !== providerId);
  const nextDefaultModelId =
    defaultModelId && deletedModelIds.has(defaultModelId) ? null : defaultModelId;
  const { [providerId]: _removedSecret, ...remainingSecrets } = secrets;

  await browserStorage.local.set({
    [AI_DEFAULT_MODEL_KEY]: nextDefaultModelId,
    [AI_MODELS_KEY]: nextModels,
    [AI_PROVIDERS_KEY]: providers.filter((provider) => provider.id !== providerId),
    [AI_PROVIDER_SECRETS_KEY]: remainingSecrets,
  });
  await removeTransparentKeyIfUnused(Object.keys(remainingSecrets).length);
}

export async function clearAIProviderSecret(providerId: string): Promise<void> {
  await initializeAiStorageAccess();
  return clearStoredAIProviderSecret(providerId);
}

export async function loadAISecretProtectionStatus(): Promise<AISecretProtectionStatus> {
  await initializeAiStorageAccess();
  return loadStoredAISecretProtectionStatus();
}

export async function unlockAISecretProtection(passphrase: string): Promise<void> {
  await initializeAiStorageAccess();
  return unlockStoredAISecretProtection(passphrase);
}

export async function lockAISecretProtection(): Promise<void> {
  await initializeAiStorageAccess();
  return lockStoredAISecretProtection();
}

export async function enableAISecretPassphraseProtection(passphrase: string): Promise<void> {
  await initializeAiStorageAccess();
  return enableStoredAISecretPassphraseProtection(passphrase);
}

export async function disableAISecretPassphraseProtection(passphrase?: string): Promise<void> {
  await initializeAiStorageAccess();
  return disableStoredAISecretPassphraseProtection(passphrase);
}

export async function changeAISecretPassphraseProtection(params: {
  currentPassphrase: string;
  nextPassphrase: string;
}): Promise<void> {
  await initializeAiStorageAccess();
  return changeStoredAISecretPassphraseProtection(params);
}

export async function resetAISecretPassphraseProtection(): Promise<void> {
  await initializeAiStorageAccess();
  return resetStoredAISecretPassphraseProtection();
}

export async function loadAIModels(): Promise<AIModel[]> {
  const result = await browserStorage.local.get([AI_MODELS_KEY]);
  const parsedModels = parseStoredAIModels(result[AI_MODELS_KEY]);

  warnAboutInvalidAiStorageEntries({
    logger,
    storageKey: AI_MODELS_KEY,
    invalidEntryCount: parsedModels.invalidEntryCount,
    hasInvalidRoot: parsedModels.hasInvalidRoot,
  });

  return parsedModels.value;
}

export async function saveAIModels(models: AIModel[]): Promise<void> {
  await initializeAiStorageAccess();
  return saveLocalValue(AI_MODELS_KEY, models, `AI models saved: ${models.length}`);
}

export async function saveAIModelGraph(
  models: AIModel[],
  defaultModelId: string | null
): Promise<void> {
  await initializeAiStorageAccess();
  await browserStorage.local.set({
    [AI_DEFAULT_MODEL_KEY]: defaultModelId,
    [AI_MODELS_KEY]: models,
  });
}

export async function loadDefaultModelId(): Promise<string | null> {
  const result = await browserStorage.local.get([AI_DEFAULT_MODEL_KEY]);
  return parseStoredDefaultModelId(result[AI_DEFAULT_MODEL_KEY]);
}

export async function loadChromeAiEnabled(): Promise<boolean> {
  const result = await browserStorage.local.get([AI_CHROME_ENABLED_KEY]);
  return parseStoredChromeAiEnabled(result[AI_CHROME_ENABLED_KEY]);
}

export async function saveDefaultModelId(modelId: string | null): Promise<void> {
  await initializeAiStorageAccess();
  return saveLocalValue(
    AI_DEFAULT_MODEL_KEY,
    modelId,
    `Default model ID saved: ${String(modelId)}`
  );
}

export async function saveChromeAiEnabled(enabled: boolean): Promise<void> {
  await initializeAiStorageAccess();
  return saveLocalValue(
    AI_CHROME_ENABLED_KEY,
    enabled,
    `Chrome AI enabled saved: ${String(enabled)}`
  );
}

export async function loadGlobalSystemPrompt(): Promise<string> {
  const result = await browserStorage.local.get([AI_GLOBAL_PROMPT_KEY]);
  return parseStoredSystemPrompt(result[AI_GLOBAL_PROMPT_KEY], DEFAULT_GLOBAL_SYSTEM_PROMPT);
}

export async function saveGlobalSystemPrompt(prompt: string): Promise<void> {
  await initializeAiStorageAccess();
  return saveLocalValue(AI_GLOBAL_PROMPT_KEY, prompt, 'Global system prompt saved');
}

export async function loadScenarioEditorSystemPrompt(): Promise<string> {
  const result = await browserStorage.local.get([AI_SCENARIO_EDITOR_PROMPT_KEY]);
  return parseStoredSystemPrompt(
    result[AI_SCENARIO_EDITOR_PROMPT_KEY],
    DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT
  );
}

export async function saveScenarioEditorSystemPrompt(prompt: string): Promise<void> {
  await initializeAiStorageAccess();
  return saveLocalValue(
    AI_SCENARIO_EDITOR_PROMPT_KEY,
    prompt,
    'Scenario editor system prompt saved'
  );
}
