import type { StateManager } from '@sniptale/platform/data/state-manager/types';
import { parseCaptureJobRecord, type CaptureJobRecord } from './record';

export const CAPTURE_JOB_DOMAIN = 'background.capture.jobs';

export type CaptureJobStore = {
  clear(): Promise<void>;
  create(job: CaptureJobRecord): Promise<CaptureJobRecord>;
  hydrateForReconciliation(): Promise<CaptureJobRecord[]>;
  read(jobId: string): Promise<CaptureJobRecord | undefined>;
  remove(jobId: string): Promise<void>;
  transition(
    jobId: string,
    update: (job: CaptureJobRecord) => CaptureJobRecord | undefined
  ): Promise<CaptureJobRecord>;
};

export function createStateManagerCaptureJobStore(args: {
  stateManager: StateManager;
}): CaptureJobStore {
  const { stateManager } = args;

  return {
    clear: () => stateManager.clearDomain(CAPTURE_JOB_DOMAIN),
    create: (job) => createCaptureJobRecord(stateManager, job),
    hydrateForReconciliation: () => hydrateCaptureJobsForReconciliation(stateManager),
    read: (jobId) => readCaptureJobRecord(stateManager, jobId),
    remove: (jobId) => stateManager.remove(CAPTURE_JOB_DOMAIN, jobId),
    transition: (jobId, update) => transitionCaptureJobRecord(stateManager, jobId, update),
  };
}

async function createCaptureJobRecord(
  stateManager: StateManager,
  job: CaptureJobRecord
): Promise<CaptureJobRecord> {
  await stateManager.write<CaptureJobRecord>(CAPTURE_JOB_DOMAIN, job.jobId, job);
  return job;
}

async function hydrateCaptureJobsForReconciliation(
  stateManager: StateManager
): Promise<CaptureJobRecord[]> {
  const hydrated = await stateManager.hydrate(CAPTURE_JOB_DOMAIN);
  const { invalidKeys, validJobs } = partitionHydratedCaptureJobs(hydrated);

  if (invalidKeys.length > 0) {
    await stateManager.removeMany(CAPTURE_JOB_DOMAIN, invalidKeys);
  }

  return validJobs;
}

function partitionHydratedCaptureJobs(hydrated: Record<string, unknown>): {
  invalidKeys: string[];
  validJobs: CaptureJobRecord[];
} {
  const validJobs: CaptureJobRecord[] = [];
  const invalidKeys: string[] = [];
  Object.entries(hydrated).forEach(([jobId, value]) => {
    const job = parseCaptureJobRecord(value, jobId);
    if (job) {
      validJobs.push(job);
    } else {
      invalidKeys.push(jobId);
    }
  });
  return { invalidKeys, validJobs };
}

async function readCaptureJobRecord(
  stateManager: StateManager,
  jobId: string
): Promise<CaptureJobRecord | undefined> {
  return (
    parseCaptureJobRecord(await stateManager.read(CAPTURE_JOB_DOMAIN, jobId), jobId) ?? undefined
  );
}

async function transitionCaptureJobRecord(
  stateManager: StateManager,
  jobId: string,
  update: (job: CaptureJobRecord) => CaptureJobRecord | undefined
): Promise<CaptureJobRecord> {
  const snapshot = await stateManager.mutate<unknown>(CAPTURE_JOB_DOMAIN, jobId, (value) =>
    updateParsedCaptureJob(jobId, value, update)
  );
  const parsed = parseCaptureJobRecord(snapshot.value, jobId);
  if (!parsed) {
    throw new Error(`Capture job "${jobId}" was invalid and was removed`);
  }
  return parsed;
}

function updateParsedCaptureJob(
  jobId: string,
  value: unknown,
  update: (job: CaptureJobRecord) => CaptureJobRecord | undefined
): CaptureJobRecord | undefined {
  if (value === undefined) {
    throw new Error(`Capture job "${jobId}" was not found`);
  }
  const job = parseCaptureJobRecord(value, jobId);
  return job ? update(job) : undefined;
}
