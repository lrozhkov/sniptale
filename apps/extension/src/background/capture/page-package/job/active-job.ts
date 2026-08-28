import type { ActivePopupExportJob } from './runtime-state';

let activeJob: ActivePopupExportJob | null = null;

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
