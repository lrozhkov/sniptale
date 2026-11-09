// @vitest-environment jsdom
import { createEffectRuntimeFailure } from '../../../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeSceneResult,
  EffectRuntimeRenderCommand,
} from '../../../../contracts/effect-runtime/types';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from '../../../../features/video/composition/draw/window-header';
import * as timeline from '../../../../features/video/composition/timeline/render';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEffectRuntimeSnapshotDocument } from '../../../../features/video/composition/effect-runtime/runtime/snapshot-document';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import { scaleEffectRuntimeFramePlan } from '../../../../features/video/composition/effect-runtime/render/wave';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import {
  captureNativePreviewSources,
  prepareNativePreviewSceneFrame,
  resolveUpcomingNativeEffect,
  resolveUpcomingNativeEffectOnset,
} from './frame-plan';
import type { PreviewSceneRenderInput } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture() {
  const clip = createVideoClip({ id: 'source', startTime: 0, duration: 5, sourceDuration: 5 });
  const project = createProject([clip]);
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    videoWidth: { value: 1904 },
    videoHeight: { value: 984 },
  });
  video.currentTime = 1.033;
  const frames: CapturedFrame[] = [];
  class CapturedFrame {
    timestamp: number;
    duration = 33333;
    displayWidth = 1904;
    displayHeight = 984;
    close = vi.fn();
    constructor(source: HTMLVideoElement | CapturedFrame) {
      this.timestamp =
        source instanceof HTMLVideoElement
          ? Math.round(source.currentTime * 1e6)
          : source.timestamp;
      frames.push(this);
    }
    clone() {
      return new CapturedFrame(this);
    }
  }
  vi.stubGlobal('VideoFrame', CapturedFrame);
  const input: PreviewSceneRenderInput = {
    project,
    canvas: document.createElement('canvas'),
    currentTime: 1,
    imageBank: {},
    stage: null,
    videoRefs: { current: { source: video } },
    previewRenderer: 'gpu',
  };
  return { input, video, frames };
}

it('holds the captured source PTS while asynchronous dependencies and the media clock advance', async () => {
  const f = fixture();
  const images = Promise.withResolvers<void>();
  const prepareImages = vi.fn((_frames: unknown, _signal?: AbortSignal) => images.promise);
  const controller = new AbortController();
  const pending = prepareNativePreviewSceneFrame({
    ...f.input,
    prepareImages,
    signal: controller.signal,
  });
  expect(prepareImages.mock.calls[0]?.[1]).toBe(controller.signal);
  expect(f.frames).toHaveLength(1);
  f.video.currentTime = 2;
  images.resolve();
  const prepared = await pending;
  if (!prepared) throw new Error('Expected prepared scene.');
  const data = prepared.input.preparedFrame;
  expect(data?.compositionTime).toBe(1);
  expect(data?.sourcePresentation.get('source')).toEqual({
    timestampUs: 1033000,
    durationUs: 33333,
  });
  const clone = prepared.input.decodedVideoFrames?.get('source')?.toVideoFrame?.();
  expect(clone?.timestamp).toBe(1033000);
  expect(f.frames).toHaveLength(2);
  expect(f.frames[0]!.close).not.toHaveBeenCalled();
  prepared.release();
  prepared.release();
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
  expect(f.frames[1]!.close).not.toHaveBeenCalled();
  clone?.close();
  expect(f.frames[1]!.close).toHaveBeenCalledOnce();
  expect(prepareImages).toHaveBeenCalledOnce();
});

it('releases captured inputs when cancelled during asynchronous preparation', async () => {
  const f = fixture();
  const images = Promise.withResolvers<void>();
  const controller = new AbortController();
  const pending = prepareNativePreviewSceneFrame({
    ...f.input,
    signal: controller.signal,
    prepareImages: () => images.promise,
  });
  expect(f.frames).toHaveLength(1);
  controller.abort();
  images.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});

it('releases captured inputs after failed dependency preparation', async () => {
  const f = fixture();
  const failure = new Error('image preparation failed');
  await expect(
    prepareNativePreviewSceneFrame({
      ...f.input,
      prepareImages: async () => {
        throw failure;
      },
    })
  ).rejects.toThrow(failure);
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});

it('does not capture an unready or legacy source', () => {
  const f = fixture();
  expect(prepareNativePreviewSceneFrame({ ...f.input, previewRenderer: 'legacy' })).toBeUndefined();
  Object.defineProperty(f.video, 'readyState', { value: 1 });
  expect(prepareNativePreviewSceneFrame(f.input)).toBeUndefined();
  expect(f.frames).toHaveLength(0);
});

it('rolls back partial captures when a later source is unavailable', () => {
  const f = fixture();
  const second = createVideoClip({ id: 'unready', startTime: 0, duration: 5, sourceDuration: 5 });
  const project = { ...f.input.project, clips: [...f.input.project.clips, second] };
  const video = document.createElement('video');
  const input = {
    ...f.input,
    project,
    videoRefs: { current: { source: f.video, unready: video } },
  };
  const result = captureNativePreviewSources(
    input,
    resolveVideoCompositionRenderPasses(project, 1)
  );
  expect(result).toBeNull();
  expect(f.frames).toHaveLength(1);
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});

function futureFixture() {
  const f = fixture();
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
    'utf8'
  );
  const document = parseEffectRuntimeSnapshotDocument({ source });
  const id = 'a'.repeat(64);
  f.input.project.effectSnapshots = [
    {
      id: `effect:${id}`,
      source,
      sha256: id,
      documentId: document.id,
      assets: [],
      kind: 'standalone',
      schemaVersion: 'sniptale.effect.v1',
      retainedByteLength: new TextEncoder().encode(source).byteLength,
    },
  ];
  f.input.project.effectInstances = [
    {
      id: 'future',
      snapshotId: `effect:${id}`,
      controls: {},
      duration: document.duration,
      enabled: true,
      kind: 'standalone',
      playbackRate: 1,
      startTime: 2,
      target: { kind: 'scene' },
    },
  ];
  const host = createEffectHostClip({
    effectInstanceId: 'future',
    name: 'Future',
    startTime: 2,
    duration: document.duration,
    trackId: f.input.project.tracks[0]!.id,
    projectWidth: f.input.project.width,
    projectHeight: f.input.project.height,
  });
  f.input.project.clips.push(host);
  f.input.currentTime = 1.1;
  f.input.previewRasterSize = { width: 640, height: 360 };
  Object.defineProperties(f.input.canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  });
  return { ...f, host };
}

it('selects the actual scaled future standalone plan without capturing or seeking media', () => {
  const f = futureFixture(),
    before = f.video.currentTime;
  const candidate = resolveUpcomingNativeEffect(f.input);
  expect(candidate).not.toBeNull();
  if (!candidate) throw new Error('Expected future effect');
  expect(candidate.onset).toBe(2);
  expect(candidate.time).toBeGreaterThan(2);
  expect(candidate.time).toBeLessThanOrEqual(2 + 2 / f.input.project.fps);
  const expected = resolveVideoCompositionRenderPasses(
    f.input.project,
    candidate.time
  ).overlayFrame.effectRuntimePlans!.find((plan) => plan.effectInstanceId === 'future')!;
  const scale = Math.min(640 / f.input.project.width, 360 / f.input.project.height);
  expect(candidate.plan).toEqual(scaleEffectRuntimeFramePlan(expected, scale));
  expect(candidate.layer.clipId).toBe(f.host.id);
  expect(candidate.plan.target).toMatchObject({ kind: 'scene', clipId: f.host.id });
  expect(candidate.fullFrame).toBe(false);
  expect(candidate.logical).toEqual({
    width: f.input.project.width,
    height: f.input.project.height,
  });
  expect(candidate.output).toEqual({ width: 640, height: 360 });
  expect(f.frames).toEqual([]);
  expect(f.video.currentTime).toBe(before);
});

it.each(['hidden', 'disabled', 'unreferenced', 'outside'] as const)(
  'does not select an ineligible future standalone effect (%s)',
  (reason) => {
    const f = futureFixture();
    if (reason === 'hidden') f.input.project.tracks[0]!.visible = false;
    if (reason === 'disabled') f.input.project.effectInstances![0]!.enabled = false;
    if (reason === 'unreferenced')
      f.input.project.clips = f.input.project.clips.filter((clip) => clip.id !== f.host.id);
    if (reason === 'outside') f.input.currentTime = 0.5;
    expect(resolveUpcomingNativeEffect(f.input)).toBeNull();
    expect(f.frames).toEqual([]);
  }
);

it('selects a cheap onset without resolving future composition or touching media', () => {
  const f = futureFixture();
  const spy = vi.spyOn(f.input.canvas, 'getContext');
  const next = resolveUpcomingNativeEffectOnset(f.input.project, f.input.currentTime);
  expect(next).toMatchObject({ clipId: f.host.id, effectInstanceId: 'future', onset: 2 });
  expect(spy).not.toHaveBeenCalled();
  expect(f.frames).toEqual([]);
});

it('releases captured sources without reserving a frame while its header is pending', async () => {
  const f = fixture();
  const clip = f.input.project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.windowHeader = DEFAULT_WINDOW_HEADER;
  const notify = vi.fn();
  await expect(
    prepareNativePreviewSceneFrame({ ...f.input, onImageResourcesPrepared: notify })
  ).resolves.toBeUndefined();
  expect(notify).toHaveBeenCalledOnce();
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});

it('captures the prepared image snapshot from its one resolved pass set after image readiness', async () => {
  const f = fixture();
  const clip = f.input.project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.windowHeader = DEFAULT_WINDOW_HEADER;
  const key = windowHeaderImageKey(clip.id, DEFAULT_WINDOW_HEADER);
  const image = document.createElement('img');
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } });
  const bank = { [key]: image, unused: image };
  const gate = Promise.withResolvers<void>();
  const notify = vi.fn();
  const resolve = vi.spyOn(timeline, 'resolveVideoCompositionRenderPasses');
  const pending = prepareNativePreviewSceneFrame({
    ...f.input,
    imageBank: bank,
    prepareImages: () => gate.promise,
    onImageResourcesPrepared: notify,
  });
  expect(notify).not.toHaveBeenCalled();
  gate.resolve();
  const prepared = await pending;
  if (!prepared) throw new Error('Expected prepared frame');
  expect(resolve).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledOnce();
  expect(prepared.input.preparedFrame?.imageResources).toBe(notify.mock.calls[0]![0]);
  expect(prepared.input.imageBank[key]).toBe(image);
  expect(prepared.input.imageBank['unused']).toBeUndefined();
  expect(bank.unused).toBe(image);
  prepared.release();
  resolve.mockRestore();
});

it('reports the prepared resource snapshot before its SDK request completes and releases failure inputs', async () => {
  const f = futureFixture();
  f.input.currentTime = 2.1;
  const response = Promise.withResolvers<EffectRuntimeSceneResult>();
  const executor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn((_request: EffectRuntimeRenderCommand) => response.promise),
  };
  const notify = vi.fn();
  const pending = prepareNativePreviewSceneFrame({
    ...f.input,
    effectRuntimeExecutor: executor,
    onImageResourcesPrepared: notify,
  });
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(executor.prepareGpuFrame).toHaveBeenCalledOnce());
  expect(notify).toHaveBeenCalledOnce();
  const command = executor.prepareGpuFrame.mock.calls[0]?.[0];
  if (!command) throw new Error('Expected SDK request');
  response.resolve(createEffectRuntimeFailure(command, 'inputRejected'));
  await rejected;
  expect(f.frames[0]!.close).toHaveBeenCalledOnce();
});
