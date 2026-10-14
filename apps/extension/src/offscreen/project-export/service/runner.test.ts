import { beforeEach, expect, it, vi } from 'vitest';
import { cancelActiveProjectExportJob, releaseProjectExportJob, runProjectExport } from './runner';
import { VideoExportFormat, VideoExportQualityPreset } from '../../../features/video/project/types';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { ProjectCameraConflictError } from '../../../features/video/composition/motion/project-follow';

const { loadImagesForProjectMock, renderCompositeExportMock, sendProgressMock, cleanupJobMock } =
  vi.hoisted(() => ({
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
  renderCompositeExport: renderCompositeExportMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  vi.clearAllMocks();
  loadImagesForProjectMock.mockResolvedValue(new Map());
  renderCompositeExportMock.mockResolvedValue(undefined);
  sendProgressMock.mockResolvedValue(undefined);
});

it('refuses a conflicting follow camera before acquiring export resources', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'camera',
    filename: 'camera.webm',
    width: 1280,
    height: 720,
    duration: 3,
    mimeType: 'video/webm',
    size: 1,
  });
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 3,
      focusMode: 'CURSOR',
      scale: 4,
      zoomInDuration: 0.01,
      zoomOutDuration: 0,
    },
  ];
  const job = { jobId: 'camera-job', cancelled: false };
  const settings = {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    width: 1280,
    quality: VideoExportQualityPreset.MEDIUM,
  };
  await expect(
    runProjectExport('camera-job', project, settings, job as never)
  ).rejects.toBeInstanceOf(ProjectCameraConflictError);
  expect(sendProgressMock).not.toHaveBeenCalled();
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
  expect(job).not.toHaveProperty('exportAbortController');
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
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
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
