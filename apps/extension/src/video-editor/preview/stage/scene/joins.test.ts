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
  media.create.mockReturnValue({ canvas: frame, renderFrame, dispose });
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
  return { owner, input, raw, renderFrame, dispose, frame, live, pixel };
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
