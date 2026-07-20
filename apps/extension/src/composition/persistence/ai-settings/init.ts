import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { recoverStoredAISecretPassphraseProtectionTransition } from './secret-protection-transition.store.ts';
import { migrateAiProviderStorageToV3 } from './provider-secrets.migration.ts';

const logger = createLogger({ namespace: 'SharedAiStorage' });

let aiStoragePreparationPromise: Promise<void> | null = null;

async function readStorageInitializationState(): Promise<{
  migrationPhase: string | null;
  version: number | null;
}> {
  const result = await browserStorage.local.get([
    AI_STORAGE_MIGRATION_PHASE_KEY,
    AI_STORAGE_VERSION_KEY,
  ]);

  return {
    version:
      typeof result[AI_STORAGE_VERSION_KEY] === 'number' ? result[AI_STORAGE_VERSION_KEY] : null,
    migrationPhase:
      typeof result[AI_STORAGE_MIGRATION_PHASE_KEY] === 'string'
        ? result[AI_STORAGE_MIGRATION_PHASE_KEY]
        : null,
  };
}

export interface AiStorageReadiness {
  isReady: boolean;
  migrationPhase: string | null;
  requiresMigration: boolean;
  version: number | null;
}

export async function readAiStorageReadiness(): Promise<AiStorageReadiness> {
  const { migrationPhase, version } = await readStorageInitializationState();

  return {
    isReady: version === AI_STORAGE_VERSION,
    migrationPhase,
    requiresMigration: version !== AI_STORAGE_VERSION,
    version,
  };
}

export function initializeAiStorageAccess(): Promise<void> {
  if (aiStoragePreparationPromise) {
    return aiStoragePreparationPromise;
  }

  aiStoragePreparationPromise = readAiStorageReadiness()
    .then(({ isReady, migrationPhase }) => {
      if (isReady) {
        return recoverStoredAISecretPassphraseProtectionTransition();
      }

      if (migrationPhase === AI_PROVIDER_STORAGE_MIGRATION_PHASE) {
        logger.warn('Resuming pending AI storage migration during initialization', {
          phase: migrationPhase,
        });
      }

      return migrateAiProviderStorageToV3().then(() =>
        recoverStoredAISecretPassphraseProtectionTransition()
      );
    })
    .catch((error) => {
      aiStoragePreparationPromise = null;
      throw error;
    });

  return aiStoragePreparationPromise;
}
