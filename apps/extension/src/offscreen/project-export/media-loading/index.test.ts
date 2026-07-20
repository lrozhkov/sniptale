// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAssetByIdMock,
  getProjectSceneBackgroundImageAssetIdMock,
  getProjectAssetMock,
  getRecordingMock,
  isAudioClipMock,
  isVideoClipMock,
} = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
  getProjectSceneBackgroundImageAssetIdMock: vi.fn(),
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  isAudioClipMock: vi.fn(),
  isVideoClipMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),

  getProjectAsset: getProjectAssetMock,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),

  getRecording: getRecordingMock,
}));

vi.mock('../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/timeline')>()),
  getAssetById: getAssetByIdMock,
  isAudioClip: isAudioClipMock,
  isVideoClip: isVideoClipMock,
}));

vi.mock('../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/scene/background')>()),
  getProjectSceneBackgroundImageAssetId: getProjectSceneBackgroundImageAssetIdMock,
}));

import { loadBlobForAsset, loadImagesForProject, preloadClipVideos } from './index';

function createProject() {
  return {
    assets: [],
    clips: [
      { id: 'video-clip', type: 'VIDEO', assetId: 'asset-video' },
      { id: 'audio-clip', type: 'AUDIO', assetId: 'asset-audio' },
      { id: 'image-clip', type: 'IMAGE', assetId: 'asset-image' },
      { id: 'image-clip-duplicate', type: 'IMAGE', assetId: 'asset-image' },
    ],
  };
}

function createAsset(
  source:
    | { kind: 'recording'; recordingId: string }
    | { kind: 'project-asset'; projectAssetId: string }
) {
  return { source } as never;
}

function createMediaElement(tagName: 'audio' | 'video', createElement: Document['createElement']) {
  const element = createElement(tagName);

  Object.defineProperty(element, 'load', {
    configurable: true,
    value: () => {
      element.dispatchEvent(new Event(tagName === 'audio' ? 'loadedmetadata' : 'loadeddata'));
    },
  });
  Object.defineProperty(element, 'readyState', {
    configurable: true,
    get: () =>
      tagName === 'audio' ? HTMLMediaElement.HAVE_METADATA : HTMLMediaElement.HAVE_CURRENT_DATA,
  });

  return element;
}

class ImageMock {
  complete = false;
  decoding = '';
  onerror: null | (() => void) = null;
  onload: null | (() => void) = null;
  private _src = '';

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    this.complete = true;
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

function resetProjectExportMediaLoadingTestState() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Image', ImageMock as unknown as typeof Image);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
      revokeObjectURL: vi.fn(),
    });
  });
}

async function verifyLoadBlobForAsset() {
  const recordingBlob = new Blob(['recording']);
  const projectAssetBlob = new Blob(['asset']);

  getRecordingMock.mockResolvedValue({ blob: recordingBlob });
  getProjectAssetMock.mockResolvedValue({ blob: projectAssetBlob });

  await expect(
    loadBlobForAsset(createAsset({ kind: 'recording', recordingId: 'rec-1' }))
  ).resolves.toBe(recordingBlob);
  await expect(
    loadBlobForAsset(createAsset({ kind: 'project-asset', projectAssetId: 'asset-1' }))
  ).resolves.toBe(projectAssetBlob);

  getRecordingMock.mockResolvedValueOnce(null);
  await expect(
    loadBlobForAsset(createAsset({ kind: 'recording', recordingId: 'missing-rec' }))
  ).rejects.toThrow('Recording missing-rec not found.');

  getProjectAssetMock.mockResolvedValueOnce(null);
  await expect(
    loadBlobForAsset(createAsset({ kind: 'project-asset', projectAssetId: 'missing-asset' }))
  ).rejects.toThrow('Project asset missing-asset not found.');
}

function configureClipPreloadEnvironment() {
  const project = createProject();
  const container = document.createElement('div');
  const job = {
    assetUrls: [] as string[],
    clipMediaElements: new Map<string, HTMLMediaElement>(),
  };
  const createElementSpy = vi.spyOn(document, 'createElement');
  const originalCreateElement = (tagName: string) =>
    Document.prototype.createElement.call(document, tagName);

  createElementSpy.mockImplementation((tagName: string) => {
    if (tagName === 'audio' || tagName === 'video') {
      return createMediaElement(tagName, originalCreateElement) as never;
    }

    return originalCreateElement(tagName);
  });

  isVideoClipMock.mockImplementation((clip: { type: string }) => clip.type === 'VIDEO');
  isAudioClipMock.mockImplementation((clip: { type: string }) => clip.type === 'AUDIO');
  getProjectSceneBackgroundImageAssetIdMock.mockReturnValue(null);
  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'asset-video') {
      return createAsset({ kind: 'project-asset', projectAssetId: 'asset-video' });
    }
    if (assetId === 'asset-audio') {
      return createAsset({ kind: 'recording', recordingId: 'recording-audio' });
    }
    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['video']) });
  getRecordingMock.mockResolvedValue({ blob: new Blob(['audio']) });

  return { container, job, project };
}

async function verifyPreloadClipVideos() {
  const { container, job, project } = configureClipPreloadEnvironment();

  await preloadClipVideos(project as never, job as never, container);

  expect(job.assetUrls).toHaveLength(2);
  expect(job.clipMediaElements.get('video-clip')?.tagName).toBe('VIDEO');
  expect(job.clipMediaElements.get('audio-clip')?.tagName).toBe('AUDIO');
  expect(container.children).toHaveLength(2);
}

async function verifyLoadImagesForProject() {
  const project = createProject();
  const job = { assetUrls: [] as string[] };

  getProjectSceneBackgroundImageAssetIdMock.mockReturnValue(null);
  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'asset-image') {
      return createAsset({ kind: 'project-asset', projectAssetId: 'image-1' });
    }
    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['image']) });

  const images = await loadImagesForProject(project as never, job as never);

  expect(Object.keys(images)).toEqual(['asset-image']);
  expect(job.assetUrls).toHaveLength(1);
  expect(images['asset-image']).toBeInstanceOf(ImageMock as never);
}

async function verifyPreloadClipVideosRejectsWhenAssetIsMissing() {
  const project = createProject();

  isVideoClipMock.mockImplementation((clip: { type: string }) => clip.type === 'VIDEO');
  isAudioClipMock.mockImplementation((clip: { type: string }) => clip.type === 'AUDIO');
  getAssetByIdMock.mockReturnValue(null);

  await expect(
    preloadClipVideos(
      project as never,
      {
        assetUrls: [],
        clipMediaElements: new Map<string, HTMLMediaElement>(),
      } as never,
      document.createElement('div')
    )
  ).rejects.toThrow('Asset asset-video not found for clip video-clip');
}

async function verifyLoadImagesRejectsWhenAssetIsMissing() {
  const project = createProject();

  getProjectSceneBackgroundImageAssetIdMock.mockReturnValue(null);
  getAssetByIdMock.mockReturnValue(null);

  await expect(
    loadImagesForProject(
      project as never,
      {
        assetUrls: [],
      } as never
    )
  ).rejects.toThrow('Image asset asset-image not found.');
}

function runProjectExportMediaLoadingSuite() {
  resetProjectExportMediaLoadingTestState();

  it(
    'loads blobs from recording and project-asset sources and throws for missing entries',
    verifyLoadBlobForAsset
  );
  it('preloads video and audio clips into media elements', verifyPreloadClipVideos);
  it(
    'fails clip preload when a referenced media asset is missing',
    verifyPreloadClipVideosRejectsWhenAssetIsMissing
  );
  it('loads project images once per asset id', verifyLoadImagesForProject);
  it(
    'fails image preload when a referenced asset is missing',
    verifyLoadImagesRejectsWhenAssetIsMissing
  );
}

describe('media-loading index', runProjectExportMediaLoadingSuite);
