import { describe, expect, it, vi } from 'vitest';

const { reconcileCaptureJobDownloadMock } = vi.hoisted(() => ({
  reconcileCaptureJobDownloadMock: vi.fn(),
}));

vi.mock('./service-singleton', () => ({
  defaultDownloadRouterService: {
    reconcileCaptureJobDownload: reconcileCaptureJobDownloadMock,
  },
}));

import { reconcileCaptureJobDownloadOnStartup } from './reconciliation';
import type { CaptureJobRecord } from '../../jobs/state-machine';

function createExportingJob(downloadId?: number): CaptureJobRecord {
  return {
    ...(downloadId === undefined ? {} : { downloadId }),
    jobId: 'capture-job',
    revision: 3,
    runtimeGeneration: 'previous-worker',
    state: 'exporting',
    tabId: 7,
    updatedAtEpochMs: Date.now(),
  };
}

describe('reconcileCaptureJobDownloadOnStartup', () => {
  it('fails closed when an exporting job has no persisted download id', async () => {
    await expect(reconcileCaptureJobDownloadOnStartup(createExportingJob())).resolves.toBe(
      'missing'
    );

    expect(reconcileCaptureJobDownloadMock).not.toHaveBeenCalled();
  });

  it('delegates persisted download ids to the default download router service', async () => {
    reconcileCaptureJobDownloadMock.mockResolvedValueOnce('rebound');

    await expect(reconcileCaptureJobDownloadOnStartup(createExportingJob(44))).resolves.toBe(
      'rebound'
    );

    expect(reconcileCaptureJobDownloadMock).toHaveBeenCalledWith(44, 'capture-job');
  });
});
