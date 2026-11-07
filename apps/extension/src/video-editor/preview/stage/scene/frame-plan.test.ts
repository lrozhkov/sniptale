// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { captureNativePreviewSources, prepareNativePreviewSceneFrame } from './frame-plan';
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
  const prepareImages = vi.fn(() => images.promise);
  const pending = prepareNativePreviewSceneFrame({ ...f.input, prepareImages });
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
