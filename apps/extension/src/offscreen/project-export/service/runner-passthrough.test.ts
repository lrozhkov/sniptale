import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import type { ExportJobState } from '../types';
import { cancelActiveProjectExportJob, runProjectExport } from './runner';

const {
  canUsePassthroughPathMock,
  cleanupJobMock,
  exportPassthroughMock,
  loadImagesForProjectMock,
  renderCompositeExportMock,
  sendProgressMock,
} = vi.hoisted(() => ({
  canUsePassthroughPathMock: vi.fn(),
  cleanupJobMock: vi.fn(),
  exportPassthroughMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime')>()),
  cleanupJob: cleanupJobMock,
  sendProgress: sendProgressMock,
}));

vi.mock('../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media')>()),
  loadImagesForProject: loadImagesForProjectMock,
}));

vi.mock('../render', () => ({
  canUsePassthroughPath: canUsePassthroughPathMock,
  exportPassthrough: exportPassthroughMock,
  renderCompositeExport: renderCompositeExportMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createJobState(jobId: string): ExportJobState {
  return {
    assetUrls: [],
    audioContext: null,
    audioDestination: null,
    cancelled: false,
    cleanupNode: null,
    clipAudioNodes: new Map(),
    clipMediaElements: new Map(),
    exportAbortController: null,
    exportAudioSettings: null,
    exportStream: null,
    jobId,
    mediaRecorder: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  canUsePassthroughPathMock.mockReturnValue(true);
  exportPassthroughMock.mockResolvedValue(undefined);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  renderCompositeExportMock.mockResolvedValue(undefined);
  sendProgressMock.mockResolvedValue(undefined);
});

it('creates export abort state before the passthrough export path', async () => {
  const project = createEmptyVideoProject('Passthrough', 1280, 720);
  const settings = createSettings();
  const jobState = createJobState('job-passthrough');

  await runProjectExport(jobState.jobId, project, settings, jobState);

  expect(jobState.exportAbortController).toBeInstanceOf(AbortController);
  expect(exportPassthroughMock).toHaveBeenCalledWith(
    expect.objectContaining({
      exportAbortController: expect.any(AbortController),
      jobId: 'job-passthrough',
    }),
    project,
    settings
  );
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});

it('does not enter heavy export work when cancelled while preparing progress is pending', async () => {
  const project = createEmptyVideoProject('Preparing cancel', 1280, 720);
  const settings = createSettings();
  const jobState = createJobState('job-preparing-cancel');
  let resolvePreparingProgress: () => void = () => undefined;

  sendProgressMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolvePreparingProgress = resolve;
    })
  );

  const startPromise = runProjectExport(jobState.jobId, project, settings, jobState);

  expect(jobState.exportAbortController).toBeInstanceOf(AbortController);
  cancelActiveProjectExportJob(jobState);
  resolvePreparingProgress();

  await expect(startPromise).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(canUsePassthroughPathMock).not.toHaveBeenCalled();
  expect(exportPassthroughMock).not.toHaveBeenCalled();
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});
