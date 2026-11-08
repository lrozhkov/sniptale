// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import type {
  GpuPreviewRenderer,
  GpuPreviewLayer,
} from '../../../../features/video/composition/canvas/gpu-preview';
import type { renderPreviewScene } from './render-preview';
import { createNativeGpuPreviewRenderer } from './gpu-preview';
const owners: ReturnType<typeof createNativeGpuPreviewRenderer>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture(
  maximumInFlight: 1 | 2 = 1,
  maximumPresentationSurfaces?: number,
  maximumPresentationBytes?: number
) {
  const clip = createVideoClip({
    transform: { x: 0, y: 0, width: 8, height: 4, rotation: 0, opacity: 1 },
  });
  const project = createProject([clip]);
  project.width = 8;
  project.height = 4;
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 8 }, clientHeight: { value: 4 } });
  canvas.width = 8;
  canvas.height = 4;
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoWidth: { value: 8 },
    videoHeight: { value: 4 },
    readyState: { value: 4 },
  });
  const captured: { close: ReturnType<typeof vi.fn>; copyTo: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'VideoFrame',
    class {
      displayWidth = 8;
      displayHeight = 4;
      close = vi.fn();
      copyTo = vi.fn();
      constructor() {
        captured.push(this);
      }
    }
  );
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 8;
  bitmap.height = 4;
  bitmap.getContext('2d')!.fillStyle = '#0000ff';
  bitmap.getContext('2d')!.fillRect(0, 0, 8, 4);
  const render = vi.fn<GpuPreviewRenderer['render']>(async () => bitmap);
  const dispose = vi.fn();
  const create = vi.fn(async () => ({ render, dispose, allocatedBytes: 0 }));
  const owner = createNativeGpuPreviewRenderer(create, {
    maximumInFlight,
    ...(maximumPresentationSurfaces !== undefined ? { maximumPresentationSurfaces } : {}),
    ...(maximumPresentationBytes !== undefined ? { maximumPresentationBytes } : {}),
  });
  owners.push(owner);
  const input: Parameters<typeof renderPreviewScene>[0] = {
    project,
    canvas,
    stage: null,
    imageBank: {},
    currentTime: 1,
    videoRefs: { current: { [clip.id]: video } },
    signal: new AbortController().signal,
  };
  const finish = vi.fn();
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  return { owner, input, passes, finish, render, dispose, create, bitmap, captured };
}
function preparedOutputFixture() {
  const f = fixture(2);
  const pending: Array<{
    request: Parameters<GpuPreviewRenderer['render']>[0];
    done: ReturnType<typeof Promise.withResolvers<void>>;
  }> = [];
  const backend = {
    render: f.render,
    dispose: f.dispose,
    allocatedBytes: 0,
    createSurface: vi.fn(),
  };
  f.create.mockResolvedValue(backend);
  const acquire: NonNullable<typeof f.input.acquireGpuOutput> = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    return {
      canvas,
      release: vi.fn(),
      surface: {
        canvas,
        dispose: vi.fn(),
        present: vi.fn((request) => {
          const done = Promise.withResolvers<void>();
          pending.push({ request, done });
          return done.promise;
        }),
      },
    };
  };
  f.input.acquireGpuOutput = acquire;
  f.input.preparedFrame = {
    passes: f.passes,
    rasterScale: 1,
    compositionTime: 1,
    sourcePresentation: new Map(),
  };
  return { ...f, pending };
}

it('refuses unsafe source-only GPU overlap while a safe prior output is submitted', async () => {
  const f = preparedOutputFixture();
  const first = f.owner.render(f.input, f.passes, f.finish, () => false);
  await vi.waitFor(() => expect(f.pending).toHaveLength(1));
  f.pending[0]!.request.onSubmitted?.();
  const source = {
    sourceWidth: 8,
    sourceHeight: 4,
    toVideoFrame: () =>
      new VideoFrame(f.input.videoRefs.current[Object.keys(f.input.videoRefs.current)[0]!]!),
    draw: vi.fn(),
  };
  const sourceFrames = {
    nominal: new Map([[f.passes.overlayFrame.visualLayers[0]!.clipId, source]]),
    intervals: new Map(),
    media: () => new Map(),
    release: vi.fn(),
  };
  const input = {
    ...f.input,
    preparedFrame: { ...f.input.preparedFrame!, sourceFrames, gpuIsolated: false },
  };
  await expect(f.owner.render(input, f.passes, f.finish, () => false)).rejects.toThrow('overlap');
  expect(f.pending).toHaveLength(1);
  f.pending[0]!.done.resolve();
  const output = await first;
  if (output && typeof output === 'object') output.release();
});
it('selects different video source poses for actual exposure passes on the GPU graph', async () => {
  const f = fixture();
  f.input.project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(f.input.project, 0),
      duration: 5,
      scale: 2,
      zoomInDuration: 5,
      motionBlurAmount: 1,
    },
  ];
  const passes = resolveVideoCompositionRenderPasses(f.input.project, 1);
  expect(passes.visualPasses.length).toBeGreaterThan(1);
  const clipId = passes.overlayFrame.visualLayers[0]!.clipId;
  const source = (time: number) => ({
    sourceWidth: 8,
    sourceHeight: 4,
    draw: vi.fn(),
    toVideoFrame: () => {
      const frame = new VideoFrame(f.input.videoRefs.current[clipId]!);
      Object.defineProperty(frame, 'timestamp', { value: Math.round(time * 1e6) });
      return frame;
    },
  });
  const frames = new Map<object, Map<string, ReturnType<typeof source>>>(
    [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].map((frame) => [
      frame,
      new Map([
        [
          clipId,
          source(
            frame === passes.overlayFrame
              ? 1
              : passes.visualPasses.find((pass) => pass.frame === frame)!.time
          ),
        ],
      ]),
    ])
  );
  const input = {
    ...f.input,
    preparedFrame: {
      passes,
      rasterScale: 1,
      compositionTime: 1,
      sourcePresentation: new Map(),
      gpuIsolated: true,
      sourceFrames: {
        nominal: frames.get(passes.overlayFrame)!,
        intervals: new Map(),
        media: (frame: Pick<typeof passes.overlayFrame, 'visualLayers'>) => {
          const media = frames.get(frame);
          if (!media) throw new Error('Missing frame');
          return media;
        },
        release: vi.fn(),
      },
    },
  };
  const last = passes.visualPasses.at(-1)!;
  await f.owner.render(
    input,
    passes,
    f.finish,
    () => false,
    async (compose) => {
      const result = await compose({
        dimensions: { width: 8, height: 4 },
        renderDimensions: { width: 8, height: 4 },
        layers: last.frame.visualLayers,
        applyCamera: false,
        frames: new Map(),
        scene: { project: f.input.project, frame: last.frame },
        time: last.time,
      });
      result.close();
      return undefined;
    }
  );
  const timestamps: number[] = [];
  const visit = (layers: readonly GpuPreviewLayer[]) => {
    for (const layer of layers) {
      if (layer.source instanceof VideoFrame) timestamps.push(layer.source.timestamp);
      else if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
    }
  };
  visit(f.render.mock.calls[0]![0].layers);
  expect(new Set(timestamps)).toEqual(new Set([Math.round(last.time * 1e6)]));
  timestamps.length = 0;
  visit(f.render.mock.calls.at(-1)![0].layers);
  expect(new Set(timestamps)).toEqual(
    new Set(passes.visualPasses.map((pass) => Math.round(pass.time * 1e6)))
  );
  for (const frame of f.captured) expect(frame.close).toHaveBeenCalledOnce();
});
