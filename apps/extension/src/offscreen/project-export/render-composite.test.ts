import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
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
  loadBlobForAsset: vi.fn(),
  loadImagesForProject: vi.fn(),
  preloadClipVideos: preloadClipVideosMock,
  setupExportAudio: vi.fn(),
  syncClipPlayback: vi.fn(),
  syncVideoClipFrame: vi.fn(),
}));

vi.mock('./persistence', () => ({
  finalizeExport: finalizeExportMock,
  getExportFormatDescriptor: vi.fn(),
  isMimeTypeCompatibleWithFormat: vi.fn(),
  prepareOutputBlob: vi.fn(),
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

function createSettings(
  format: VideoExportFormat = VideoExportFormat.MP4
): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format,
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
    exportAbortController: null,
    exportAudioSettings: null,
    exportStream: null,
    jobId: 'job-1',
    mediaRecorder: null,
  };
}

function createDocumentStub(context: object | null) {
  const appendChild = vi.fn();
  return {
    body: {
      appendChild: vi.fn((node) => node),
    },
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

it('renders composite exports through mp4 and webm paths with the job abort signal', async () => {
  const { renderCompositeExport } = await import('./render');
  const context = { marker: '2d' };
  const job = createJob();
  const project = createEmptyVideoProject('Composite', 1280, 720);
  const mp4Settings = createSettings(VideoExportFormat.MP4);
  const webmSettings = createSettings(VideoExportFormat.WEBM);
  const mp4Blob = new Blob(['mp4'], { type: 'video/mp4' });
  const webmBlob = new Blob(['webm'], { type: 'video/webm' });

  vi.stubGlobal('document', createDocumentStub(context));
  renderCompositeToMp4Mock.mockResolvedValue(mp4Blob);
  renderCompositeToWebmMock.mockResolvedValue(webmBlob);

  await renderCompositeExport(job, project, mp4Settings, {});
  await renderCompositeExport(job, project, webmSettings, {});

  expect(preloadClipVideosMock).toHaveBeenCalledTimes(2);
  expect(preloadClipVideosMock).toHaveBeenNthCalledWith(
    1,
    project,
    expect.any(Object),
    expect.anything(),
    expect.any(AbortSignal)
  );
  expect(renderCompositeToMp4Mock).toHaveBeenCalledOnce();
  expect(renderCompositeToWebmMock).toHaveBeenCalledOnce();
  expect(finalizeExportMock).toHaveBeenNthCalledWith(
    1,
    'job-1',
    project,
    mp4Settings,
    mp4Blob,
    expect.objectContaining({ isCancelled: expect.any(Function), signal: expect.any(AbortSignal) })
  );
  expect(finalizeExportMock).toHaveBeenNthCalledWith(
    2,
    'job-1',
    project,
    webmSettings,
    webmBlob,
    expect.objectContaining({ isCancelled: expect.any(Function), signal: expect.any(AbortSignal) })
  );
  expect(job.exportAbortController).toBeInstanceOf(AbortController);
});

it('finalizes selected-clip renders against the original project context', async () => {
  const { renderCompositeExport } = await import('./render');
  const context = { marker: '2d' };
  const sourceProject = createEmptyVideoProject('Source', 1280, 720);
  const renderProject: VideoProject = { ...sourceProject, id: 'render-project' };
  const settings = { ...createSettings(VideoExportFormat.MP4), selectedClipIds: ['clip-1'] };
  const outputBlob = new Blob(['mp4'], { type: 'video/mp4' });

  vi.stubGlobal('document', createDocumentStub(context));
  renderCompositeToMp4Mock.mockResolvedValue(outputBlob);

  await renderCompositeExport(createJob(), renderProject, settings, {}, sourceProject);

  expect(finalizeExportMock).toHaveBeenCalledWith(
    'job-1',
    sourceProject,
    settings,
    outputBlob,
    expect.objectContaining({ isCancelled: expect.any(Function), signal: expect.any(AbortSignal) })
  );
});

it('throws when the canvas 2d context cannot be created', async () => {
  const { renderCompositeExport } = await import('./render');

  vi.stubGlobal('document', createDocumentStub(null));

  await expect(
    renderCompositeExport(createJob(), createEmptyVideoProject('No canvas'), createSettings(), {})
  ).rejects.toThrow('offscreenExport.canvasContextError');
});
