import type { AIProvider } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecretEnvelope,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import { parseStoredAIProviders, parseStoredProviderSecretMap } from './guards';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
} from './constants';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { removeTransparentKeyIfUnused } from './provider-secret-keys.store.ts';
import {
  createAIProviderSecretAdditionalData,
  hasAIProviderSecretBindingChanged,
} from './provider-secret-binding';
import {
  readPlaintextProviderSecretFromState,
  readProviderSecretKeyState,
  type AIProviderSecretReadState,
} from './provider-secret-read-state';
import {
  createProviderSecretUpsertPlan,
  type AIProviderUpsertInput,
} from './provider-secret-upsert-plan';
import {
  warnAboutInvalidAiStorageEntries,
  warnAboutInvalidAiStoragePayload,
} from './warning-helpers';

const logger = createLogger({ namespace: 'SharedAiStorage' });

export type { AIProviderUpsertInput } from './provider-secret-upsert-plan';

export class AIProviderTransferRollbackError extends Error {}

export interface AIProviderTransferMutationPlan {
  readonly clearedProviderIds: string[];
  readonly missingProviderIds: string[];
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export async function prepareAIProviderTransferMutation(args: {
  importedProviders: readonly AIProvider[];
  permit?: PersistenceMutationPermit;
}): Promise<AIProviderTransferMutationPlan> {
  const keys = [
    AI_PROVIDERS_KEY,
    AI_PROVIDER_SECRETS_KEY,
    AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  ] as const;
  const before = await browserStorage.local.get([...keys]);
  const parsedProviders = parseStoredAIProviders(before[AI_PROVIDERS_KEY]);
  const currentProviders = parsedProviders.value;
  const currentSecrets = parseStoredProviderSecretMap(before[AI_PROVIDER_SECRETS_KEY]) ?? {};
  const clearedProviderIds: string[] = [];
  const missingProviderIds: string[] = [];
  const nextProviders = args.importedProviders.map((imported) => {
    const current = currentProviders.find((provider) => provider.id === imported.id);
    const bindingMatches = current ? !hasAIProviderSecretBindingChanged(current, imported) : false;
    const preservesSecret = Boolean(
      current?.hasStoredApiKey && bindingMatches && currentSecrets[imported.id]
    );
    if (current?.hasStoredApiKey && !preservesSecret) clearedProviderIds.push(current.id);
    if (!preservesSecret) missingProviderIds.push(imported.id);
    return {
      ...imported,
      hasStoredApiKey: preservesSecret,
    };
  });
  const nextProviderIds = new Set(nextProviders.map((provider) => provider.id));
  for (const current of currentProviders) {
    if (current.hasStoredApiKey && !nextProviderIds.has(current.id))
      clearedProviderIds.push(current.id);
  }
  const retainedSecretIds = new Set(
    nextProviders.filter((provider) => provider.hasStoredApiKey).map((provider) => provider.id)
  );
  for (const secretId of Object.keys(currentSecrets)) {
    if (!retainedSecretIds.has(secretId)) clearedProviderIds.push(secretId);
  }
  const nextSecrets = Object.fromEntries(
    Object.entries(currentSecrets).filter(([providerId]) => retainedSecretIds.has(providerId))
  );
  const next = {
    [AI_PROVIDERS_KEY]: nextProviders,
    [AI_PROVIDER_SECRETS_KEY]: nextSecrets,
  };
  const restore = async () => {
    const present = Object.fromEntries(
      keys.filter((key) => key in before).map((key) => [key, before[key]])
    );
    const missing = keys.filter((key) => !(key in before));
    if (Object.keys(present).length > 0) await browserStorage.local.set(present, args.permit);
    if (missing.length > 0) await browserStorage.local.remove([...missing], args.permit);
    const verified = await browserStorage.local.get([...keys]);
    if (JSON.stringify(verified) !== JSON.stringify(present)) {
      throw new AIProviderTransferRollbackError(
        'AI provider transfer rollback verification failed'
      );
    }
  };
  return {
    clearedProviderIds: [...new Set(clearedProviderIds)],
    missingProviderIds: [...new Set(missingProviderIds)],
    async commit() {
      try {
        await browserStorage.local.set(next, args.permit);
        await removeTransparentKeyIfUnused(Object.keys(nextSecrets).length, args.permit);
      } catch (error) {
        try {
          await restore();
        } catch {
          throw new AIProviderTransferRollbackError('AI provider transfer rollback failed');
        }
        throw error;
      }
    },
    rollback: restore,
  };
}

export async function readStoredProviderMetadata(): Promise<AIProvider[]> {
  const result = await browserStorage.local.get([AI_PROVIDERS_KEY]);
  const parsedProviders = parseStoredAIProviders(result[AI_PROVIDERS_KEY]);

  warnAboutInvalidAiStorageEntries({
    logger,
    storageKey: AI_PROVIDERS_KEY,
    invalidEntryCount: parsedProviders.invalidEntryCount,
    hasInvalidRoot: parsedProviders.hasInvalidRoot,
  });

  return parsedProviders.value;
}

export async function readStoredProviderSecrets(): Promise<
  Record<string, EncryptedSecretEnvelope>
> {
  const result = await browserStorage.local.get([AI_PROVIDER_SECRETS_KEY]);
  const parsedSecrets = parseStoredProviderSecretMap(result[AI_PROVIDER_SECRETS_KEY]);

  if (parsedSecrets) {
    return parsedSecrets;
  }

  if (result[AI_PROVIDER_SECRETS_KEY] !== undefined) {
    warnAboutInvalidAiStoragePayload({
      logger,
      storageKey: AI_PROVIDER_SECRETS_KEY,
      message: 'Ignoring invalid AI provider secrets payload root',
    });
  }

  return {};
}

export async function loadStoredAIProviders(): Promise<AIProvider[]> {
  return readStoredProviderMetadata();
}

export async function saveStoredAIProviders(providers: AIProvider[]): Promise<void> {
  await browserStorage.local.set({
    [AI_PROVIDERS_KEY]: providers,
  });

  logger.info(`AI providers saved: ${providers.length}`);
}

export async function upsertStoredAIProviderRecord(input: AIProviderUpsertInput): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const previousProvider = providers.find((provider) => provider.id === input.id);
  const plan = await createProviderSecretUpsertPlan({ input, previousProvider, secrets });

  const nextProviders = previousProvider
    ? providers.map((provider) => (provider.id === input.id ? plan.nextProvider : provider))
    : [...providers, plan.nextProvider];

  const payload: Record<string, unknown> = {
    [AI_PROVIDERS_KEY]: nextProviders,
    [AI_PROVIDER_SECRETS_KEY]: plan.nextSecrets,
  };

  if (plan.nextKeyMaterial) {
    payload[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = plan.nextKeyMaterial;
  }

  await browserStorage.local.set(payload);
  if (plan.remainingSecretCountAfterRemoval !== undefined) {
    await removeTransparentKeyIfUnused(plan.remainingSecretCountAfterRemoval);
  }
}

export async function deleteStoredAIProviderRecord(providerId: string): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const nextProviders = providers.filter((provider) => provider.id !== providerId);
  const removal = createProviderSecretRemovalPayload({ nextProviders, providerId, secrets });

  await browserStorage.local.set(removal.payload);
  await removeTransparentKeyIfUnused(removal.remainingSecretCount);
}

export async function clearStoredAIProviderSecret(providerId: string): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const nextProviders = providers.map((provider) =>
    provider.id === providerId ? { ...provider, hasStoredApiKey: false } : provider
  );
  const removal = createProviderSecretRemovalPayload({ nextProviders, providerId, secrets });

  await browserStorage.local.set(removal.payload);
  await removeTransparentKeyIfUnused(removal.remainingSecretCount);
}

function createProviderSecretRemovalPayload({
  nextProviders,
  providerId,
  secrets,
}: {
  nextProviders: AIProvider[];
  providerId: string;
  secrets: Record<string, EncryptedSecretEnvelope>;
}) {
  const { [providerId]: _removedSecret, ...remainingSecrets } = secrets;

  return {
    payload: {
      [AI_PROVIDERS_KEY]: nextProviders,
      [AI_PROVIDER_SECRETS_KEY]: remainingSecrets,
    },
    remainingSecretCount: Object.keys(remainingSecrets).length,
  };
}

export async function readStoredAIProviderSecretState(
  providerId: string
): Promise<AIProviderSecretReadState> {
  const providers = await readStoredProviderMetadata();
  const provider = providers.find((current) => current.id === providerId);
  if (!provider) {
    return { status: 'missing' };
  }

  return readStoredAIProviderSecretStateForProvider(provider);
}

export async function readStoredAIProviderSecretStateForProvider(
  provider: AIProvider
): Promise<AIProviderSecretReadState> {
  const secretMap = await readStoredProviderSecrets();
  const envelope = secretMap[provider.id];

  if (!envelope || !isEncryptedSecretEnvelope(envelope)) {
    return { status: 'missing' };
  }

  const keyState = await readProviderSecretKeyState();
  if (keyState.status !== 'ok') {
    return keyState;
  }

  try {
    const additionalData = createAIProviderSecretAdditionalData(provider);
    return { status: 'ok', secret: await decryptSecret(envelope, keyState.key, additionalData) };
  } catch (error) {
    return { status: 'corrupt', error };
  }
}

export async function activateStoredAIProviderSecretForUse(
  provider: AIProvider
): Promise<string | null> {
  const secretMap = await readStoredProviderSecrets();
  const envelope = secretMap[provider.id];
  const state = await readStoredAIProviderSecretStateForProvider(provider);

  if (state.status === 'ok' && envelope?.version === 1) {
    await rewriteLegacyProviderSecretEnvelope(provider, secretMap, state.secret);
  }

  return readPlaintextProviderSecretFromState(provider.id, state);
}

async function rewriteLegacyProviderSecretEnvelope(
  provider: AIProvider,
  secretMap: Record<string, EncryptedSecretEnvelope>,
  secret: string
): Promise<void> {
  const keyState = await readProviderSecretKeyState();
  if (keyState.status !== 'ok') {
    return;
  }

  await browserStorage.local.set({
    [AI_PROVIDER_SECRETS_KEY]: {
      ...secretMap,
      [provider.id]: await encryptSecret(
        secret,
        keyState.key,
        createAIProviderSecretAdditionalData(provider)
      ),
    },
  });
}

export async function loadStoredAIProviderSecret(providerId: string): Promise<string | null> {
  const state = await readStoredAIProviderSecretState(providerId);
  return readPlaintextProviderSecretFromState(providerId, state);
}
