// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  createImageClip,
  createShapeClip,
  createTrack,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { VideoProjectAssetType, type VideoProject } from '../../../features/video/project/types';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { createVideoPreviewFrameMaterializer } from './materializer';

type PreviewSceneInput = Parameters<
  typeof import('../stage/scene/render-preview').renderPreviewScene
>[0];
const paintScene = vi.hoisted(() => vi.fn());
const renderPreviewScene = vi.hoisted(() => vi.fn<(input: PreviewSceneInput) => Promise<void>>());
beforeEach(() => {
  renderPreviewScene.mockImplementation(async (input) => {
    const plan = resolveVideoCompositionRenderPasses(input.project, input.currentTime);
    await input.prepareImages?.([
      plan.overlayFrame,
      ...plan.visualPasses.map((pass) => pass.frame),
    ]);
    paintScene();
  });
});
vi.mock('../stage/scene/render-preview', async () => {
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  return {
    renderPreviewScene: async (
      input: Parameters<typeof import('../stage/scene/render-preview').renderPreviewScene>[0]
    ) => {
      await renderPreviewScene(input);
      return {
        camera:
          input.cameraOverride ??
          resolveVideoCompositionFrame(input.project, input.currentTime).camera,
        time: input.currentTime,
      };
    },
  };
});

afterEach(() => {
  renderPreviewScene.mockClear();
  paintScene.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function imageReadinessFixture(
  complete: boolean,
  naturalWidth: number,
  options: {
    inactiveCount?: number;
    inactiveComplete?: boolean;
    configure?: (project: VideoProject) => void;
  } = {}
) {
  const image = document.createElement('img');
  const readiness = { complete, naturalWidth };
  Object.defineProperties(image, {
    complete: { configurable: true, get: () => readiness.complete },
    naturalWidth: { configurable: true, get: () => readiness.naturalWidth },
  });
  const createElement = document.createElement.bind(document);
  const extraReads = vi.fn(() => options.inactiveComplete ?? true);
  const extraImages: HTMLImageElement[] = [];
  let imageCount = 0;
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    if (tagName !== 'img') return createElement(tagName, options);
    if (imageCount++ === 0) return image;
    const inactive = createElement('img');
    Object.defineProperties(inactive, {
      complete: { configurable: true, get: extraReads },
      naturalWidth: { configurable: true, value: 0 },
    });
    extraImages.push(inactive);
    return inactive;
  });
  const project = createEmptyVideoProject('Image readiness');
  project.assets = [
    {
      id: 'image',
      name: 'Image',
      createdAt: 1,
      type: VideoProjectAssetType.IMAGE,
      source: { kind: 'recording', recordingId: 'recording' },
      metadata: {
        audioPeaks: null,
        duration: 1,
        hasAudio: false,
        height: 180,
        width: 320,
        mimeType: 'image/png',
        size: 100,
      },
    },
  ];
  const asset = project.assets[0]!;
  for (let index = 0; index < (options.inactiveCount ?? 0); index++) {
    project.assets.push({ ...asset, id: `inactive-${index}` });
  }
  project.clips = [createImageClip({ assetId: 'image', trackId: project.tracks[0]!.id })];
  options.configure?.(project);
  const owner = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: Object.fromEntries(project.assets.map((asset) => [asset.id, `blob:${asset.id}`])),
    rasterSize: { width: 320, height: 180 },
  });
  return { image, readiness, owner, extraReads, extraImages, project };
}

it('rejects an image that failed before preparation without waiting for the frame timeout', async () => {
  vi.useFakeTimers();
  const { image, readiness, owner } = imageReadinessFixture(true, 0);
  image.dispatchEvent(new Event('error'));
  const failure = vi.fn();
  const pending = owner.renderFrame(0, new AbortController().signal).catch(failure);
  await vi.advanceTimersByTimeAsync(0);
  expect(failure).toHaveBeenCalledWith(new Error('Preview media could not be decoded'));
  await pending;
  expect(paintScene).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  readiness.naturalWidth = 320;
  await expect(owner.renderFrame(0, new AbortController().signal)).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it.each(['load', 'error', 'abort', 'timeout'] as const)(
  'settles pending image preparation on %s and releases its listeners and timer',
  async (event) => {
    vi.useFakeTimers();
    const { image, readiness, owner } = imageReadinessFixture(false, 0);
    const controller = new AbortController();
    const addImage = vi.spyOn(image, 'addEventListener');
    const removeImage = vi.spyOn(image, 'removeEventListener');
    const addAbort = vi.spyOn(controller.signal, 'addEventListener');
    const removeAbort = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = owner.renderFrame(0, controller.signal);
    const outcome = pending.then(
      () => 'rendered',
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(paintScene).not.toHaveBeenCalled();
    if (event === 'timeout') {
      await vi.advanceTimersByTimeAsync(2_000);
    } else if (event === 'abort') {
      controller.abort();
    } else {
      readiness.complete = true;
      readiness.naturalWidth = event === 'load' ? 320 : 0;
      image.dispatchEvent(new Event(event));
    }
    const expected =
      event === 'load'
        ? 'rendered'
        : event === 'abort'
          ? expect.objectContaining({ name: 'AbortError' })
          : new Error(
              event === 'error' ? 'Preview media could not be decoded' : 'Preview media timed out'
            );
    expect(await outcome).toEqual(expected);
    expect(paintScene).toHaveBeenCalledTimes(event === 'load' ? 1 : 0);
    for (const [name, listener] of addImage.mock.calls) {
      expect(removeImage).toHaveBeenCalledWith(name, listener);
    }
    for (const [name, listener] of addAbort.mock.calls) {
      expect(removeAbort).toHaveBeenCalledWith(name, listener);
    }
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
  }
);

it.each([0, 320])(
  'honors cancellation before preparing a completed image of width %s',
  async (width) => {
    vi.useFakeTimers();
    const { owner } = imageReadinessFixture(true, width);
    const controller = new AbortController();
    controller.abort();
    await expect(owner.renderFrame(0, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(paintScene).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
  }
);

it.each([true, false])(
  'ignores readiness of 500 unused images with complete=%s',
  async (inactiveComplete) => {
    const { owner, extraReads, extraImages } = imageReadinessFixture(true, 320, {
      inactiveCount: 500,
      inactiveComplete,
    });
    const listeners = extraImages.map((image) => vi.spyOn(image, 'addEventListener'));
    await expect(owner.renderFrame(0, new AbortController().signal)).resolves.toBe(owner.canvas);
    expect(paintScene).toHaveBeenCalledOnce();
    expect(extraReads).not.toHaveBeenCalled();
    for (const listener of listeners) expect(listener).not.toHaveBeenCalled();
    owner.dispose();
  }
);

it.each(['future', 'hidden'] as const)('ignores a broken image on a %s clip', async (location) => {
  const { owner, extraReads } = imageReadinessFixture(true, 320, {
    inactiveCount: 1,
    configure(project) {
      project.tracks.push(createTrack('hidden', 1, undefined, false));
      project.clips.push(
        createImageClip({
          id: 'later',
          assetId: 'inactive-0',
          windowHeader: { ...DEFAULT_WINDOW_HEADER },
          trackId: location === 'hidden' ? 'hidden' : project.tracks[0]!.id,
          startTime: location === 'future' ? 20 : 0,
        })
      );
    },
  });
  await expect(owner.renderFrame(0, new AbortController().signal)).resolves.toBe(owner.canvas);
  expect(extraReads).not.toHaveBeenCalled();
  owner.dispose();
});

it('waits for an embedded shape image before painting', async () => {
  vi.useFakeTimers();
  const { owner, image, readiness } = imageReadinessFixture(false, 0, {
    configure(project) {
      project.clips = [
        createShapeClip({
          trackId: project.tracks[0]!.id,
          embeddedAsset: { assetId: 'image', placement: { x: 0, y: 0, width: 100, height: 100 } },
        }),
      ];
    },
  });
  const pending = owner.renderFrame(0, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(paintScene).not.toHaveBeenCalled();
  readiness.complete = true;
  readiness.naturalWidth = 320;
  image.dispatchEvent(new Event('load'));
  await expect(pending).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it('requires the current window header and allows retry after its decode failure', async () => {
  const { owner, extraImages } = imageReadinessFixture(true, 320, {
    configure(project) {
      const clip = project.clips[0]!;
      if (clip.type === 'IMAGE') clip.windowHeader = { ...DEFAULT_WINDOW_HEADER };
    },
  });
  expect(extraImages).toHaveLength(1);
  await expect(owner.renderFrame(0, new AbortController().signal)).rejects.toThrow(
    'could not be decoded'
  );
  expect(paintScene).not.toHaveBeenCalled();
  Object.defineProperty(extraImages[0]!, 'naturalWidth', { value: 320 });
  await expect(owner.renderFrame(0, new AbortController().signal)).resolves.toBe(owner.canvas);
  owner.dispose();
});

it('waits for image dependencies that occur only in motion-blur samples', async () => {
  vi.useFakeTimers();
  const { owner, image, readiness, extraImages, project } = imageReadinessFixture(false, 0, {
    inactiveCount: 1,
    configure(project) {
      project.duration = 4;
      project.clips = [
        createImageClip({
          id: 'before',
          assetId: 'image',
          trackId: project.tracks[0]!.id,
          duration: 1.5,
        }),
        createImageClip({
          id: 'after',
          assetId: 'inactive-0',
          trackId: project.tracks[0]!.id,
          startTime: 1.5,
          duration: 2.5,
        }),
      ];
      project.motionRegions = [
        {
          ...createVideoProjectMotionRegion(project, 1),
          motionBlurAmount: 0.75,
          scale: 2,
          zoomInDuration: 1,
        },
      ];
    },
  });
  Object.defineProperty(extraImages[0]!, 'naturalWidth', { value: 320 });
  const plan = resolveVideoCompositionRenderPasses(project, 1.5);
  expect(plan.overlayFrame.visualLayers.map((layer) => layer.clipId)).not.toContain('before');
  expect(
    plan.visualPasses.some(({ frame }) =>
      frame.visualLayers.some((layer) => layer.clipId === 'before')
    )
  ).toBe(true);
  const pending = owner.renderFrame(1.5, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(paintScene).not.toHaveBeenCalled();
  readiness.complete = true;
  readiness.naturalWidth = 320;
  image.dispatchEvent(new Event('load'));
  await expect(pending).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it('prepares both held composition-join endpoints without admitting unused broken images', async () => {
  vi.useFakeTimers();
  const { owner, extraImages } = imageReadinessFixture(true, 320, {
    inactiveCount: 2,
    inactiveComplete: false,
    configure(project) {
      project.duration = 2;
      project.clips = [
        createImageClip({
          id: 'before',
          assetId: 'image',
          trackId: project.tracks[0]!.id,
          duration: 1,
        }),
        createImageClip({
          id: 'after',
          assetId: 'inactive-0',
          trackId: project.tracks[0]!.id,
          startTime: 1,
          duration: 1,
        }),
      ];
      project.compositionJoins = [
        {
          id: 'join',
          clipId: 'before',
          edge: 'end',
          transition: { type: 'dissolve', before: 0.5, after: 0.5 },
        },
      ];
    },
  });
  const pending = owner.renderFrame(1, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(paintScene).toHaveBeenCalledTimes(1);
  const endpoint = extraImages[0]!;
  Object.defineProperties(endpoint, { complete: { value: true }, naturalWidth: { value: 320 } });
  endpoint.dispatchEvent(new Event('load'));
  await expect(pending).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledTimes(2);
  owner.dispose();
});

it('prepares transparent image inputs even when an effect replaces their visible layers', async () => {
  vi.useFakeTimers();
  const { owner, project, image, readiness } = imageReadinessFixture(false, 0);
  const frame = resolveVideoCompositionRenderPasses(project, 0).overlayFrame;
  frame.effectInputLayers = frame.visualLayers.map((layer) => ({ ...layer, opacity: 0 }));
  frame.visualLayers = [];
  renderPreviewScene.mockImplementationOnce(async (input) => {
    await input.prepareImages?.([frame]);
    paintScene();
  });
  const pending = owner.renderFrame(0, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(paintScene).not.toHaveBeenCalled();
  readiness.complete = true;
  readiness.naturalWidth = 320;
  image.dispatchEvent(new Event('load'));
  await expect(pending).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it('waits for the scene background even when it is absent from frame visual layers', async () => {
  vi.useFakeTimers();
  const { image, readiness, owner } = imageReadinessFixture(false, 0, {
    configure(project) {
      project.clips = [];
      project.sceneBackground = { kind: 'image', assetId: 'image' };
    },
  });
  const pending = owner.renderFrame(0, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(paintScene).not.toHaveBeenCalled();
  readiness.complete = true;
  readiness.naturalWidth = 320;
  image.dispatchEvent(new Event('load'));
  await expect(pending).resolves.toBe(owner.canvas);
  expect(paintScene).toHaveBeenCalledOnce();
  owner.dispose();
});

it.each(['error', 'abort'] as const)(
  'settles pending scene background on %s without painting',
  async (event) => {
    vi.useFakeTimers();
    const { image, readiness, owner } = imageReadinessFixture(false, 0, {
      configure(project) {
        project.clips = [];
        project.sceneBackground = { kind: 'image', assetId: 'image' };
      },
    });
    const controller = new AbortController();
    const outcome = owner.renderFrame(0, controller.signal).then(
      () => 'painted',
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(0);
    if (event === 'abort') controller.abort();
    else {
      readiness.complete = true;
      image.dispatchEvent(new Event('error'));
    }
    expect(await outcome).toEqual(
      event === 'error'
        ? new Error('Preview media could not be decoded')
        : expect.objectContaining({ name: 'AbortError' })
    );
    expect(paintScene).not.toHaveBeenCalled();
    owner.dispose();
  }
);
