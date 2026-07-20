import { beforeEach, expect, it, vi } from 'vitest';
import { cancelActiveProjectExportJob, releaseProjectExportJob, runProjectExport } from './runner';
import { VideoExportFormat, VideoExportQualityPreset } from '../../../features/video/project/types';

// State-machine proof: cancel/failure cleanup keeps export resources terminal.
const {
  exportPassthroughMock,
  canUsePassthroughPathMock,
  loadImagesForProjectMock,
  renderCompositeExportMock,
  sendProgressMock,
  cleanupJobMock,
} = vi.hoisted(() => ({
  exportPassthroughMock: vi.fn(),
  canUsePassthroughPathMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
  sendProgressMock: vi.fn(),
  cleanupJobMock: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  canUsePassthroughPathMock.mockReturnValue(false);
  exportPassthroughMock.mockResolvedValue(undefined);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  renderCompositeExportMock.mockResolvedValue(undefined);
  sendProgressMock.mockResolvedValue(undefined);
});

it('scopes selected-clip renders before loading media', async () => {
  const project = {
    clips: [
      { id: 'clip-1', type: 'VIDEO' },
      { id: 'clip-2', type: 'VIDEO' },
      { id: 'subtitle-1', type: 'SUBTITLE' },
    ],
    id: 'project-1',
  };
  const settings = {
    burnInSubtitles: true,
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    scope: 'selected-clip',
    selectedClipIds: ['clip-1'],
    width: 1280,
  };

  await runProjectExport('job-1', project as never, settings as never, { jobId: 'job-1' } as never);

  expect(loadImagesForProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      clips: [
        { id: 'clip-1', type: 'VIDEO' },
        { id: 'subtitle-1', type: 'SUBTITLE' },
      ],
    }),
    expect.any(Object),
    expect.any(AbortSignal)
  );
  expect(renderCompositeExportMock).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      clips: [
        { id: 'clip-1', type: 'VIDEO' },
        { id: 'subtitle-1', type: 'SUBTITLE' },
      ],
    }),
    settings,
    expect.any(Map),
    project
  );
});

it('short-circuits into the passthrough export path when the project qualifies', async () => {
  const project = { clips: [], id: 'project-1' };
  const settings = {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };

  canUsePassthroughPathMock.mockReturnValue(true);

  await runProjectExport('job-2', project as never, settings as never, { jobId: 'job-2' } as never);

  expect(exportPassthroughMock).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job-2' }),
    project,
    settings
  );
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});

it('cancels active export resources and releases completed jobs', () => {
  const abort = vi.fn();
  const stopTrack = vi.fn();
  const stopRecorder = vi.fn();
  const activeJobs = new Map();
  const jobState = {
    cancelled: false,
    exportAbortController: { abort },
    exportStream: {
      getTracks: () => [{ stop: stopTrack }],
    },
    mediaRecorder: {
      state: 'recording',
      stop: stopRecorder,
    },
  };

  cancelActiveProjectExportJob(jobState as never);
  activeJobs.set('job-3', jobState as never);
  releaseProjectExportJob(jobState as never);

  expect(jobState.cancelled).toBe(true);
  expect(abort).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(stopRecorder).toHaveBeenCalledOnce();
  expect(cleanupJobMock).toHaveBeenCalledWith(jobState);
});
