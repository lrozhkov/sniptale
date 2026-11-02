import { SECRET_PROTECTION_PROFILE_KEY } from '../secret-protection/constants';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createAesGcmKeyMaterial,
  decryptSecret,
  encryptSecret,
  importAesGcmKey,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import type { AIProvider } from '../../../contracts/settings';
import { browserStorage } from '../infrastructure/browser-storage';
import type {
  PreparedSecretParticipant,
  SecretProtectionParticipant,
} from '../secret-protection/model';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
} from './constants';
import { parseStoredAIProviders, parseStoredProviderSecretMap } from './guards';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';

interface ParticipantSnapshot {
  providers: AIProvider[];
  secrets: Record<string, EncryptedSecretEnvelope>;
  transparentKey: string | null;
}

function refused(): never {
  throw new Error('AI secret participant admission refused');
}

function parseSnapshot(value: unknown): ParticipantSnapshot {
  if (!isRecord(value) || Object.keys(value).length !== 3) return refused();
  const providers = parseStoredAIProviders(value['providers']);
  const secrets = parseStoredProviderSecretMap(value['secrets']);
  const transparentKey = value['transparentKey'];
  if (
    providers.hasInvalidRoot ||
    providers.invalidEntryCount > 0 ||
    !secrets ||
    (transparentKey !== null && (typeof transparentKey !== 'string' || !transparentKey))
  )
    return refused();
  return { providers: providers.value, secrets, transparentKey };
}

async function readSnapshot(): Promise<ParticipantSnapshot> {
  const stored = await browserStorage.local.get([
    AI_PROVIDERS_KEY,
    AI_PROVIDER_SECRETS_KEY,
    AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  ]);
  return parseSnapshot({
    providers: stored[AI_PROVIDERS_KEY] ?? [],
    secrets: stored[AI_PROVIDER_SECRETS_KEY] ?? {},
    transparentKey: stored[AI_LOCAL_SECRET_KEY_STORAGE_KEY] ?? null,
  });
}

async function snapshotDigest(snapshot: ParticipantSnapshot): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

/** Chrome storage can reorder object keys; decided arrays and every stored value remain exact. */
function sameSnapshotValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameSnapshotValue(value, right[index]))
    );
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameSnapshotValue(left[key], right[key]))
  );
}

async function reencrypt(
  snapshot: ParticipantSnapshot,
  sourceKey: CryptoKey,
  targetKey: CryptoKey
): Promise<Record<string, EncryptedSecretEnvelope>> {
  const entries = await Promise.all(
    Object.entries(snapshot.secrets).map(async ([id, envelope]) => {
      const provider = snapshot.providers.find((entry) => entry.id === id);
      if (!provider) return refused();
      const aad = createAIProviderSecretAdditionalData(provider);
      const plaintext = await decryptSecret(envelope, sourceKey, aad);
      return [id, await encryptSecret(plaintext, targetKey, aad)] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** Prepare domain ciphertext only. The common owner decides and recovers the transition. */
export function createAISecretProtectionParticipant(): SecretProtectionParticipant {
  return {
    id: 'ai',
    async prepare({ action, sourceKey, targetKey }): Promise<PreparedSecretParticipant> {
      const source = await readSnapshot();
      let target: ParticipantSnapshot;
      if (action === 'reset') {
        target = {
          providers: source.providers.map((provider) => ({ ...provider, hasStoredApiKey: false })),
          secrets: {},
          transparentKey: null,
        };
      } else {
        const hasSecrets = Object.keys(source.secrets).length > 0;
        const from =
          sourceKey ??
          (source.transparentKey ? await importAesGcmKey(source.transparentKey) : null);
        if (hasSecrets && !from) return refused();
        const transparent = action === 'unprotect' ? await createAesGcmKeyMaterial() : null;
        const to = transparent?.key ?? targetKey;
        if (!to) return refused();
        target = {
          providers: source.providers,
          secrets: hasSecrets && from ? await reencrypt(source, from, to) : {},
          transparentKey: transparent?.material ?? null,
        };
      }
      return { payload: { version: 1, sourceDigest: await snapshotDigest(source), target } };
    },
    async apply(prepared, _tx, targetProfile): Promise<void> {
      const payload = prepared.payload;
      if (
        !isRecord(payload) ||
        Object.keys(payload).length !== 3 ||
        payload['version'] !== 1 ||
        prepared.nativeKey
      )
        return refused();
      const sourceDigest = payload['sourceDigest'];
      if (typeof sourceDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(sourceDigest))
        return refused();
      const target = parseSnapshot(payload['target']);
      const current = await readSnapshot();
      // A decided replay accepts its exact target. A different writer cannot replace its selection.
      const alreadyApplied = sameSnapshotValue(current, target);
      if (!alreadyApplied && (await snapshotDigest(current)) !== sourceDigest) return refused();
      if (alreadyApplied && targetProfile === undefined) return;
      await browserStorage.local.set({
        [AI_PROVIDERS_KEY]: target.providers,
        [AI_PROVIDER_SECRETS_KEY]: target.secrets,
        [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: target.transparentKey,
        ...(targetProfile === undefined ? {} : { [SECRET_PROTECTION_PROFILE_KEY]: targetProfile }),
      });
    },
  };
}
