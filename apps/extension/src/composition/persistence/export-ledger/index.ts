import { browserStorage } from '../infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoProjectExportPhase } from '../../../features/video/project/types';
import { parseProjectExportJobLedgerEntry } from './guards';
import type {
  ProjectExportJobLedgerEntry,
  ProjectExportJobLedgerInput,
  ProjectExportJobLedgerStatus,
} from './types';
import { enqueueProjectExportLedgerWrite, PROJECT_EXPORT_JOB_LEDGER_KEY } from './write-queue';
export type {
  ProjectExportJobLedgerEntry,
  ProjectExportJobLedgerInput,
  ProjectExportJobLedgerStatus,
} from './types';
export { clearProjectExportJobLedgerForPrivacyErasure } from './privacy-erasure';

const logger = createLogger({ namespace: 'SharedVideoExportStorage' });

export type ProjectExportJobLedgerInspection =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'unavailable' }
  | { entry: ProjectExportJobLedgerEntry; status: 'entry' };

const phaseRanks: Record<VideoProjectExportPhase, number> = {
  [VideoProjectExportPhase.PREPARING]: 0,
  [VideoProjectExportPhase.RENDERING]: 1,
  [VideoProjectExportPhase.TRANSCODING]: 2,
  [VideoProjectExportPhase.SAVING]: 3,
  [VideoProjectExportPhase.DONE]: 4,
  [VideoProjectExportPhase.FAILED]: 4,
  [VideoProjectExportPhase.CANCELLED]: 4,
};

function resolveLedgerPhase(
  nextPhase: VideoProjectExportPhase | undefined,
  existing: ProjectExportJobLedgerEntry | null
): VideoProjectExportPhase {
  if (!existing || !nextPhase) {
    return nextPhase ?? existing?.phase ?? VideoProjectExportPhase.PREPARING;
  }

  return phaseRanks[nextPhase] >= phaseRanks[existing.phase] ? nextPhase : existing.phase;
}

function resolveLedgerProgress(
  nextProgress: number | undefined,
  existing: ProjectExportJobLedgerEntry | null
): number {
  const normalizedProgress = nextProgress === undefined ? undefined : Math.max(0, nextProgress);
  return Math.min(100, Math.max(existing?.progress ?? 0, normalizedProgress ?? 0));
}

function createProjectExportJobLedgerEntry(
  input: ProjectExportJobLedgerInput,
  existing?: ProjectExportJobLedgerEntry | null
): ProjectExportJobLedgerEntry {
  const now = Date.now();
  const matchingExisting = existing?.jobId === input.jobId ? existing : null;
  if (matchingExisting && matchingExisting.status !== 'running') {
    return matchingExisting;
  }

  return {
    jobId: input.jobId,
    ownerDocumentId: input.ownerDocumentId ?? matchingExisting?.ownerDocumentId ?? null,
    ownerSenderUrl: input.ownerSenderUrl ?? matchingExisting?.ownerSenderUrl ?? null,
    projectId: input.projectId,
    phase: resolveLedgerPhase(input.phase, matchingExisting),
    progress: resolveLedgerProgress(input.progress, matchingExisting),
    status: input.status ?? matchingExisting?.status ?? 'running',
    startedAt: matchingExisting?.startedAt ?? now,
    updatedAt: now,
    cancelRequested: input.cancelRequested ?? matchingExisting?.cancelRequested ?? false,
    terminalError: input.terminalError ?? matchingExisting?.terminalError ?? null,
  };
}

export async function inspectActiveProjectExportJobLedgerEntry(): Promise<ProjectExportJobLedgerInspection> {
  if (!browserStorage.session.isAvailable()) {
    return { status: 'unavailable' };
  }

  const result = await browserStorage.session.get([PROJECT_EXPORT_JOB_LEDGER_KEY]);
  const rawEntry = result[PROJECT_EXPORT_JOB_LEDGER_KEY];
  if (rawEntry === undefined) return { status: 'absent' };
  const entry = parseProjectExportJobLedgerEntry(rawEntry);

  if (!entry) {
    logger.warn('Ignoring invalid project export job ledger entry from session storage');
    return { status: 'invalid' };
  }

  return { entry, status: 'entry' };
}

export async function loadActiveProjectExportJobLedgerEntry(): Promise<ProjectExportJobLedgerEntry | null> {
  const inspection = await inspectActiveProjectExportJobLedgerEntry();
  return inspection.status === 'entry' ? inspection.entry : null;
}

export async function upsertProjectExportJobLedgerEntry(
  input: ProjectExportJobLedgerInput
): Promise<ProjectExportJobLedgerEntry> {
  if (!browserStorage.session.isAvailable()) {
    return createProjectExportJobLedgerEntry(input);
  }

  return enqueueProjectExportLedgerWrite(async () => {
    const existing = await loadActiveProjectExportJobLedgerEntry();
    const nextEntry = createProjectExportJobLedgerEntry(input, existing);

    if (nextEntry !== existing) {
      await browserStorage.session.set({ [PROJECT_EXPORT_JOB_LEDGER_KEY]: nextEntry });
    }
    return nextEntry;
  });
}

export async function reserveProjectExportJobLedgerEntry(
  input: ProjectExportJobLedgerInput
): Promise<ProjectExportJobLedgerEntry> {
  if (!browserStorage.session.isAvailable()) {
    return createProjectExportJobLedgerEntry(input);
  }

  return enqueueProjectExportLedgerWrite(async () => {
    const existing = await loadActiveProjectExportJobLedgerEntry();
    if (existing?.status === 'running') {
      throw new Error(
        existing.jobId === input.jobId
          ? 'Project export is already running'
          : 'Another project export is already running'
      );
    }

    const nextEntry = createProjectExportJobLedgerEntry(input, existing);
    await browserStorage.session.set({ [PROJECT_EXPORT_JOB_LEDGER_KEY]: nextEntry });
    return nextEntry;
  });
}

export async function requestProjectExportJobCancel(
  jobId: string
): Promise<ProjectExportJobLedgerEntry | null> {
  return enqueueProjectExportLedgerWrite(async () => {
    const existing = await loadActiveProjectExportJobLedgerEntry();
    if (!existing || existing.jobId !== jobId) {
      return null;
    }
    if (existing.status !== 'running') {
      return existing;
    }

    const nextEntry = createProjectExportJobLedgerEntry(
      {
        jobId: existing.jobId,
        projectId: existing.projectId,
        cancelRequested: true,
        status: 'running',
      },
      existing
    );

    await browserStorage.session.set({ [PROJECT_EXPORT_JOB_LEDGER_KEY]: nextEntry });
    return nextEntry;
  });
}

export async function markProjectExportJobTerminal(
  jobId: string,
  status: Exclude<ProjectExportJobLedgerStatus, 'running'>,
  terminalError: string | null = null
): Promise<ProjectExportJobLedgerEntry | null> {
  return enqueueProjectExportLedgerWrite(async () => {
    const existing = await loadActiveProjectExportJobLedgerEntry();
    if (!existing || existing.jobId !== jobId) {
      return null;
    }
    if (existing.status !== 'running') {
      return existing;
    }
    const terminalStatus =
      status === 'completed' && existing.cancelRequested ? 'cancelled' : status;

    const nextEntry = createProjectExportJobLedgerEntry(
      {
        jobId: existing.jobId,
        projectId: existing.projectId,
        status: terminalStatus,
        progress: terminalStatus === 'completed' ? 100 : existing.progress,
        terminalError,
        cancelRequested: terminalStatus === 'cancelled' ? true : existing.cancelRequested,
        phase:
          terminalStatus === 'completed'
            ? VideoProjectExportPhase.DONE
            : terminalStatus === 'failed'
              ? VideoProjectExportPhase.FAILED
              : VideoProjectExportPhase.CANCELLED,
      },
      existing
    );

    await browserStorage.session.set({ [PROJECT_EXPORT_JOB_LEDGER_KEY]: nextEntry });
    return nextEntry;
  });
}

export async function clearProjectExportJobLedgerEntry(jobId: string): Promise<void> {
  await enqueueProjectExportLedgerWrite(async () => {
    const existing = await loadActiveProjectExportJobLedgerEntry();
    if (!existing || existing.jobId !== jobId) {
      return;
    }

    await browserStorage.session.remove(PROJECT_EXPORT_JOB_LEDGER_KEY);
  });
}
