import type { AIProvider } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  encryptSecret,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import {
  cloneLegacyAiSettings,
  parseLegacyStoredAIProviders,
  parseStoredAIProviders,
  parseStoredProviderSecretMap,
} from './guards';
import {
  AI_DEFAULT_MODEL_KEY,
  AI_GLOBAL_PROMPT_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_SCENARIO_EDITOR_PROMPT_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
  LEGACY_AI_MASTER_KEY_STORAGE_KEY,
  LEGACY_AI_SETTINGS_STORAGE_KEY,
} from './constants';
import { resolveSecretKey } from './provider-secret-keys.store.ts';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';
import {
  warnAboutInvalidAiStorageEntries,
  warnAboutInvalidAiStoragePayload,
} from './warning-helpers';

const logger = createLogger({ namespace: 'SharedAiStorage' });

async function stripLegacyAiSettings(): Promise<void> {
  const result = await browserStorage.sync.get([LEGACY_AI_SETTINGS_STORAGE_KEY]);
  const nextSettings = cloneLegacyAiSettings(result[LEGACY_AI_SETTINGS_STORAGE_KEY]);

  if (!nextSettings) {
    return;
  }

  let didChange = false;

  for (const legacyKey of ['apiBaseUrl', 'apiKey', 'modelName'] as const) {
    if (legacyKey in nextSettings) {
      delete nextSettings[legacyKey];
      didChange = true;
    }
  }

  if (didChange) {
    await browserStorage.sync.set({
      [LEGACY_AI_SETTINGS_STORAGE_KEY]: nextSettings,
    });
  }
}

function mapLegacyProvidersToMetadata(
  providers: ReturnType<typeof parseLegacyStoredAIProviders>['value']
): AIProvider[] {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    connectionType: provider.connectionType,
    baseUrl: provider.baseUrl,
    hasStoredApiKey: provider.apiKey.length > 0,
    createdAt: provider.createdAt,
  }));
}

async function buildLegacyProviderSecrets(
  providers: ReturnType<typeof parseLegacyStoredAIProviders>['value'],
  key: CryptoKey
): Promise<Record<string, EncryptedSecretEnvelope>> {
  const entries = await Promise.all(
    providers
      .filter((provider) => provider.apiKey.length > 0)
      .map(
        async (provider) =>
          [
            provider.id,
            await encryptSecret(
              provider.apiKey,
              key,
              createAIProviderSecretAdditionalData(provider)
            ),
          ] as const
      )
  );

  return Object.fromEntries(entries);
}

function resolveStoredKeyMaterial(result: Record<string, unknown>): string | undefined {
  return typeof result[AI_LOCAL_SECRET_KEY_STORAGE_KEY] === 'string' &&
    result[AI_LOCAL_SECRET_KEY_STORAGE_KEY].length > 0
    ? result[AI_LOCAL_SECRET_KEY_STORAGE_KEY]
    : undefined;
}

async function resolveMigratedProviders(params: {
  legacyProviders: ReturnType<typeof parseLegacyStoredAIProviders>;
  nextKeyMaterial: string | undefined;
  nextProviderSecrets: Record<string, EncryptedSecretEnvelope>;
  storedProviders: ReturnType<typeof parseStoredAIProviders>;
}): Promise<{
  nextKeyMaterial: string | undefined;
  nextProviderSecrets: Record<string, EncryptedSecretEnvelope>;
  nextProviders: AIProvider[];
}> {
  if (!params.storedProviders.hasInvalidRoot && params.storedProviders.invalidEntryCount === 0) {
    return {
      nextProviders: params.storedProviders.value,
      nextProviderSecrets: params.nextProviderSecrets,
      nextKeyMaterial: params.nextKeyMaterial,
    };
  }

  warnAboutInvalidAiStorageEntries({
    logger,
    storageKey: AI_PROVIDERS_KEY,
    invalidEntryCount: params.legacyProviders.invalidEntryCount,
    hasInvalidRoot: params.legacyProviders.hasInvalidRoot,
  });

  let nextKeyMaterial = params.nextKeyMaterial;
  let nextProviderSecrets = params.nextProviderSecrets;
  const nextProviders = mapLegacyProvidersToMetadata(params.legacyProviders.value);

  if (params.legacyProviders.value.some((provider) => provider.apiKey.length > 0)) {
    const resolvedKey = await resolveSecretKey(nextKeyMaterial);
    nextKeyMaterial = resolvedKey.material;

    if (Object.keys(nextProviderSecrets).length === 0) {
      nextProviderSecrets = await buildLegacyProviderSecrets(
        params.legacyProviders.value,
        resolvedKey.key
      );
    }
  }

  return { nextProviders, nextProviderSecrets, nextKeyMaterial };
}

function warnAboutInvalidSecretPayload(
  result: Record<string, unknown>,
  parsedSecrets: Record<string, EncryptedSecretEnvelope> | null
): void {
  if (result[AI_PROVIDER_SECRETS_KEY] !== undefined && !parsedSecrets) {
    warnAboutInvalidAiStoragePayload({
      logger,
      storageKey: AI_PROVIDER_SECRETS_KEY,
      message: 'Ignoring invalid AI provider secrets payload root',
    });
  }
}

function buildMigrationPayload(params: {
  nextKeyMaterial: string | undefined;
  nextProviderSecrets: Record<string, EncryptedSecretEnvelope>;
  nextProviders: AIProvider[];
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [AI_PROVIDERS_KEY]: params.nextProviders,
    [AI_PROVIDER_SECRETS_KEY]: params.nextProviderSecrets,
  };

  if (params.nextKeyMaterial) {
    payload[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = params.nextKeyMaterial;
  }

  return payload;
}

async function markAiProviderMigrationStarted(): Promise<void> {
  await browserStorage.local.set({
    [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  });
}

async function clearAiProviderMigrationPhase(): Promise<void> {
  await browserStorage.local.remove([AI_STORAGE_MIGRATION_PHASE_KEY]);
}

async function finalizeAiProviderMigration(payload: Record<string, unknown>): Promise<void> {
  await markAiProviderMigrationStarted();
  await browserStorage.local.set(payload);
  await stripLegacyAiSettings();
  await browserStorage.sync.remove([
    AI_DEFAULT_MODEL_KEY,
    AI_GLOBAL_PROMPT_KEY,
    AI_SCENARIO_EDITOR_PROMPT_KEY,
  ]);
  await browserStorage.local.remove([LEGACY_AI_MASTER_KEY_STORAGE_KEY]);
  await browserStorage.local.set({
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
  });
  await clearAiProviderMigrationPhase();

  logger.warn('AI storage migrated to v3 encrypted provider secrets');
}

export async function migrateAiProviderStorageToV3(): Promise<void> {
  const result = await browserStorage.local.get([
    AI_LOCAL_SECRET_KEY_STORAGE_KEY,
    AI_PROVIDERS_KEY,
    AI_PROVIDER_SECRETS_KEY,
    AI_STORAGE_MIGRATION_PHASE_KEY,
  ]);
  if (result[AI_STORAGE_MIGRATION_PHASE_KEY] === AI_PROVIDER_STORAGE_MIGRATION_PHASE) {
    logger.warn('Resuming interrupted AI provider secret migration', {
      phase: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
    });
  }

  const storedProviders = parseStoredAIProviders(result[AI_PROVIDERS_KEY]);
  const legacyProviders = parseLegacyStoredAIProviders(result[AI_PROVIDERS_KEY]);
  const parsedSecrets = parseStoredProviderSecretMap(result[AI_PROVIDER_SECRETS_KEY]);

  const migratedProviders = await resolveMigratedProviders({
    legacyProviders,
    nextKeyMaterial: resolveStoredKeyMaterial(result),
    nextProviderSecrets: parsedSecrets ?? {},
    storedProviders,
  });

  warnAboutInvalidSecretPayload(result, parsedSecrets);
  await finalizeAiProviderMigration(buildMigrationPayload(migratedProviders));
}
