import {
  createProjectExportServiceState,
  hasActiveProjectExportJob,
  registerProjectExportJob,
  releaseProjectExportJobRegistration,
} from '../service/state';
import {
  cancelActiveProjectExportJob,
  releaseProjectExportJob,
  runProjectExport,
} from '../service/runner';
import { sendProjectExportCancelled, sendProjectExportFailed } from '../service/notifications';
import { assertExportReadyVideoProject } from '../../../features/video/project/validation/root';
import * as settingsValidation from '../../../features/video/project/export/settings-validation';
import { type VideoProjectExportSettings } from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';
import { translate } from '../../../platform/i18n';
import {
  loadActiveProjectExportJobLedgerEntry,
  markProjectExportJobTerminal,
  requestProjectExportJobCancel,
  upsertProjectExportJobLedgerEntry,
} from '../../../composition/persistence/export-ledger';
import type { ExportJobState } from '../types';
import { createLogger } from '@sniptale/platform/observability/logger';

const EXPORT_INTERRUPTED_ERROR_KEY = 'offscreenExport.interruptedByRuntimeRestart';
const logger = createLogger({ namespace: 'OffscreenProjectExportService' });
const { assertVideoProjectExportSettingsCompatibleWithProject } = settingsValidation;
type ProjectExportServiceState = ReturnType<typeof createProjectExportServiceState>;

async function reconcileInterruptedProjectExportJob(
  hasActiveJob: boolean,
  admittedJobId?: string
): Promise<void> {
  if (hasActiveJob) {
    return;
  }

  const activeLedgerEntry = await loadActiveProjectExportJobLedgerEntry();
  if (!activeLedgerEntry || activeLedgerEntry.status !== 'running') {
    return;
  }
  if (activeLedgerEntry.jobId === admittedJobId) {
    return;
  }

  const errorMessage = translate(EXPORT_INTERRUPTED_ERROR_KEY);
  await sendProjectExportFailed(activeLedgerEntry.jobId, new Error(errorMessage));
}

async function startProjectExportWithState(
  state: ProjectExportServiceState,
  jobId: string,
  input: VideoProject | (() => Promise<VideoProject>),
  settings: VideoProjectExportSettings,
  prepareData?: () => Promise<void>
): Promise<void> {
  const jobState = registerProjectExportJob(state, jobId);
  if (!jobState) return;
  const abort = new AbortController();
  jobState.exportAbortController = abort;
  let detached = false;
  let rejectCancellation!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const onCancel = () => rejectCancellation(new Error('PROJECT_EXPORT_CANCELLED'));
  abort.signal.addEventListener('abort', onCancel, { once: true });
  const assertCurrent = () => {
    if (jobState.cancelled || state.activeJobs.get(jobId) !== jobState)
      throw new Error('PROJECT_EXPORT_CANCELLED');
  };
  try {
    await Promise.race([prepareData?.() ?? Promise.resolve(), cancelled]);
    assertCurrent();
    const project = await Promise.race([
      typeof input === 'function' ? input() : Promise.resolve(input),
      cancelled,
    ]);
    assertCurrent();
    assertExportReadyVideoProject(project);
    assertVideoProjectExportSettingsCompatibleWithProject(project, settings);
    await reconcileInterruptedProjectExportJob(false, jobId);
    assertCurrent();
    const existing = await loadActiveProjectExportJobLedgerEntry();
    assertCurrent();
    if (existing?.jobId === jobId && (existing.status !== 'running' || existing.cancelRequested))
      return;
    const admitted = await upsertProjectExportJobLedgerEntry({ jobId, projectId: project.id });
    assertCurrent();
    if (admitted.status !== 'running' || admitted.cancelRequested) return;
    detached = true;
    void runAcceptedProjectExportWithState(state, jobId, project, settings, jobState).catch(() =>
      logger.error('Accepted project export detached lifecycle failed')
    );
  } catch (error) {
    if (jobState.cancelled) {
      await sendProjectExportCancelled(jobId);
      return;
    }
    throw error;
  } finally {
    abort.signal.removeEventListener('abort', onCancel);
    if (!detached) {
      releaseProjectExportJob(jobState);
      if (state.activeJobs.get(jobId) === jobState)
        releaseProjectExportJobRegistration(state, jobId);
    }
  }
}

async function runAcceptedProjectExportWithState(
  state: ProjectExportServiceState,
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  jobState: ExportJobState
): Promise<void> {
  try {
    await runProjectExport(jobId, project, settings, jobState);
  } catch (error) {
    if (jobState.cancelled) {
      await sendProjectExportCancelled(jobId);
      return;
    }

    await sendProjectExportFailed(jobId, error);
  } finally {
    releaseProjectExportJob(jobState);
    releaseProjectExportJobRegistration(state, jobId);
  }
}

async function cancelProjectExportWithState(
  state: ProjectExportServiceState,
  jobId: string
): Promise<void> {
  const activeJob = state.activeJobs.get(jobId);
  if (activeJob) {
    cancelActiveProjectExportJob(activeJob);
    await requestProjectExportJobCancel(jobId);
    return;
  }

  await requestProjectExportJobCancel(jobId);
  await markProjectExportJobTerminal(jobId, 'cancelled');
}

export function createProjectExportUseCaseService() {
  const state = createProjectExportServiceState();

  async function reconcileProjectExportJobs(): Promise<void> {
    await reconcileInterruptedProjectExportJob(hasActiveProjectExportJob(state));
  }

  return {
    startProjectExport: (
      jobId: string,
      project: VideoProject | (() => Promise<VideoProject>),
      settings: VideoProjectExportSettings,
      prepareData?: () => Promise<void>
    ) => startProjectExportWithState(state, jobId, project, settings, prepareData),
    cancelProjectExport: (jobId: string) => cancelProjectExportWithState(state, jobId),
    reconcileProjectExportJobs,
  };
}
