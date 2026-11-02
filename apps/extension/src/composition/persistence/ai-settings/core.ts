import type { SecretProtectionAdmissionPermit } from '../secret-protection/model';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredAIModels, parseStoredChromeAiEnabled, parseStoredSystemPrompt } from './guards';
import {
  AI_AUDIO_TRANSCRIPTION_PROMPT_KEY,
  AI_VOICE_INPUT_CORRECTION_PROMPT_KEY,
  DEFAULT_VOICE_INPUT_CORRECTION_SYSTEM_PROMPT,
  DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT,
  AI_CHROME_ENABLED_KEY,
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
import type { SecretProtectionService, SecretProtectionStatus } from '../secret-protection/model';
import { readSecretProtectionProfile } from '../secret-protection/profile.store';
export type AISecretProtectionStatus = Pick<
  SecretProtectionStatus,
  'isEnabled' | 'isUnlocked' | 'mode'
>;

export type { AIProviderUpsertInput } from './provider-secrets.store.ts';
export {
  loadStoredAIProviderSecret as loadAIProviderSecret,
  loadStoredAIProviders as loadAIProviders,
};

const logger = createLogger({ namespace: 'SharedAiStorage' });

function saveLocalValue<T>(
  key: string,
  value: T,
  logMessage: string,
  permit?: PersistenceMutationPermit
): Promise<void> {
  const publication = isActivePersistenceMutationPermit(permit)
    ? browserStorage.local.set({ [key]: value }, permit)
    : browserStorage.local.set({ [key]: value });
  return publication.then(() => {
    logger.info(logMessage);
  });
}

export async function saveAIProviders(providers: AIProvider[]): Promise<void> {
  await initializeAiStorageAccess();
  return saveStoredAIProviders(providers);
}

export async function upsertAIProviderRecord(
  input: AIProviderUpsertInput,
  permit?: PersistenceMutationPermit,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  await initializeAiStorageAccess();
  return upsertStoredAIProviderRecord(input, permit, operationKey, admissionPermit);
}

export async function deleteAIProviderRecord(providerId: string): Promise<void> {
  await initializeAiStorageAccess();
  return deleteStoredAIProviderRecord(providerId);
}

export async function deleteAIProviderGraphRecord(
  providerId: string,
  permit?: PersistenceMutationPermit
): Promise<void> {
  await initializeAiStorageAccess();
  const [providers, secrets, models] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
    loadAIModels(),
  ]);
  const nextModels = models.filter((model) => model.providerId !== providerId);
  const { [providerId]: _removedSecret, ...remainingSecrets } = secrets;

  const payload = {
    [AI_MODELS_KEY]: nextModels,
    [AI_PROVIDERS_KEY]: providers.filter((provider) => provider.id !== providerId),
    [AI_PROVIDER_SECRETS_KEY]: remainingSecrets,
  };
  if (permit) await browserStorage.local.set(payload, permit);
  else await browserStorage.local.set(payload);
  await removeTransparentKeyIfUnused(Object.keys(remainingSecrets).length, permit);
}

export async function clearAIProviderSecret(
  providerId: string,
  permit?: PersistenceMutationPermit,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  await initializeAiStorageAccess();
  return clearStoredAIProviderSecret(providerId, permit, admissionPermit);
}

export async function loadAISecretProtectionStatus(
  service?: SecretProtectionService
): Promise<AISecretProtectionStatus> {
  if (service) return service.readStatus();
  const profile = await readSecretProtectionProfile();
  return {
    isEnabled: profile !== null,
    isUnlocked: profile === null,
    mode: profile ? 'passphrase' : 'transparent',
  };
}

function requireProtectionService(
  service: SecretProtectionService | undefined
): SecretProtectionService {
  if (!service) throw new Error('Shared secret protection service is required');
  return service;
}

export async function unlockAISecretProtection(
  passphrase: string,
  service?: SecretProtectionService
): Promise<void> {
  return requireProtectionService(service).unlock(passphrase);
}
export async function lockAISecretProtection(service?: SecretProtectionService): Promise<void> {
  return requireProtectionService(service).lock();
}
export async function enableAISecretPassphraseProtection(
  passphrase: string,
  service?: SecretProtectionService
): Promise<void> {
  return requireProtectionService(service).enable('ai', passphrase);
}
export async function disableAISecretPassphraseProtection(
  passphrase?: string,
  service?: SecretProtectionService
): Promise<void> {
  return requireProtectionService(service).disable('ai', passphrase);
}
export async function changeAISecretPassphraseProtection(
  params: {
    currentPassphrase: string;
    nextPassphrase: string;
  },
  service?: SecretProtectionService
): Promise<void> {
  return requireProtectionService(service).changePassphrase(params);
}
export async function resetAISecretPassphraseProtection(
  service?: SecretProtectionService
): Promise<void> {
  return requireProtectionService(service).reset();
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

/** Publishes model records with an active caller permit or admits an independent write. */
export async function saveAIModels(
  models: AIModel[],
  permit?: PersistenceMutationPermit
): Promise<void> {
  if (!isActivePersistenceMutationPermit(permit)) await initializeAiStorageAccess();
  return saveLocalValue(AI_MODELS_KEY, models, `AI models saved: ${models.length}`, permit);
}

export async function loadChromeAiEnabled(): Promise<boolean> {
  const result = await browserStorage.local.get([AI_CHROME_ENABLED_KEY]);
  return parseStoredChromeAiEnabled(result[AI_CHROME_ENABLED_KEY]);
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

export async function resetGlobalSystemPrompt(): Promise<void> {
  await initializeAiStorageAccess();
  await browserStorage.local.remove(AI_GLOBAL_PROMPT_KEY);
  logger.info('Global system prompt reset');
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

export async function resetScenarioEditorSystemPrompt(): Promise<void> {
  await initializeAiStorageAccess();
  await browserStorage.local.remove(AI_SCENARIO_EDITOR_PROMPT_KEY);
  logger.info('Scenario editor system prompt reset');
}

/** Reads bounded local user instructions without activating provider credentials. */
export async function loadAudioTranscriptionSystemPrompt(): Promise<string> {
  const result = await browserStorage.local.get([AI_AUDIO_TRANSCRIPTION_PROMPT_KEY]);
  const value = result[AI_AUDIO_TRANSCRIPTION_PROMPT_KEY];
  return typeof value === 'string' && value.length <= 10000
    ? value
    : DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT;
}
export async function saveAudioTranscriptionSystemPrompt(prompt: string): Promise<void> {
  if (prompt.length > 10000) throw new Error('Invalid transcription instructions');
  await initializeAiStorageAccess();
  return saveLocalValue(
    AI_AUDIO_TRANSCRIPTION_PROMPT_KEY,
    prompt,
    'Audio transcription instructions saved'
  );
}
export async function resetAudioTranscriptionSystemPrompt(): Promise<void> {
  await initializeAiStorageAccess();
  await browserStorage.local.remove(AI_AUDIO_TRANSCRIPTION_PROMPT_KEY);
  logger.info('Audio transcription instructions reset');
}

/** Reads local correction instructions without credentials or storage repair. */
export async function loadVoiceInputCorrectionSystemPrompt(): Promise<string> {
  const result = await browserStorage.local.get([AI_VOICE_INPUT_CORRECTION_PROMPT_KEY]);
  const value = result[AI_VOICE_INPUT_CORRECTION_PROMPT_KEY];
  return typeof value === 'string' && value.length <= 10000
    ? value
    : DEFAULT_VOICE_INPUT_CORRECTION_SYSTEM_PROMPT;
}

/** Saves bounded correction instructions through the existing local settings writer. */
export async function saveVoiceInputCorrectionSystemPrompt(prompt: string): Promise<void> {
  if (prompt.length > 10000) throw new Error('Invalid voice correction instructions');
  await initializeAiStorageAccess();
  return saveLocalValue(
    AI_VOICE_INPUT_CORRECTION_PROMPT_KEY,
    prompt,
    'Voice input correction instructions saved'
  );
}

/** Restores the default correction instructions by removing the local override. */
export async function resetVoiceInputCorrectionSystemPrompt(): Promise<void> {
  await initializeAiStorageAccess();
  await browserStorage.local.remove(AI_VOICE_INPUT_CORRECTION_PROMPT_KEY);
  logger.info('Voice input correction instructions reset');
}
