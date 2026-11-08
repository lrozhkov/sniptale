import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createImageClip,
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import type { VideoPreviewFrameMaterializer } from '../../cache/materializer';
import type { renderPreviewScene } from './render-preview';
import { createVideoPreviewCompositionJoinRenderer } from './joins';

const media = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../cache/materializer', () => ({ createVideoPreviewFrameMaterializer: media.create }));
const owners: ReturnType<typeof createVideoPreviewCompositionJoinRenderer>[] = [];
beforeEach(() => media.create.mockReset());
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function fixture() {
  const project = createProject([
    createImageClip({ id: 'intro', duration: 1 }),
    createVideoClip({ id: 'underlay', startTime: 0, duration: 3, sourceDuration: 3 }),
  ]);
  project.duration = 3;
  project.width = 8;
  project.height = 4;
  project.backgroundColor = '#0000ff80';
  project.compositionJoins = [
    {
      id: 'join',
      clipId: 'intro',
      edge: 'end',
      transition: { type: 'dissolve', before: 0.2, after: 0.2 },
    },
  ];
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 12;
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 16, 12));
  const frame = document.createElement('canvas');
  frame.width = 16;
  frame.height = 8;
  const context = frame.getContext('2d')!;
  context.fillStyle = '#ff000080';
  context.fillRect(0, 0, 16, 8);
  const renderFrame = vi.fn<VideoPreviewFrameMaterializer['renderFrame']>(async () => frame);
  const dispose = vi.fn();
  const updateProject = vi.fn(() => true);
  media.create.mockReturnValue({
    canvas: frame,
    renderFrame,
    dispose,
    updateProject,
    renderFrameWithPresentation: vi.fn(
      async (
        time: number,
        signal: AbortSignal,
        camera?: import('../../../../features/video/composition/types').VideoCompositionCameraState
      ) => ({
        canvas: await renderFrame(time, signal, camera),
        presentation: {
          camera: camera ?? resolveVideoCompositionFrame(project, time).camera,
          time,
        },
      })
    ),
  });
  const live = document.createElement('video');
  live.src = 'blob:source-one';
  const raw = vi.fn<typeof renderPreviewScene>(async () => {});
  const owner = createVideoPreviewCompositionJoinRenderer(raw);
  owners.push(owner);
  const input: Parameters<typeof renderPreviewScene>[0] = {
    canvas,
    stage,
    project,
    currentTime: 1,
    assetUrls: { 'asset-video': live.src },
    imageBank: {},
    videoRefs: { current: { underlay: live } },
    signal: new AbortController().signal,
  };
  const pixel = (x: number, y: number) =>
    Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
  return { owner, input, raw, renderFrame, dispose, updateProject, frame, live, pixel };
}

it('publishes a completed viewport without duplicate alpha or live seeks', async () => {
  const f = fixture();
  const seek = vi.spyOn(f.live, 'currentTime', 'set');
  const target = f.input.canvas.getContext('2d')!;
  target.shadowColor = '#00ff00';
  target.shadowBlur = 0;
  await f.owner.render(f.input);
  expect(f.raw).not.toHaveBeenCalled();
  expect(f.renderFrame).toHaveBeenCalledWith(1, expect.any(AbortSignal), undefined);
  expect(media.create.mock.calls[0]![0]).toMatchObject({
    project: f.input.project,
    assetUrls: { 'asset-video': f.live.src },
    rasterSize: { width: 16, height: 8 },
  });
  expect(f.pixel(8, 5)).toEqual([255, 0, 0, 128]);
  expect(f.pixel(8, 0)).toEqual([0, 0, 255, 128]);
  expect(seek).not.toHaveBeenCalled();
  await f.owner.render({ ...f.input, currentTime: 1.1 });
  expect(media.create).toHaveBeenCalledOnce();
  await f.owner.render({ ...f.input, currentTime: 2 });
  expect(f.raw).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
});

it('rebuilds only the private sampler when a borrowed source URL changes', async () => {
  const f = fixture();
  await f.owner.render(f.input);
  f.live.src = 'blob:source-two';
  f.input.assetUrls = { 'asset-video': f.live.src };
  await f.owner.render(f.input);
  expect(media.create).toHaveBeenCalledTimes(2);
  expect(media.create.mock.lastCall![0].assetUrls['asset-video']).toBe(f.live.src);
  expect(f.dispose).toHaveBeenCalledOnce();
});

it('returns cancellation without publishing an obsolete frame or reporting a decoder failure', async () => {
  const f = fixture();
  const pending = Promise.withResolvers<HTMLCanvasElement>();
  f.renderFrame.mockReturnValueOnce(pending.promise);
  const context = f.input.canvas.getContext('2d')!;
  context.fillStyle = '#00ff00';
  context.fillRect(0, 0, 16, 12);
  const drawing = f.owner.render(f.input);
  const requestSignal = f.renderFrame.mock.calls[0]![1];
  f.owner.clear();
  expect(requestSignal.aborted).toBe(true);
  pending.resolve(f.frame);
  expect(await drawing).toBe(false);
  expect(f.pixel(8, 5)).toEqual([0, 255, 0, 255]);
  expect(f.dispose).toHaveBeenCalledOnce();
  await f.owner.render(f.input);
  expect(f.pixel(8, 5)).toEqual([255, 0, 0, 128]);
});

it('keeps the last frame on genuine sampling failure and permits a fresh retry', async () => {
  const f = fixture();
  f.renderFrame.mockRejectedValueOnce(new Error('decode failed'));
  const context = f.input.canvas.getContext('2d')!;
  context.fillStyle = '#00ff00';
  context.fillRect(0, 0, 16, 12);
  await expect(f.owner.render(f.input)).rejects.toThrow('decode failed');
  expect(f.pixel(8, 5)).toEqual([0, 255, 0, 255]);
  expect(f.dispose).toHaveBeenCalledOnce();
  await f.owner.render(f.input);
  expect(media.create).toHaveBeenCalledTimes(2);
  expect(f.pixel(8, 5)).toEqual([255, 0, 0, 128]);
});

it('borrows complete accepted source URLs when both endpoint media are outside the active banks', async () => {
  const f = fixture();
  await f.owner.render({
    ...f.input,
    imageBank: {},
    videoRefs: { current: {} },
    assetUrls: { 'asset-image': 'blob:inactive-intro', 'asset-video': 'blob:inactive-main' },
  });
  expect(media.create.mock.calls[0]![0].assetUrls).toEqual({
    'asset-image': 'blob:inactive-intro',
    'asset-video': 'blob:inactive-main',
  });
});

it('uses the exact sampler for an active windowed video outside a join and releases it on exit', async () => {
  const f = fixture();
  f.input.project.clips.find(({ id }) => id === 'underlay')!.playbackWindow = {
    offset: 0,
    holdAt: 2.9,
  };
  await f.owner.render({ ...f.input, currentTime: 2.95 });
  expect(f.renderFrame).toHaveBeenCalledWith(2.95, expect.any(AbortSignal), undefined);
  expect(f.raw).not.toHaveBeenCalled();
  await f.owner.render({ ...f.input, currentTime: 3.1 });
  expect(f.raw).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
});

it.each(['join', 'window'] as const)(
  'retains admitted media for paused visual edits in a %s',
  async (kind) => {
    const f = fixture();
    if (kind === 'window') {
      f.input.project.compositionJoins = [];
      f.input.project.clips.find(({ id }) => id === 'underlay')!.playbackWindow = {
        offset: 0,
        holdAt: 2.9,
      };
    }
    await f.owner.render(f.input);
    const project = { ...f.input.project, backgroundColor: '#ffffff' };
    await f.owner.render({ ...f.input, project });
    expect(media.create).toHaveBeenCalledOnce();
    expect(f.dispose).not.toHaveBeenCalled();
    expect(f.updateProject).toHaveBeenCalledWith(project);
    expect(f.renderFrame).toHaveBeenCalledTimes(2);
  }
);

it('replaces an incompatible source snapshot and releases the old owner', async () => {
  const f = fixture();
  await f.owner.render(f.input);
  f.updateProject.mockReturnValueOnce(false);
  const project = { ...f.input.project, id: 'another-project' };
  await f.owner.render({ ...f.input, project });
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(media.create).toHaveBeenCalledTimes(2);
  expect(media.create.mock.lastCall![0].project).toBe(project);
});

it('cannot publish a late frame after an incompatible snapshot replaces its owner', async () => {
  const f = fixture();
  const pending = Promise.withResolvers<HTMLCanvasElement>();
  f.renderFrame.mockReturnValueOnce(pending.promise);
  const old = f.owner.render(f.input);
  const oldSignal = f.renderFrame.mock.calls[0]![1];
  f.updateProject.mockReturnValueOnce(false);
  await f.owner.render({ ...f.input, project: { ...f.input.project, id: 'another-project' } });
  expect(oldSignal.aborted).toBe(true);
  const output = f.input.canvas.getContext('2d')!;
  output.fillStyle = '#00ff00';
  output.fillRect(0, 0, 16, 12);
  pending.resolve(f.frame);
  expect(await old).toBe(false);
  expect(f.pixel(8, 5)).toEqual([0, 255, 0, 255]);
  expect(f.dispose).toHaveBeenCalledOnce();
});

it('returns the materialized pose only after final join publication', async () => {
  const f = fixture();
  const camera = {
    ...resolveVideoCompositionFrame(f.input.project, 1).camera,
    scale: 2.4,
    viewportX: 123,
  };
  const presentation = { camera, time: 1 };
  const materializer = media.create;
  const original = materializer.getMockImplementation();
  materializer.mockReturnValueOnce({
    canvas: f.frame,
    dispose: vi.fn(),
    updateProject: () => true,
    renderFrameWithPresentation: async () => ({ canvas: f.frame, presentation }),
  });
  await expect(f.owner.render(f.input)).resolves.toBe(presentation);
  expect(f.pixel(8, 5)).toEqual([255, 0, 0, 128]);
  if (original) materializer.mockImplementation(original);
});

it('prepares the ordinary scene while joins and held windows retain serial admission', async () => {
  const f = fixture();
  const release = vi.fn();
  const prepare = vi.fn(async (input: Parameters<typeof renderPreviewScene>[0]) => ({
    input,
    release,
  }));
  const owner = createVideoPreviewCompositionJoinRenderer(f.raw, prepare);
  owners.push(owner);
  expect(owner.prepare(f.input)).toBeUndefined();
  expect(prepare).not.toHaveBeenCalled();
  const body = { ...f.input, currentTime: 2 };
  const prepared = await owner.prepare(body);
  expect(prepared?.input).toBe(body);
  expect(prepare).toHaveBeenCalledOnce();
  const windowed = {
    ...body,
    project: {
      ...body.project,
      clips: body.project.clips.map((clip) =>
        clip.type === 'VIDEO' ? { ...clip, playbackWindow: { offset: 0, holdAt: 0.9 } } : clip
      ),
    },
  };
  expect(owner.prepare(windowed)).toBeUndefined();
  expect(prepare).toHaveBeenCalledOnce();
  expect(media.create).not.toHaveBeenCalled();
  prepared?.release();
  owner.dispose();
  expect(() => owner.prepare(body)).toThrow('disposed');
});

it('passes the original admitted preparation context through the materializer route', async () => {
  const f = fixture();
  const context = { project: f.input.project, signal: new AbortController().signal };
  const preparation = { context, project: f.input.project, time: f.input.currentTime };
  await f.owner.render({ ...f.input, effectPreparation: preparation });
  const materializer = media.create.mock.results[0]!.value;
  expect(materializer.renderFrameWithPresentation).toHaveBeenCalledWith(
    f.input.currentTime,
    expect.any(AbortSignal),
    undefined,
    undefined,
    preparation
  );
  expect(f.raw).not.toHaveBeenCalled();
});

it('hands off the exact final GPU receipt for a window without copying it to Canvas2D', async () => {
  const f = fixture();
  f.input.project.compositionJoins = [];
  f.input.project.clips.find(({ id }) => id === 'underlay')!.playbackWindow = {
    offset: 0,
    holdAt: 2.9,
  };
  vi.spyOn(f.input.stage!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 16, 8));
  const acquire = vi.fn<NonNullable<typeof f.input.acquireGpuOutput>>();
  const release = vi.fn();
  const camera = { ...resolveVideoCompositionFrame(f.input.project, 2.95).camera, scale: 1.4 };
  const presentation = {
    camera,
    time: 2.95,
    output: { canvas: f.frame, release },
    renderer: { backend: 'gpu' as const },
  };
  const render = vi.fn<VideoPreviewFrameMaterializer['renderFrameWithPresentation']>(async () => ({
    canvas: f.frame,
    presentation,
  }));
  media.create.mockReturnValueOnce({
    renderFrameWithPresentation: render,
    updateProject: f.updateProject,
    dispose: f.dispose,
  });
  const context = f.input.canvas.getContext('2d')!;
  const copy = vi.spyOn(context, 'drawImage');
  const result = await f.owner.render({
    ...f.input,
    currentTime: 2.95,
    cameraOverride: camera,
    acquireGpuOutput: acquire,
  });
  expect(render).toHaveBeenCalledWith(2.95, expect.any(AbortSignal), camera, acquire, undefined);
  expect(result).toBe(presentation);
  expect(copy).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  f.owner.clear();
  expect(release).not.toHaveBeenCalled();
  presentation.output.release();
  expect(release).toHaveBeenCalledOnce();
});

it.each(['abort', 'clear', 'dispose', 'replace'] as const)(
  'releases an untransferred GPU receipt after late %s',
  async (reason) => {
    const f = fixture();
    const controller = new AbortController();
    const release = vi.fn();
    const pending =
      Promise.withResolvers<
        Awaited<ReturnType<VideoPreviewFrameMaterializer['renderFrameWithPresentation']>>
      >();
    media.create.mockReturnValueOnce({
      renderFrameWithPresentation: vi.fn(() => pending.promise),
      updateProject: f.updateProject,
      dispose: f.dispose,
    });
    const context = f.input.canvas.getContext('2d')!;
    const copy = vi.spyOn(context, 'drawImage');
    const job = f.owner.render({ ...f.input, signal: controller.signal });
    if (reason === 'abort') controller.abort();
    else if (reason === 'replace') {
      f.updateProject.mockReturnValueOnce(false);
      await f.owner.render({ ...f.input, project: { ...f.input.project, id: 'replacement' } });
      copy.mockClear();
    } else f.owner[reason]();
    pending.resolve({
      canvas: f.frame,
      presentation: {
        camera: resolveVideoCompositionFrame(f.input.project, 1).camera,
        time: 1,
        output: { canvas: f.frame, release },
      },
    });
    expect(await job).toBe(false);
    expect(copy).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  }
);

it('retains Canvas publication when the materializer declines direct GPU output', async () => {
  const f = fixture();
  const acquire = vi.fn<NonNullable<typeof f.input.acquireGpuOutput>>();
  const result = await f.owner.render({ ...f.input, acquireGpuOutput: acquire });
  expect(media.create.mock.results[0]!.value.renderFrameWithPresentation).toHaveBeenCalledWith(
    1,
    expect.any(AbortSignal),
    undefined,
    acquire,
    undefined
  );
  expect(result).toMatchObject({ time: 1 });
  expect(f.pixel(8, 5)).toEqual([255, 0, 0, 128]);
  expect(f.pixel(8, 0)).toEqual([0, 0, 255, 128]);
  expect(acquire).not.toHaveBeenCalled();
});
