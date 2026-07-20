import { type CaptureJobRecord, type CaptureJobState } from './record';
import { runCaptureTabExclusive } from './tab-work-fence';
import type { CaptureJobStore } from './store';

type CaptureJobPatch = Partial<Omit<CaptureJobRecord, 'jobId' | 'revision' | 'state' | 'tabId'>>;

export const captureJobPolicyState = {
  policyStateId: 'capture-download-jobs',
} as const;

export type CaptureJobService = {
  bindDownload(jobId: string, downloadId: number): Promise<CaptureJobRecord>;
  clearForTests(): Promise<void>;
  create(tabId: number): Promise<CaptureJobRecord>;
  getRuntimeGeneration(): string;
  hasCurrentRuntimeActiveJobForTab(tabId: number): Promise<boolean>;
  hydrateForReconciliation(): Promise<CaptureJobRecord[]>;
  listActive(): Promise<CaptureJobRecord[]>;
  read(jobId: string): Promise<CaptureJobRecord | undefined>;
  remove(jobId: string): Promise<void>;
  transition(
    jobId: string,
    nextState: CaptureJobState,
    patch?: CaptureJobPatch
  ): Promise<CaptureJobRecord>;
};

const allowedTransitions = new Map<CaptureJobState, readonly CaptureJobState[]>([
  ['created', ['capturing', 'failed', 'cancelled']],
  ['capturing', ['rendering', 'failed', 'cancelled']],
  ['rendering', ['exporting', 'completed', 'failed', 'cancelled']],
  ['exporting', ['completed', 'failed', 'cancelled']],
  ['completed', []],
  ['failed', []],
  ['cancelled', []],
]);

export function createCaptureJobService(args: {
  now?: (() => number) | undefined;
  randomId?: (() => string) | undefined;
  runtimeGeneration: string;
  store: CaptureJobStore;
}): CaptureJobService {
  const now = args.now ?? Date.now;
  const randomId = args.randomId ?? (() => crypto.randomUUID());

  return {
    bindDownload: (jobId, downloadId) =>
      transitionJob(args.store, now, jobId, 'exporting', { downloadId }),
    clearForTests: () => args.store.clear(),
    create: (tabId) => createJob(args.store, now, randomId, args.runtimeGeneration, tabId),
    getRuntimeGeneration: () => args.runtimeGeneration,
    hasCurrentRuntimeActiveJobForTab: (tabId) =>
      hasCurrentRuntimeActiveJobForTab(args.store, args.runtimeGeneration, tabId),
    hydrateForReconciliation: () => args.store.hydrateForReconciliation(),
    listActive: () => listActiveJobs(args.store),
    read: (jobId) => args.store.read(jobId),
    remove: (jobId) => args.store.remove(jobId),
    transition: (jobId, nextState, patch = {}) =>
      transitionJob(args.store, now, jobId, nextState, patch),
  };
}

function createJob(
  store: CaptureJobStore,
  now: () => number,
  randomId: () => string,
  runtimeGeneration: string,
  tabId: number
): Promise<CaptureJobRecord> {
  return runCaptureTabExclusive(tabId, async () =>
    store.create(
      createCaptureJobRecord({
        now: now(),
        randomId: randomId(),
        runtimeGeneration,
        tabId,
      })
    )
  );
}

function transitionJob(
  store: CaptureJobStore,
  now: () => number,
  jobId: string,
  nextState: CaptureJobState,
  patch: CaptureJobPatch = {}
): Promise<CaptureJobRecord> {
  return store.transition(jobId, (job) =>
    applyCaptureJobTransition({
      job,
      nextState,
      now: now(),
      patch,
    })
  );
}

async function hasCurrentRuntimeActiveJobForTab(
  store: CaptureJobStore,
  runtimeGeneration: string,
  tabId: number
): Promise<boolean> {
  return (await store.hydrateForReconciliation()).some(
    (job) =>
      job.tabId === tabId &&
      job.runtimeGeneration === runtimeGeneration &&
      !isTerminalState(job.state)
  );
}

async function listActiveJobs(store: CaptureJobStore): Promise<CaptureJobRecord[]> {
  return (await store.hydrateForReconciliation()).filter((job) => !isTerminalState(job.state));
}

export function isTerminalState(state: CaptureJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

export function assertTransitionAllowed(current: CaptureJobState, next: CaptureJobState): void {
  if (current === next) {
    return;
  }
  if (!allowedTransitions.get(current)?.includes(next)) {
    throw new Error(`Invalid capture job transition ${current} -> ${next}`);
  }
}

export function applyCaptureJobTransition(args: {
  job: CaptureJobRecord;
  nextState: CaptureJobState;
  now: number;
  patch?: CaptureJobPatch | undefined;
}): CaptureJobRecord {
  assertTransitionAllowed(args.job.state, args.nextState);
  return {
    ...args.job,
    ...args.patch,
    revision: args.job.revision + 1,
    state: args.nextState,
    terminalAtEpochMs: isTerminalState(args.nextState) ? args.now : args.job.terminalAtEpochMs,
    updatedAtEpochMs: args.now,
  };
}

function createCaptureJobRecord(args: {
  now: number;
  randomId: string;
  runtimeGeneration: string;
  tabId: number;
}): CaptureJobRecord {
  return {
    jobId: `capture-${args.tabId}-${args.randomId}`,
    revision: 0,
    runtimeGeneration: args.runtimeGeneration,
    state: 'created',
    tabId: args.tabId,
    updatedAtEpochMs: args.now,
  };
}
