import type { CaptureJobState } from './record';
import { getDefaultCaptureJobService } from './default-service';
import { CAPTURE_JOB_DOMAIN } from './store';

export type { CaptureJobRecord } from './record';
export { CAPTURE_JOB_DOMAIN };

export function getCaptureJobRuntimeGeneration(): string {
  return getDefaultCaptureJobService().getRuntimeGeneration();
}

export async function createCaptureJob(tabId: number) {
  return getDefaultCaptureJobService().create(tabId);
}

export async function transitionCaptureJob(jobId: string, nextState: CaptureJobState, patch = {}) {
  return getDefaultCaptureJobService().transition(jobId, nextState, patch);
}

export async function bindDownloadToCaptureJob(jobId: string, downloadId: number) {
  return getDefaultCaptureJobService().bindDownload(jobId, downloadId);
}

export async function readCaptureJob(jobId: string) {
  return getDefaultCaptureJobService().read(jobId);
}

export async function hydrateCaptureJobsForReconciliation() {
  return getDefaultCaptureJobService().hydrateForReconciliation();
}

export async function hasCurrentRuntimeActiveCaptureJobForTab(tabId: number) {
  return getDefaultCaptureJobService().hasCurrentRuntimeActiveJobForTab(tabId);
}

export async function listActiveCaptureJobs() {
  return getDefaultCaptureJobService().listActive();
}

export async function removeCaptureJob(jobId: string) {
  return getDefaultCaptureJobService().remove(jobId);
}

export async function clearCaptureJobsForTests() {
  return getDefaultCaptureJobService().clearForTests();
}
