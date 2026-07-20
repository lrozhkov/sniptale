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
  project: VideoProject,
  settings: VideoProjectExportSettings
): Promise<void> {
  assertExportReadyVideoProject(project);
  assertVideoProjectExportSettingsCompatibleWithProject(project, settings);
  await reconcileInterruptedProjectExportJob(hasActiveProjectExportJob(state), jobId);
  const jobState = registerProjectExportJob(state, jobId);
  if (!jobState) {
    return;
  }

  try {
    await upsertProjectExportJobLedgerEntry({ jobId, projectId: project.id });
  } catch (error) {
    releaseProjectExportJob(jobState);
    releaseProjectExportJobRegistration(state, jobId);
    throw error;
  }

  void runAcceptedProjectExportWithState(state, jobId, project, settings, jobState).catch(
    (error: unknown) => {
      logger.error('Accepted project export detached lifecycle failed', error);
    }
  );
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
      project: VideoProject,
      settings: VideoProjectExportSettings
    ) => startProjectExportWithState(state, jobId, project, settings),
    cancelProjectExport: (jobId: string) => cancelProjectExportWithState(state, jobId),
    reconcileProjectExportJobs,
  };
}
