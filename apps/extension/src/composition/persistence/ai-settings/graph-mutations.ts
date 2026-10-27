import { setStoredAIProviderEnabled } from './provider-secrets.store';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
} from './constants';
import {
  getAIModelOperation,
  isValidAIModelOperationConfiguration,
} from '../../../contracts/settings/model-operation';
import type { AIModel } from '../../../contracts/settings';
import {
  runWithExclusivePersistenceMutationPermit,
  runWithAtomicPersistenceMutationPermit,
  acquirePersistenceMutationTransition,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
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
  resetAudioTranscriptionSystemPrompt,
  saveAudioTranscriptionSystemPrompt,
  saveVoiceInputCorrectionSystemPrompt,
  resetVoiceInputCorrectionSystemPrompt,
  resetGlobalSystemPrompt,
  resetAISecretPassphraseProtection,
  resetScenarioEditorSystemPrompt,
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
import { rememberAIScenarioSelection } from './scenario-selections';
import {
  admitCatalogRefresh,
  commitCatalogRefresh,
  type AICatalogRefreshToken,
  type AICatalogRefreshOutcome,
} from './managed-catalog';
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
  if (!isValidAIModelOperationConfiguration(model))
    throw new Error('Invalid AI model operation configuration');
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

async function addModel(model: AIModel, permit: PersistenceMutationPermit): Promise<void> {
  await assertModelProviderExists(model);
  const models = await loadAIModels();
  if (models.some((current) => current.id === model.id)) {
    throw new Error(`Model ${model.id} already exists`);
  }
  await saveAIModels([...models, model], permit);
}

async function updateModel(model: AIModel, permit: PersistenceMutationPermit): Promise<void> {
  await assertModelProviderExists(model);
  const models = await loadAIModels();
  const index = models.findIndex((current) => current.id === model.id);
  if (index < 0) {
    throw new Error(`Model ${model.id} not found`);
  }
  const nextModels = [...models];
  const {
    audio: _audio,
    operation: _operation,
    systemPrompt: previousPrompt,
    ...previous
  } = nextModels[index]!;
  nextModels[index] = {
    ...previous,
    ...(getAIModelOperation(model) === 'text' && previousPrompt !== undefined
      ? { systemPrompt: previousPrompt }
      : {}),
    ...model,
  };
  const defaultModelId = await loadDefaultModelId();
  await saveAIModelGraph(
    nextModels,
    defaultModelId === model.id && getAIModelOperation(model) !== 'text' ? null : defaultModelId,
    permit
  );
}

async function deleteModel(modelId: string, permit: PersistenceMutationPermit): Promise<void> {
  const models = await loadAIModels();
  const defaultModelId = await loadDefaultModelId();
  await saveAIModelGraph(
    models.filter((model) => model.id !== modelId),
    defaultModelId === modelId ? null : defaultModelId,
    permit
  );
}

async function moveModel(
  modelId: string,
  beforeModelId: string | null,
  permit: PersistenceMutationPermit
): Promise<void> {
  const models = await loadAIModels();
  const sourceIndex = models.findIndex((model) => model.id === modelId);
  if (sourceIndex < 0) {
    throw new Error(`Model ${modelId} not found`);
  }
  if (beforeModelId === modelId) return;
  if (beforeModelId !== null && !models.some((model) => model.id === beforeModelId)) {
    throw new Error(`Model ${beforeModelId} not found`);
  }

  const source = models[sourceIndex];
  if (!source) return;
  const nextModels = models.filter((model) => model.id !== modelId);
  const targetIndex =
    beforeModelId === null
      ? nextModels.length
      : nextModels.findIndex((model) => model.id === beforeModelId);
  nextModels.splice(targetIndex, 0, source);
  if (nextModels.every((model, index) => model.id === models[index]?.id)) return;
  await saveAIModels(nextModels, permit);
}

async function saveDefaultModel(defaultModelId: string | null): Promise<void> {
  if (defaultModelId) {
    const models = await loadAIModels();
    if (
      !models.some((model) => model.id === defaultModelId && getAIModelOperation(model) === 'text')
    ) {
      throw new Error(`Default AI model ${defaultModelId} not found`);
    }
  }
  await saveDefaultModelId(defaultModelId);
}

type ModelGraphCommand = Extract<
  AISettingsMutationCommand,
  {
    operation: 'add-model' | 'update-model' | 'delete-model' | 'move-model';
  }
>;
function isModelGraphCommand(command: AISettingsMutationCommand): command is ModelGraphCommand {
  return (
    command.operation === 'add-model' ||
    command.operation === 'update-model' ||
    command.operation === 'delete-model' ||
    command.operation === 'move-model'
  );
}
async function applyModelGraphMutation(
  command: ModelGraphCommand,
  permit: PersistenceMutationPermit
): Promise<void> {
  switch (command.operation) {
    case 'add-model':
      return addModel(command.model, permit);
    case 'update-model':
      return updateModel(command.model, permit);
    case 'delete-model':
      return deleteModel(command.modelId, permit);
    case 'move-model':
      return moveModel(command.modelId, command.beforeModelId, permit);
  }
}
async function mutateModelGraph(command: ModelGraphCommand): Promise<void> {
  await runWithAtomicPersistenceMutationPermit(async (permit) => {
    const state = await browserStorage.local.get([
      AI_STORAGE_VERSION_KEY,
      AI_STORAGE_RESET_PHASE_KEY,
    ]);
    if (
      state[AI_STORAGE_VERSION_KEY] !== AI_STORAGE_VERSION ||
      state[AI_STORAGE_RESET_PHASE_KEY] !== undefined
    )
      throw new Error('AI settings are not ready for model publication');
    await assertAISettingsGraphInvariants();
    await applyModelGraphMutation(command, permit);
    await assertAISettingsGraphInvariants();
  });
}

async function applyAISettingsMutation(
  command: Exclude<AISettingsMutationCommand, ModelGraphCommand>
): Promise<void> {
  switch (command.operation) {
    case 'remember-scenario-selection':
      return runWithExclusivePersistenceMutationPermit((permit) =>
        rememberAIScenarioSelection(command.selection, Date.now(), permit)
      );
    case 'set-provider-enabled':
      return runWithExclusivePersistenceMutationPermit((permit) =>
        setStoredAIProviderEnabled(command, permit)
      );
    case 'add-provider':
      return addProvider(command);
    case 'update-provider':
      return updateProvider(command);
    case 'clear-provider-secret':
      return clearProviderSecret(command.providerId);
    case 'delete-provider':
      return deleteAIProviderGraphRecord(command.providerId);
    case 'save-default-model':
      return saveDefaultModel(command.defaultModelId);
    case 'save-voice-input-correction-prompt':
      return saveVoiceInputCorrectionSystemPrompt(command.prompt);
    case 'reset-voice-input-correction-prompt':
      return resetVoiceInputCorrectionSystemPrompt();
    case 'save-audio-transcription-prompt':
      return saveAudioTranscriptionSystemPrompt(command.prompt);
    case 'reset-audio-transcription-prompt':
      return resetAudioTranscriptionSystemPrompt();
    case 'save-global-prompt':
      return saveGlobalSystemPrompt(command.prompt);
    case 'save-scenario-editor-prompt':
      return saveScenarioEditorSystemPrompt(command.prompt);
    case 'reset-global-prompt':
      return resetGlobalSystemPrompt();
    case 'reset-scenario-editor-prompt':
      return resetScenarioEditorSystemPrompt();
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
  const transition =
    command.operation === 'save-voice-input-correction-prompt' ||
    command.operation === 'reset-voice-input-correction-prompt'
      ? acquirePersistenceMutationTransition()
      : null;
  // Admission starts before queueing; observe failure even while an earlier command is pending.
  void transition?.catch(() => undefined);
  return queueAISettingsMutation(async () => {
    const lease = await transition;
    try {
      await initializeAiStorageAccess();
      if (isModelGraphCommand(command)) {
        await mutateModelGraph(command);
        return;
      }
      await assertAISettingsGraphInvariants();
      await applyAISettingsMutation(command);
      await assertAISettingsGraphInvariants();
    } finally {
      await lease?.release();
    }
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

/** Admit metadata fetch through the same queue as user settings mutations; fetch runs outside it. */
export function admitStoredAICatalogRefresh(
  providerId: string,
  explicit: boolean,
  now = Date.now()
) {
  return queueAISettingsMutation(async () => {
    await initializeAiStorageAccess();
    return runWithExclusivePersistenceMutationPermit((permit) =>
      admitCatalogRefresh(providerId, explicit, now, permit)
    );
  });
}

/** Commit one admitted metadata result without replaying a failed network request. */
export function commitStoredAICatalogRefresh(
  token: AICatalogRefreshToken,
  outcome: AICatalogRefreshOutcome,
  now = Date.now()
): Promise<boolean> {
  return queueAISettingsMutation(() =>
    runWithExclusivePersistenceMutationPermit((permit) =>
      commitCatalogRefresh(token, outcome, now, permit)
    )
  );
}
