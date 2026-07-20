import { browserStorage } from '../infrastructure/browser-storage';
import {
  createAesGcmKeyMaterial,
  importAesGcmKey,
} from '@sniptale/platform/security/local-secret-crypto';
import { AI_LOCAL_SECRET_KEY_STORAGE_KEY } from './constants';
import {
  AISecretPassphraseLockedError,
  readStoredAISecretProtection,
  readUnlockedAISecretPassphraseKey,
} from './secret-protection.store.ts';

export async function readStoredSecretKeyMaterial(): Promise<string | null> {
  const result = await browserStorage.local.get([AI_LOCAL_SECRET_KEY_STORAGE_KEY]);
  const stored = result[AI_LOCAL_SECRET_KEY_STORAGE_KEY];
  return typeof stored === 'string' && stored.length > 0 ? stored : null;
}

export async function resolveSecretKey(
  nextKeyMaterial?: string
): Promise<{ created: boolean; key: CryptoKey; material: string }> {
  if (nextKeyMaterial) {
    return {
      created: false,
      key: await importAesGcmKey(nextKeyMaterial),
      material: nextKeyMaterial,
    };
  }

  const storedKeyMaterial = await readStoredSecretKeyMaterial();
  if (storedKeyMaterial) {
    return {
      created: false,
      key: await importAesGcmKey(storedKeyMaterial),
      material: storedKeyMaterial,
    };
  }

  const createdKey = await createAesGcmKeyMaterial();
  return {
    created: true,
    key: createdKey.key,
    material: createdKey.material,
  };
}

export async function resolveProviderSecretKeyForWrite(): Promise<{
  key: CryptoKey;
  nextKeyMaterial?: string | undefined;
}> {
  const protection = await readStoredAISecretProtection();
  if (protection) {
    const key = await readUnlockedAISecretPassphraseKey();
    if (!key) {
      throw new AISecretPassphraseLockedError();
    }

    return { key };
  }

  const resolvedKey = await resolveSecretKey();
  return {
    key: resolvedKey.key,
    ...(resolvedKey.created ? { nextKeyMaterial: resolvedKey.material } : {}),
  };
}

export async function removeTransparentKeyIfUnused(secretCount: number): Promise<void> {
  if (secretCount > 0 || (await readStoredAISecretProtection())) {
    return;
  }

  await browserStorage.local.remove(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
}
