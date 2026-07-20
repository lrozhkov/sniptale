import { browserStorage } from '../infrastructure/browser-storage';
import {
  createPbkdf2AesGcmKeyParams,
  decryptSecret,
  deriveAesGcmKeyMaterialFromPassphrase,
  encryptSecret,
  importAesGcmKey,
  isEncryptedSecretEnvelope,
  isPbkdf2AesGcmKeyParams,
  type EncryptedSecretEnvelope,
  type Pbkdf2AesGcmKeyParams,
} from '@sniptale/platform/security/local-secret-crypto';
import { AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY, AI_SECRET_PROTECTION_KEY } from './constants';
import { clearStoredAISecretUnlockRequests } from './secret-unlock-requests.store.ts';

const PASSPHRASE_PROTECTION_VERSION = 1;
const PASSPHRASE_VERIFIER_VALUE = 'sniptale-ai-secret-passphrase-v1';
let unlockedAISecretPassphraseKey: CryptoKey | null = null;

export class AISecretPassphraseLockedError extends Error {
  readonly reason = 'ai-secrets-locked' as const;

  constructor() {
    super('AI provider secrets are locked');
    this.name = 'AISecretPassphraseLockedError';
  }
}

export class AISecretInvalidPassphraseError extends Error {
  readonly reason = 'invalid-ai-secret-passphrase' as const;

  constructor() {
    super('Invalid AI secret passphrase');
    this.name = 'AISecretInvalidPassphraseError';
  }
}

export interface StoredAISecretProtection {
  version: 1;
  mode: 'passphrase';
  kdf: Pbkdf2AesGcmKeyParams;
  verifier: EncryptedSecretEnvelope;
  enabledAt: number;
  updatedAt: number;
}

export interface AISecretProtectionStatus {
  isEnabled: boolean;
  isUnlocked: boolean;
  mode: 'transparent' | 'passphrase';
}

export function isAISecretPassphraseLockedError(
  error: unknown
): error is AISecretPassphraseLockedError {
  return error instanceof AISecretPassphraseLockedError;
}

export function isAISecretInvalidPassphraseError(
  error: unknown
): error is AISecretInvalidPassphraseError {
  return error instanceof AISecretInvalidPassphraseError;
}

function isStoredAISecretProtection(value: unknown): value is StoredAISecretProtection {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as StoredAISecretProtection).version === PASSPHRASE_PROTECTION_VERSION &&
    (value as StoredAISecretProtection).mode === 'passphrase' &&
    isPbkdf2AesGcmKeyParams((value as StoredAISecretProtection).kdf) &&
    isEncryptedSecretEnvelope((value as StoredAISecretProtection).verifier) &&
    typeof (value as StoredAISecretProtection).enabledAt === 'number' &&
    typeof (value as StoredAISecretProtection).updatedAt === 'number'
  );
}

async function removeStoredPassphraseSessionKeyMaterial(): Promise<void> {
  await browserStorage.session.remove(AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY);
}

export async function readStoredAISecretProtection(): Promise<StoredAISecretProtection | null> {
  const result = await browserStorage.local.get([AI_SECRET_PROTECTION_KEY]);
  const stored = result[AI_SECRET_PROTECTION_KEY];
  return isStoredAISecretProtection(stored) ? stored : null;
}

export async function readAISecretProtectionStatus(): Promise<AISecretProtectionStatus> {
  const protection = await readStoredAISecretProtection();
  if (!protection) {
    return { isEnabled: false, isUnlocked: true, mode: 'transparent' };
  }

  return {
    isEnabled: true,
    isUnlocked: unlockedAISecretPassphraseKey !== null,
    mode: 'passphrase',
  };
}

export async function createAISecretPassphraseProtection(passphrase: string): Promise<{
  key: CryptoKey;
  keyMaterial: string;
  protection: StoredAISecretProtection;
}> {
  const kdf = createPbkdf2AesGcmKeyParams();
  const derived = await deriveAesGcmKeyMaterialFromPassphrase(passphrase, kdf);
  const now = Date.now();

  return {
    key: derived.key,
    keyMaterial: derived.material,
    protection: {
      version: PASSPHRASE_PROTECTION_VERSION,
      mode: 'passphrase',
      kdf,
      verifier: await encryptSecret(PASSPHRASE_VERIFIER_VALUE, derived.key),
      enabledAt: now,
      updatedAt: now,
    },
  };
}

export async function deriveAndVerifyAISecretPassphrase(
  passphrase: string,
  protection: StoredAISecretProtection
): Promise<{ key: CryptoKey; keyMaterial: string }> {
  const derived = await deriveAesGcmKeyMaterialFromPassphrase(passphrase, protection.kdf);
  let verifier: string;
  try {
    verifier = await decryptSecret(protection.verifier, derived.key);
  } catch {
    throw new AISecretInvalidPassphraseError();
  }
  if (verifier !== PASSPHRASE_VERIFIER_VALUE) {
    throw new AISecretInvalidPassphraseError();
  }

  return {
    key: derived.key,
    keyMaterial: derived.material,
  };
}

export async function readUnlockedAISecretPassphraseKey(): Promise<CryptoKey | null> {
  return unlockedAISecretPassphraseKey;
}

export async function unlockStoredAISecretPassphrase(passphrase: string): Promise<void> {
  unlockedAISecretPassphraseKey = null;
  await removeStoredPassphraseSessionKeyMaterial();
  const protection = await readStoredAISecretProtection();
  if (!protection) {
    return;
  }

  const derived = await deriveAndVerifyAISecretPassphrase(passphrase, protection);
  unlockedAISecretPassphraseKey = derived.key;
}

export async function cacheUnlockedAISecretPassphraseKey(material: string): Promise<void> {
  unlockedAISecretPassphraseKey = await importAesGcmKey(material);
  await removeStoredPassphraseSessionKeyMaterial();
}

export async function lockStoredAISecretPassphrase(): Promise<void> {
  unlockedAISecretPassphraseKey = null;
  await Promise.all([
    removeStoredPassphraseSessionKeyMaterial(),
    clearStoredAISecretUnlockRequests(),
  ]);
}

export async function removeStoredAISecretProtection(): Promise<void> {
  unlockedAISecretPassphraseKey = null;
  await Promise.all([
    browserStorage.local.remove(AI_SECRET_PROTECTION_KEY),
    removeStoredPassphraseSessionKeyMaterial(),
    clearStoredAISecretUnlockRequests(),
  ]);
}
