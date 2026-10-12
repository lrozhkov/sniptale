import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoExportFormat, VideoExportQualityPreset } from '../../../features/video/project/types';

const harness = vi.hoisted(() => ({
  acquire: vi.fn(),
  run: vi.fn(),
  releaseJob: vi.fn(),
  releaseReader: vi.fn(),
  ledger: vi.fn(),
}));
vi.mock('../../../composition/persistence/assets/resource-sessions', () => ({
  acquireAssetResourceSession: harness.acquire,
}));
vi.mock('../service/runner', () => ({
  runProjectExport: harness.run,
  releaseProjectExportJob: harness.releaseJob,
  cancelActiveProjectExportJob: vi.fn(),
}));
vi.mock('../../../composition/persistence/export-ledger', () => ({
  loadActiveProjectExportJobLedgerEntry: async () => null,
  upsertProjectExportJobLedgerEntry: harness.ledger,
}));
vi.mock('../service/notifications', () => ({
  sendProjectExportFailed: vi.fn(),
  sendProjectExportCancelled: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  harness.acquire.mockResolvedValue({ release: harness.releaseReader });
  harness.releaseReader.mockResolvedValue(undefined);
  harness.ledger.mockImplementation(async (value) => ({
    ...value,
    status: 'running',
    cancelRequested: false,
  }));
});

import { createProjectExportUseCaseService } from './use-case';

it('exposes offscreen project export use-case operations', () => {
  expect(createProjectExportUseCaseService()).toMatchObject({
    cancelProjectExport: expect.any(Function),
    reconcileProjectExportJobs: expect.any(Function),
    startProjectExport: expect.any(Function),
  });
});

it.each(['completed', 'failed'] as const)(
  'holds a detached export reader through %s and releases after job cleanup',
  async (outcome) => {
    let settle!: () => void;
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });
    harness.run.mockImplementation(async () => {
      await finished;
      if (outcome === 'failed') throw new Error('render failed');
    });
    const project = createEmptyVideoProject('export');
    project.duration = 1;
    const service = createProjectExportUseCaseService();
    const input = vi.fn(async () => {
      expect(harness.acquire).toHaveBeenCalledOnce();
      return project;
    });
    await service.startProjectExport('job', input, {
      width: project.width,
      height: project.height,
      fps: project.fps,
      quality: VideoExportQualityPreset.MEDIUM,
      format: VideoExportFormat.MP4,
      resolution: 'SOURCE',
      mp4VideoCodec: 'AVC',
      downloadAfterExport: true,
    });
    expect(input).toHaveBeenCalledOnce();
    expect(harness.run).toHaveBeenCalledOnce();
    expect(harness.releaseReader).not.toHaveBeenCalled();
    settle();
    await vi.waitFor(() => expect(harness.releaseReader).toHaveBeenCalledOnce());
    expect(harness.releaseJob).toHaveBeenCalledOnce();
    expect(harness.releaseJob.mock.invocationCallOrder[0]).toBeLessThan(
      harness.releaseReader.mock.invocationCallOrder[0]!
    );
  }
);

it('releases a reader after failed input admission without detaching a job', async () => {
  const service = createProjectExportUseCaseService();
  const project = createEmptyVideoProject('export');
  await expect(
    service.startProjectExport(
      'invalid-input',
      async () => {
        throw new Error('input failed');
      },
      {
        width: project.width,
        height: project.height,
        fps: project.fps,
        quality: VideoExportQualityPreset.MEDIUM,
        format: VideoExportFormat.MP4,
        resolution: 'SOURCE',
        mp4VideoCodec: 'AVC',
        downloadAfterExport: true,
      }
    )
  ).rejects.toThrow('input failed');
  expect(harness.run).not.toHaveBeenCalled();
  expect(harness.releaseReader).toHaveBeenCalledOnce();
});
