import { afterEach, expect, it, vi } from 'vitest';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../features/video/project/types/model';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  type VideoProjectExportSettings,
} from '../../features/video/project/types/export';
import { type VideoProject } from '../../features/video/project/types/model';
import type { ExportJobState } from './types';

const {
  finalizeExportMock,
  getAssetByIdMock,
  isMimeTypeCompatibleWithFormatMock,
  isSimplePassthroughProjectMock,
  isVideoClipMock,
  loadBlobForAssetMock,
  prepareOutputBlobMock,
  sendProgressMock,
} = vi.hoisted(() => ({
  finalizeExportMock: vi.fn(),
  getAssetByIdMock: vi.fn(),
  isMimeTypeCompatibleWithFormatMock: vi.fn(),
  isSimplePassthroughProjectMock: vi.fn(),
  isVideoClipMock: vi.fn(),
  loadBlobForAssetMock: vi.fn(),
  prepareOutputBlobMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  ClipAudioNode: undefined,
  ProjectExportMediaState: undefined,
  loadBlobForAsset: loadBlobForAssetMock,
  loadImagesForProject: vi.fn(),
  preloadClipVideos: vi.fn(),
  setupExportAudio: vi.fn(),
  syncClipPlayback: vi.fn(),
  syncVideoClipFrame: vi.fn(),
}));

vi.mock('./persistence', () => ({
  finalizeExport: finalizeExportMock,
  getExportFormatDescriptor: vi.fn(),
  isMimeTypeCompatibleWithFormat: isMimeTypeCompatibleWithFormatMock,
  prepareOutputBlob: prepareOutputBlobMock,
}));

vi.mock('./runtime', () => ({
  cleanupJob: vi.fn(),
  getSupportedWebmExportMimeType: vi.fn(),
  sendProgress: sendProgressMock,
  waitForDelay: vi.fn(),
}));

vi.mock('../../features/video/project/timeline/basics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/video/project/timeline/basics')>()),
  getAssetById: getAssetByIdMock,
  isVideoClip: isVideoClipMock,
}));

vi.mock('../../features/video/project/timeline/meta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/video/project/timeline/meta')>()),
  isSimplePassthroughProject: isSimplePassthroughProjectMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
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

function createProjectWithVideoClip(): VideoProject {
  const project = createEmptyVideoProject('Passthrough', 1280, 720);
  const asset = createVideoProjectAsset(
    'Clip',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    {
      audioPeaks: null,
      duration: 5,
      hasAudio: true,
      height: 720,
      mimeType: 'video/mp4',
      size: 100,
      width: 1280,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);

  return { ...project, assets: [asset], clips: [clip], duration: clip.duration };
}

function createJob(): ExportJobState {
  return {
    assetUrls: [],
    audioContext: null,
    audioDestination: null,
    cancelled: false,
    cleanupNode: null,
    clipAudioNodes: new Map(),
    clipMediaElements: new Map(),
    exportAbortController: new AbortController(),
    exportAudioSettings: null,
    exportStream: null,
    jobId: 'job-1',
    mediaRecorder: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('evaluates passthrough eligibility from clip and asset compatibility', async () => {
  const { canUsePassthroughPath } = await import('./render');
  const project = createProjectWithVideoClip();
  const settings = createSettings();

  isSimplePassthroughProjectMock.mockReturnValue(false);
  expect(canUsePassthroughPath(project, settings)).toBe(false);

  isSimplePassthroughProjectMock.mockReturnValue(true);
  isVideoClipMock.mockReturnValue(false);
  expect(canUsePassthroughPath(project, settings)).toBe(false);

  isVideoClipMock.mockReturnValue(true);
  getAssetByIdMock.mockReturnValue(project.assets[0]);
  isMimeTypeCompatibleWithFormatMock.mockReturnValue(true);
  expect(canUsePassthroughPath(project, settings)).toBe(true);
});

it('exports passthrough projects and validates missing clip or asset failures', async () => {
  const { exportPassthrough } = await import('./render');
  const job = createJob();
  const project = createProjectWithVideoClip();
  const settings = createSettings();
  const outputBlob = new Blob(['output'], { type: 'video/mp4' });

  await expect(exportPassthrough(job, { ...project, clips: [] }, settings)).rejects.toThrow(
    'offscreenExport.passthroughSingleClipOnly'
  );

  isVideoClipMock.mockReturnValue(true);
  getAssetByIdMock.mockReturnValue(null);
  await expect(exportPassthrough(job, project, settings)).rejects.toThrow(
    'offscreenExport.passthroughAssetMissing'
  );

  getAssetByIdMock.mockReturnValue(project.assets[0]);
  loadBlobForAssetMock.mockResolvedValue(new Blob(['source'], { type: 'video/mp4' }));
  prepareOutputBlobMock.mockResolvedValue(outputBlob);

  await exportPassthrough(job, project, settings);

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.SAVING,
    100,
    'offscreenExport.savingFinishedFile'
  );
  expect(finalizeExportMock).toHaveBeenCalledWith(
    'job-1',
    project,
    settings,
    outputBlob,
    expect.objectContaining({ isCancelled: expect.any(Function), signal: expect.any(AbortSignal) })
  );
});
