import * as timeline from '../../../../features/video/composition/timeline/render';
import * as gpuComposition from '../../../../features/video/composition/effect-runtime/render/gpu-wave';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
// @vitest-environment jsdom
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
  expect([...prepared.input.preparedFrame!.sourceFrames!.intervals.values()][0]).toMatchObject({
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
