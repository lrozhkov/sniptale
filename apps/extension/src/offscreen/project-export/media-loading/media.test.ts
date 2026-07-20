// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const {
  getAssetByIdMock,
  getProjectAssetMock,
  getRecordingMock,
  isAudioClipMock,
  isVideoClipMock,
} = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
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

import { preloadClipVideos } from './media';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'Image',
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
        queueMicrotask(() => this.onload?.());
      }
    } as never
  );
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
    revokeObjectURL: vi.fn(),
  });
});

function installClipMediaMocks() {
  isVideoClipMock.mockImplementation((clip: { type: string }) => clip.type === 'VIDEO');
  isAudioClipMock.mockImplementation((clip: { type: string }) => clip.type === 'AUDIO');
  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'asset-video') {
      return { source: { kind: 'project-asset', projectAssetId: 'asset-video' } };
    }
    if (assetId === 'asset-audio') {
      return { source: { kind: 'recording', recordingId: 'recording-audio' } };
    }
    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['video']) });
  getRecordingMock.mockResolvedValue({ blob: new Blob(['audio']) });
}

function installMediaElementLoaders() {
  const originalCreateElement = Document.prototype.createElement;
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = originalCreateElement.call(document, tagName);
    if (tagName !== 'audio' && tagName !== 'video') {
      return element;
    }

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
  });
}

it('preloads video and audio clips into media elements', async () => {
  const project = {
    assets: [],
    clips: [
      { id: 'video-clip', type: 'VIDEO', assetId: 'asset-video' },
      { id: 'audio-clip', type: 'AUDIO', assetId: 'asset-audio' },
    ],
  };
  const container = document.createElement('div');
  const job = {
    assetUrls: [] as string[],
    clipMediaElements: new Map<string, HTMLMediaElement>(),
  };

  installClipMediaMocks();
  installMediaElementLoaders();

  await preloadClipVideos(project as never, job as never, container);

  expect(job.assetUrls).toHaveLength(2);
  expect(job.clipMediaElements.get('video-clip')?.tagName).toBe('VIDEO');
  expect(job.clipMediaElements.get('audio-clip')?.tagName).toBe('AUDIO');
  expect(container.children).toHaveLength(2);
});

it('stops clip preload when the export aborts before media readiness', async () => {
  const project = {
    assets: [],
    clips: [{ id: 'video-clip', type: 'VIDEO', assetId: 'asset-video' }],
  };
  const container = document.createElement('div');
  const job = {
    assetUrls: [] as string[],
    clipMediaElements: new Map<string, HTMLMediaElement>(),
  };
  const controller = new AbortController();
  const originalCreateElement = Document.prototype.createElement;

  installClipMediaMocks();
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = originalCreateElement.call(document, tagName);
    if (tagName !== 'video') {
      return element;
    }

    Object.defineProperty(element, 'load', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(element, 'readyState', {
      configurable: true,
      get: () => 0,
    });

    return element;
  });

  const preloadPromise = preloadClipVideos(
    project as never,
    job as never,
    container,
    controller.signal
  );
  await Promise.resolve();
  controller.abort();

  await expect(preloadPromise).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(job.clipMediaElements.size).toBe(0);
  expect(job.assetUrls).toEqual([]);
  expect(container.children).toHaveLength(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:5');
});

it('rejects preload when a referenced media asset is missing', async () => {
  const project = {
    assets: [],
    clips: [{ id: 'video-clip', type: 'VIDEO', assetId: 'asset-video' }],
  };

  installClipMediaMocks();
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
});
