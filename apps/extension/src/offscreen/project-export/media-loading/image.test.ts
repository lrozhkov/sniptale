// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { getAssetByIdMock, getProjectAssetMock } = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
  getProjectAssetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),

  getProjectAsset: getProjectAssetMock,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),

  getRecording: vi.fn(),
}));

vi.mock('../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/timeline')>()),
  getAssetById: getAssetByIdMock,
}));

vi.mock('../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/scene/background')>()),
  getProjectSceneBackgroundImageAssetId: vi.fn(
    (project: { sceneBackground?: { assetId?: string } }) =>
      project.sceneBackground?.assetId ?? null
  ),
}));

import { loadImagesForProject } from './image';

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

it('loads project images once per asset id and fails for missing assets', async () => {
  const project = {
    assets: [],
    clips: [
      { id: 'image-clip', type: 'IMAGE', assetId: 'asset-image' },
      { id: 'image-clip-duplicate', type: 'IMAGE', assetId: 'asset-image' },
    ],
  };
  const job = { assetUrls: [] as string[] };

  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'asset-image') {
      return { source: { kind: 'project-asset', projectAssetId: 'image-1' } };
    }
    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['image']) });

  const images = await loadImagesForProject(project as never, job as never);

  expect(Object.keys(images)).toEqual(['asset-image']);
  expect(job.assetUrls).toHaveLength(1);
  expect(images['asset-image']).toBeInstanceOf(Image);

  getAssetByIdMock.mockReturnValue(null);
  await expect(
    loadImagesForProject(
      {
        assets: [],
        clips: [{ id: 'image-clip', type: 'IMAGE', assetId: 'missing-image' }],
      } as never,
      { assetUrls: [] } as never
    )
  ).rejects.toThrow('Image asset missing-image not found.');
});

it('includes the scene background image asset in the preload set', async () => {
  const project = {
    assets: [],
    clips: [],
    sceneBackground: {
      kind: 'image',
      assetId: 'background-image',
    },
  };
  const job = { assetUrls: [] as string[] };

  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'background-image') {
      return { source: { kind: 'project-asset', projectAssetId: 'image-2' } };
    }

    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['background']) });

  const images = await loadImagesForProject(project as never, job as never);

  expect(images['background-image']).toBeInstanceOf(Image);
  expect(job.assetUrls).toHaveLength(1);
});

it('includes embedded shape image assets in the preload set', async () => {
  const project = {
    assets: [],
    clips: [
      {
        embeddedAsset: { assetId: 'badge-image' },
        id: 'shape-clip',
        type: 'SHAPE',
      },
    ],
  };
  const job = { assetUrls: [] as string[] };

  getAssetByIdMock.mockImplementation((_project: unknown, assetId: string) => {
    if (assetId === 'badge-image') {
      return { source: { kind: 'project-asset', projectAssetId: 'badge-asset' } };
    }
    return null;
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['badge']) });

  const images = await loadImagesForProject(project as never, job as never);

  expect(images['badge-image']).toBeInstanceOf(Image);
  expect(job.assetUrls).toHaveLength(1);
});

it('stops image preload when the export aborts before image readiness', async () => {
  const project = {
    assets: [],
    clips: [{ id: 'image-clip', type: 'IMAGE', assetId: 'asset-image' }],
  };
  const job = { assetUrls: [] as string[] };
  const controller = new AbortController();

  vi.stubGlobal(
    'Image',
    class PendingImageMock {
      complete = false;
      decoding = '';
      onerror: null | (() => void) = null;
      onload: null | (() => void) = null;
      src = '';
    } as never
  );
  getAssetByIdMock.mockReturnValue({
    source: { kind: 'project-asset', projectAssetId: 'image-1' },
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['image']) });

  const loadPromise = loadImagesForProject(project as never, job as never, controller.signal);
  await Promise.resolve();
  controller.abort();

  await expect(loadPromise).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(job.assetUrls).toEqual([]);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:5');
});
