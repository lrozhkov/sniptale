import type { AIProvider } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  createAesGcmKeyMaterial,
  decryptSecret,
  encryptSecret,
  importAesGcmKey,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
} from './constants';
import {
  AISecretPassphraseLockedError,
  createAISecretPassphraseProtection,
  deriveAndVerifyAISecretPassphrase,
  lockStoredAISecretPassphrase,
  readAISecretProtectionStatus,
  readStoredAISecretProtection,
  readUnlockedAISecretPassphraseKey,
  unlockStoredAISecretPassphrase,
  cacheUnlockedAISecretPassphraseKey,
  type AISecretProtectionStatus,
  type StoredAISecretProtection,
} from './secret-protection.store.ts';
import { readStoredProviderMetadata, readStoredProviderSecrets } from './provider-secrets.store.ts';
import { readStoredSecretKeyMaterial } from './provider-secret-keys.store.ts';
import {
  beginStoredAISecretProtectionTransition,
  finishStoredAISecretProtectionTransitionCleanup,
} from './secret-protection-transition.store.ts';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';

export type { AISecretProtectionStatus } from './secret-protection.store.ts';

async function decryptStoredSecrets(
  secrets: Record<string, EncryptedSecretEnvelope>,
  key: CryptoKey,
  providers: readonly AIProvider[]
): Promise<Record<string, string>> {
  const entries: Array<[string, string]> = await Promise.all(
    Object.entries(secrets).map(async ([providerId, envelope]) => [
      providerId,
      await decryptSecret(
        envelope,
        key,
        createAIProviderSecretAdditionalData(resolveProviderForSecret(providers, providerId))
      ),
    ])
  );

  return Object.fromEntries(entries);
}

async function encryptPlaintextSecrets(
  secrets: Record<string, string>,
  key: CryptoKey,
  providers: readonly AIProvider[]
): Promise<Record<string, EncryptedSecretEnvelope>> {
  const entries: Array<[string, EncryptedSecretEnvelope]> = await Promise.all(
    Object.entries(secrets).map(async ([providerId, secret]) => [
      providerId,
      await encryptSecret(
        secret,
        key,
        createAIProviderSecretAdditionalData(resolveProviderForSecret(providers, providerId))
      ),
    ])
  );

  return Object.fromEntries(entries);
}

function resolveProviderForSecret(
  providers: readonly AIProvider[],
  providerId: string
): AIProvider {
  const provider = providers.find((current) => current.id === providerId);
  if (!provider) {
    throw new Error(`AI provider secret ${providerId} has no provider metadata`);
  }

  return provider;
}

function markProvidersMissingSecrets(providers: AIProvider[]): AIProvider[] {
  return providers.map((provider) => ({ ...provider, hasStoredApiKey: false }));
}

async function resolveExistingPassphraseProtectionKey(passphrase?: string): Promise<{
  key: CryptoKey;
  keyMaterial?: string | undefined;
  protection: StoredAISecretProtection;
}> {
  const protection = await readStoredAISecretProtection();
  if (!protection) {
    throw new Error('AI secret passphrase protection is not enabled');
  }

  if (passphrase !== undefined) {
    const derived = await deriveAndVerifyAISecretPassphrase(passphrase, protection);
    return {
      key: derived.key,
      keyMaterial: derived.keyMaterial,
      protection,
    };
  }

  const key = await readUnlockedAISecretPassphraseKey();
  if (!key) {
    throw new AISecretPassphraseLockedError();
  }

  return { key, protection };
}

export async function loadStoredAISecretProtectionStatus(): Promise<AISecretProtectionStatus> {
  return readAISecretProtectionStatus();
}

export async function unlockStoredAISecretProtection(passphrase: string): Promise<void> {
  await unlockStoredAISecretPassphrase(passphrase);
}

export async function lockStoredAISecretProtection(): Promise<void> {
  await lockStoredAISecretPassphrase();
}

export async function enableStoredAISecretPassphraseProtection(passphrase: string): Promise<void> {
  if (await readStoredAISecretProtection()) {
    throw new Error('AI secret passphrase protection is already enabled');
  }

  const [providers, secrets, keyMaterial] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
    readStoredSecretKeyMaterial(),
  ]);
  const hasSecrets = Object.keys(secrets).length > 0;
  if (hasSecrets && !keyMaterial) {
    throw new Error('Existing AI provider secrets are missing key material');
  }

  const plaintextSecrets =
    hasSecrets && keyMaterial
      ? await decryptStoredSecrets(secrets, await importAesGcmKey(keyMaterial), providers)
      : {};
  const passphraseProtection = await createAISecretPassphraseProtection(passphrase);
  const nextSecrets = await encryptPlaintextSecrets(
    plaintextSecrets,
    passphraseProtection.key,
    providers
  );

  await beginStoredAISecretProtectionTransition('pending-enable');
  await browserStorage.local.set({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
    [AI_PROVIDER_SECRETS_KEY]: nextSecrets,
    [AI_SECRET_PROTECTION_KEY]: passphraseProtection.protection,
  });
  await finishStoredAISecretProtectionTransitionCleanup(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
  await cacheUnlockedAISecretPassphraseKey(passphraseProtection.keyMaterial);
}

export async function disableStoredAISecretPassphraseProtection(
  passphrase?: string
): Promise<void> {
  const resolvedProtection = await resolveExistingPassphraseProtectionKey(passphrase);
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const plaintextSecrets = await decryptStoredSecrets(secrets, resolvedProtection.key, providers);
  const transparentKey = await createAesGcmKeyMaterial();
  const nextSecrets = await encryptPlaintextSecrets(
    plaintextSecrets,
    transparentKey.key,
    providers
  );

  await beginStoredAISecretProtectionTransition('pending-disable');
  await browserStorage.local.set({
    [AI_PROVIDER_SECRETS_KEY]: nextSecrets,
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: transparentKey.material,
    [AI_SECRET_PROTECTION_KEY]: null,
  });
  await lockStoredAISecretPassphrase();
  await finishStoredAISecretProtectionTransitionCleanup(AI_SECRET_PROTECTION_KEY);
}

export async function changeStoredAISecretPassphraseProtection(params: {
  currentPassphrase: string;
  nextPassphrase: string;
}): Promise<void> {
  const currentProtection = await resolveExistingPassphraseProtectionKey(params.currentPassphrase);
  const [providers, secrets] = await Promise.all([
    readStoredProviderMetadata(),
    readStoredProviderSecrets(),
  ]);
  const plaintextSecrets = await decryptStoredSecrets(secrets, currentProtection.key, providers);
  const nextProtection = await createAISecretPassphraseProtection(params.nextPassphrase);
  const nextSecrets = await encryptPlaintextSecrets(
    plaintextSecrets,
    nextProtection.key,
    providers
  );

  await browserStorage.local.set({
    [AI_PROVIDER_SECRETS_KEY]: nextSecrets,
    [AI_SECRET_PROTECTION_KEY]: {
      ...nextProtection.protection,
      enabledAt: currentProtection.protection.enabledAt,
    },
  });
  await browserStorage.local.remove(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
  await cacheUnlockedAISecretPassphraseKey(nextProtection.keyMaterial);
}

export async function resetStoredAISecretPassphraseProtection(): Promise<void> {
  const providers = await readStoredProviderMetadata();

  await beginStoredAISecretProtectionTransition('pending-reset');
  await browserStorage.local.set({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
    [AI_PROVIDERS_KEY]: markProvidersMissingSecrets(providers),
    [AI_PROVIDER_SECRETS_KEY]: {},
    [AI_SECRET_PROTECTION_KEY]: null,
  });
  await lockStoredAISecretPassphrase();
  await finishStoredAISecretProtectionTransitionCleanup([
    AI_SECRET_PROTECTION_KEY,
    AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  ]);
}
