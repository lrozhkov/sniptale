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
  preloadClipVideosMock,
  renderCompositeToMp4Mock,
  renderCompositeToWebmMock,
  sendProgressMock,
} = vi.hoisted(() => ({
  finalizeExportMock: vi.fn(),
  preloadClipVideosMock: vi.fn(),
  renderCompositeToMp4Mock: vi.fn(),
  renderCompositeToWebmMock: vi.fn(),
  sendProgressMock: vi.fn(),
}));

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  ClipAudioNode: undefined,
  ProjectExportMediaState: undefined,
  loadImagesForProject: vi.fn(),
  preloadClipVideos: preloadClipVideosMock,
  setupExportAudio: vi.fn(),
  syncClipPlayback: vi.fn(),
  syncVideoClipFrame: vi.fn(),
}));

vi.mock('./persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./persistence')>()),
  finalizeExport: finalizeExportMock,
  getExportFormatDescriptor: vi.fn(),
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
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
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
