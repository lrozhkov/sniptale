import { browserStorage } from '../infrastructure/browser-storage';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createPbkdf2AesGcmKeyParams,
  deriveAesGcmKeyMaterialFromPassphrase,
  encryptSecret,
  decryptSecret,
  isEncryptedSecretEnvelope,
  isPbkdf2AesGcmKeyParams,
} from '@sniptale/platform/security/local-secret-crypto';
import { SECRET_PROTECTION_PROFILE_KEY, LEGACY_SECRET_SESSION_KEY } from './constants';
import { SecretProtectionInvalidPassphraseError, type SecretProtectionProfile } from './model';

const VERIFIER = 'sniptale-ai-secret-passphrase-v1';
export function parseSecretProtectionProfile(value: unknown): SecretProtectionProfile | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    value['mode'] !== 'passphrase' ||
    !isPbkdf2AesGcmKeyParams(value['kdf']) ||
    !isEncryptedSecretEnvelope(value['verifier']) ||
    typeof value['enabledAt'] !== 'number' ||
    !Number.isFinite(value['enabledAt']) ||
    typeof value['updatedAt'] !== 'number' ||
    !Number.isFinite(value['updatedAt'])
  )
    throw new Error('Secret protection profile unavailable');
  return {
    version: 1,
    mode: 'passphrase',
    kdf: value['kdf'],
    verifier: value['verifier'],
    enabledAt: value['enabledAt'],
    updatedAt: value['updatedAt'],
  };
}
export async function readSecretProtectionProfile(): Promise<SecretProtectionProfile | null> {
  const value = await browserStorage.local.get(SECRET_PROTECTION_PROFILE_KEY);
  return parseSecretProtectionProfile(value[SECRET_PROTECTION_PROFILE_KEY]);
}
export async function writeSecretProtectionProfile(
  profile: SecretProtectionProfile | null
): Promise<void> {
  if (profile) await browserStorage.local.set({ [SECRET_PROTECTION_PROFILE_KEY]: profile });
  else await browserStorage.local.remove(SECRET_PROTECTION_PROFILE_KEY);
}
export async function createSecretProtectionProfile(
  passphrase: string
): Promise<{ key: CryptoKey; profile: SecretProtectionProfile }> {
  if (!passphrase.length || passphrase.length > 10000)
    throw new SecretProtectionInvalidPassphraseError();
  const kdf = createPbkdf2AesGcmKeyParams();
  const derived = await deriveAesGcmKeyMaterialFromPassphrase(passphrase, kdf);
  const now = Date.now();
  return {
    key: derived.key,
    profile: {
      version: 1,
      mode: 'passphrase',
      kdf,
      verifier: await encryptSecret(VERIFIER, derived.key),
      enabledAt: now,
      updatedAt: now,
    },
  };
}
export async function verifySecretProtectionPassphrase(
  passphrase: string,
  profile: SecretProtectionProfile
): Promise<CryptoKey> {
  if (!passphrase.length || passphrase.length > 10000)
    throw new SecretProtectionInvalidPassphraseError();
  const derived = await deriveAesGcmKeyMaterialFromPassphrase(passphrase, profile.kdf);
  try {
    if ((await decryptSecret(profile.verifier, derived.key)) !== VERIFIER)
      throw new Error('Verifier mismatch');
  } catch {
    throw new SecretProtectionInvalidPassphraseError();
  }
  return derived.key;
}
/** Keep JSON values and array order. Chrome can reorder object members during persistence. */
function orderedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedJsonValue);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, orderedJsonValue(value[key])])
    );
  return value;
}
function canonicalNestedValue(value: unknown): unknown {
  // Apply the same JSON value conversion as the old binding before ordering object members.
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Secret protection profile unavailable');
  const normalized: unknown = JSON.parse(serialized);
  return orderedJsonValue(normalized);
}
async function digestProfile(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function profileIdentity(profile: SecretProtectionProfile, kdf: unknown, verifier: unknown) {
  return {
    version: profile.version,
    mode: profile.mode,
    kdf,
    verifier,
    enabledAt: profile.enabledAt,
    updatedAt: profile.updatedAt,
  };
}
export async function secretProtectionProfileBinding(
  profile: SecretProtectionProfile | null
): Promise<string | null> {
  if (!profile) return null;
  return digestProfile(
    profileIdentity(
      profile,
      canonicalNestedValue(profile.kdf),
      canonicalNestedValue(profile.verifier)
    )
  );
}
function exactMembers(value: object, expected: readonly string[]): boolean {
  const members = Object.keys(value);
  return members.length === expected.length && expected.every((name) => members.includes(name));
}
/** Compatibility grants only the released constructor's encoding of this exact current profile. */
export async function readCompatibleSecretProtectionProfileBindings(
  expected: string
): Promise<readonly string[]> {
  if (!/^[a-f0-9]{64}$/u.test(expected)) return [];
  try {
    const profile = await readSecretProtectionProfile();
    if (!profile || (await secretProtectionProfileBinding(profile)) !== expected) return [expected];
    if (
      profile.verifier.version !== 1 ||
      !exactMembers(profile.kdf, ['algorithm', 'hash', 'iterations', 'keyLengthBits', 'salt']) ||
      !exactMembers(profile.verifier, ['algorithm', 'iv', 'ciphertext', 'version'])
    )
      return [expected];
    const kdf = {
      algorithm: profile.kdf.algorithm,
      hash: profile.kdf.hash,
      iterations: profile.kdf.iterations,
      keyLengthBits: profile.kdf.keyLengthBits,
      salt: profile.kdf.salt,
    };
    const verifier = {
      algorithm: profile.verifier.algorithm,
      iv: profile.verifier.iv,
      ciphertext: profile.verifier.ciphertext,
      version: profile.verifier.version,
    };
    const legacy = await digestProfile(profileIdentity(profile, kdf, verifier));
    return legacy === expected ? [expected] : [expected, legacy];
  } catch {
    // Storage failure cannot grant an alias. The caller retains its original exact equality guard.
    return [expected];
  }
}
export async function readSecretProtectionProfileBinding(): Promise<string | null> {
  return secretProtectionProfileBinding(await readSecretProtectionProfile());
}
export async function removeLegacySecretSessionMaterial(): Promise<void> {
  await browserStorage.session.remove(LEGACY_SECRET_SESSION_KEY);
}
