import { readCompatibleSecretProtectionProfileBindings } from '../secret-protection/profile.store';
import { withSecretProtectionWriter } from '../secret-protection/service';
import { assertSecretProtectionStableInTransaction } from '../secret-protection/transition.store';
import type { SecretProtectionAdmissionPermit } from '../secret-protection/model';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createAesGcmKeyMaterial,
  importAesGcmKey,
  encryptSecret,
  decryptSecret,
  isEncryptedSecretEnvelope,
  type ContextBoundEncryptedSecretEnvelope,
  type SecretAdditionalData,
} from '@sniptale/platform/security/local-secret-crypto';
import { capturePreparedDatabase, initDB } from '../infrastructure/indexed-db/core';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  parseSyncWorkspaceMarker,
  type SyncWorkspaceIdentity,
} from '../../../contracts/sync-workspace';
import {
  readReadySyncWorkspaceAllocation,
  readSyncWorkspaceAllocation,
  type SyncWorkspaceAllocation,
} from './workspace-allocation';
import { readReadySyncWorkspaceJoin, type SyncWorkspaceJoin } from './workspace-join';
import {
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CONNECTION_STORE,
  SECRET_PROTECTION_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { withSyncConnectionAdmissionLock } from './coordination';
import {
  connectionUuid,
  parseConnectionBinding,
  parseConnectionMetadata,
  parseSyncStoragePolicy,
  parseConnectionAuthentication,
  parseSyncConnectionIdentity,
  parseSyncWorkspaceSource,
  sameConnectionBinding,
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionBinding,
  type SyncConnectionScope,
  type SyncConnectionIdentity,
  type SyncWorkspaceSource,
  type SyncConnectionMetadata,
  type SyncConnectionAuthentication,
} from './model';

type ConnectionTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
interface TransparentCredential {
  version: 1;
  kind: 'sync-connection-credential';
  key: 'credential';
  credentialId: string;
  cryptoKey: CryptoKey;
  envelope: ContextBoundEncryptedSecretEnvelope;
}
interface ProtectedCredential {
  version: 2;
  kind: 'sync-connection-credential';
  key: 'credential';
  credentialId: string;
  protection: { mode: 'passphrase'; profileBinding: string };
  envelope: ContextBoundEncryptedSecretEnvelope;
}
export type SyncConnectionCredential = TransparentCredential | ProtectedCredential;
type Credential = SyncConnectionCredential;
function refused(): never {
  throw new Error('Sync connection admission refused.');
}
function nextIdentity(identity: SyncConnectionIdentity): SyncConnectionIdentity {
  if (!Number.isSafeInteger(identity.revision + 1)) return refused();
  return { incarnation: identity.incarnation, revision: identity.revision + 1 };
}
async function checkProfile(tx: ConnectionTransaction, scope: SyncConnectionScope): Promise<void> {
  const row = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !row ||
    row.kind !== 'profile' ||
    !sameConnectionScope(scope, {
      spaceId: row.spaceId,
      connectionGeneration: row.connectionGeneration,
      profileCreatedAt: row.createdAt,
    })
  )
    refused();
}
async function readMetadata(tx: ConnectionTransaction): Promise<SyncConnectionMetadata | null> {
  const raw: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('connection');
  if (raw === undefined) return null;
  return parseConnectionMetadata(raw) ?? refused();
}
async function mutate<T>(
  operation: (tx: IDBPTransaction<unknown, string[], 'readwrite'>) => Promise<T>,
  permit?: SecretProtectionAdmissionPermit
): Promise<T> {
  return withSecretProtectionWriter(
    () =>
      withSyncConnectionAdmissionLock(() =>
        runWithIndexedDbMutation(async (db) => {
          const tx = db.transaction(
            [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SECRET_PROTECTION_STORE],
            'readwrite'
          );
          try {
            await assertSecretProtectionStableInTransaction(tx);
            const result = await operation(tx);
            await tx.done;
            return result;
          } catch (error) {
            try {
              tx.abort();
            } catch {
              /* Transaction can already be closed. */
            }
            await tx.done.catch(() => undefined);
            throw error;
          }
        })
      ),
    permit
  );
}
export function syncConnectionSecretAdditionalData(
  metadata: SyncConnectionMetadata,
  credentialId: string
): SecretAdditionalData {
  const binding = metadata.binding;
  return {
    version: metadata.workspace ? 'sync-connection-secret:v2' : 'sync-connection-secret:v1',
    provider: binding.provider,
    rootUrl: binding.rootUrl,
    accountId: binding.accountId,
    spaceId: binding.spaceId,
    connectionGeneration: String(binding.connectionGeneration),
    profileCreatedAt: String(binding.profileCreatedAt),
    incarnation: metadata.identity.incarnation,
    credentialId,
    ...(metadata.workspace
      ? { bootstrapId: metadata.workspace.bootstrapId, fingerprint: metadata.workspace.fingerprint }
      : {}),
  };
}
function matchingAdditionalData(
  actual: SecretAdditionalData,
  expected: SecretAdditionalData
): boolean {
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
}
function validKey(value: unknown): value is CryptoKey {
  return (
    isRecord(value) &&
    Object.prototype.toString.call(value) === '[object CryptoKey]' &&
    value['type'] === 'secret' &&
    value['extractable'] === false &&
    isRecord(value['algorithm']) &&
    value['algorithm']['name'] === 'AES-GCM' &&
    value['algorithm']['length'] === 256 &&
    Array.isArray(value['usages']) &&
    value['usages'].length === 2 &&
    value['usages'].includes('encrypt') &&
    value['usages'].includes('decrypt')
  );
}
function base64(value: string, minimum: number, maximum: number): boolean {
  if (value.length > maximum * 2 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) return false;
  try {
    const decoded = atob(value);
    return decoded.length >= minimum && decoded.length <= maximum && btoa(decoded) === value;
  } catch {
    return false;
  }
}
export function parseSyncConnectionCredential(
  value: unknown,
  metadata: SyncConnectionMetadata
): Credential {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    (value['version'] !== 1 && value['version'] !== 2) ||
    value['kind'] !== 'sync-connection-credential' ||
    value['key'] !== 'credential' ||
    !connectionUuid(value['credentialId']) ||
    value['credentialId'] !== metadata.credentialId
  )
    return refused();
  const envelope = value['envelope'];
  if (
    !isEncryptedSecretEnvelope(envelope) ||
    envelope.version !== 2 ||
    Object.keys(envelope).length !== 5 ||
    !base64(envelope.iv, 12, 12) ||
    !base64(envelope.ciphertext, 16, 65536) ||
    !matchingAdditionalData(
      envelope.additionalData,
      syncConnectionSecretAdditionalData(metadata, value['credentialId'])
    )
  )
    return refused();
  const common = {
    kind: 'sync-connection-credential' as const,
    key: 'credential' as const,
    credentialId: value['credentialId'],
    envelope,
  };
  if (value['version'] === 1) {
    if (!validKey(value['cryptoKey']) || Object.hasOwn(value, 'protection')) return refused();
    return { ...common, version: 1, cryptoKey: value['cryptoKey'] };
  }
  const protection = value['protection'];
  if (
    !isRecord(protection) ||
    Object.keys(protection).length !== 2 ||
    protection['mode'] !== 'passphrase' ||
    typeof protection['profileBinding'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(protection['profileBinding']) ||
    Object.hasOwn(value, 'cryptoKey')
  )
    return refused();
  return {
    ...common,
    version: 2,
    protection: { mode: 'passphrase', profileBinding: protection['profileBinding'] },
  };
}
const parseCredential = parseSyncConnectionCredential;
async function protectAuthentication(
  metadata: SyncConnectionMetadata,
  authentication: SyncConnectionAuthentication,
  credentialId: string,
  protectionKey: CryptoKey | null = null,
  profileBinding: string | null = null
): Promise<Credential> {
  let credential: Credential;
  try {
    if (protectionKey !== null) {
      if (profileBinding === null || !/^[a-f0-9]{64}$/u.test(profileBinding)) return refused();
      return parseCredential(
        {
          version: 2,
          kind: 'sync-connection-credential',
          key: 'credential',
          credentialId,
          protection: { mode: 'passphrase', profileBinding },
          envelope: await encryptSecret(
            JSON.stringify(authentication),
            protectionKey,
            syncConnectionSecretAdditionalData(metadata, credentialId)
          ),
        },
        { ...metadata, credentialId }
      );
    }
    if (profileBinding !== null) return refused();
    const { material } = await createAesGcmKeyMaterial();
    const cryptoKey = await importAesGcmKey(material);
    const envelope = await encryptSecret(
      JSON.stringify(authentication),
      cryptoKey,
      syncConnectionSecretAdditionalData(metadata, credentialId)
    );
    credential = parseCredential(
      {
        version: 1,
        kind: 'sync-connection-credential',
        key: 'credential',
        credentialId,
        cryptoKey,
        envelope,
      },
      { ...metadata, credentialId }
    );
  } catch {
    return refused();
  }
  return credential;
}
/** Metadata and profile reads have no repair or secret side effects. */
export async function loadSyncConnection(): Promise<SyncConnectionMetadata | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
  const metadata = await readMetadata(tx);
  if (metadata) await checkProfile(tx, metadata.binding);
  await tx.done;
  return metadata;
}
/** Advisory metadata read that cannot initialize or repair native storage. */
export async function readPreparedSyncConnection(): Promise<SyncConnectionMetadata | null> {
  const db = capturePreparedDatabase();
  if (!db) return null;
  try {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
    try {
      const metadata = await readMetadata(tx);
      if (metadata) await checkProfile(tx, metadata.binding);
      await tx.done;
      return capturePreparedDatabase() === db ? metadata : null;
    } catch {
      await tx.done.catch(() => undefined);
      return null;
    }
  } catch {
    return null;
  }
}
/** Close admission durably before asynchronous credential protection begins. */
export async function beginSyncConnectionAuthUpdate(
  bindingInput: unknown,
  expectedInput: unknown,
  permit?: SecretProtectionAdmissionPermit
): Promise<SyncConnectionMetadata> {
  const binding = parseConnectionBinding(structuredClone(bindingInput));
  const expected =
    expectedInput === null ? null : parseSyncConnectionIdentity(structuredClone(expectedInput));
  if (!binding || (expectedInput !== null && !expected)) return refused();
  return mutate(async (tx) => {
    await checkProfile(tx, binding);
    const current = await readMetadata(tx);
    if (
      current
        ? !expected ||
          !sameSyncConnectionIdentity(current.identity, expected) ||
          !sameConnectionBinding(current.binding, binding)
        : expected !== null
    )
      return refused();
    const metadata: SyncConnectionMetadata = {
      version: 1,
      kind: 'sync-connection',
      key: 'connection',
      binding,
      identity: current
        ? nextIdentity(current.identity)
        : { incarnation: crypto.randomUUID(), revision: 1 },
      phase: 'updating-auth',
      updateNonce: crypto.randomUUID(),
      ...(current?.phase === 'paused' || current?.pausedBeforeAuthUpdate
        ? { pausedBeforeAuthUpdate: true }
        : {}),
      credentialId: current?.credentialId ?? null,
      storagePolicy: current?.storagePolicy ?? { version: 1, mode: 'on-demand' },
      ...(current?.workspace ? { workspace: current.workspace } : {}),
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(metadata);
    return metadata;
  }, permit);
}
/** Crypto runs outside native transactions; only the exact durable reservation can publish it. */
export async function commitSyncConnectionAuthentication(
  reservationInput: unknown,
  authenticationInput: unknown,
  protectionKey: CryptoKey | null = null,
  profileBinding: string | null = null,
  permit?: SecretProtectionAdmissionPermit
): Promise<SyncConnectionMetadata> {
  const reservation = parseConnectionMetadata(structuredClone(reservationInput));
  const detachedAuthentication: unknown = structuredClone(authenticationInput);
  if (!reservation || reservation.phase !== 'updating-auth') return refused();
  const authentication = parseConnectionAuthentication(
    detachedAuthentication,
    reservation.binding.accountId
  );
  if (!authentication) return refused();
  const credentialId = crypto.randomUUID();
  const credential = await protectAuthentication(
    reservation,
    authentication,
    credentialId,
    protectionKey,
    profileBinding
  );
  // Browser storage and SHA-256 waits must finish before the native write transaction opens.
  const compatibleProfileBindings =
    profileBinding === null
      ? []
      : await readCompatibleSecretProtectionProfileBindings(profileBinding);
  return mutate(async (tx) => {
    await checkProfile(tx, reservation.binding);
    const current = await readMetadata(tx);
    if (!current || JSON.stringify(current) !== JSON.stringify(reservation)) return refused();
    const control = await assertSecretProtectionStableInTransaction(tx);
    if (current.credentialId) {
      const existing = parseCredential(
        await tx.objectStore(SYNC_CONNECTION_STORE).get('credential'),
        current
      );
      if (existing.version === 2 && credential.version !== 2) return refused();
      if (
        existing.version === 2 &&
        !compatibleProfileBindings.includes(existing.protection.profileBinding)
      )
        return refused();
    }
    if (
      control.participants.webdav &&
      (control.participants.webdav.incarnation !== current.identity.incarnation ||
        control.participants.webdav.credentialId !== current.credentialId ||
        credential.version !== 2)
    )
      return refused();
    const { pausedBeforeAuthUpdate, ...currentFields } = current;
    const metadata: SyncConnectionMetadata = {
      ...currentFields,
      identity: nextIdentity(current.identity),
      phase: pausedBeforeAuthUpdate ? 'paused' : 'active',
      updateNonce: null,
      credentialId,
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(credential);
    await tx.objectStore(SYNC_CONNECTION_STORE).put(metadata);
    if (credential.version === 2) {
      await tx.objectStore(SECRET_PROTECTION_STORE).put({
        ...control,
        key: 'control',
        participants: {
          ...control.participants,
          webdav: { incarnation: metadata.identity.incarnation, credentialId },
        },
      });
    }
    return metadata;
  }, permit);
}
interface ReadyEnrollmentSelection {
  native: SyncWorkspaceAllocation | SyncWorkspaceJoin;
  rootUrl: string;
  accountId: string;
  workspace: SyncWorkspaceIdentity;
  nativeRows: number;
}
interface EnrollmentEvidence {
  selection: ReadyEnrollmentSelection;
  connection: SyncConnectionMetadata | null;
}
async function readReadyEnrollmentSelection(
  tx: ConnectionTransaction,
  source: SyncWorkspaceSource
): Promise<ReadyEnrollmentSelection> {
  if (source.kind === 'allocation') {
    const native = await readReadySyncWorkspaceAllocation(tx, source.identity);
    if (!native.marker) return refused();
    return {
      native,
      rootUrl: native.rootUrl,
      accountId: native.accountId,
      workspace: parseSyncWorkspaceMarker(native.marker.text),
      nativeRows: 1,
    };
  }
  const native = await readReadySyncWorkspaceJoin(tx, source.identity);
  const allocation = await readSyncWorkspaceAllocation(tx);
  if (!native.workspace || (allocation && allocation.phase !== 'abandoned')) return refused();
  return {
    native,
    rootUrl: native.rootUrl,
    accountId: native.accountId,
    workspace: native.workspace,
    nativeRows: allocation ? 2 : 1,
  };
}
async function readEnrollmentEvidence(
  tx: ConnectionTransaction,
  source: SyncWorkspaceSource
): Promise<EnrollmentEvidence> {
  const selection = await readReadyEnrollmentSelection(tx, source);
  const { workspace } = selection;
  const rows = tx.objectStore(SYNC_CONNECTION_STORE);
  const receipt: unknown = await rows.get('workspace-enrollment');
  if (receipt === undefined) {
    if (
      (await tx.objectStore(SYNC_CAPTURE_STORE).count()) !== 0 ||
      (await tx.objectStore(SYNC_OUTBOX_STORE).count()) !== 0 ||
      (await rows.count()) !== selection.nativeRows
    )
      return refused();
    return { selection, connection: null };
  }
  if (
    !isRecord(receipt) ||
    Object.keys(receipt).length !== 5 ||
    receipt['version'] !== 1 ||
    receipt['kind'] !== 'sync-workspace-enrollment' ||
    receipt['key'] !== 'workspace-enrollment'
  )
    return refused();
  const recordedSource = parseSyncWorkspaceSource(receipt['source']);
  const enrolled = parseConnectionMetadata(receipt['connection']);
  const current = await readMetadata(tx);
  if (
    !recordedSource ||
    recordedSource.kind !== source.kind ||
    !sameSyncConnectionIdentity(recordedSource.identity, source.identity) ||
    !enrolled ||
    enrolled.phase !== 'active' ||
    enrolled.identity.revision !== 1 ||
    !enrolled.workspace ||
    enrolled.binding.rootUrl !== selection.rootUrl ||
    enrolled.binding.accountId !== selection.accountId ||
    enrolled.binding.spaceId !== workspace.spaceId ||
    enrolled.binding.connectionGeneration !== 1 ||
    JSON.stringify(enrolled.workspace) !== JSON.stringify(workspace) ||
    !current ||
    current.phase === 'updating-auth' ||
    current.identity.incarnation !== enrolled.identity.incarnation ||
    current.identity.revision < enrolled.identity.revision ||
    !sameConnectionBinding(current.binding, enrolled.binding) ||
    JSON.stringify(current.workspace) !== JSON.stringify(workspace) ||
    (await rows.count()) !== selection.nativeRows + 3
  )
    return refused();
  await checkProfile(tx, current.binding);
  parseCredential(await rows.get('credential'), current);
  return { selection, connection: current };
}

/**
 * Enroll one exact native ready CREATE or JOIN source atomically. Cold admission never opens storage.
 * Replaying its receipt returns the current same-binding enrollment without replacing secrets.
 */
export async function enrollSyncWorkspaceConnection(
  sourceInput: unknown,
  authenticationInput: unknown,
  storagePolicyInput: unknown,
  protectionKey: CryptoKey | null = null,
  profileBinding: string | null = null,
  permit?: SecretProtectionAdmissionPermit
): Promise<SyncConnectionMetadata> {
  const db = capturePreparedDatabase();
  if (!db) return refused();
  let detachedSource: unknown;
  let detachedAuthentication: unknown;
  let detachedPolicy: unknown;
  try {
    detachedPolicy = structuredClone(storagePolicyInput);
    detachedSource = structuredClone(sourceInput);
    detachedAuthentication = structuredClone(authenticationInput);
  } catch {
    return refused();
  }
  const source = parseSyncWorkspaceSource(detachedSource);
  const storagePolicy = parseSyncStoragePolicy(detachedPolicy);
  if (!source || !storagePolicy) return refused();
  return withSecretProtectionWriter(async () => {
    try {
      const initial = await withSyncConnectionAdmissionLock(() =>
        runWithPersistenceMutationPermit(async () => {
          const tx = db.transaction(
            [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE, SECRET_PROTECTION_STORE],
            'readonly'
          );
          try {
            await assertSecretProtectionStableInTransaction(tx);
            const evidence = await readEnrollmentEvidence(tx, source);
            await tx.done;
            return evidence;
          } catch (error) {
            await tx.done.catch(() => undefined);
            throw error;
          }
        })
      );
      const authentication = parseConnectionAuthentication(
        detachedAuthentication,
        initial.selection.accountId
      );
      if (!authentication) return refused();
      if (initial.connection) return initial.connection;
      const selection = initial.selection;
      const profile = parseSyncCaptureRecord({
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: Date.now(),
        enabled: true,
        spaceId: selection.workspace.spaceId,
        connectionGeneration: 1,
      });
      if (!profile || profile.kind !== 'profile') return refused();
      const binding: SyncConnectionBinding = {
        provider: 'webdav',
        rootUrl: selection.rootUrl,
        accountId: selection.accountId,
        spaceId: profile.spaceId,
        connectionGeneration: profile.connectionGeneration,
        profileCreatedAt: profile.createdAt,
      };
      const credentialId = crypto.randomUUID();
      const metadata: SyncConnectionMetadata = {
        version: 1,
        kind: 'sync-connection',
        key: 'connection',
        binding,
        workspace: selection.workspace,
        storagePolicy,
        identity: { incarnation: crypto.randomUUID(), revision: 1 },
        phase: 'active',
        updateNonce: null,
        credentialId,
      };
      const credential = await protectAuthentication(
        metadata,
        authentication,
        credentialId,
        protectionKey,
        profileBinding
      );
      return await withSyncConnectionAdmissionLock(() =>
        runWithPersistenceMutationPermit(async () => {
          const tx = db.transaction(
            [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE, SECRET_PROTECTION_STORE],
            'readwrite'
          );
          try {
            const control = await assertSecretProtectionStableInTransaction(tx);
            const current = await readEnrollmentEvidence(tx, source);
            if (JSON.stringify(current.selection) !== JSON.stringify(selection)) return refused();
            if (current.connection) {
              await tx.done;
              return current.connection;
            }
            await tx.objectStore(SYNC_CAPTURE_STORE).put(profile);
            const rows = tx.objectStore(SYNC_CONNECTION_STORE);
            await rows.put(metadata);
            await rows.put(credential);
            if (credential.version === 2) {
              if (control.participants.webdav !== null) return refused();
              await tx.objectStore(SECRET_PROTECTION_STORE).put({
                ...control,
                key: 'control',
                participants: {
                  ...control.participants,
                  webdav: { incarnation: metadata.identity.incarnation, credentialId },
                },
              });
            }
            await rows.put({
              version: 1,
              kind: 'sync-workspace-enrollment',
              key: 'workspace-enrollment',
              source,
              connection: metadata,
            });
            await tx.done;
            return metadata;
          } catch (error) {
            try {
              tx.abort();
            } catch {
              /* Transaction can already be closed. */
            }
            await tx.done.catch(() => undefined);
            throw error;
          }
        })
      );
    } catch {
      return refused();
    }
  }, permit);
}

/** A pause preserves capture enrollment, namespace generation and the encrypted credential. */
export async function commandSyncConnection(
  identityInput: unknown,
  command: 'pause' | 'resume',
  permit?: SecretProtectionAdmissionPermit
): Promise<SyncConnectionMetadata> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  if (!identity || (command !== 'pause' && command !== 'resume')) return refused();
  return mutate(async (tx) => {
    const current = await readMetadata(tx);
    if (
      !current ||
      !sameSyncConnectionIdentity(current.identity, identity) ||
      current.phase === 'updating-auth'
    )
      return refused();
    await checkProfile(tx, current.binding);
    const metadata: SyncConnectionMetadata = {
      ...current,
      identity: nextIdentity(current.identity),
      phase: command === 'pause' ? 'paused' : 'active',
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(metadata);
    return metadata;
  }, permit);
}
/** Used inside the caller's native queue transaction, never in a prior independent read. */
export async function checkSyncConnectionAdmission(
  tx: ConnectionTransaction,
  scope: SyncConnectionScope,
  identity: SyncConnectionIdentity | null
): Promise<SyncConnectionMetadata | null> {
  await checkProfile(tx, scope);
  const metadata = await readMetadata(tx);
  if (!metadata) return identity === null ? null : refused();
  const parsedIdentity = parseSyncConnectionIdentity(identity);
  if (
    !parsedIdentity ||
    metadata.phase !== 'active' ||
    !sameConnectionScope(metadata.binding, scope) ||
    !sameSyncConnectionIdentity(metadata.identity, parsedIdentity)
  )
    return refused();
  return metadata;
}
async function readAuthentication(
  identity: SyncConnectionIdentity
): Promise<{ metadata: SyncConnectionMetadata; credential: Credential }> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
  const metadata = await readMetadata(tx);
  if (
    !metadata ||
    metadata.phase !== 'active' ||
    !sameSyncConnectionIdentity(metadata.identity, identity)
  )
    return refused();
  await checkProfile(tx, metadata.binding);
  const credential = parseCredential(
    await tx.objectStore(SYNC_CONNECTION_STORE).get('credential'),
    metadata
  );
  await tx.done;
  return { metadata, credential };
}
/** A delayed decrypt cannot return credentials after rotation, erasure or profile replacement. */
export async function loadSyncConnectionAuthentication(
  identityInput: unknown,
  protectionKey: CryptoKey | null = null,
  profileBinding: string | null = null
): Promise<SyncConnectionAuthentication> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  if (!identity) return refused();
  const { metadata, credential } = await readAuthentication(identity);
  const key = credential.version === 1 ? credential.cryptoKey : protectionKey;
  if (!key) return refused();
  const bindingMatches =
    credential.version === 1
      ? profileBinding === null
      : profileBinding !== null &&
        (credential.protection.profileBinding === profileBinding ||
          (await readCompatibleSecretProtectionProfileBindings(profileBinding)).includes(
            credential.protection.profileBinding
          ));
  if (!bindingMatches) return refused();
  let authentication: SyncConnectionAuthentication | null;
  try {
    const plaintext = await decryptSecret(
      credential.envelope,
      key,
      syncConnectionSecretAdditionalData(metadata, credential.credentialId)
    );
    const decoded: unknown = JSON.parse(plaintext);
    authentication = parseConnectionAuthentication(decoded, metadata.binding.accountId);
  } catch {
    return refused();
  }
  if (!authentication) return refused();
  const latest = await readAuthentication(identity);
  if (
    JSON.stringify(latest.metadata) !== JSON.stringify(metadata) ||
    latest.credential.credentialId !== credential.credentialId ||
    JSON.stringify(latest.credential.envelope) !== JSON.stringify(credential.envelope)
  )
    return refused();
  return authentication;
}

/** The contained local-only owner checks retained bytes in this same transaction before retiring authority. */
export async function clearLocalOnlySyncConnectionInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  expected: SyncConnectionMetadata
): Promise<void> {
  const current = await readMetadata(tx);
  if (
    !current ||
    current.phase !== 'paused' ||
    expected.phase !== 'paused' ||
    !sameSyncConnectionIdentity(current.identity, expected.identity) ||
    !sameConnectionBinding(current.binding, expected.binding)
  )
    return refused();
  await checkProfile(tx, current.binding);
  const control = await assertSecretProtectionStableInTransaction(tx);
  if (control.participants.webdav?.incarnation === current.identity.incarnation) {
    await tx
      .objectStore(SECRET_PROTECTION_STORE)
      .put({ ...control, key: 'control', participants: { ...control.participants, webdav: null } });
  }
  await tx.objectStore(SYNC_CONNECTION_STORE).clear();
  await tx.objectStore(SYNC_CAPTURE_STORE).clear();
  await tx.objectStore(SYNC_OUTBOX_STORE).clear();
}

export interface SyncConnectionProtectionSnapshot {
  metadata: SyncConnectionMetadata;
  credential: SyncConnectionCredential;
}
/** A transition reads paused connections without granting request admission. */
export async function readSyncConnectionProtectionSnapshot(): Promise<SyncConnectionProtectionSnapshot | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
  const metadata = await readMetadata(tx);
  if (!metadata) {
    await tx.done;
    return null;
  }
  await checkProfile(tx, metadata.binding);
  if (metadata.phase === 'updating-auth' || !metadata.credentialId) return refused();
  const credential = parseCredential(
    await tx.objectStore(SYNC_CONNECTION_STORE).get('credential'),
    metadata
  );
  await tx.done;
  return { metadata, credential };
}
/** Ciphertext and metadata identify the exact selected credential without copying a native key. */
export function syncConnectionProtectionSelection(
  snapshot: SyncConnectionProtectionSnapshot
): unknown {
  const credential = snapshot.credential;
  return {
    metadata: snapshot.metadata,
    credential: {
      version: credential.version,
      credentialId: credential.credentialId,
      envelope: credential.envelope,
      ...(credential.version === 2 ? { protection: credential.protection } : {}),
    },
  };
}
/** The common owner supplies its native transaction to commit credential and journal together. */
export async function applySyncConnectionProtectionTarget(
  expected: unknown,
  target: { metadata: SyncConnectionMetadata; credential: SyncConnectionCredential | null },
  transaction?: IDBPTransaction<unknown, string[], 'readwrite'>
): Promise<void> {
  async function apply(tx: IDBPTransaction<unknown, string[], 'readwrite'>) {
    const metadata = await readMetadata(tx);
    if (!metadata) return refused();
    await checkProfile(tx, metadata.binding);
    const raw: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('credential');
    if (JSON.stringify(metadata) === JSON.stringify(target.metadata)) {
      if (target.credential === null && raw === undefined) return;
      if (target.credential !== null) {
        const current = parseCredential(raw, metadata);
        if (
          JSON.stringify(syncConnectionProtectionSelection({ metadata, credential: current })) ===
          JSON.stringify(
            syncConnectionProtectionSelection({
              metadata: target.metadata,
              credential: target.credential,
            })
          )
        )
          return;
      }
    }
    if (metadata.phase === 'updating-auth') return refused();
    const current = parseCredential(raw, metadata);
    if (
      JSON.stringify(syncConnectionProtectionSelection({ metadata, credential: current })) !==
      JSON.stringify(expected)
    )
      return refused();
    if (
      !sameConnectionBinding(metadata.binding, target.metadata.binding) ||
      metadata.identity.incarnation !== target.metadata.identity.incarnation
    )
      return refused();
    if (target.credential) await tx.objectStore(SYNC_CONNECTION_STORE).put(target.credential);
    else await tx.objectStore(SYNC_CONNECTION_STORE).delete('credential');
    await tx.objectStore(SYNC_CONNECTION_STORE).put(target.metadata);
  }
  if (transaction) return apply(transaction);
  return mutate(apply);
}
