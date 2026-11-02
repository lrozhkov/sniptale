import { readCompatibleSecretProtectionProfileBindings } from '../secret-protection/profile.store';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createAesGcmKeyMaterial,
  decryptSecret,
  encryptSecret,
  importAesGcmKey,
  isEncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import type {
  PreparedSecretParticipant,
  SecretParticipantPreparation,
  SecretProtectionParticipant,
} from '../secret-protection/model';
import {
  applySyncConnectionProtectionTarget,
  loadSyncConnection,
  parseSyncConnectionCredential,
  readSyncConnectionProtectionSnapshot,
  syncConnectionProtectionSelection,
  syncConnectionSecretAdditionalData,
  type SyncConnectionCredential,
} from './store';
import {
  connectionExact,
  connectionUuid,
  parseConnectionAuthentication,
  parseConnectionMetadata,
  sameConnectionBinding,
  type SyncConnectionMetadata,
} from './model';

function refused(): never {
  throw new Error('Sync connection protection transition refused.');
}
function binding(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function projectCredential(credential: SyncConnectionCredential) {
  const { version, kind, key, credentialId, envelope } = credential;
  return {
    version,
    kind,
    key,
    credentialId,
    envelope,
    ...(credential.version === 2 ? { protection: credential.protection } : {}),
  };
}
function parseSourceSelection(value: unknown) {
  if (!isRecord(value) || !connectionExact(value, ['metadata', 'credential'])) return refused();
  const metadata = parseConnectionMetadata(value['metadata']);
  const credential = value['credential'];
  if (
    !metadata ||
    metadata.phase === 'updating-auth' ||
    !isRecord(credential) ||
    !connectionExact(credential, [
      'version',
      'credentialId',
      'envelope',
      ...(credential['version'] === 2 ? ['protection'] : []),
    ]) ||
    (credential['version'] !== 1 && credential['version'] !== 2) ||
    !connectionUuid(credential['credentialId']) ||
    credential['credentialId'] !== metadata.credentialId ||
    !isEncryptedSecretEnvelope(credential['envelope']) ||
    credential['envelope'].version !== 2
  )
    return refused();
  if (credential['version'] === 2) {
    const protection = credential['protection'];
    if (
      !isRecord(protection) ||
      !connectionExact(protection, ['mode', 'profileBinding']) ||
      protection['mode'] !== 'passphrase' ||
      !binding(protection['profileBinding'])
    )
      return refused();
  }
  return { metadata, credential: structuredClone(credential) };
}
function parsePrepared(prepared: PreparedSecretParticipant) {
  const payload = prepared.payload;
  if (
    !isRecord(payload) ||
    !connectionExact(payload, ['version', 'source', 'target']) ||
    payload['version'] !== 1
  )
    return refused();
  const source = parseSourceSelection(payload['source']);
  const target = payload['target'];
  if (!isRecord(target) || !connectionExact(target, ['metadata', 'credential'])) return refused();
  const metadata = parseConnectionMetadata(target['metadata']);
  if (!metadata) return refused();
  let credential: SyncConnectionCredential | null;
  if (target['credential'] === null) {
    if (
      metadata.phase !== 'updating-auth' ||
      metadata.credentialId !== null ||
      prepared.nativeKey !== undefined
    )
      return refused();
    credential = null;
  } else {
    const raw = target['credential'];
    if (!isRecord(raw)) return refused();
    if (raw['version'] === 1) {
      if (
        !connectionExact(raw, ['version', 'kind', 'key', 'credentialId', 'envelope']) ||
        !prepared.nativeKey
      )
        return refused();
      credential = parseSyncConnectionCredential(
        { ...raw, cryptoKey: prepared.nativeKey },
        metadata
      );
    } else {
      if (prepared.nativeKey !== undefined) return refused();
      credential = parseSyncConnectionCredential(raw, metadata);
    }
  }
  if (credential === null) {
    const expected = {
      ...source.metadata,
      identity: { ...source.metadata.identity, revision: source.metadata.identity.revision + 1 },
      phase: 'updating-auth',
      credentialId: null,
      updateNonce: metadata.updateNonce,
      ...(source.metadata.phase === 'paused' ? { pausedBeforeAuthUpdate: true } : {}),
    };
    if (JSON.stringify(metadata) !== JSON.stringify(parseConnectionMetadata(expected)))
      return refused();
  } else if (JSON.stringify(metadata) !== JSON.stringify(source.metadata)) return refused();
  return { source, target: { metadata, credential } };
}

/** The common owner supplies keys and exclusion. This adapter preserves native identity and AAD. */
export function createWebdavSecretProtectionParticipant(): SecretProtectionParticipant {
  return {
    id: 'webdav',
    async binding() {
      const current = await loadSyncConnection();
      return current?.credentialId
        ? { incarnation: current.identity.incarnation, credentialId: current.credentialId }
        : null;
    },
    async prepare(input: SecretParticipantPreparation): Promise<PreparedSecretParticipant> {
      const snapshot = await readSyncConnectionProtectionSnapshot();
      if (!snapshot) return refused();
      const { metadata, credential } = snapshot;
      const source = syncConnectionProtectionSelection(snapshot);
      if (input.action === 'reset') {
        if (!Number.isSafeInteger(metadata.identity.revision + 1)) return refused();
        const target: SyncConnectionMetadata = {
          ...metadata,
          identity: { ...metadata.identity, revision: metadata.identity.revision + 1 },
          phase: 'updating-auth',
          credentialId: null,
          updateNonce: crypto.randomUUID(),
          ...(metadata.phase === 'paused' ? { pausedBeforeAuthUpdate: true } : {}),
        };
        return { payload: { version: 1, source, target: { metadata: target, credential: null } } };
      }
      const sourceKey = credential.version === 1 ? credential.cryptoKey : input.sourceKey;
      if (!sourceKey) return refused();
      const sourceBindingMatches =
        credential.version === 1 ||
        (input.sourceProfileBinding !== null &&
          (credential.protection.profileBinding === input.sourceProfileBinding ||
            (
              await readCompatibleSecretProtectionProfileBindings(input.sourceProfileBinding)
            ).includes(credential.protection.profileBinding)));
      if (!sourceBindingMatches) return refused();
      const plaintext = await decryptSecret(
        credential.envelope,
        sourceKey,
        syncConnectionSecretAdditionalData(metadata, credential.credentialId)
      );
      const decoded: unknown = JSON.parse(plaintext);
      const authentication = parseConnectionAuthentication(decoded, metadata.binding.accountId);
      if (!authentication) return refused();
      let target: SyncConnectionCredential;
      let nativeKey: CryptoKey | undefined;
      if (input.action === 'unprotect') {
        const random = await createAesGcmKeyMaterial();
        nativeKey = await importAesGcmKey(random.material);
        target = parseSyncConnectionCredential(
          {
            version: 1,
            kind: 'sync-connection-credential',
            key: 'credential',
            credentialId: credential.credentialId,
            cryptoKey: nativeKey,
            envelope: await encryptSecret(
              JSON.stringify(authentication),
              nativeKey,
              syncConnectionSecretAdditionalData(metadata, credential.credentialId)
            ),
          },
          metadata
        );
      } else {
        if (!input.targetKey || !binding(input.targetProfileBinding)) return refused();
        target = parseSyncConnectionCredential(
          {
            version: 2,
            kind: 'sync-connection-credential',
            key: 'credential',
            credentialId: credential.credentialId,
            protection: { mode: 'passphrase', profileBinding: input.targetProfileBinding },
            envelope: await encryptSecret(
              JSON.stringify(authentication),
              input.targetKey,
              syncConnectionSecretAdditionalData(metadata, credential.credentialId)
            ),
          },
          metadata
        );
      }
      // Refuse a delayed decrypt or preparation after replacement, disconnect or erasure.
      const after = await readSyncConnectionProtectionSnapshot();
      if (
        !after ||
        !sameConnectionBinding(after.metadata.binding, metadata.binding) ||
        JSON.stringify(syncConnectionProtectionSelection(after)) !== JSON.stringify(source)
      )
        return refused();
      return {
        payload: {
          version: 1,
          source,
          target: { metadata, credential: projectCredential(target) },
        },
        ...(nativeKey ? { nativeKey } : {}),
      };
    },
    async apply(
      prepared: PreparedSecretParticipant,
      transaction?: IDBPTransaction<unknown, string[], 'readwrite'>
    ) {
      const { source, target } = parsePrepared(prepared);
      await applySyncConnectionProtectionTarget(source, target, transaction);
    },
  };
}
