import type { ExportProgressStepKey } from '@sniptale/runtime-contracts/export';
import { updatePagePackageJobStatus, type ActivePopupExportJob } from './runtime-state';

let activeJob: ActivePopupExportJob | null = null;
type ProducerProgressState = {
  activeStepKey: ExportProgressStepKey | null;
  activeStepsByTab: Map<
    number,
    Partial<Record<'structured' | 'webSnapshot', ExportProgressStepKey>>
  >;
  completedTabsByStep: Map<ExportProgressStepKey, Set<number>>;
  publishedCompletedStepKeys: Set<ExportProgressStepKey>;
};
type ProducerLane = 'structured' | 'webSnapshot';
const producerProgress = new WeakMap<ActivePopupExportJob, ProducerProgressState>();

function createProducerProgressState(
  job: ActivePopupExportJob,
  selectedTabIds: number[]
): ProducerProgressState {
  const completedStepKeys = job.status.progress.completedStepKeys ?? [];
  const completedTabsByStep = new Map<ExportProgressStepKey, Set<number>>();
  for (const stepKey of completedStepKeys) {
    completedTabsByStep.set(stepKey, new Set(selectedTabIds));
  }
  return {
    activeStepKey: job.status.progress.activeStepKey ?? null,
    activeStepsByTab: new Map(),
    completedTabsByStep,
    publishedCompletedStepKeys: new Set(completedStepKeys),
  };
}

function markProducerStepCompleted(args: {
  state: ProducerProgressState;
  stepKey: ExportProgressStepKey;
  tabId: number;
}): void {
  const completedTabs = args.state.completedTabsByStep.get(args.stepKey) ?? new Set<number>();
  completedTabs.add(args.tabId);
  args.state.completedTabsByStep.set(args.stepKey, completedTabs);
}

function collectGloballyCompletedSteps(
  state: ProducerProgressState,
  selectedTabIds: number[]
): ExportProgressStepKey[] {
  return [...state.completedTabsByStep]
    .filter(([, tabIds]) => selectedTabIds.every((tabId) => tabIds.has(tabId)))
    .map(([stepKey]) => stepKey);
}

export function getActivePagePackageJob(): ActivePopupExportJob | null {
  return activeJob;
}

export function claimActivePagePackageJob(job: ActivePopupExportJob): boolean {
  if (activeJob) return false;
  activeJob = job;
  return true;
}

export function releaseActivePagePackageJob(job: ActivePopupExportJob): void {
  if (activeJob === job) activeJob = null;
  producerProgress.delete(job);
}

export function assertActivePopupExportStageBinding(args: {
  jobId: string;
  ordinal: number;
  tabId: number;
}): void {
  const selected = activeJob?.status.orderedTabs[args.ordinal];
  if (
    !activeJob ||
    activeJob.cancelled ||
    activeJob.status.phase !== 'running' ||
    activeJob.status.jobId !== args.jobId ||
    selected?.tabId !== args.tabId
  ) {
    throw new Error('Page Package stage is not bound to the active job.');
  }
}

export async function updateActivePagePackageJobProducerProgress(args: {
  activeStepKey: ExportProgressStepKey;
  current: number;
  requestId: string;
  tabId: number;
  total: number;
}): Promise<void> {
  const job = activeJob;
  const selected = job?.status.orderedTabs.find((tab) => tab.tabId === args.tabId);
  if (
    !job ||
    job.cancelled ||
    job.status.phase !== 'running' ||
    job.status.jobId !== args.requestId ||
    !selected
  ) {
    throw new Error('Page Package progress is not bound to the active job.');
  }
  const selectedTabIds = job.status.orderedTabs.map((tab) => tab.tabId);
  const state = producerProgress.get(job) ?? createProducerProgressState(job, selectedTabIds);
  const lane: ProducerLane = args.activeStepKey.startsWith('webSnapshot')
    ? 'webSnapshot'
    : 'structured';
  const activeSteps = state.activeStepsByTab.get(args.tabId) ?? {};
  const previousLaneStep = activeSteps[lane];
  if (previousLaneStep && previousLaneStep !== args.activeStepKey) {
    markProducerStepCompleted({ state, stepKey: previousLaneStep, tabId: args.tabId });
  }
  if (args.total > 0 && args.current >= args.total) {
    markProducerStepCompleted({ state, stepKey: args.activeStepKey, tabId: args.tabId });
  }
  const completedStepKeys = collectGloballyCompletedSteps(state, selectedTabIds);
  const unchanged =
    state.activeStepKey === args.activeStepKey &&
    completedStepKeys.length === state.publishedCompletedStepKeys.size &&
    completedStepKeys.every((stepKey) => state.publishedCompletedStepKeys.has(stepKey));
  state.activeStepKey = args.activeStepKey;
  activeSteps[lane] = args.activeStepKey;
  state.activeStepsByTab.set(args.tabId, activeSteps);
  state.publishedCompletedStepKeys = new Set(completedStepKeys);
  producerProgress.set(job, state);
  if (unchanged) return;
  try {
    await updatePagePackageJobStatus(job, {
      progress: {
        ...job.status.progress,
        activeStepKey: args.activeStepKey,
        completedStepKeys,
        current: args.current,
        total: args.total,
      },
    });
  } catch (error) {
    producerProgress.delete(job);
    throw error;
  }
}

export async function markActivePagePackageJobProducerFailure(
  job: ActivePopupExportJob,
  failedStepKey: ExportProgressStepKey | null
): Promise<void> {
  if (!failedStepKey) return;
  const failedStepKeys = new Set(job.status.progress.failedStepKeys ?? []);
  failedStepKeys.add(failedStepKey);
  await updatePagePackageJobStatus(job, {
    progress: {
      ...job.status.progress,
      activeStepKey: failedStepKey,
      failedStepKeys: [...failedStepKeys],
    },
  });
}
