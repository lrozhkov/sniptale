import { readPreparedSecretProtectionControl } from '../secret-protection/transition.store';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  createAesGcmKeyMaterial,
  importAesGcmKey,
} from '@sniptale/platform/security/local-secret-crypto';
import { AI_LOCAL_SECRET_KEY_STORAGE_KEY } from './constants';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { SecretProtectionLockedError } from '../secret-protection/model';
import { AI_SECRET_PROTECTION_KEY, AI_SECRET_PROTECTION_TRANSITION_KEY } from './constants';

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

/** An explicit key belongs to one already-admitted common protection operation. */
export async function resolveProviderSecretKeyForWrite(operationKey?: CryptoKey | null): Promise<{
  key: CryptoKey;
  nextKeyMaterial?: string | undefined;
}> {
  if (operationKey) return { key: operationKey };
  if (operationKey === undefined) await assertUnprotectedLegacyAccess();
  const resolvedKey = await resolveSecretKey();
  return {
    key: resolvedKey.key,
    ...(resolvedKey.created ? { nextKeyMaterial: resolvedKey.material } : {}),
  };
}

/** Compatibility callers have no unlocked session authority. Refuse protected or unresolved data. */
export async function assertUnprotectedLegacyAccess(): Promise<void> {
  const [state, control] = await Promise.all([
    browserStorage.local.get([AI_SECRET_PROTECTION_KEY, AI_SECRET_PROTECTION_TRANSITION_KEY]),
    readPreparedSecretProtectionControl(),
  ]);
  if (
    state[AI_SECRET_PROTECTION_KEY] != null ||
    state[AI_SECRET_PROTECTION_TRANSITION_KEY] != null ||
    control?.phase === 'transitioning' ||
    control?.participants.ai
  )
    throw new SecretProtectionLockedError();
}

export async function removeTransparentKeyIfUnused(
  secretCount: number,
  permit?: PersistenceMutationPermit
): Promise<void> {
  if (secretCount > 0) {
    return;
  }

  if (permit) await browserStorage.local.remove(AI_LOCAL_SECRET_KEY_STORAGE_KEY, permit);
  else await browserStorage.local.remove(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
}
