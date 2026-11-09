// @vitest-environment jsdom
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  createImageClip,
  createProject,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import {
  capturePreviewImageResources,
  arePreviewImageResourcesReady,
} from '../scene/image-resources';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';

import { act } from 'react';
import { projectWindowHeaderImages } from '../../../../features/video/composition/draw/window-header';

vi.mock('../../../../features/video/composition/draw/window-header', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/draw/window-header')
  >()),
  projectWindowHeaderImages: vi.fn(() => []),
}));
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type VideoProjectVideoClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { PreviewStageVideoBank, usePreviewStageImageBank } from './video-bank';
import type { PreviewStageVideoRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    id: 'clip-video',
    trackId: 'track-video',
    type: VideoProjectClipType.VIDEO,
    name: 'Video',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: 5,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-video',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 5,
    ...overrides,
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.mocked(projectWindowHeaderImages).mockReturnValue([]);
});

it('registers hidden preview videos with muted defaults for runtime-owned playback', async () => {
  const videoRefs: PreviewStageVideoRefs = { current: {} };
  const clip = createVideoClip();

  await act(async () => {
    root?.render(
      <PreviewStageVideoBank
        assetUrls={{ [clip.assetId]: 'blob:video' }}
        bankClips={[clip]}
        videoRefs={videoRefs}
      />
    );
  });

  const video = videoRefs.current[clip.id];
  expect(video).toBeInstanceOf(HTMLVideoElement);
  expect(video?.muted).toBe(true);
  expect(video?.defaultMuted).toBe(true);
});

it('releases removed video sources without resetting players on ordinary frame updates', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const videoRefs: PreviewStageVideoRefs = { current: {} };
  const clip = createVideoClip();
  const render = (clips: VideoProjectVideoClip[], src = 'blob:first') =>
    act(() =>
      root!.render(
        <PreviewStageVideoBank
          assetUrls={{ [clip.assetId]: src }}
          bankClips={clips}
          videoRefs={videoRefs}
        />
      )
    );
  try {
    for (let i = 0; i < 3; i++) {
      render([clip]);
      const video = videoRefs.current[clip.id]!;
      const loads = load.mock.calls.length;
      const pauses = pause.mock.calls.length;
      render([{ ...clip }]);
      expect(videoRefs.current[clip.id]).toBe(video);
      expect(load).toHaveBeenCalledTimes(loads);
      expect(pause).toHaveBeenCalledTimes(pauses);
      render([]);
      expect(video.hasAttribute('src')).toBe(false);
      expect(pause).toHaveBeenCalledTimes(pauses + 1);
      expect(load).toHaveBeenCalledTimes(loads + 1);
      expect(videoRefs.current[clip.id]).toBeUndefined();
    }
    render([clip]);
    const video = videoRefs.current[clip.id]!;
    const loads = load.mock.calls.length;
    render([clip], 'blob:second');
    expect(video.src).toBe('blob:second');
    expect(load).toHaveBeenCalledTimes(loads + 1);
    render([]);
  } finally {
    pause.mockRestore();
    load.mockRestore();
  }
});

it('keeps pending image requests across equivalent frame plans and ignores stale sources', () => {
  const project = createEmptyVideoProject();
  const requested: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    if (requested.length > 10) throw new Error('Repeated image requests for unchanged frame');
    requested.push(image);
    return image;
  });
  const clip = { ...createVideoClip(), type: VideoProjectClipType.IMAGE };
  let images: Record<string, HTMLImageElement> = {};
  function Probe({ source }: { source: string }) {
    images = usePreviewStageImageBank(project, [clip], { [clip.assetId]: source }).images;
    return null;
  }
  const render = (source: string) => act(() => root!.render(<Probe source={source} />));
  render('blob:first');
  render('blob:first');
  expect(requested).toHaveLength(1);
  render('blob:second');
  expect(requested).toHaveLength(2);
  act(() => requested[0]!.dispatchEvent(new Event('load')));
  expect(images[clip.assetId]).toBeUndefined();
  act(() => requested[1]!.dispatchEvent(new Event('load')));
  expect(images[clip.assetId]).toBe(requested[1]);
  render('blob:second');
  expect(requested).toHaveLength(2);
});

it('retains a failed header image across equivalent frame renders', () => {
  const project = createEmptyVideoProject();
  vi.mocked(projectWindowHeaderImages).mockReturnValue([{ key: 'header', src: 'blob:header' }]);
  const requested: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    if (requested.length > 10) throw new Error('Repeated header request');
    requested.push(image);
    return image;
  });
  let images: Record<string, HTMLImageElement> = {};
  let renders = 0;
  function Probe() {
    if (++renders > 20) throw new Error('Repeated image bank render');
    images = usePreviewStageImageBank(project, [], {}).images;
    return null;
  }
  act(() => root!.render(<Probe />));
  expect(requested).toHaveLength(1);
  act(() => requested[0]!.dispatchEvent(new Event('error')));
  const afterError = renders;
  act(() => root!.render(<Probe />));
  expect(renders).toBe(afterError + 1);
  expect(images['header']).toBe(requested[0]);
  expect(requested).toHaveLength(1);
});

it('does not schedule image state updates for equivalent empty frame plans', () => {
  const project = createEmptyVideoProject();
  let renders = 0;
  function Probe() {
    if (++renders > 20) throw new Error('Repeated empty bank render');
    usePreviewStageImageBank(project, [], {});
    return null;
  }
  act(() => root!.render(<Probe />));
  const initial = renders;
  act(() => root!.render(<Probe />));
  expect(renders).toBe(initial + 1);
});

it('reuses header preparation on ordinary frames and admits the pending image', () => {
  const project = createEmptyVideoProject();
  const clip = createVideoClip();
  const assetUrls = {};
  const requested: HTMLImageElement[] = [];
  vi.mocked(projectWindowHeaderImages).mockClear();
  vi.mocked(projectWindowHeaderImages).mockReturnValue([{ key: 'header', src: 'blob:header' }]);
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  let images: Record<string, HTMLImageElement> = {};
  function Probe({ snapshot = project }: { snapshot?: typeof project }) {
    images = usePreviewStageImageBank(snapshot, [clip], assetUrls).images;
    return null;
  }
  for (let frame = 0; frame < 30; frame++) act(() => root!.render(<Probe />));
  expect(projectWindowHeaderImages).toHaveBeenCalledTimes(1);
  expect(requested).toHaveLength(1);
  act(() => root!.render(<Probe snapshot={{ ...project, name: 'Renamed' }} />));
  expect(projectWindowHeaderImages).toHaveBeenCalledTimes(2);
  expect(requested).toHaveLength(1);
  act(() => requested[0]!.dispatchEvent(new Event('load')));
  expect(images['header']).toBe(requested[0]);
  vi.mocked(projectWindowHeaderImages).mockReturnValue([
    { key: 'updated-header', src: 'blob:updated' },
  ]);
  act(() => root!.render(<Probe snapshot={{ ...project, name: 'Header changed' }} />));
  expect(requested).toHaveLength(2);
  expect(images['header']).toBeUndefined();
  act(() => requested[1]!.dispatchEvent(new Event('load')));
  expect(images['updated-header']).toBe(requested[1]);
});

it('replaces the image plan when seeking to another clip and prunes the previous images', () => {
  const project = createEmptyVideoProject();
  const first = createVideoClip();
  const second = createVideoClip({ id: 'second-clip' });
  const assetUrls = {};
  const requested: HTMLImageElement[] = [];
  vi.mocked(projectWindowHeaderImages).mockImplementation((_project, clips = []) =>
    clips.map((clip) => ({ key: clip.id, src: `blob:${clip.id}` }))
  );
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  let images: Record<string, HTMLImageElement> = {};
  function Probe({ clips }: { clips: VideoProjectVideoClip[] }) {
    images = usePreviewStageImageBank(project, clips, assetUrls).images;
    return null;
  }
  act(() => root!.render(<Probe clips={[first]} />));
  act(() => root!.render(<Probe clips={[second]} />));
  expect(requested).toHaveLength(2);
  act(() => requested[0]!.dispatchEvent(new Event('load')));
  expect(images[first.id]).toBeUndefined();
  act(() => requested[1]!.dispatchEvent(new Event('load')));
  expect(images[second.id]).toBe(requested[1]);
  act(() => root!.render(<Probe clips={[]} />));
  expect(images).toEqual({});
});

it('rebinds equal loaded header content synchronously before effects without another decode or identity flip', () => {
  const project = createEmptyVideoProject();
  const first = createVideoClip({ id: 'first' }),
    second = createVideoClip({ id: 'second' });
  const urls = {};
  const requested: HTMLImageElement[] = [];
  vi.mocked(projectWindowHeaderImages).mockImplementation((_project, clips = []) =>
    clips.map((clip) => ({ key: clip.id, src: 'blob:same-header' }))
  );
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  const observations: { id: string; bank: Record<string, HTMLImageElement> }[] = [];
  function Probe({ clip }: { clip: VideoProjectVideoClip }) {
    const bank = usePreviewStageImageBank(project, [clip], urls).images;
    observations.push({ id: clip.id, bank });
    return null;
  }
  act(() => root!.render(<Probe clip={first} />));
  Object.defineProperties(requested[0]!, {
    complete: { value: true },
    naturalWidth: { value: 100 },
  });
  act(() => requested[0]!.dispatchEvent(new Event('load')));
  const oldBank = observations.at(-1)!.bank;
  const before = observations.length;
  act(() => root!.render(<Probe clip={second} />));
  expect(requested).toHaveLength(1);
  const next = observations.slice(before);
  expect(next[0]!.bank['second']).toBe(requested[0]);
  expect(next.every((row) => row.bank === next[0]!.bank)).toBe(true);
  expect(next[0]!.bank['first']).toBeUndefined();
  expect(oldBank['first']).toBe(requested[0]);
  const descriptorCalls = vi.mocked(projectWindowHeaderImages).mock.calls.length;
  const sourceReads = vi.spyOn(requested[0]!, 'src', 'get');
  for (let frame = 0; frame < 30; frame++) act(() => root!.render(<Probe clip={second} />));
  expect(projectWindowHeaderImages).toHaveBeenCalledTimes(descriptorCalls);
  expect(sourceReads).not.toHaveBeenCalled();
  sourceReads.mockRestore();
});

it('excludes stale same-key header content on the first changed-source render and admits Undo content freshly', () => {
  const project = createEmptyVideoProject();
  const requested: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  const observations: Record<string, HTMLImageElement>[] = [];
  function Probe({ source }: { source: string }) {
    vi.mocked(projectWindowHeaderImages).mockReturnValue([{ key: 'header', src: source }]);
    observations.push(usePreviewStageImageBank({ ...project, name: source }, [], {}).images);
    return null;
  }
  act(() => root!.render(<Probe source="blob:old" />));
  Object.defineProperties(requested[0]!, {
    complete: { value: true },
    naturalWidth: { value: 100 },
  });
  act(() => requested[0]!.dispatchEvent(new Event('load')));
  let before = observations.length;
  act(() => root!.render(<Probe source="blob:new" />));
  expect(observations[before]!['header']).toBeUndefined();
  Object.defineProperties(requested[1]!, {
    complete: { value: true },
    naturalWidth: { value: 100 },
  });
  act(() => requested[1]!.dispatchEvent(new Event('load')));
  expect(observations.at(-1)!['header']).toBe(requested[1]);
  before = observations.length;
  act(() => root!.render(<Probe source="blob:old" />));
  expect(observations[before]!['header']).toBeUndefined();
  expect(requested).toHaveLength(3);
});

it('loads neighboring IMAGE body and header while paused on the first clip', async () => {
  const realHeaders = await vi.importActual<
    typeof import('../../../../features/video/composition/draw/window-header')
  >('../../../../features/video/composition/draw/window-header');
  vi.mocked(projectWindowHeaderImages).mockImplementation(realHeaders.projectWindowHeaderImages);
  const first = createImageClip({
    id: 'A',
    assetId: 'asset-A',
    startTime: 0,
    duration: 2,
    windowHeader: DEFAULT_WINDOW_HEADER,
  });
  const second = createImageClip({
    id: 'B',
    assetId: 'asset-B',
    startTime: 2,
    duration: 2,
    windowHeader: DEFAULT_WINDOW_HEADER,
  });
  const project = createProject([first, second]);
  project.duration = 4;
  const template = project.assets[0]!;
  project.assets = [
    { ...template, id: 'asset-A', type: 'IMAGE' },
    { ...template, id: 'asset-B', type: 'IMAGE' },
  ];
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 4,
      scale: 2,
      zoomInDuration: 3,
      zoomOutDuration: 0,
      motionBlurAmount: 1,
    },
  ];
  const passes = resolveVideoCompositionRenderPasses(project, 1.99);
  expect(passes.overlayFrame.visualLayers.map((layer) => layer.clipId)).toEqual(['A']);
  expect(
    passes.visualPasses.some((pass) =>
      pass.frame.visualLayers.some((layer) => layer.clipId === 'B')
    )
  ).toBe(true);
  const urls = { 'asset-A': 'blob:A', 'asset-B': 'blob:B' };
  const requested: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  let owner: ReturnType<typeof usePreviewStageImageBank> | undefined;
  let renders = 0;
  function Probe() {
    renders++;
    owner = usePreviewStageImageBank(project, [first], urls);
    return null;
  }
  act(() => root!.render(<Probe />));
  for (const image of [...requested]) {
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 1280 },
    });
    act(() => image.dispatchEvent(new Event('load')));
  }
  if (!owner) throw new Error('Expected image owner');
  const request: unknown = Reflect.get(owner, 'prepareImages');
  await act(async () => {
    if (typeof request === 'function')
      await request([passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)]);
  });
  expect(requested.some((image) => image.src === 'blob:B')).toBe(true);
  const resources = () =>
    capturePreviewImageResources({ project, assetUrls: urls, imageBank: owner!.images }, passes);
  expect(arePreviewImageResourcesReady(resources())).toBe(false);
  const headerA = realHeaders.windowHeaderImageKey(first.id, DEFAULT_WINDOW_HEADER);
  const headerB = realHeaders.windowHeaderImageKey(second.id, DEFAULT_WINDOW_HEADER);
  expect(owner!.images[headerB]).toBe(owner!.images[headerA]);
  const body = requested.find((image) => image.src === 'blob:B')!;
  Object.defineProperties(body, { complete: { value: true }, naturalWidth: { value: 1280 } });
  act(() => body.dispatchEvent(new Event('load')));
  expect(arePreviewImageResourcesReady(resources())).toBe(true);
  const calls = vi.mocked(projectWindowHeaderImages).mock.calls.length;
  const renderCount = renders;
  const callback = owner!.prepareImages;
  const sourceReads = requested.map((image) => vi.spyOn(image, 'src', 'get'));
  for (let i = 0; i < 30; i++)
    await act(async () =>
      callback([passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)])
    );
  expect(owner!.prepareImages).toBe(callback);
  expect(renders).toBe(renderCount);
  expect(projectWindowHeaderImages).toHaveBeenCalledTimes(calls);
  expect(requested).toHaveLength(3);
  for (const read of sourceReads) {
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  }
});

it('keeps canceled demand private and rejects retained prior-project callbacks', async () => {
  const first = createImageClip({ id: 'A', assetId: 'A' });
  const next = createImageClip({ id: 'B', assetId: 'B' });
  const project = createProject([first, next]);
  const urls = { A: 'blob:A', B: 'blob:B' };
  const frames = [resolveVideoCompositionRenderPasses(createProject([next]), 1).overlayFrame];
  const requested: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    requested.push(image);
    return image;
  });
  let owner: ReturnType<typeof usePreviewStageImageBank> | undefined;
  function Probe({ revision = project }: { revision?: typeof project }) {
    owner = usePreviewStageImageBank(revision, [first], urls);
    return null;
  }
  act(() => root!.render(<Probe />));
  const old = owner!.prepareImages;
  const canceled = new AbortController();
  await act(async () => owner!.prepareImages(frames, canceled.signal));
  canceled.abort();
  const body = requested.find((image) => image.src === 'blob:B')!;
  Object.defineProperties(body, { complete: { value: true }, naturalWidth: { value: 100 } });
  act(() => body.dispatchEvent(new Event('load')));
  expect(owner!.images['B']).toBeUndefined();
  await act(async () => owner!.prepareImages(frames, new AbortController().signal));
  expect(owner!.images['B']).toBe(body);
  const revision = { ...project, name: 'Edited' };
  act(() => root!.render(<Probe revision={revision} />));
  expect(owner!.images['B']).toBeUndefined();
  const count = requested.length;
  await act(async () => old(frames, new AbortController().signal));
  expect(owner!.images['B']).toBeUndefined();
  expect(requested).toHaveLength(count);
});
