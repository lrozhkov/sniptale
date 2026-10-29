import { browserStorage } from '../infrastructure/browser-storage';
import {
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { recoverStoredAISecretPassphraseProtectionTransition } from './secret-protection-transition.store';
import { resetIncompatibleAISettings } from './alpha-reset';

let aiStoragePreparationPromise: Promise<void> | null = null;

export interface AiStorageReadiness {
  isReady: boolean;
  resetPhase: string | null;
  requiresReset: boolean;
  version: number | null;
}

/** Read readiness without reset, migration, credential activation, or other writes. */
export async function readAiStorageReadiness(): Promise<AiStorageReadiness> {
  const result = await browserStorage.local.get([
    AI_STORAGE_RESET_PHASE_KEY,
    AI_STORAGE_VERSION_KEY,
  ]);
  const version =
    typeof result[AI_STORAGE_VERSION_KEY] === 'number' ? result[AI_STORAGE_VERSION_KEY] : null;
  const resetPhase =
    typeof result[AI_STORAGE_RESET_PHASE_KEY] === 'string'
      ? result[AI_STORAGE_RESET_PHASE_KEY]
      : null;
  const isReady =
    version === AI_STORAGE_VERSION && result[AI_STORAGE_RESET_PHASE_KEY] === undefined;
  return { isReady, resetPhase, requiresReset: !isReady, version };
}

/** Explicit startup authority; concurrent callers share one preparation and failures remain retryable. */
export function initializeAiStorageAccess(): Promise<void> {
  if (aiStoragePreparationPromise) return aiStoragePreparationPromise;
  aiStoragePreparationPromise = readAiStorageReadiness()
    .then(async ({ isReady }) => {
      if (!isReady) await resetIncompatibleAISettings();
      await recoverStoredAISecretPassphraseProtectionTransition();
    })
    .catch((error) => {
      aiStoragePreparationPromise = null;
      throw error;
    });
  return aiStoragePreparationPromise;
}
