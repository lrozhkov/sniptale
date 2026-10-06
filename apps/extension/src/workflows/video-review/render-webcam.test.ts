import { beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import {
  createReviewWebcamRenderer,
  drawReviewWebcam,
  inspectReviewWebcamFrameDuration,
} from './render-webcam';

const state = vi.hoisted(() => ({
  disposed: vi.fn(),
  times: [] as number[],
  samples: [] as { close: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn> }[],
  missing: false,
  stats: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = state.disposed;
    async getPrimaryVideoTrack() {
      return {
        canDecode: async () => true,
        getDisplayWidth: async () => 640,
        getDisplayHeight: async () => 480,
        getTimeResolution: async () => 1000,
        computePacketStats: state.stats,
      };
    }
    async getDurationFromMetadata() {
      return 3;
    }
  },
  VideoSampleSink: class {
    async *samplesAtTimestamps(times: readonly number[]) {
      for (const time of times) {
        state.times.push(time);
        if (state.missing) {
          yield null;
          continue;
        }
        const sample = { close: vi.fn(), draw: vi.fn(), format: 'RGBA' };
        state.samples.push(sample);
        yield sample;
      }
    }
  },
}));

const webcam = () =>
  createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1000, height: 1000 }
  );
const read = async () => new Blob(['camera']);
const context = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  clip: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  state.samples.length = 0;
  state.times.length = 0;
  state.missing = false;
  state.stats.mockResolvedValue({ averagePacketRate: 10 });
});

it('seeds native seek tolerance from bounded metadata without decoding the camera', async () => {
  expect(await inspectReviewWebcamFrameDuration(await read(), new AbortController().signal)).toBe(
    0.1
  );
  expect(state.stats).toHaveBeenCalledWith(60, { metadataOnly: true });
  expect(state.samples).toHaveLength(0);
  expect(state.disposed).toHaveBeenCalledOnce();
});

it('releases cadence inspection after invalid metadata and cancellation', async () => {
  state.stats.mockResolvedValueOnce({ averagePacketRate: 0 });
  await expect(
    inspectReviewWebcamFrameDuration(await read(), new AbortController().signal)
  ).rejects.toThrow('cadence');
  const abort = new AbortController();
  state.stats.mockImplementationOnce(async () => {
    abort.abort();
    return { averagePacketRate: 30 };
  });
  await expect(inspectReviewWebcamFrameDuration(await read(), abort.signal)).rejects.toThrow();
  expect(state.samples).toHaveLength(0);
  expect(state.disposed).toHaveBeenCalled();
});

it('uses one scene-normalized crop and silhouette, then mirrors inside that box', () => {
  const camera = webcam();
  camera.mirrored = true;
  const ctx = context();
  const draw = vi.fn();
  drawReviewWebcam(
    ctx as unknown as CanvasRenderingContext2D,
    { width: 1000, height: 500 },
    camera,
    { x: 0.2, y: 0.1, width: 0.2, height: 0.4 },
    { width: 640, height: 480 },
    { draw }
  );
  expect(ctx.translate.mock.calls).toEqual([
    [200, 50],
    [200, 0],
  ]);
  expect(ctx.roundRect).toHaveBeenCalledWith(0, 0, 200, 200, 20);
  expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
  expect(draw.mock.calls[0]![1]).toBeCloseTo(-100 / 3);
  expect(draw.mock.calls[0]![3]).toBeCloseTo(800 / 3);
  expect(ctx.restore).toHaveBeenCalledOnce();
});

it('streams only covered visible camera timestamps and releases each sample', async () => {
  const camera = {
    ...webcam(),
    offsetSeconds: 2,
    hiddenRanges: [{ id: 'hide', start: 3, end: 4 }],
  };
  const renderer = await createReviewWebcamRenderer(camera, read, new AbortController().signal);
  const visible: boolean[] = [];
  for await (const frame of renderer.frames([1, 2, 3, 4, 5])) visible.push(!!frame);
  expect(visible).toEqual([false, true, false, true, false]);
  expect(state.times).toEqual([0, 2]);
  expect(state.samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  renderer.dispose();
  expect(state.disposed).toHaveBeenCalledOnce();
});

it('closes the retained sample when encoding exits a window early', async () => {
  const renderer = await createReviewWebcamRenderer(webcam(), read, new AbortController().signal);
  const frames = renderer.frames([0, 1, 2]);
  expect((await frames.next()).value).not.toBeNull();
  await frames.return(undefined);
  expect(state.samples[0]!.close).toHaveBeenCalledOnce();
  expect(state.times).toEqual([0]);
  renderer.dispose();
});

it('rejects unavailable bytes and missing frames instead of exporting without the enabled camera', async () => {
  await expect(
    createReviewWebcamRenderer(webcam(), async () => null, new AbortController().signal)
  ).rejects.toMatchObject({ reasons: ['asset-missing'] });
  state.missing = true;
  const renderer = await createReviewWebcamRenderer(webcam(), read, new AbortController().signal);
  await expect(renderer.frames([0]).next()).rejects.toMatchObject({ reasons: ['asset-missing'] });
  renderer.dispose();
});

it('aborts outstanding camera work and rejects subsequent frames', async () => {
  const abort = new AbortController();
  const renderer = await createReviewWebcamRenderer(webcam(), read, abort.signal);
  const frames = renderer.frames([0, 1]);
  await frames.next();
  abort.abort();
  await expect(frames.next()).rejects.toThrow();
  expect(state.samples[0]!.close).toHaveBeenCalledOnce();
  expect(state.disposed).toHaveBeenCalled();
  renderer.dispose();
});
