import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { SupersededAssetPublicationError } from '../../assets';
import {
  RECORDING_RECOVERY_SESSIONS_STORE as SESSIONS,
  type IndexedDbWriteTransaction,
} from '../../infrastructure/indexed-db/core';
import { parseRecoveryRecording } from './storage';

/** The source generation that admits one canonical or recovered publication. */
export interface RecordingRecoverySource {
  id: string;
  incarnation: string;
  epoch: string;
}

export function parseRecordingRecoverySource(raw: unknown): RecordingRecoverySource | null {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    !raw['id'] ||
    raw['id'] === '@epoch' ||
    typeof raw['incarnation'] !== 'string' ||
    !raw['incarnation'] ||
    typeof raw['epoch'] !== 'string' ||
    !raw['epoch']
  )
    return null;
  return { id: raw['id'], incarnation: raw['incarnation'], epoch: raw['epoch'] };
}

/** Revalidate in the publication transaction, after deletion admission and before effects. */
export async function assertRecordingRecoveryPublication(
  tx: IndexedDbWriteTransaction,
  source: RecordingRecoverySource,
  targetId: string
): Promise<void> {
  const store = tx.objectStore(SESSIONS);
  const entry = parseRecoveryRecording(await store.get(source.id));
  const epoch: unknown = await store.get('@epoch');
  if (
    !entry ||
    entry.incarnation !== source.incarnation ||
    entry.epoch !== source.epoch ||
    !isRecord(epoch) ||
    epoch['token'] !== source.epoch ||
    (targetId !== entry.id && targetId !== entry.recoveryId)
  )
    throw new SupersededAssetPublicationError();
}

/** Mark an original recording as saved in the same transaction as publication. */
export async function markRecordingRecoveryPublished(
  tx: IndexedDbWriteTransaction,
  source: RecordingRecoverySource,
  targetId: string
): Promise<void> {
  void targetId;
  const store = tx.objectStore(SESSIONS);
  const entry = parseRecoveryRecording(await store.get(source.id));
  if (!entry) throw new SupersededAssetPublicationError();
  await store.put({ ...entry, published: true });
}
