// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { createScenarioItem, createVideoProjectItem } from '../actions/test-support';

const io = vi.hoisted(() => ({
  getVideoProject: vi.fn(),
  getProjectAsset: vi.fn(),
  getMediaAssetBlob: vi.fn(),
  getRecording: vi.fn(),
  getScenarioAsset: vi.fn(),
  getScenarioProjectEntry: vi.fn(),
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects', () => ({
  getVideoProject: io.getVideoProject,
  getProjectAsset: io.getProjectAsset,
}));
vi.mock('../../../composition/persistence/media-library', () => ({
  getMediaAssetBlob: io.getMediaAssetBlob,
}));
vi.mock('../../../composition/persistence/recordings', () => ({ getRecording: io.getRecording }));
vi.mock('../../../composition/persistence/scenario/projects', () => ({
  getScenarioAsset: io.getScenarioAsset,
  getScenarioProjectEntry: io.getScenarioProjectEntry,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.getScenarioAssetBlob,
}));

import { getGalleryProjectCover, getVideoCoverCandidates } from './project-covers';

function projectWithClips() {
  const project = createEmptyVideoProject('Cover');
  const track = project.tracks[0]!;
  const first = createVideoProjectAsset(
    'Unused',
    VideoProjectAssetType.IMAGE,
    { kind: 'library-asset', mediaId: 'unused' },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 600,
      mimeType: 'image/png',
      size: 1,
      width: 800,
    }
  );
  const second = {
    ...first,
    id: 'used-asset',
    source: { kind: 'library-asset' as const, mediaId: 'used' },
  };
  const third = {
    ...first,
    id: 'later-asset',
    source: { kind: 'library-asset' as const, mediaId: 'later' },
  };
  const hidden = createVideoClipFromAsset(track.id, first, project.width, project.height, 0);
  const early = createVideoClipFromAsset(track.id, second, project.width, project.height, 1);
  const later = createVideoClipFromAsset(track.id, third, project.width, project.height, 4);
  early.duration = 2;
  later.duration = 2;
  const hiddenTrack = { ...track, id: 'hidden-track', visible: false, order: -1 };
  hidden.trackId = hiddenTrack.id;
  hidden.duration = 2;
  return {
    ...project,
    assets: [first, second, third],
    tracks: [track, hiddenTrack],
    clips: [hidden, later, early],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.getMediaAssetBlob.mockResolvedValue(undefined);
  io.getScenarioProjectEntry.mockResolvedValue(undefined);
});

it('selects the earliest visible used visual clip rather than the first asset', () => {
  expect(getVideoCoverCandidates(projectWithClips()).map((asset) => asset.id)).toEqual([
    'used-asset',
    'later-asset',
  ]);
});

it('returns fallback for stale, unavailable, and empty projects without reading source bytes', async () => {
  const item = { ...createVideoProjectItem(), workspaceRevision: 2 };
  io.getVideoProject.mockResolvedValue({
    status: 'ready',
    project: projectWithClips(),
    workspaceRevision: 1,
  });
  await expect(getGalleryProjectCover(item)).resolves.toBeUndefined();
  await expect(
    getGalleryProjectCover({ ...item, unavailableReason: 'invalid' as const })
  ).resolves.toBeUndefined();
  expect(io.getMediaAssetBlob).not.toHaveBeenCalled();
});

it('reads a retained trashed project only while its lifecycle and revision still match', async () => {
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 2, trashedAt: 5 };
  const item = {
    ...createVideoProjectItem({ id: 'video-project:deleted', entityId: 'deleted' }),
    lifecycle,
    workspaceRevision: 8,
  };
  io.getVideoProject.mockResolvedValueOnce({
    status: 'ready',
    project: projectWithClips(),
    lifecycle,
    workspaceRevision: 8,
  });
  await expect(getGalleryProjectCover(item)).resolves.toBeUndefined();
  expect(io.getVideoProject).toHaveBeenCalledWith('deleted');
  expect(io.getMediaAssetBlob.mock.calls.map(([id]) => id)).toEqual(['used', 'later']);
  io.getMediaAssetBlob.mockClear();

  io.getVideoProject.mockResolvedValueOnce({
    status: 'ready',
    project: projectWithClips(),
    lifecycle: { ...lifecycle, trashedAt: 6 },
    workspaceRevision: 8,
  });
  await expect(
    getGalleryProjectCover({ ...item, id: 'video-project:stale', entityId: 'stale' })
  ).resolves.toBeUndefined();
  expect(io.getMediaAssetBlob).not.toHaveBeenCalled();
});

it('coalesces concurrent reads and tries the next source when the first is missing', async () => {
  const item = { ...createVideoProjectItem(), workspaceRevision: 2 };
  const project = projectWithClips();
  io.getVideoProject.mockResolvedValue({ status: 'ready', project, workspaceRevision: 2 });
  io.getMediaAssetBlob.mockImplementation(async (id: string) =>
    id === 'later' ? new Blob(['image'], { type: 'image/png' }) : undefined
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['cover'], { type: 'image/webp' }))
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover-source');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const [first, second] = await Promise.all([
    getGalleryProjectCover(item),
    getGalleryProjectCover(item),
  ]);
  expect(first).toBe(second);
  expect(io.getVideoProject).toHaveBeenCalledTimes(1);
  expect(io.getMediaAssetBlob.mock.calls.map(([id]) => id)).toEqual(['used', 'later']);
  expect(drawImage).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith('blob:cover-source');
  expect(await getGalleryProjectCover(item)).toBe(first);
  expect(io.getVideoProject).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses scenario document order and skips an unavailable image', async () => {
  const item = { ...createScenarioItem(), workspaceRevision: 3 };
  io.getScenarioProjectEntry.mockResolvedValue({
    workspaceRevision: 3,
    project: {
      items: [
        {
          kind: 'step',
          id: 'step-1',
          title: 'First',
          blocks: [
            {
              kind: 'image',
              id: 'image-1',
              assetId: 'missing',
              alt: '',
              caption: '',
              frame: { width: 800, height: 600 },
              fit: 'contain',
              contentTransform: { x: 0, y: 0, scale: 1 },
            },
            {
              kind: 'image',
              id: 'image-2',
              assetId: 'present',
              alt: '',
              caption: '',
              frame: { width: 800, height: 600 },
              fit: 'contain',
              contentTransform: { x: 0, y: 0, scale: 1 },
            },
          ],
        },
      ],
    },
  });
  io.getScenarioAssetBlob.mockResolvedValue(undefined);
  await expect(getGalleryProjectCover(item)).resolves.toBeUndefined();
  expect(io.getScenarioAssetBlob.mock.calls.map(([id]) => id)).toEqual(['missing', 'present']);
});

it('renders the first decodable scenario image with its saved frame, fit, and transform', async () => {
  const item = { ...createScenarioItem(), workspaceRevision: 4 };
  io.getScenarioProjectEntry.mockResolvedValue({
    workspaceRevision: 4,
    project: {
      items: [
        {
          kind: 'step',
          id: 'step-1',
          title: 'Capture',
          blocks: [
            {
              kind: 'image',
              id: 'capture',
              assetId: 'capture-asset',
              alt: '',
              caption: '',
              frame: { width: 200, height: 100 },
              fit: 'cover',
              contentTransform: { x: 0.1, y: 0.1, scale: 1.5 },
            },
          ],
        },
      ],
    },
  });
  io.getScenarioAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  const drawImage = vi.fn();
  const clip = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip,
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['cover'], { type: 'image/webp' }))
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scenario-image');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const result = await getGalleryProjectCover(item);
  expect(result?.type).toBe('image/webp');
  expect(clip).toHaveBeenCalledOnce();
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), -96, -268, 960, 960);
  expect(revoke).toHaveBeenCalledWith('blob:scenario-image');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('bounds concurrent project reads and releases a slot after completion', async () => {
  const resolvers: Array<
    (value: {
      status: 'ready';
      project: ReturnType<typeof projectWithClips>;
      workspaceRevision: number;
    }) => void
  > = [];
  io.getVideoProject.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      })
  );
  const items = [1, 2, 3, 4].map((index) => ({
    ...createVideoProjectItem(),
    id: `video-project:${index}`,
    entityId: `project-${index}`,
    workspaceRevision: 1,
  }));
  const results = items.map((item) => getGalleryProjectCover(item));
  await Promise.resolve();
  expect(io.getVideoProject).toHaveBeenCalledTimes(3);
  resolvers[0]?.({
    status: 'ready',
    project: { ...projectWithClips(), clips: [] },
    workspaceRevision: 1,
  });
  await vi.waitFor(() => expect(io.getVideoProject.mock.calls.length).toBeGreaterThanOrEqual(4));
  for (const resolve of resolvers.slice(1)) {
    resolve({
      status: 'ready',
      project: { ...projectWithClips(), clips: [] },
      workspaceRevision: 1,
    });
  }
  await expect(Promise.all(results)).resolves.toEqual([undefined, undefined, undefined, undefined]);
});

it('bounds pending work during rapid viewport churn and starts the newest cover next', async () => {
  const held: Array<
    (value: {
      status: 'ready';
      project: ReturnType<typeof projectWithClips>;
      workspaceRevision: number;
    }) => void
  > = [];
  const empty = { ...projectWithClips(), clips: [] };
  io.getVideoProject.mockImplementation(() => {
    if (io.getVideoProject.mock.calls.length <= 3) {
      return new Promise((resolve) => held.push(resolve));
    }
    return Promise.resolve({ status: 'ready', project: empty, workspaceRevision: 5 });
  });
  const items = Array.from({ length: 40 }, (_, index) => ({
    ...createVideoProjectItem(),
    id: `churn:${index}`,
    entityId: `churn-project-${index}`,
    workspaceRevision: 5,
  }));
  const requests = items.map((item) => getGalleryProjectCover(item));
  expect(io.getVideoProject).toHaveBeenCalledTimes(3);
  held[0]?.({ status: 'ready', project: empty, workspaceRevision: 5 });
  await vi.waitFor(() => expect(io.getVideoProject.mock.calls.length).toBeGreaterThanOrEqual(4));
  expect(io.getVideoProject.mock.calls[3]?.[0]).toBe('churn-project-39');
  held[1]?.({ status: 'ready', project: empty, workspaceRevision: 5 });
  held[2]?.({ status: 'ready', project: empty, workspaceRevision: 5 });
  await expect(Promise.all(requests)).resolves.toHaveLength(40);
  expect(io.getVideoProject).toHaveBeenCalledTimes(27);
});

it('removes a hidden queued request without cancelling another subscriber', async () => {
  const held: Array<
    (value: {
      status: 'ready';
      project: ReturnType<typeof projectWithClips>;
      workspaceRevision: number;
    }) => void
  > = [];
  const empty = { ...projectWithClips(), clips: [] };
  io.getVideoProject.mockImplementation(() => new Promise((resolve) => held.push(resolve)));
  const items = [0, 1, 2, 3].map((index) => ({
    ...createVideoProjectItem(),
    id: `abort:${index}`,
    entityId: `abort-project-${index}`,
    workspaceRevision: 6,
  }));
  const active = items.slice(0, 3).map((item) => getGalleryProjectCover(item));
  const hidden = new AbortController();
  const stillVisible = new AbortController();
  const queuedHidden = getGalleryProjectCover(items[3]!, hidden.signal);
  const queuedVisible = getGalleryProjectCover(items[3]!, stillVisible.signal);
  const sole = new AbortController();
  const queuedSole = getGalleryProjectCover(
    { ...items[3]!, id: 'abort:sole', entityId: 'abort-project-sole' },
    sole.signal
  );
  hidden.abort();
  sole.abort();
  await expect(queuedHidden).resolves.toBeUndefined();
  await expect(queuedSole).resolves.toBeUndefined();
  expect(io.getVideoProject).toHaveBeenCalledTimes(3);
  held[0]?.({ status: 'ready', project: empty, workspaceRevision: 6 });
  await vi.waitFor(() => expect(io.getVideoProject).toHaveBeenCalledTimes(4));
  held[1]?.({ status: 'ready', project: empty, workspaceRevision: 6 });
  held[2]?.({ status: 'ready', project: empty, workspaceRevision: 6 });
  held[3]?.({ status: 'ready', project: empty, workspaceRevision: 6 });
  await expect(Promise.all([...active, queuedVisible])).resolves.toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(io.getVideoProject.mock.calls.map(([id]) => id)).not.toContain('abort-project-sole');
});

it('releases active decoder slots when hidden projects abort', async () => {
  const project = projectWithClips();
  project.clips = project.clips.filter((clip) => clip.assetId === 'used-asset');
  io.getVideoProject.mockImplementation(async (id: string) => ({
    status: 'ready',
    project: id === 'visible-after-abort' ? { ...project, clips: [] } : project,
    workspaceRevision: 7,
  }));
  io.getMediaAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        // A decoder with no event must still stop when its row leaves view.
      }
    }
  );
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hanging-cover');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const controllers = [0, 1, 2].map(() => new AbortController());
  const hidden = controllers.map((controller, index) =>
    getGalleryProjectCover(
      {
        ...createVideoProjectItem(),
        id: `hidden-active:${index}`,
        entityId: `hidden-active:${index}`,
        workspaceRevision: 7,
      },
      controller.signal
    )
  );
  await vi.waitFor(() => expect(createUrl).toHaveBeenCalledTimes(3));
  controllers.forEach((controller) => controller.abort());
  const visible = getGalleryProjectCover({
    ...createVideoProjectItem(),
    id: 'visible-after-abort',
    entityId: 'visible-after-abort',
    workspaceRevision: 7,
  });
  await vi.waitFor(() => expect(io.getVideoProject).toHaveBeenCalledWith('visible-after-abort'), {
    timeout: 500,
  });
  await expect(Promise.all([...hidden, visible])).resolves.toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(revokeUrl).toHaveBeenCalledTimes(3);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
