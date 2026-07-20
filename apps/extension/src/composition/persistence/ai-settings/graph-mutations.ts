import type { AIModel } from '../../../contracts/settings';
import type { AIProviderUpsertInput } from './core';
import {
  changeAISecretPassphraseProtection,
  clearAIProviderSecret,
  deleteAIProviderGraphRecord,
  disableAISecretPassphraseProtection,
  enableAISecretPassphraseProtection,
  loadAISecretProtectionStatus as loadUnserializedAISecretProtectionStatus,
  loadAIModels,
  loadAIProviders,
  loadDefaultModelId,
  lockAISecretProtection,
  resetAISecretPassphraseProtection,
  saveAIModels,
  saveAIModelGraph,
  saveChromeAiEnabled,
  saveDefaultModelId,
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
  unlockAISecretProtection,
  upsertAIProviderRecord,
  type AISecretProtectionStatus,
} from './core';
import { initializeAiStorageAccess } from './init';
import { assertAISettingsGraphInvariants } from './graph-invariants';
import type { AISettingsMutationCommand } from './graph-mutation-types';

// policyStateId: ai-settings-mutation-queue - durable storage remains authoritative while this
// runtime-local queue serializes graph transitions and is recreated empty after runtime restart.
let aiSettingsMutationQueue = Promise.resolve<void>(undefined);

function queueAISettingsMutation<T>(run: () => Promise<T>): Promise<T> {
  const nextMutation = aiSettingsMutationQueue.catch(() => undefined).then(run);
  aiSettingsMutationQueue = nextMutation.then(
    () => undefined,
    () => undefined
  );
  return nextMutation;
}

async function assertModelProviderExists(model: AIModel): Promise<void> {
  const providers = await loadAIProviders();
  if (!providers.some((provider) => provider.id === model.providerId)) {
    throw new Error(`Provider ${model.providerId} not found for model ${model.id}`);
  }
}

async function addProvider(command: { provider: AIProviderUpsertInput }): Promise<void> {
  const providers = await loadAIProviders();
  if (providers.some((provider) => provider.id === command.provider.id)) {
    throw new Error(`Provider ${command.provider.id} already exists`);
  }
  await upsertAIProviderRecord(command.provider);
}

async function updateProvider(command: { provider: AIProviderUpsertInput }): Promise<void> {
  const providers = await loadAIProviders();
  if (!providers.some((provider) => provider.id === command.provider.id)) {
    throw new Error(`Provider ${command.provider.id} not found`);
  }
  await upsertAIProviderRecord(command.provider);
}

async function clearProviderSecret(providerId: string): Promise<void> {
  const providers = await loadAIProviders();
  if (!providers.some((provider) => provider.id === providerId)) {
    throw new Error(`Provider ${providerId} not found`);
  }
  await clearAIProviderSecret(providerId);
}

async function addModel(model: AIModel): Promise<void> {
  await assertModelProviderExists(model);
  const models = await loadAIModels();
  if (models.some((current) => current.id === model.id)) {
    throw new Error(`Model ${model.id} already exists`);
  }
  await saveAIModels([...models, model]);
}

async function updateModel(model: AIModel): Promise<void> {
  await assertModelProviderExists(model);
  const models = await loadAIModels();
  const index = models.findIndex((current) => current.id === model.id);
  if (index < 0) {
    throw new Error(`Model ${model.id} not found`);
  }
  const nextModels = [...models];
  nextModels[index] = { ...nextModels[index], ...model };
  await saveAIModels(nextModels);
}

async function deleteModel(modelId: string): Promise<void> {
  const models = await loadAIModels();
  const defaultModelId = await loadDefaultModelId();
  await saveAIModelGraph(
    models.filter((model) => model.id !== modelId),
    defaultModelId === modelId ? null : defaultModelId
  );
}

async function saveDefaultModel(defaultModelId: string | null): Promise<void> {
  if (defaultModelId) {
    const models = await loadAIModels();
    if (!models.some((model) => model.id === defaultModelId)) {
      throw new Error(`Default AI model ${defaultModelId} not found`);
    }
  }
  await saveDefaultModelId(defaultModelId);
}

async function applyAISettingsMutation(command: AISettingsMutationCommand): Promise<void> {
  switch (command.operation) {
    case 'add-provider':
      return addProvider(command);
    case 'update-provider':
      return updateProvider(command);
    case 'clear-provider-secret':
      return clearProviderSecret(command.providerId);
    case 'delete-provider':
      return deleteAIProviderGraphRecord(command.providerId);
    case 'add-model':
      return addModel(command.model);
    case 'update-model':
      return updateModel(command.model);
    case 'delete-model':
      return deleteModel(command.modelId);
    case 'save-default-model':
      return saveDefaultModel(command.defaultModelId);
    case 'save-global-prompt':
      return saveGlobalSystemPrompt(command.prompt);
    case 'save-scenario-editor-prompt':
      return saveScenarioEditorSystemPrompt(command.prompt);
    case 'save-chrome-ai-enabled':
      return saveChromeAiEnabled(command.enabled);
    case 'enable-secret-passphrase-protection':
      return enableAISecretPassphraseProtection(command.passphrase);
    case 'disable-secret-passphrase-protection':
      return disableAISecretPassphraseProtection(command.passphrase);
    case 'unlock-secret-passphrase-protection':
      return unlockAISecretProtection(command.passphrase);
    case 'change-secret-passphrase-protection':
      return changeAISecretPassphraseProtection({
        currentPassphrase: command.currentPassphrase,
        nextPassphrase: command.nextPassphrase,
      });
    case 'lock-secret-passphrase-protection':
      return lockAISecretProtection();
    case 'reset-secret-passphrase-protection':
      return resetAISecretPassphraseProtection();
  }
}

/** Serializes every durable AI settings mutation through the persistence owner. */
export function mutateStoredAISettings(command: AISettingsMutationCommand): Promise<void> {
  return queueAISettingsMutation(async () => {
    await initializeAiStorageAccess();
    await assertAISettingsGraphInvariants();
    await applyAISettingsMutation(command);
    await assertAISettingsGraphInvariants();
  });
}

/** Reads secret-protection state after all previously queued settings mutations settle. */
export function loadSerializedAISecretProtectionStatus(): Promise<AISecretProtectionStatus> {
  return queueAISettingsMutation(async () => {
    await initializeAiStorageAccess();
    await assertAISettingsGraphInvariants();
    return loadUnserializedAISecretProtectionStatus();
  });
}

export function resetAISettingsMutationQueueForTests(): void {
  aiSettingsMutationQueue = Promise.resolve<void>(undefined);
}
