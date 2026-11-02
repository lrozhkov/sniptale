import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecretEnvelope,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import { capturePreparedDatabase, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  SECRET_PROTECTION_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_CAPTURE_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { withSyncConnectionAdmissionLock } from '../remote-connection/coordination';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  LEGACY_SECRET_PROTECTION_TRANSITION_KEY,
  LEGACY_AI_TRANSPARENT_KEY,
  SECRET_PROTECTION_PROFILE_KEY,
} from './constants';
import { parseSecretProtectionProfile, readSecretProtectionProfile } from './profile.store';
import { SecretProtectionLockedError } from './model';
import type {
  PreparedSecretParticipant,
  SecretParticipantId,
  SecretProtectionControl,
  SecretProtectionProfile,
  SecretWebdavBinding,
} from './model';

export type SecretProtectionTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
export interface SecretProtectionBundle {
  profile: SecretProtectionProfile | null;
  control: SecretProtectionControl;
  participants: Partial<Record<SecretParticipantId, PreparedSecretParticipant>>;
}
export interface SecretProtectionJournal {
  version: 1;
  key: 'journal';
  id: string;
  epoch: number;
  phase: 'prepared' | 'committing' | 'applied';
  operation: string;
  envelope: EncryptedSecretEnvelope;
  recoveryKey: CryptoKey;
  nativeKey?: CryptoKey;
}
export interface SecretProtectionJournalStore {
  readControl(): Promise<SecretProtectionControl>;
  readJournal(): Promise<SecretProtectionJournal | null>;
  close(expected: SecretProtectionControl): Promise<SecretProtectionControl>;
  prepare(
    control: SecretProtectionControl,
    operation: string,
    bundle: SecretProtectionBundle
  ): Promise<SecretProtectionJournal>;
  decide(journal: SecretProtectionJournal): Promise<SecretProtectionJournal>;
  decode(journal: SecretProtectionJournal): Promise<SecretProtectionBundle>;
  commit(
    journal: SecretProtectionJournal,
    apply: (bundle: SecretProtectionBundle, tx: SecretProtectionTransaction) => Promise<void>
  ): Promise<SecretProtectionJournal>;
  finish(journal: SecretProtectionJournal, control: SecretProtectionControl): Promise<void>;
  abort(control: SecretProtectionControl): Promise<void>;
}
function refused(): never {
  throw new Error('Secret protection transition unavailable');
}
export function emptySecretProtectionControl(): SecretProtectionControl {
  return { version: 1, epoch: 0, phase: 'stable', participants: { ai: false, webdav: null } };
}
function binding(value: unknown): SecretWebdavBinding | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value['incarnation'] !== 'string' ||
    typeof value['credentialId'] !== 'string'
  )
    return refused();
  return { incarnation: value['incarnation'], credentialId: value['credentialId'] };
}
export function parseSecretProtectionControl(value: unknown): SecretProtectionControl {
  if (value === undefined) return emptySecretProtectionControl();
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !Number.isSafeInteger(value['epoch']) ||
    typeof value['epoch'] !== 'number' ||
    value['epoch'] < 0 ||
    (value['phase'] !== 'stable' && value['phase'] !== 'transitioning') ||
    !isRecord(value['participants']) ||
    typeof value['participants']['ai'] !== 'boolean'
  )
    return refused();
  return {
    version: 1,
    epoch: value['epoch'],
    phase: value['phase'],
    participants: {
      ai: value['participants']['ai'],
      webdav: binding(value['participants']['webdav']),
    },
  };
}
function validKey(value: unknown): value is CryptoKey {
  return (
    isRecord(value) &&
    Object.prototype.toString.call(value) === '[object CryptoKey]' &&
    value['type'] === 'secret' &&
    value['extractable'] === false &&
    isRecord(value['algorithm']) &&
    value['algorithm']['name'] === 'AES-GCM'
  );
}
function parseJournal(value: unknown): SecretProtectionJournal | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    value['key'] !== 'journal' ||
    typeof value['id'] !== 'string' ||
    typeof value['epoch'] !== 'number' ||
    !Number.isSafeInteger(value['epoch']) ||
    typeof value['operation'] !== 'string' ||
    !['prepared', 'committing', 'applied'].includes(
      typeof value['phase'] === 'string' ? value['phase'] : ''
    ) ||
    !isEncryptedSecretEnvelope(value['envelope']) ||
    !validKey(value['recoveryKey']) ||
    (value['nativeKey'] !== undefined && !validKey(value['nativeKey']))
  )
    return refused();
  const phase = value['phase'];
  if (phase !== 'prepared' && phase !== 'committing' && phase !== 'applied') return refused();
  return {
    version: 1,
    key: 'journal',
    id: value['id'],
    epoch: value['epoch'],
    operation: value['operation'],
    phase,
    envelope: value['envelope'],
    recoveryKey: value['recoveryKey'],
    ...(value['nativeKey'] ? { nativeKey: value['nativeKey'] } : {}),
  };
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function aad(journal: Pick<SecretProtectionJournal, 'id' | 'epoch' | 'operation'>) {
  return {
    version: 'secret-protection-journal:v1',
    id: journal.id,
    epoch: String(journal.epoch),
    operation: journal.operation,
  };
}
export async function readSecretProtectionControl(): Promise<SecretProtectionControl> {
  const db = await initDB();
  return parseSecretProtectionControl(await db.get(SECRET_PROTECTION_STORE, 'control'));
}
export async function readPreparedSecretProtectionControl(): Promise<SecretProtectionControl | null> {
  const db = capturePreparedDatabase();
  if (!db) return null;
  return parseSecretProtectionControl(await db.get(SECRET_PROTECTION_STORE, 'control'));
}
async function mutate<T>(operation: (tx: SecretProtectionTransaction) => Promise<T>): Promise<T> {
  return withSyncConnectionAdmissionLock(() =>
    runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [SECRET_PROTECTION_STORE, SYNC_CONNECTION_STORE, SYNC_CAPTURE_STORE],
        'readwrite'
      );
      try {
        const result = await operation(tx);
        await tx.done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already settled. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    })
  );
}
export function createNativeSecretProtectionJournalStore(): SecretProtectionJournalStore {
  async function readJournal() {
    const db = await initDB();
    return parseJournal(await db.get(SECRET_PROTECTION_STORE, 'journal'));
  }
  async function requireJournal(
    tx: SecretProtectionTransaction,
    expected: SecretProtectionJournal
  ) {
    const current = parseJournal(await tx.objectStore(SECRET_PROTECTION_STORE).get('journal'));
    if (
      !current ||
      current.id !== expected.id ||
      current.epoch !== expected.epoch ||
      current.phase !== expected.phase ||
      !same(current.envelope, expected.envelope)
    )
      return refused();
    return current;
  }
  async function decode(journal: SecretProtectionJournal): Promise<SecretProtectionBundle> {
    const decoded: unknown = JSON.parse(
      await decryptSecret(journal.envelope, journal.recoveryKey, aad(journal))
    );
    if (
      !isRecord(decoded) ||
      Object.keys(decoded).length !== 3 ||
      !Object.hasOwn(decoded, 'profile') ||
      !Object.hasOwn(decoded, 'control') ||
      !isRecord(decoded['participants']) ||
      Object.keys(decoded['participants']).some((id) => id !== 'ai' && id !== 'webdav')
    )
      return refused();
    const control = parseSecretProtectionControl(decoded['control']);
    if (control.epoch !== journal.epoch || control.phase !== 'transitioning') return refused();
    const participants: SecretProtectionBundle['participants'] = {};
    for (const id of ['ai', 'webdav'] as const) {
      const value = decoded['participants'][id];
      if (value === undefined) continue;
      if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'payload'))
        return refused();
      participants[id] = {
        payload: value['payload'],
        ...(id === 'webdav' && journal.nativeKey ? { nativeKey: journal.nativeKey } : {}),
      };
    }
    return { profile: parseSecretProtectionProfile(decoded['profile']), control, participants };
  }
  return {
    readControl: readSecretProtectionControl,
    readJournal,
    decode,
    close: (expected) =>
      mutate(async (tx) => {
        const current = parseSecretProtectionControl(
          await tx.objectStore(SECRET_PROTECTION_STORE).get('control')
        );
        if (
          !same(current, expected) ||
          current.phase !== 'stable' ||
          current.epoch === Number.MAX_SAFE_INTEGER ||
          (await tx.objectStore(SECRET_PROTECTION_STORE).get('journal')) !== undefined
        )
          return refused();
        const next: SecretProtectionControl = {
          ...current,
          epoch: current.epoch + 1,
          phase: 'transitioning',
        };
        await tx.objectStore(SECRET_PROTECTION_STORE).put({ ...next, key: 'control' });
        return next;
      }),
    async prepare(control, operation, bundle) {
      const recoveryKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      const seed = { id: crypto.randomUUID(), epoch: control.epoch, operation };
      const serializable = {
        ...bundle,
        participants: Object.fromEntries(
          Object.entries(bundle.participants).map(([id, p]) => [id, { payload: p.payload }])
        ),
      };
      const journal: SecretProtectionJournal = {
        version: 1,
        key: 'journal',
        ...seed,
        phase: 'prepared',
        recoveryKey,
        envelope: await encryptSecret(JSON.stringify(serializable), recoveryKey, aad(seed)),
        ...(bundle.participants.webdav?.nativeKey
          ? { nativeKey: bundle.participants.webdav.nativeKey }
          : {}),
      };
      return mutate(async (tx) => {
        const current = parseSecretProtectionControl(
          await tx.objectStore(SECRET_PROTECTION_STORE).get('control')
        );
        if (
          !same(current, control) ||
          (await tx.objectStore(SECRET_PROTECTION_STORE).get('journal')) !== undefined
        )
          return refused();
        await tx.objectStore(SECRET_PROTECTION_STORE).put(journal);
        return journal;
      });
    },
    decide: (journal) =>
      mutate(async (tx) => {
        const current = await requireJournal(tx, journal);
        if (current.phase !== 'prepared') return refused();
        const next: SecretProtectionJournal = { ...current, phase: 'committing' };
        await tx.objectStore(SECRET_PROTECTION_STORE).put(next);
        return next;
      }),
    async commit(journal, apply) {
      const bundle = await decode(journal);
      return mutate(async (tx) => {
        const current = await requireJournal(tx, journal);
        if (current.phase !== 'committing') return refused();
        await apply(bundle, tx);
        await tx.objectStore(SECRET_PROTECTION_STORE).put({ ...bundle.control, key: 'control' });
        const next: SecretProtectionJournal = { ...current, phase: 'applied' };
        await tx.objectStore(SECRET_PROTECTION_STORE).put(next);
        return next;
      });
    },
    finish: (journal, control) =>
      mutate(async (tx) => {
        const current = await requireJournal(tx, journal);
        if (current.phase !== 'applied' || control.epoch !== journal.epoch) return refused();
        await tx
          .objectStore(SECRET_PROTECTION_STORE)
          .put({ ...control, phase: 'stable', key: 'control' });
        await tx.objectStore(SECRET_PROTECTION_STORE).delete('journal');
      }),
    abort: (control) =>
      mutate(async (tx) => {
        const current = parseSecretProtectionControl(
          await tx.objectStore(SECRET_PROTECTION_STORE).get('control')
        );
        const journal = parseJournal(await tx.objectStore(SECRET_PROTECTION_STORE).get('journal'));
        if (!same(current, control) || (journal && journal.phase !== 'prepared')) return refused();
        await tx.objectStore(SECRET_PROTECTION_STORE).delete('journal');
        await tx
          .objectStore(SECRET_PROTECTION_STORE)
          .put({ ...current, phase: 'stable', key: 'control' });
      }),
  };
}
export async function recoverLegacySecretProtectionTransition(): Promise<void> {
  const stored = await browserStorage.local.get([
    LEGACY_SECRET_PROTECTION_TRANSITION_KEY,
    LEGACY_AI_TRANSPARENT_KEY,
    SECRET_PROTECTION_PROFILE_KEY,
  ]);
  const marker = stored[LEGACY_SECRET_PROTECTION_TRANSITION_KEY];
  if (marker === undefined) return;
  if (
    !isRecord(marker) ||
    marker['version'] !== 1 ||
    !['pending-enable', 'pending-disable', 'pending-reset'].includes(
      typeof marker['phase'] === 'string' ? marker['phase'] : ''
    )
  )
    return refused();
  const profile = await readSecretProtectionProfile();
  if (profile) await browserStorage.local.remove(LEGACY_AI_TRANSPARENT_KEY);
  else if (
    marker['phase'] === 'pending-reset' &&
    !(
      typeof stored[LEGACY_AI_TRANSPARENT_KEY] === 'string' &&
      stored[LEGACY_AI_TRANSPARENT_KEY].length > 0
    ) &&
    stored[SECRET_PROTECTION_PROFILE_KEY] !== undefined
  )
    await browserStorage.local.remove([SECRET_PROTECTION_PROFILE_KEY, LEGACY_AI_TRANSPARENT_KEY]);
  await browserStorage.local.remove(LEGACY_SECRET_PROTECTION_TRANSITION_KEY);
}

export async function assertSecretProtectionStableInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>
): Promise<SecretProtectionControl> {
  const control = parseSecretProtectionControl(
    await tx.objectStore(SECRET_PROTECTION_STORE).get('control')
  );
  if (control.phase !== 'stable') throw new SecretProtectionLockedError();
  return control;
}
