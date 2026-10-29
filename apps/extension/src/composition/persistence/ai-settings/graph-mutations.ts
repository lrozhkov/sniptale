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
import type { AIModel, AIProvider } from '../../../contracts/settings';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
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
  lockAISecretProtection,
  resetAudioTranscriptionSystemPrompt,
  saveAudioTranscriptionSystemPrompt,
  saveVoiceInputCorrectionSystemPrompt,
  resetVoiceInputCorrectionSystemPrompt,
  resetGlobalSystemPrompt,
  resetAISecretPassphraseProtection,
  resetScenarioEditorSystemPrompt,
  saveAIModels,
  saveChromeAiEnabled,
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
import {
  admitOperationObservation,
  commitOperationObservation,
  type AIOperationObservationBinding,
  type AIOperationObservationToken,
  type AIOperationObservationOutcome,
} from './operation-observations';
import { assertAISettingsGraphInvariants } from './graph-invariants';
import {
  AIModelProviderChangedError,
  type AISettingsMutationCommand,
} from './graph-mutation-types';

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

async function assertModelProviderExists(
  model: AIModel,
  providerIncarnation?: string
): Promise<AIProvider> {
  if (!isValidAIModelOperationConfiguration(model))
    throw new Error('Invalid AI model operation configuration');
  const providers = await loadAIProviders();
  const provider = providers.find((entry) => entry.id === model.providerId);
  if (!provider) {
    if (providerIncarnation !== undefined) throw new AIModelProviderChangedError();
    throw new Error(`Provider ${model.providerId} not found for model ${model.id}`);
  }
  if (providerIncarnation !== undefined && provider.incarnation !== providerIncarnation)
    throw new AIModelProviderChangedError();
  return provider;
}

async function addProvider(
  command: { provider: AIProviderUpsertInput },
  permit: PersistenceMutationPermit
): Promise<void> {
  const providers = await loadAIProviders();
  if (providers.some((provider) => provider.id === command.provider.id)) {
    throw new Error(`Provider ${command.provider.id} already exists`);
  }
  await upsertAIProviderRecord(command.provider, permit);
}

async function updateProvider(
  command: { provider: AIProviderUpsertInput },
  permit: PersistenceMutationPermit
): Promise<void> {
  const providers = await loadAIProviders();
  if (!providers.some((provider) => provider.id === command.provider.id)) {
    throw new Error(`Provider ${command.provider.id} not found`);
  }
  await upsertAIProviderRecord(command.provider, permit);
}

async function clearProviderSecret(
  providerId: string,
  permit: PersistenceMutationPermit
): Promise<void> {
  const providers = await loadAIProviders();
  if (!providers.some((provider) => provider.id === providerId)) {
    throw new Error(`Provider ${providerId} not found`);
  }
  await clearAIProviderSecret(providerId, permit);
}

async function resolveModelProperties(
  model: AIModel,
  models: readonly AIModel[],
  provider: AIProvider
): Promise<AIModel> {
  const {
    catalog: _submittedCatalog,
    operationObservations: _submittedObservations,
    ...configured
  } = model;
  const matches = models.filter(
    (entry) =>
      entry.providerId === model.providerId && entry.modelCode === model.modelCode && entry.catalog
  );
  const scope = matches.length ? await createAIProviderDestinationBinding(provider) : undefined;
  const current = matches.find((entry) => entry.catalog?.scope === scope)?.catalog;
  const provenance = current ?? matches.find((entry) => entry.id === model.id)?.catalog;
  if (
    model.propertySource === 'catalog' ||
    (model.propertySource === undefined && model.source === 'catalog')
  ) {
    if (!current || current.lifecycle === 'absent' || current.lifecycle === 'unknown')
      throw new Error('Current AI model catalog properties are unavailable');
    return {
      ...configured,
      propertySource: 'catalog',
      retirementOverride: false,
      displayName: current.displayName,
      capabilities: current.capabilities,
      catalog: current,
    };
  }
  return {
    ...configured,
    ...(model.propertySource === 'manual' ? { source: 'manual' as const } : {}),
    ...(provenance ? { catalog: provenance } : {}),
  };
}

async function addModel(
  model: AIModel,
  permit: PersistenceMutationPermit,
  providerIncarnation?: string
): Promise<void> {
  const provider = await assertModelProviderExists(model, providerIncarnation);
  const models = await loadAIModels();
  if (models.some((current) => current.id === model.id)) {
    throw new Error(`Model ${model.id} already exists`);
  }
  await saveAIModels([...models, await resolveModelProperties(model, models, provider)], permit);
}

async function updateModel(
  model: AIModel,
  permit: PersistenceMutationPermit,
  providerIncarnation?: string
): Promise<void> {
  const provider = await assertModelProviderExists(model, providerIncarnation);
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
  const {
    catalog: _catalog,
    capabilities: _capabilities,
    source: _source,
    propertySource: _propertySource,
    retirementOverride: _retirementOverride,
    ...changedIdentity
  } = previous;
  const sameIdentity =
    previous.providerId === model.providerId && previous.modelCode === model.modelCode;
  nextModels[index] = await resolveModelProperties(
    {
      ...(sameIdentity ? previous : changedIdentity),
      ...(getAIModelOperation(model) === 'text' && previousPrompt !== undefined
        ? { systemPrompt: previousPrompt }
        : {}),
      ...model,
    },
    models,
    provider
  );
  await saveAIModels(nextModels, permit);
}

async function deleteModel(modelId: string, permit: PersistenceMutationPermit): Promise<void> {
  const models = await loadAIModels();
  await saveAIModels(
    models.filter((model) => model.id !== modelId),
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

type GraphCommand = Extract<
  AISettingsMutationCommand,
  {
    operation:
      | 'add-model'
      | 'update-model'
      | 'delete-model'
      | 'move-model'
      | 'add-provider'
      | 'update-provider'
      | 'clear-provider-secret'
      | 'delete-provider';
  }
>;
function isGraphCommand(command: AISettingsMutationCommand): command is GraphCommand {
  return (
    command.operation === 'add-model' ||
    command.operation === 'update-model' ||
    command.operation === 'delete-model' ||
    command.operation === 'move-model' ||
    command.operation === 'add-provider' ||
    command.operation === 'update-provider' ||
    command.operation === 'clear-provider-secret' ||
    command.operation === 'delete-provider'
  );
}
async function applyGraphMutation(
  command: GraphCommand,
  permit: PersistenceMutationPermit
): Promise<void> {
  switch (command.operation) {
    case 'add-provider':
      return addProvider(command, permit);
    case 'update-provider':
      return updateProvider(command, permit);
    case 'clear-provider-secret':
      return clearProviderSecret(command.providerId, permit);
    case 'delete-provider':
      return deleteAIProviderGraphRecord(command.providerId, permit);
    case 'add-model':
      return addModel(command.model, permit, command.providerIncarnation);
    case 'update-model':
      return updateModel(command.model, permit, command.providerIncarnation);
    case 'delete-model':
      return deleteModel(command.modelId, permit);
    case 'move-model':
      return moveModel(command.modelId, command.beforeModelId, permit);
  }
}
async function mutateGraph(command: GraphCommand): Promise<void> {
  await runWithAtomicPersistenceMutationPermit(async (permit) => {
    const state = await browserStorage.local.get([
      AI_STORAGE_VERSION_KEY,
      AI_STORAGE_RESET_PHASE_KEY,
    ]);
    if (
      state[AI_STORAGE_VERSION_KEY] !== AI_STORAGE_VERSION ||
      state[AI_STORAGE_RESET_PHASE_KEY] !== undefined
    )
      throw new Error('AI settings are not ready for graph publication');
    await assertAISettingsGraphInvariants();
    await applyGraphMutation(command, permit);
    await assertAISettingsGraphInvariants();
  });
}

async function applyAISettingsMutation(
  command: Exclude<AISettingsMutationCommand, GraphCommand>
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
      if (isGraphCommand(command)) {
        await mutateGraph(command);
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

/** Admit advisory request metadata without initialization, secret activation or graph repair. */
export function admitStoredAIOperation(binding: AIOperationObservationBinding) {
  return queueAISettingsMutation(() =>
    runWithExclusivePersistenceMutationPermit((permit) =>
      admitOperationObservation(binding, permit)
    )
  );
}

/** Publish a bounded operation outcome after earlier graph mutations settle. */
export function commitStoredAIOperation(
  token: AIOperationObservationToken,
  outcome: AIOperationObservationOutcome,
  now = Date.now()
): Promise<boolean> {
  return queueAISettingsMutation(() =>
    runWithExclusivePersistenceMutationPermit((permit) =>
      commitOperationObservation(token, outcome, now, permit)
    )
  );
}
