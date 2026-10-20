import { argsFixture, contextFixture, state } from './render-export.test-support';
import { afterEach, expect, it, vi } from 'vitest';
import { writeReviewFrames } from './render-export';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
const painting = vi.hoisted(() => ({
  order: [] as string[],
  draw: vi.fn(),
  dispose: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('./render-watermark', () => ({ createReviewWatermarkRenderer: painting.prepare }));
vi.mock('./render-key-animation', () => ({ drawReviewKeys: () => painting.order.push('keys') }));
vi.mock('./cut-transition-frames', async (original) => ({
  ...(await original<typeof import('./cut-transition-frames')>()),
  paintReviewCutBlackout: () => painting.order.push('blackout'),
}));
afterEach(() => {
  vi.clearAllMocks();
  painting.order = [];
});
it('prepares once and paints after keys before whole-frame blackout for every exported frame', async () => {
  const args = argsFixture();
  args.advanced.watermark = { ...createQuickEditWatermark('Saved'), mode: 'text' };
  painting.prepare.mockResolvedValue({
    draw: () => painting.order.push('watermark'),
    dispose: painting.dispose,
  });
  await writeReviewFrames(args);
  expect(painting.prepare).toHaveBeenCalledOnce();
  expect(painting.prepare).toHaveBeenCalledWith(
    args.advanced.watermark,
    { width: 320, height: 180 },
    args.signal,
    args.readProjectAsset
  );
  expect(painting.order).toEqual(
    Array.from({ length: state.encoded.length }, () => ['keys', 'watermark', 'blackout']).flat()
  );
  expect(painting.dispose).toHaveBeenCalledOnce();
});
it('does not encode any frame when watermark resource preparation fails', async () => {
  const args = argsFixture();
  args.advanced.watermark = { ...createQuickEditWatermark('Saved'), mode: 'text' };
  painting.prepare.mockRejectedValueOnce(new Error('font unavailable'));
  await expect(writeReviewFrames(args)).rejects.toThrow('font unavailable');
  expect(state.encoded).toHaveLength(0);
});
it.each([
  { fps: 30, offset: 0 },
  { fps: 30, offset: 4 },
  { fps: 60, offset: 0 },
  { fps: 60, offset: 4 },
] as const)(
  'keeps a static watermark on every frame at $fps fps with fragment offset $offset',
  async ({ fps, offset }) => {
    painting.prepare.mockResolvedValue({ draw: painting.draw, dispose: painting.dispose });
    const args = argsFixture();
    args.advanced.watermark = { ...createQuickEditWatermark('Saved'), mode: 'text' };
    args.index.duration = 0.2;
    await writeReviewFrames({
      ...args,
      fragmentOffset: offset,
      renderSettings: { quality: 'HIGH', frameRate: fps },
    });
    expect(painting.draw).toHaveBeenCalledTimes(state.encoded.length);
    expect(state.encoded.length).toBe(fps / 5);
    expect(state.encoded[0]!.timestamp).toBe(0);
    expect(painting.prepare).toHaveBeenCalledOnce();
  }
);
it('disposes cached watermark resources after an encoder failure', async () => {
  painting.prepare.mockResolvedValue({ draw: painting.draw, dispose: painting.dispose });
  const args = argsFixture();
  args.advanced.watermark = { ...createQuickEditWatermark('Saved'), mode: 'text' };
  await expect(
    writeReviewFrames({
      ...args,
      frameProbe: {
        add: async () => {
          throw new Error('encoder failed');
        },
      },
    })
  ).rejects.toThrow('encoder failed');
  expect(painting.dispose).toHaveBeenCalledOnce();
});

it('coalesces a static watermark with the real adaptive writer without increasing emitted cadence', async () => {
  const pixels = new WeakMap<HTMLCanvasElement, number>();
  vi.stubGlobal('document', {
    createElement: () => {
      const context = contextFixture();
      const canvas = { width: 0, height: 0, getContext: () => context };
      Object.defineProperty(context, 'canvas', { value: canvas });
      return canvas;
    },
  });
  class NativeFrame {
    width: number;
    height: number;
    private value: number;
    constructor(private source: HTMLCanvasElement) {
      this.width = source.width;
      this.height = source.height;
      this.value = pixels.get(source) ?? 0;
    }
    async copyTo(destination: Uint8Array) {
      destination.fill(this.value);
    }
    clone() {
      return new NativeFrame(this.source);
    }
    close() {}
  }
  vi.stubGlobal('VideoFrame', NativeFrame);
  // The budget is deliberately deterministic: pixel comparison has zero measured cost.
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const observed: Array<Array<{ timestamp: number; duration: number }>> = [];
  try {
    for (const active of [false, true]) {
      state.encoded.length = 0;
      painting.draw.mockClear();
      const args = argsFixture();
      args.index.duration = 0.6;
      if (active) args.advanced.watermark = { ...createQuickEditWatermark('Static'), mode: 'text' };
      painting.prepare.mockImplementation(async () => ({
        draw: (context: CanvasRenderingContext2D) => {
          painting.draw();
          if (active) pixels.set(context.canvas, 255);
        },
        dispose: painting.dispose,
      }));
      await writeReviewFrames({
        ...args,
        renderSettings: { quality: 'HIGH', frameRate: 60, frameRateMode: 'adaptive' },
      });
      observed.push(state.encoded.map(({ timestamp, duration }) => ({ timestamp, duration })));
      expect(painting.draw).toHaveBeenCalledTimes(36);
    }
    expect(observed[1]).toEqual(observed[0]);
    expect(observed[1]).toEqual([
      { timestamp: 0, duration: 0.2 },
      { timestamp: 0.2, duration: 0.2 },
      { timestamp: 0.4, duration: 0.2 },
    ]);
  } finally {
    clock.mockRestore();
  }
});
