import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../features/video/project/types';
const render = vi.hoisted(() => ({ image: vi.fn(), video: vi.fn() }));
vi.mock('./rendering', () => ({ renderImage: render.image, renderVideo: render.video }));
import { createProjectCoverService } from './index';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../features/scenario/project/factories';

function fixture() {
  const project = createEmptyVideoProject('Cover');
  const asset = createVideoProjectAsset(
    'Image',
    VideoProjectAssetType.IMAGE,
    { kind: 'library-asset', mediaId: 'image' },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 360,
      mimeType: 'image/png',
      size: 1,
      width: 640,
    }
  );
  project.assets = [asset];
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  clip.duration = 2;
  project.clips = [clip];
  const sources = {
    getVideoProject: vi.fn().mockResolvedValue({ status: 'ready', project, workspaceRevision: 1 }),
    getProjectAsset: vi.fn(),
    getMediaAssetBlob: vi.fn().mockResolvedValue(new Blob(['source'])),
    getRecording: vi.fn(),
    getScenarioAsset: vi.fn(),
    getScenarioProjectEntry: vi.fn(),
    getScenarioAssetBlob: vi.fn(),
  };
  return {
    sources,
    project,
    request: { kind: 'video-project' as const, id: project.id, workspaceRevision: 1 },
  };
}
beforeEach(() => {
  render.image.mockReset().mockResolvedValue(new Blob(['cover']));
  render.video.mockReset();
});

it('keeps caches within the owning factory and validates cached revisions without re-decoding', async () => {
  const { sources, request } = fixture();
  const first = createProjectCoverService(sources);
  const second = createProjectCoverService(sources);
  const cover = await first.getCover(request);
  expect(await first.getCover(request)).toBe(cover);
  expect(render.image).toHaveBeenCalledOnce();
  await second.getCover(request);
  expect(render.image).toHaveBeenCalledTimes(2);
  sources.getVideoProject.mockResolvedValue({ status: 'not-found' });
  expect(await first.getCover(request)).toBeUndefined();
});

it('discards a decoded cover when a newer workspace committed while decoding', async () => {
  const { sources, request, project } = fixture();
  let finish: (blob: Blob) => void = () => {};
  render.image.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = createProjectCoverService(sources).getCover(request);
  await vi.waitFor(() => expect(render.image).toHaveBeenCalledOnce());
  sources.getVideoProject.mockResolvedValue({ status: 'ready', project, workspaceRevision: 2 });
  finish(new Blob(['old cover']));
  expect(await pending).toBeUndefined();
});

it('does not publish a cover after its only visible consumer cancels', async () => {
  const { sources, request } = fixture();
  let finish: (blob: Blob) => void = () => {};
  render.image.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const pending = createProjectCoverService(sources).getCover(request, controller.signal);
  await vi.waitFor(() => expect(render.image).toHaveBeenCalledOnce());
  controller.abort();
  finish(new Blob(['late']));
  expect(await pending).toBeUndefined();
  expect(render.image.mock.calls[0]?.[1].aborted).toBe(true);
});

it('uses a tour image when the scenario has no guide image blocks', async () => {
  const { sources } = fixture();
  const project = createGuideProject('Tour cover');
  const slide = createTourImageSlide();
  slide.image = {
    assetId: 'tour-image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 640,
    height: 360,
    alt: 'Tour screenshot',
    source: { kind: 'import', filename: 'tour.png' },
  };
  project.tour = { ...createTourDocument(), slides: [slide] };
  sources.getScenarioProjectEntry.mockResolvedValue({ project, workspaceRevision: 1 });
  const source = new Blob(['tour screenshot']);
  sources.getScenarioAssetBlob.mockResolvedValue(source);
  expect(
    await createProjectCoverService(sources).getCover({
      kind: 'scenario',
      id: project.id,
      workspaceRevision: 1,
    })
  ).toBeInstanceOf(Blob);
  expect(sources.getScenarioAssetBlob).toHaveBeenCalledWith('tour-image');
  expect(render.image).toHaveBeenCalledWith(source, expect.any(AbortSignal), undefined);
});

it('retains a revisited small cover beyond 24 entries without decoding again', async () => {
  const { sources, request } = fixture();
  const service = createProjectCoverService(sources);
  const first = await service.getCover(request);
  for (let i = 0; i < 40; i += 1) await service.getCover({ ...request, id: `cover-${i}` });
  const decodes = render.image.mock.calls.length;
  expect(await service.getCover(request)).toBe(first);
  expect(render.image).toHaveBeenCalledTimes(decodes);
});

it('evicts least recently used covers within the byte budget and never retains an oversized cover', async () => {
  const { sources, request } = fixture();
  const service = createProjectCoverService(sources);
  render.image.mockResolvedValue(new Blob([new Uint8Array(9 * 1024 * 1024)]));
  await service.getCover(request);
  await service.getCover({ ...request, id: 'second' });
  await service.getCover(request);
  expect(render.image).toHaveBeenCalledTimes(3);
  render.image.mockResolvedValue(new Blob([new Uint8Array(17 * 1024 * 1024)]));
  await service.getCover({ ...request, id: 'oversized' });
  await service.getCover({ ...request, id: 'oversized' });
  expect(render.image).toHaveBeenCalledTimes(5);
});

it('bounds even tiny covers by entry count and refreshes recency on hits', async () => {
  const { sources, request } = fixture();
  const service = createProjectCoverService(sources);
  for (let i = 0; i < 256; i += 1) await service.getCover({ ...request, id: `small-${i}` });
  await service.getCover({ ...request, id: 'small-0' });
  await service.getCover({ ...request, id: 'small-256' });
  await service.getCover({ ...request, id: 'small-0' });
  expect(render.image).toHaveBeenCalledTimes(257);
  await service.getCover({ ...request, id: 'small-1' });
  expect(render.image).toHaveBeenCalledTimes(258);
});
