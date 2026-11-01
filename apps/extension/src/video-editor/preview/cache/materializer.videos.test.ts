// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { createVideoPreviewFrameMaterializer } from './materializer';

type SceneInput = Parameters<typeof import('../stage/scene/render-preview').renderPreviewScene>[0];
const scene = vi.hoisted(() => vi.fn<(input: SceneInput) => Promise<void>>(async () => {}));
vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene: scene }));
const sample = vi.hoisted(() => ({ sample: vi.fn(), dispose: vi.fn(), release: vi.fn() }));
vi.mock('../../../workflows/video-review/decoded-video-sample', () => ({
  createCompositionCutSampleSource: () => sample,
}));
const videos: HTMLVideoElement[] = [];
const owners: ReturnType<typeof createVideoPreviewFrameMaterializer>[] = [];
beforeEach(() => {
  scene.mockClear();
  sample.sample.mockResolvedValue({ media: new Map(), release: sample.release });
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const element = create(tag, options);
    if (tag !== 'video') return element;
    const video = element as HTMLVideoElement;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, value: false },
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
    });
    videos.push(video);
    return video;
  });
});
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  videos.length = 0;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function clip(id: string, startTime = 0, sourceStart = 0): VideoProjectVideoClip {
  return {
    id,
    startTime,
    sourceStart,
    assetId: 'source',
    duration: 1,
    sourceDuration: 40,
    trackId: '',
    type: VideoProjectClipType.VIDEO,
    name: id,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    muted: false,
    volume: 1,
    linkMode: VideoClipLinkMode.DETACHED,
    fitMode: VideoMediaFitMode.CONTAIN,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { width: 100, height: 100, x: 0, y: 0, rotation: 0, opacity: 1 },
  };
}
function fixture(
  clips: VideoProjectVideoClip[],
  urls: Record<string, string> = { source: 'blob:source' }
) {
  const project = createEmptyVideoProject('Video allocation');
  project.clips = clips.map((value) => ({ ...value, trackId: project.tracks[0]!.id }));
  project.duration = Math.max(...clips.map((value) => value.startTime + value.duration));
  const owner = createVideoPreviewFrameMaterializer({
    project,
    assetUrls: urls,
    ownerDocument: document,
    rasterSize: { width: 16, height: 9 },
  });
  owners.push(owner);
  return {
    owner,
    project,
    render: (time: number) => owner.renderFrame(time, new AbortController().signal),
  };
}

it('does not allocate videos before a frame needs them', () => {
  fixture(Array.from({ length: 100 }, (_, i) => clip(`split-${i}`, i, i % 30)));
  expect(videos).toHaveLength(0);
});

it('reuses one native video across a hundred sequential clips and nonsequential seeks', async () => {
  const f = fixture(Array.from({ length: 100 }, (_, i) => clip(`split-${i}`, i, i % 30)));
  const source = JSON.stringify(f.project);
  for (const i of [0, 99, 30, 1, 50, ...Array.from({ length: 100 }, (_, i) => i)]) {
    await f.render(i + 0.25);
    const refs = scene.mock.lastCall![0].videoRefs.current;
    expect(Object.keys(refs)).toEqual([`split-${i}`]);
    expect(refs[`split-${i}`]).toBe(videos[0]);
    expect(videos[0]!.currentTime).toBeCloseTo((i % 30) + 0.25);
    expect(videos).toHaveLength(1);
  }
  expect(JSON.stringify(f.project)).toBe(source);
});

it('keeps distinct source times for overlapping clips of the same asset', async () => {
  const f = fixture([{ ...clip('first', 0, 2), duration: 3 }, clip('second', 1, 10)]);
  await f.render(0.25);
  const first = scene.mock.lastCall![0].videoRefs.current['first'];
  await f.render(1.25);
  const refs = scene.mock.lastCall![0].videoRefs.current;
  expect(refs['first']).toBe(first);
  expect(refs['second']).not.toBe(first);
  expect(refs['first']!.currentTime).toBeCloseTo(3.25);
  expect(refs['second']!.currentTime).toBeCloseTo(10.25);
  expect(videos).toHaveLength(2);
  await f.render(2.25);
  expect(Object.keys(scene.mock.lastCall![0].videoRefs.current)).toEqual(['first']);
  expect(videos).toHaveLength(2);
});

it('preserves the surviving clip slot when a preceding overlap ends', async () => {
  const f = fixture([clip('short', 0, 1), { ...clip('long', 0, 5), duration: 3 }]);
  await f.render(0.25);
  const long = scene.mock.lastCall![0].videoRefs.current['long'];
  await f.render(1.25);
  expect(scene.mock.lastCall![0].videoRefs.current['long']).toBe(long);
  expect(long!.currentTime).toBeCloseTo(6.25);
  expect(videos).toHaveLength(2);
});

it('reuses a free slot for a different asset and returns to the original source', async () => {
  const f = fixture([clip('a'), { ...clip('b', 1, 3), assetId: 'other' }, clip('c', 2, 8)], {
    source: 'blob:source',
    other: 'blob:other',
  });
  await f.render(0.25);
  await f.render(1.25);
  expect(videos).toHaveLength(1);
  expect(videos[0]!.getAttribute('src')).toBe('blob:other');
  expect(videos[0]!.currentTime).toBeCloseTo(3.25);
  await f.render(2.25);
  expect(videos).toHaveLength(1);
  expect(videos[0]!.getAttribute('src')).toBe('blob:source');
  expect(videos[0]!.currentTime).toBeCloseTo(8.25);
});

it('rejects an unavailable active source without publishing stale media and can retry', async () => {
  const f = fixture([clip('valid'), { ...clip('missing', 1), assetId: 'missing' }]);
  await f.render(0.25);
  await expect(f.render(1.25)).rejects.toThrow(
    'Preview video source is unavailable for clip missing'
  );
  expect(scene).toHaveBeenCalledTimes(1);
  await f.render(0.5);
  expect(scene).toHaveBeenCalledTimes(2);
  expect(videos).toHaveLength(1);
});

it('allocates no fallback players when decoded window samples supply the frame', async () => {
  const f = fixture([{ ...clip('window'), playbackWindow: { offset: 0, holdAt: 0.9 } }]);
  await f.render(0.25);
  expect(sample.sample).toHaveBeenCalled();
  expect(videos).toHaveLength(0);
  expect(scene.mock.lastCall![0].decodedVideoFrames).toBeInstanceOf(Map);
});

it('releases every pooled slot once, including slots absent from the last frame', async () => {
  const f = fixture([clip('short'), { ...clip('long', 0, 5), duration: 3 }]);
  await f.render(0.25);
  await f.render(1.25);
  videos.forEach((video) => vi.mocked(video.load).mockClear());
  f.owner.dispose();
  f.owner.dispose();
  for (const video of videos) {
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.isConnected).toBe(false);
  }
  await expect(f.render(0.25)).rejects.toMatchObject({ name: 'AbortError' });
});
