import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { VIDEO_PROJECT_REVISIONS_STORE } from '../infrastructure/indexed-db/core.stores';

type ProjectRevisionTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;

/** This counter belongs to local project admission and survives ordinary root deletion. */
interface VideoProjectRevision {
  version: 1;
  projectId: string;
  revision: number;
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

async function highestProjectRevision(
  tx: ProjectRevisionTransaction,
  projectId: string,
  currentRevision: number
): Promise<number> {
  if (!projectId || !validRevision(currentRevision))
    throw new Error('Invalid local video project revision.');
  const raw: unknown = await tx.objectStore(VIDEO_PROJECT_REVISIONS_STORE).get(projectId);
  if (raw === undefined) return currentRevision;
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    raw['projectId'] !== projectId ||
    !validRevision(raw['revision'])
  )
    throw new Error('Invalid retained video project revision.');
  return Math.max(currentRevision, raw['revision']);
}

/** Allocate a fresh local token with the caller's accepted native mutation. */
export async function allocateVideoProjectRevisionInTransaction(
  tx: ProjectRevisionTransaction,
  projectId: string,
  currentRevision: number
): Promise<number> {
  const highest = await highestProjectRevision(tx, projectId, currentRevision);
  if (highest === Number.MAX_SAFE_INTEGER)
    throw new Error('Local video project revisions are exhausted.');
  const revision = highest + 1;
  const record: VideoProjectRevision = { version: 1, projectId, revision };
  await tx.objectStore(VIDEO_PROJECT_REVISIONS_STORE).put(record);
  return revision;
}

/** Retire a live identity without permitting its admission token to be reused. */
export async function retainVideoProjectRevisionInTransaction(
  tx: ProjectRevisionTransaction,
  projectId: string,
  currentRevision: number
): Promise<void> {
  const revision = await highestProjectRevision(tx, projectId, currentRevision);
  const record: VideoProjectRevision = { version: 1, projectId, revision };
  await tx.objectStore(VIDEO_PROJECT_REVISIONS_STORE).put(record);
}
