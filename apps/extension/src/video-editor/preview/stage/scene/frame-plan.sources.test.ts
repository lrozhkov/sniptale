// @vitest-environment jsdom
import * as timeline from '../../../../features/video/composition/timeline/render';
import * as gpuComposition from '../../../../features/video/composition/effect-runtime/render/gpu-wave';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { prepareNativePreviewSceneFrame } from './frame-plan';
import type { PreviewSceneRenderInput } from './types';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture() {
  class Frame {
    timestamp: number;
    duration = 16667;
    displayWidth = 1904;
    displayHeight = 1072;
    close = vi.fn();
    constructor(source: HTMLVideoElement | Frame) {
      this.timestamp =
        source instanceof HTMLVideoElement
          ? Math.round(source.currentTime * 1e6)
          : source.timestamp;
    }
    clone() {
      return new Frame(this);
    }
  }
  vi.stubGlobal('VideoFrame', Frame);
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { value: 4 },
    videoWidth: { value: 1904 },
    videoHeight: { value: 1072 },
  });
  video.currentTime = 39.15;
  const projectTime = 32.733333333;
  const sourceTime = 39.292117233;
  const clip = createVideoClip({
    id: 'source',
    duration: 100,
    sourceDuration: 100,
    sourceStart: sourceTime - projectTime,
  });
  const project = createProject([clip]);
  const exact = new VideoFrame(video);
  Object.defineProperty(exact, 'timestamp', { value: 39283333 });
  const source = {
    sourceWidth: 1904,
    sourceHeight: 1072,
    toVideoFrame: () => exact.clone(),
    draw: vi.fn(),
  };
  const release = vi.fn();
  const sourceRuntime = {
    selected: true,
    acquire: vi.fn(async (demands: readonly { id: string }[]) => ({
      bindings: new Map(
        demands.map((demand) => [
          demand.id,
          {
            source,
            timestamp: 39.283333,
            nextTimestamp: 39.316667,
            target: sourceTime,
            url: 'blob:source',
          },
        ])
      ),
      release,
    })),
    prepare: vi.fn(async () => 'ready' as const),
  };
  const input: PreviewSceneRenderInput & { sourceRuntime: typeof sourceRuntime } = {
    project,
    canvas: document.createElement('canvas'),
    currentTime: projectTime,
    imageBank: {},
    stage: null,
    videoRefs: { current: { source: video } },
    previewRenderer: 'gpu',
    assetUrls: { [clip.assetId]: 'blob:source' },
    sourceRuntime,
  };
  return { input, sourceRuntime, release, projectTime, clip };
}
it('uses the covering source sample instead of a late HTML frame on the first Native request', async () => {
  const { input, sourceRuntime, release, projectTime } = fixture();
  const geometry = vi.spyOn(timeline, 'resolveVideoCompositionRenderPasses');
  const prepared = await prepareNativePreviewSceneFrame(input);
  if (!prepared) throw new Error('Expected precise prepared source');
  const frame = prepared.input.decodedVideoFrames?.get('source')?.toVideoFrame?.();
  expect(frame?.timestamp).toBe(39283333);
  expect(prepared.input.preparedFrame?.compositionTime).toBe(projectTime);
  expect(sourceRuntime.acquire).toHaveBeenCalledOnce();
  expect(geometry).toHaveBeenCalledOnce();
  expect([...prepared.input.preparedFrame!.sourceFrames!.bindings.values()][0]).toMatchObject({
    timestamp: 39.283333,
    nextTimestamp: 39.316667,
  });
  frame?.close();
  prepared.release();
  prepared.release();
  expect(release).toHaveBeenCalledOnce();
});

it('prepares an exact source-only packet without claiming GPU isolation', async () => {
  const { input, release } = fixture();
  vi.spyOn(gpuComposition, 'canPrepareEffectRuntimeGpuComposition').mockReturnValue(false);
  const prepared = await prepareNativePreviewSceneFrame(input);
  expect(prepared?.input.preparedFrame?.sourceFrames).toBeDefined();
  expect(prepared?.input.preparedFrame?.gpuIsolated).toBe(false);
  prepared?.release();
  expect(release).toHaveBeenCalledOnce();
});
it('releases its precise source lease while a healthy header is pending', async () => {
  const { input, clip, release } = fixture();
  clip.windowHeader = DEFAULT_WINDOW_HEADER;
  const notified = vi.fn();
  const prepared = await prepareNativePreviewSceneFrame({
    ...input,
    onImageResourcesPrepared: notified,
  });
  expect(prepared).toBeUndefined();
  expect(notified).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('keeps Standard canonical sources serial and skips GPU effect preparation', async () => {
  const { input, release, sourceRuntime } = fixture();
  const geometry = timeline.resolveVideoCompositionRenderPasses(input.project, input.currentTime);
  geometry.overlayFrame.effectRuntimePlans = [
    {
      assets: [],
      controls: {},
      dimensions: { width: 1904, height: 1072 },
      documentSha256: 'test-effect',
      documentSource: 'test',
      duration: 1,
      effectInstanceId: 'effect',
      fps: 30,
      frameIndex: 0,
      kind: 'standalone',
      progress: 0,
      renderDimensions: { width: 1904, height: 1072 },
      snapshotId: 'snapshot',
      target: { kind: 'scene', clipId: 'source' },
      time: input.currentTime,
    },
  ];
  vi.spyOn(timeline, 'resolveVideoCompositionRenderPasses').mockReturnValue(geometry);
  vi.spyOn(gpuComposition, 'canPrepareEffectRuntimeGpuComposition').mockReturnValue(true);
  const prepareGpuFrame = vi.fn();
  const executor = vi.fn(() => ({ prepareGpuFrame, renderFrame: vi.fn(), dispose: vi.fn() }));
  const prepared = await prepareNativePreviewSceneFrame({
    ...input,
    previewRenderer: 'legacy',
    effectRuntimeExecutor: executor,
  });
  expect(prepared?.input.preparedFrame?.sourceFrames).toBeDefined();
  expect(prepared?.input.preparedFrame?.gpuIsolated).toBe(false);
  expect(prepared?.input.preparedFrame?.sourcePresentation.get('source')?.timestampUs).toBe(
    39283333
  );
  expect(sourceRuntime.acquire).toHaveBeenCalledOnce();
  expect(executor).not.toHaveBeenCalled();
  expect(prepareGpuFrame).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  prepared?.release();
  prepared?.release();
  expect(release).toHaveBeenCalledOnce();
});

it('marks a window held at its retained source end explicitly without changing the pose clock', async () => {
  const f = fixture();
  f.clip.sourceStart = 0;
  f.clip.sourceDuration = 1;
  f.clip.duration = 2;
  f.clip.playbackWindow = { offset: 0, holdAt: 1 };
  f.input.currentTime = 1.5;
  const prepared = await prepareNativePreviewSceneFrame(f.input);
  expect(f.sourceRuntime.acquire).toHaveBeenCalledWith(
    [expect.objectContaining({ time: 1, rangeEnd: 1, endpoint: 'retained-end' })],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
  expect(prepared?.input.preparedFrame?.compositionTime).toBe(1.5);
  prepared?.release();
});

it.each(['gpu', 'legacy'] as const)(
  'borrows resolved endpoint bindings through %s preparation without successor evidence',
  async (renderer) => {
    const f = fixture();
    const lease = await f.sourceRuntime.acquire([{ id: 'endpoint' }]);
    const canonical = lease.bindings.get('endpoint')!;
    const binding = {
      source: canonical.source,
      timestamp: canonical.timestamp,
      target: canonical.target,
    };
    const media = new Map([['source', binding.source]]);
    const release = vi.fn();
    const camera = {
      ...timeline.resolveVideoCompositionRenderPasses(f.input.project, f.input.currentTime)
        .overlayFrame.camera,
      scale: 1.5,
    };
    const prepareSources = vi.fn(
      async (passes: ReturnType<typeof timeline.resolveVideoCompositionRenderPasses>) => {
        expect(passes.overlayFrame.camera).toBe(camera);
        expect(passes.visualPasses.every((pass) => pass.frame.camera === camera)).toBe(true);
        return {
          nominal: media,
          bindings: new Map([['endpoint', binding]]),
          media: () => media,
          release,
        };
      }
    );
    const { sourceRuntime: _runtime, ...input } = f.input;
    const prepared = await prepareNativePreviewSceneFrame({
      ...input,
      previewRenderer: renderer,
      cameraOverride: camera,
      prepareSourceFrames: prepareSources,
    });
    expect(prepareSources).toHaveBeenCalledOnce();
    expect(f.sourceRuntime.acquire).toHaveBeenCalledTimes(1);
    expect(prepared?.input.preparedFrame?.sourceFrames?.bindings.get('endpoint')).toBe(binding);
    expect(binding).not.toHaveProperty('nextTimestamp');
    expect(release).not.toHaveBeenCalled();
    prepared?.release();
    prepared?.release();
    expect(release).toHaveBeenCalledOnce();
    lease.release();
  }
);
