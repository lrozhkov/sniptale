import type { VideoProjectExportPhase } from '../../../features/video/project/types';

export type ProjectExportJobLedgerStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ProjectExportJobLedgerEntry {
  ownerDocumentId: string | null;
  jobId: string;
  ownerSenderUrl: string | null;
  projectId: string;
  phase: VideoProjectExportPhase;
  progress: number;
  status: ProjectExportJobLedgerStatus;
  startedAt: number;
  updatedAt: number;
  cancelRequested: boolean;
  terminalError: string | null;
}

export type ProjectExportJobLedgerInput = Pick<ProjectExportJobLedgerEntry, 'jobId' | 'projectId'> &
  Partial<
    Pick<
      ProjectExportJobLedgerEntry,
      | 'cancelRequested'
      | 'ownerDocumentId'
      | 'ownerSenderUrl'
      | 'phase'
      | 'progress'
      | 'status'
      | 'terminalError'
    >
  >;
