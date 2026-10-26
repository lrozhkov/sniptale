import { browserStorage } from '../infrastructure/browser-storage';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { resetVoiceInputModelReferences } from '../settings';
import { clearAISecretPassphraseMemory } from './secret-protection.store';
import {
  AI_CHROME_ENABLED_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
  AI_SETTINGS_RESET_NOTICE_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
  LEGACY_AI_MASTER_KEY_STORAGE_KEY,
} from './constants';

/** Replace incompatible AI settings. A durable marker makes interrupted resets safe to retry. */
export function resetIncompatibleAISettings(): Promise<void> {
  return runWithExclusivePersistenceMutationPermit(async (permit) => {
    const state = await browserStorage.local.get([
      AI_STORAGE_VERSION_KEY,
      AI_STORAGE_RESET_PHASE_KEY,
      AI_PROVIDERS_KEY,
      AI_MODELS_KEY,
      AI_SETTINGS_RESET_NOTICE_KEY,
    ]);
    if (
      state[AI_STORAGE_VERSION_KEY] === AI_STORAGE_VERSION &&
      state[AI_STORAGE_RESET_PHASE_KEY] === undefined
    )
      return;
    const hadConfiguration =
      state[AI_SETTINGS_RESET_NOTICE_KEY] === true ||
      state[AI_STORAGE_VERSION_KEY] !== undefined ||
      state[AI_PROVIDERS_KEY] !== undefined ||
      state[AI_MODELS_KEY] !== undefined;
    await browserStorage.local.set(
      {
        [AI_STORAGE_RESET_PHASE_KEY]: 'reset-ai-settings-v4',
        [AI_SETTINGS_RESET_NOTICE_KEY]: hadConfiguration,
      },
      permit
    );
    clearAISecretPassphraseMemory();
    await resetVoiceInputModelReferences(permit);
    await browserStorage.session.remove(
      [AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY, AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY],
      permit
    );
    await browserStorage.local.remove(
      [
        AI_DEFAULT_MODEL_KEY,
        AI_PROVIDER_SECRETS_KEY,
        AI_LOCAL_SECRET_KEY_STORAGE_KEY,
        AI_SECRET_PROTECTION_KEY,
        AI_SECRET_PROTECTION_TRANSITION_KEY,
        AI_STORAGE_MIGRATION_PHASE_KEY,
        LEGACY_AI_MASTER_KEY_STORAGE_KEY,
      ],
      permit
    );
    await browserStorage.local.set(
      {
        [AI_PROVIDERS_KEY]: [],
        [AI_MODELS_KEY]: [],
        [AI_SCENARIO_SELECTIONS_KEY]: {},
        [AI_CHROME_ENABLED_KEY]: false,
        [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      },
      permit
    );
    await browserStorage.local.remove(AI_STORAGE_RESET_PHASE_KEY, permit);
  });
}
