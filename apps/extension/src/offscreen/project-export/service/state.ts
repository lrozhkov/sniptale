import { translate } from '../../../platform/i18n';
import type { ExportJobState } from '../types';

interface ProjectExportServiceState {
  activeJobs: Map<string, ExportJobState>;
  activeJobId: string | null;
}

export function createProjectExportServiceState(): ProjectExportServiceState {
  return {
    activeJobs: new Map<string, ExportJobState>(),
    activeJobId: null,
  };
}

export function createExportJobState(jobId: string): ExportJobState {
  return {
    jobId,
    cancelled: false,
    mediaRecorder: null,
    clipMediaElements: new Map(),
    clipAudioNodes: new Map(),
    audioContext: null,
    audioDestination: null,
    exportAudioSettings: null,
    assetUrls: [],
    cleanupNode: null,
    exportAbortController: null,
    exportStream: null,
  };
}

export function registerProjectExportJob(
  state: ProjectExportServiceState,
  jobId: string
): ExportJobState | null {
  const existingJob = state.activeJobs.get(jobId);
  if (existingJob) {
    return null;
  }

  if (state.activeJobId !== null) {
    throw new Error(translate('offscreenExport.alreadyRunning'));
  }

  const jobState = createExportJobState(jobId);
  state.activeJobs.set(jobId, jobState);
  state.activeJobId = jobId;
  return jobState;
}

export function hasActiveProjectExportJob(state: ProjectExportServiceState): boolean {
  return state.activeJobId !== null;
}

export function releaseProjectExportJobRegistration(
  state: ProjectExportServiceState,
  jobId: string
): void {
  state.activeJobs.delete(jobId);
  if (state.activeJobId === jobId) {
    state.activeJobId = null;
  }
}
