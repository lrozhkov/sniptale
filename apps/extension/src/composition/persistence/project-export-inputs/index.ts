import {
  isProjectExportInputReference,
  type ProjectExportInputReference,
} from '../../../contracts/video/types/project-export-input';
import type { VideoProject } from '../../../features/video/project/types/model';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import { initDB, PROJECT_EXPORT_INPUTS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { failProjectExportInput } from './errors';
import { computeProjectExportIntegrity } from './integrity';

export { ProjectExportInputError } from './errors';

const MAX_RETAINED_INPUTS = 4;
const INPUT_RETENTION_MS = 24 * 60 * 60 * 1_000;
const STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;

interface ProjectExportInputRecord extends ProjectExportInputReference {
  createdAt: number;
  project: VideoProject;
}

export async function stageProjectExportInput(
  jobId: string,
  project: VideoProject,
  now = Date.now()
): Promise<ProjectExportInputReference> {
  if (!isExportReadyVideoProject(project)) failProjectExportInput('inputIntegrityFailure');
  const integrity = await computeProjectExportIntegrity(project);
  const reference: ProjectExportInputReference = {
    contentSha256: integrity.contentSha256,
    jobId,
    projectId: project.id,
    retainedByteLength: integrity.retainedByteLength,
  };
  if (!isProjectExportInputReference(reference)) failProjectExportInput('inputIntegrityFailure');
  await assertStorageHeadroom(reference.retainedByteLength);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(PROJECT_EXPORT_INPUTS_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_EXPORT_INPUTS_STORE);
    const existing: unknown = await store.get(jobId);
    if (existing !== undefined) {
      tx.abort();
      failProjectExportInput('jobConflict');
    }
    const allValue: unknown = await store.getAll();
    if (!Array.isArray(allValue)) {
      tx.abort();
      failProjectExportInput('inputIntegrityFailure');
    }
    const retained = await cleanupStaleInputs(store, allValue, now);
    if (retained >= MAX_RETAINED_INPUTS) {
      tx.abort();
      failProjectExportInput('capacityExceeded');
    }
    await store.put({ ...reference, createdAt: now, project } satisfies ProjectExportInputRecord);
    await tx.done;
  });
  return reference;
}

export async function loadProjectExportInput(
  reference: ProjectExportInputReference,
  now = Date.now()
): Promise<VideoProject> {
  if (!isProjectExportInputReference(reference)) failProjectExportInput('inputIntegrityFailure');
  const db = await initDB();
  const value: unknown = await db.get(PROJECT_EXPORT_INPUTS_STORE, reference.jobId);
  return validateStoredInput(value, reference, now);
}

export async function consumeProjectExportInput(
  reference: ProjectExportInputReference,
  now = Date.now()
): Promise<VideoProject> {
  if (!isProjectExportInputReference(reference)) failProjectExportInput('inputIntegrityFailure');
  const value = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(PROJECT_EXPORT_INPUTS_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_EXPORT_INPUTS_STORE);
    const stored: unknown = await store.get(reference.jobId);
    await store.delete(reference.jobId);
    await tx.done;
    return stored;
  });
  return validateStoredInput(value, reference, now);
}

export async function cleanupExpiredProjectExportInputs(now = Date.now()): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(PROJECT_EXPORT_INPUTS_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_EXPORT_INPUTS_STORE);
    const values: unknown = await store.getAll();
    if (!Array.isArray(values)) {
      tx.abort();
      failProjectExportInput('inputIntegrityFailure');
    }
    await cleanupStaleInputs(store, values, now);
    await tx.done;
  });
}

export async function deleteProjectExportInput(jobId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(PROJECT_EXPORT_INPUTS_STORE, jobId));
}

async function validateStoredInput(
  value: unknown,
  reference: ProjectExportInputReference,
  now: number
): Promise<VideoProject> {
  const record = parseProjectExportInputRecord(value);
  if (!record) {
    failProjectExportInput(value === undefined ? 'inputMissing' : 'inputIntegrityFailure');
  }
  if (isExpired(record.createdAt, now)) failProjectExportInput('inputMissing');
  if (!sameReference(record, reference)) failProjectExportInput('inputIntegrityFailure');
  const integrity = await computeProjectExportIntegrity(record.project);
  if (
    integrity.contentSha256 !== record.contentSha256 ||
    integrity.retainedByteLength !== record.retainedByteLength
  ) {
    failProjectExportInput('inputIntegrityFailure');
  }
  return record.project;
}

function parseProjectExportInputRecord(value: unknown): ProjectExportInputRecord | null {
  if (!isRecord(value) || Object.keys(value).length !== 6) return null;
  const reference = {
    contentSha256: value['contentSha256'],
    jobId: value['jobId'],
    projectId: value['projectId'],
    retainedByteLength: value['retainedByteLength'],
  };
  if (
    !isProjectExportInputReference(reference) ||
    typeof value['createdAt'] !== 'number' ||
    !Number.isSafeInteger(value['createdAt']) ||
    value['createdAt'] < 0 ||
    !isExportReadyVideoProject(value['project']) ||
    value['project'].id !== reference.projectId
  ) {
    return null;
  }
  return { ...reference, createdAt: value['createdAt'], project: value['project'] };
}

async function cleanupStaleInputs(
  store: { delete(key: string): Promise<unknown> },
  values: unknown[],
  now: number
): Promise<number> {
  let retained = 0;
  const deletions: Promise<unknown>[] = [];
  for (const value of values) {
    const jobId = isRecord(value) && typeof value['jobId'] === 'string' ? value['jobId'] : null;
    const createdAt = isRecord(value) ? value['createdAt'] : null;
    if (
      jobId &&
      (typeof createdAt !== 'number' ||
        !Number.isSafeInteger(createdAt) ||
        createdAt < 0 ||
        isExpired(createdAt, now))
    ) {
      deletions.push(store.delete(jobId));
      continue;
    }
    retained += 1;
  }
  await Promise.all(deletions);
  return retained;
}

function isExpired(createdAt: number, now: number): boolean {
  return now - createdAt > INPUT_RETENTION_MS;
}

async function assertStorageHeadroom(retainedByteLength: number): Promise<void> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (
    estimate?.quota !== undefined &&
    estimate.usage !== undefined &&
    estimate.usage + retainedByteLength + STORAGE_HEADROOM_BYTES > estimate.quota
  ) {
    failProjectExportInput('quotaExceeded');
  }
}

function sameReference(
  left: ProjectExportInputReference,
  right: ProjectExportInputReference
): boolean {
  return (
    left.jobId === right.jobId &&
    left.projectId === right.projectId &&
    left.contentSha256 === right.contentSha256 &&
    left.retainedByteLength === right.retainedByteLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
