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
  preloadClipVideosMock,
  renderCompositeToMp4Mock,
  renderCompositeToWebmMock,
  sendProgressMock,
} = vi.hoisted(() => ({
  finalizeExportMock: vi.fn(),
  getAssetByIdMock: vi.fn(),
  isMimeTypeCompatibleWithFormatMock: vi.fn(),
  isSimplePassthroughProjectMock: vi.fn(),
  isVideoClipMock: vi.fn(),
  loadBlobForAssetMock: vi.fn(),
  prepareOutputBlobMock: vi.fn(),
  preloadClipVideosMock: vi.fn(),
  renderCompositeToMp4Mock: vi.fn(),
  renderCompositeToWebmMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  ClipAudioNode: undefined,
  ProjectExportMediaState: undefined,
  loadBlobForAsset: loadBlobForAssetMock,
  loadImagesForProject: vi.fn(),
  preloadClipVideos: preloadClipVideosMock,
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

vi.mock('./render-mp4', () => ({
  renderCompositeToMp4: renderCompositeToMp4Mock,
}));

vi.mock('./render-webm', () => ({
  renderCompositeToWebm: renderCompositeToWebmMock,
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

function createProjectWithVideoClip(): VideoProject {
  const project = createEmptyVideoProject('Export cancellation', 1280, 720);
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

function createDocumentStub(context: object) {
  const appendChild = vi.fn();
  return {
    body: { appendChild: vi.fn((node) => node) },
    createElement: vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: vi.fn(() => context),
          height: 0,
          width: 0,
        };
      }

      return {
        appendChild,
        style: {},
      };
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('rejects passthrough cancellation before persisting or notifying completion', async () => {
  const { exportPassthrough } = await import('./render');
  const job = createJob();
  const project = createProjectWithVideoClip();
  const settings = createSettings();
  const outputBlob = new Blob(['output'], { type: 'video/mp4' });

  isVideoClipMock.mockReturnValue(true);
  getAssetByIdMock.mockReturnValue(project.assets[0]);
  loadBlobForAssetMock.mockResolvedValue(new Blob(['source'], { type: 'video/mp4' }));
  prepareOutputBlobMock.mockImplementation(async () => {
    job.cancelled = true;
    return outputBlob;
  });

  await expect(exportPassthrough(job, project, settings)).rejects.toThrow(
    'PROJECT_EXPORT_CANCELLED'
  );

  expect(sendProgressMock).not.toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.SAVING,
    expect.any(Number),
    expect.any(String)
  );
  expect(finalizeExportMock).not.toHaveBeenCalled();
});

it('rejects passthrough cancellation after saving progress before finalization', async () => {
  const { exportPassthrough } = await import('./render');
  const job = createJob();
  const project = createProjectWithVideoClip();
  const settings = createSettings();

  isVideoClipMock.mockReturnValue(true);
  getAssetByIdMock.mockReturnValue(project.assets[0]);
  loadBlobForAssetMock.mockResolvedValue(new Blob(['source'], { type: 'video/mp4' }));
  prepareOutputBlobMock.mockResolvedValue(new Blob(['output'], { type: 'video/mp4' }));
  sendProgressMock.mockImplementation(async (_jobId, phase) => {
    if (phase === VideoProjectExportPhase.SAVING) {
      job.cancelled = true;
    }
  });

  await expect(exportPassthrough(job, project, settings)).rejects.toThrow(
    'PROJECT_EXPORT_CANCELLED'
  );

  expect(finalizeExportMock).not.toHaveBeenCalled();
});

it('rejects composite cancellation before persisting or notifying completion', async () => {
  const { renderCompositeExport } = await import('./render');
  const job = createJob();
  const project = createProjectWithVideoClip();
  const settings = createSettings();

  vi.stubGlobal('document', createDocumentStub({ marker: '2d' }));
  renderCompositeToMp4Mock.mockImplementation(async () => {
    job.cancelled = true;
    return new Blob(['mp4'], { type: 'video/mp4' });
  });

  await expect(renderCompositeExport(job, project, settings, {})).rejects.toThrow(
    'PROJECT_EXPORT_CANCELLED'
  );

  expect(sendProgressMock).not.toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.SAVING,
    expect.any(Number),
    expect.any(String)
  );
  expect(finalizeExportMock).not.toHaveBeenCalled();
});
