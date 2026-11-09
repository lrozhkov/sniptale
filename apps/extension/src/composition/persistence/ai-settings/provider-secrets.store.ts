import { withSecretProtectionWriter } from '../secret-protection/service';
import type { SecretProtectionAdmissionPermit } from '../secret-protection/model';
import type { AIProvider } from '../../../contracts/settings';
import { selectSettingsTransferProviderMetadata } from '../../../contracts/settings-transfer/provider-metadata';
import { browserStorage, restoreSelectedStorageKeys } from '../infrastructure/browser-storage';
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
  AI_STORAGE_VERSION_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_RESET_PHASE_KEY,
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

async function performPrepareAIProviderTransferMutation(args: {
  importedProviders: readonly AIProvider[];
  permit?: PersistenceMutationPermit;
  admissionPermit?: SecretProtectionAdmissionPermit;
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
    const portable = selectSettingsTransferProviderMetadata(imported);
    const bindingMatches = current
      ? !hasAIProviderSecretBindingChanged(current, {
          ...portable,
          incarnation: current.incarnation,
        })
      : false;
    const revision = (current?.revision ?? 0) + 1;
    const nextProvider: AIProvider = {
      ...portable,
      management: portable.management ?? 'automatic',
      enabled: portable.enabled ?? true,
      incarnation:
        bindingMatches && current?.incarnation ? current.incarnation : crypto.randomUUID(),
      revision,
      credentialRevision: bindingMatches ? (current?.credentialRevision ?? 0) : 0,
      hasStoredApiKey: false,
      observation: { status: 'unverified', scope: 'credentials', checkedAt: Date.now(), revision },
    };
    const preservesSecret = Boolean(
      current?.hasStoredApiKey &&
      !hasAIProviderSecretBindingChanged(current, nextProvider) &&
      currentSecrets[imported.id]
    );
    if (current?.hasStoredApiKey && !preservesSecret) clearedProviderIds.push(current.id);
    if (!preservesSecret) missingProviderIds.push(imported.id);
    return {
      ...nextProvider,
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
  let committedState: Record<string, unknown> | null = null;
  const currentState = () => browserStorage.local.get([...keys]);
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  const restore = async () => {
    const current = await currentState();
    const withoutKey =
      committedState &&
      Object.fromEntries(
        Object.entries(committedState).filter(([key]) => key !== AI_LOCAL_SECRET_KEY_STORAGE_KEY)
      );
    const mayRestore =
      same(current, before) ||
      (committedState && same(current, committedState)) ||
      (Object.keys(nextSecrets).length === 0 && withoutKey && same(current, withoutKey));
    if (!mayRestore)
      throw new AIProviderTransferRollbackError('AI provider transfer rollback selection changed');
    if (!(await restoreSelectedStorageKeys(browserStorage.local, keys, before, args.permit))) {
      throw new AIProviderTransferRollbackError(
        'AI provider transfer rollback verification failed'
      );
    }
  };
  return {
    clearedProviderIds: [...new Set(clearedProviderIds)],
    missingProviderIds: [...new Set(missingProviderIds)],
    async commit() {
      return withSecretProtectionWriter(async () => {
        if (!same(await currentState(), before))
          throw new Error('AI provider transfer selection changed');
        try {
          // A failed atomic set can report an ambiguous acknowledgement. Retain only its exact intended target.
          committedState = { ...before, ...next };
          await browserStorage.local.set(next, args.permit);
          committedState = await currentState();
          await removeTransparentKeyIfUnused(Object.keys(nextSecrets).length, args.permit);
          committedState = await currentState();
        } catch (error) {
          try {
            await restore();
          } catch {
            throw new AIProviderTransferRollbackError('AI provider transfer rollback failed');
          }
          throw error;
        }
      }, args.admissionPermit);
    },
    rollback: () => withSecretProtectionWriter(restore, args.admissionPermit),
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

async function performSaveStoredAIProviders(providers: AIProvider[]): Promise<void> {
  await browserStorage.local.set({
    [AI_PROVIDERS_KEY]: providers,
  });

  logger.info(`AI providers saved: ${providers.length}`);
}

/** Patch only current metadata. A stale Settings page cannot replace connection fields or credentials. */
export async function setStoredAIProviderEnabled(
  command: { providerId: string; providerIncarnation: string; enabled: boolean },
  permit: PersistenceMutationPermit
): Promise<void> {
  const stored = await browserStorage.local.get([
    AI_PROVIDERS_KEY,
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
  ]);
  const parsed = parseStoredAIProviders(stored[AI_PROVIDERS_KEY]);
  const provider = parsed.value.find((entry) => entry.id === command.providerId);
  if (
    stored[AI_STORAGE_VERSION_KEY] !== AI_STORAGE_VERSION ||
    stored[AI_STORAGE_RESET_PHASE_KEY] !== undefined ||
    parsed.hasInvalidRoot ||
    parsed.invalidEntryCount > 0 ||
    !provider ||
    !provider.incarnation ||
    provider.incarnation !== command.providerIncarnation
  )
    throw new Error('AI provider unavailable');
  if ((provider.enabled !== false) === command.enabled) return;
  const next = { ...provider, enabled: command.enabled, revision: (provider.revision ?? 0) + 1 };
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: parsed.value.map((entry) => (entry.id === provider.id ? next : entry)),
    },
    permit
  );
}

async function performUpsertStoredAIProviderRecord(
  input: AIProviderUpsertInput,
  permit?: PersistenceMutationPermit,
  operationKey?: CryptoKey | null
): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const previousProvider = providers.find((provider) => provider.id === input.id);
  const plan = await createProviderSecretUpsertPlan({
    input,
    previousProvider,
    secrets,
    operationKey,
  });

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

  if (permit) await browserStorage.local.set(payload, permit);
  else await browserStorage.local.set(payload);
  if (plan.remainingSecretCountAfterRemoval !== undefined) {
    await removeTransparentKeyIfUnused(plan.remainingSecretCountAfterRemoval, permit);
  }
}

async function performDeleteStoredAIProviderRecord(providerId: string): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const nextProviders = providers.filter((provider) => provider.id !== providerId);
  const removal = createProviderSecretRemovalPayload({ nextProviders, providerId, secrets });

  await browserStorage.local.set(removal.payload);
  await removeTransparentKeyIfUnused(removal.remainingSecretCount);
}

async function performClearStoredAIProviderSecret(
  providerId: string,
  permit?: PersistenceMutationPermit
): Promise<void> {
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const nextProviders = providers.map((provider) =>
    provider.id === providerId
      ? {
          ...provider,
          hasStoredApiKey: false,
          revision: (provider.revision ?? 0) + 1,
          credentialRevision: (provider.credentialRevision ?? 0) + 1,
          observation: {
            status: 'unverified' as const,
            scope: 'credentials' as const,
            checkedAt: Date.now(),
            revision: (provider.revision ?? 0) + 1,
          },
        }
      : provider
  );
  const removal = createProviderSecretRemovalPayload({ nextProviders, providerId, secrets });

  if (permit) await browserStorage.local.set(removal.payload, permit);
  else await browserStorage.local.set(removal.payload);
  await removeTransparentKeyIfUnused(removal.remainingSecretCount, permit);
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

async function performReadStoredAIProviderSecretState(
  providerId: string,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<AIProviderSecretReadState> {
  const providers = await readStoredProviderMetadata();
  const provider = providers.find((current) => current.id === providerId);
  if (!provider) {
    return { status: 'missing' };
  }

  return readStoredAIProviderSecretStateForProvider(provider, operationKey, admissionPermit);
}

async function performReadStoredAIProviderSecretStateForProvider(
  provider: AIProvider,
  operationKey?: CryptoKey | null
): Promise<AIProviderSecretReadState> {
  const secretMap = await readStoredProviderSecrets();
  const envelope = secretMap[provider.id];

  if (!envelope || !isEncryptedSecretEnvelope(envelope)) {
    return { status: 'missing' };
  }

  const keyState = await readProviderSecretKeyState(operationKey);
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

async function performActivateStoredAIProviderSecretForUse(
  provider: AIProvider,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<string | null> {
  const secretMap = await readStoredProviderSecrets();
  const envelope = secretMap[provider.id];
  const state = await readStoredAIProviderSecretStateForProvider(
    provider,
    operationKey,
    admissionPermit
  );

  if (state.status === 'ok' && envelope?.version === 1) {
    await rewriteLegacyProviderSecretEnvelope(provider, secretMap, state.secret, operationKey);
  }

  return readPlaintextProviderSecretFromState(provider.id, state);
}

async function rewriteLegacyProviderSecretEnvelope(
  provider: AIProvider,
  secretMap: Record<string, EncryptedSecretEnvelope>,
  secret: string,
  operationKey?: CryptoKey | null
): Promise<void> {
  const keyState = await readProviderSecretKeyState(operationKey);
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

async function performLoadStoredAIProviderSecret(
  providerId: string,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<string | null> {
  const state = await readStoredAIProviderSecretState(providerId, operationKey, admissionPermit);
  return readPlaintextProviderSecretFromState(providerId, state);
}

export function saveStoredAIProviders(
  providers: AIProvider[],
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  return withSecretProtectionWriter(() => performSaveStoredAIProviders(providers), admissionPermit);
}
export function upsertStoredAIProviderRecord(
  input: AIProviderUpsertInput,
  permit?: PersistenceMutationPermit,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  return withSecretProtectionWriter(
    () => performUpsertStoredAIProviderRecord(input, permit, operationKey),
    admissionPermit
  );
}
export function deleteStoredAIProviderRecord(
  providerId: string,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  return withSecretProtectionWriter(
    () => performDeleteStoredAIProviderRecord(providerId),
    admissionPermit
  );
}
export function clearStoredAIProviderSecret(
  providerId: string,
  permit?: PersistenceMutationPermit,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<void> {
  return withSecretProtectionWriter(
    () => performClearStoredAIProviderSecret(providerId, permit),
    admissionPermit
  );
}
export function readStoredAIProviderSecretState(
  providerId: string,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<AIProviderSecretReadState> {
  return withSecretProtectionWriter(
    (checked) => performReadStoredAIProviderSecretState(providerId, operationKey, checked),
    admissionPermit
  );
}
export function readStoredAIProviderSecretStateForProvider(
  provider: AIProvider,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<AIProviderSecretReadState> {
  return withSecretProtectionWriter(
    () => performReadStoredAIProviderSecretStateForProvider(provider, operationKey),
    admissionPermit
  );
}
export function activateStoredAIProviderSecretForUse(
  provider: AIProvider,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<string | null> {
  return withSecretProtectionWriter(
    (checked) => performActivateStoredAIProviderSecretForUse(provider, operationKey, checked),
    admissionPermit
  );
}
export function loadStoredAIProviderSecret(
  providerId: string,
  operationKey?: CryptoKey | null,
  admissionPermit?: SecretProtectionAdmissionPermit
): Promise<string | null> {
  return withSecretProtectionWriter(
    (checked) => performLoadStoredAIProviderSecret(providerId, operationKey, checked),
    admissionPermit
  );
}

export function prepareAIProviderTransferMutation(args: {
  importedProviders: readonly AIProvider[];
  permit?: PersistenceMutationPermit;
  admissionPermit?: SecretProtectionAdmissionPermit;
}): Promise<AIProviderTransferMutationPlan> {
  return withSecretProtectionWriter(
    () => performPrepareAIProviderTransferMutation(args),
    args.admissionPermit
  );
}
