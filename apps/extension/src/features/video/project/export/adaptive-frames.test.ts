// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createAdaptiveFrameWriter } from './adaptive-frames';

afterEach(() => vi.restoreAllMocks());

function fixture(signal?: AbortSignal) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 1;
  let pixels = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255]);
  let retained: ImageData;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        putImageData: (data: ImageData) => {
          retained = data;
        },
      }) as unknown as CanvasRenderingContext2D
  );
  const context = {
    canvas,
    getImageData: () => ({ data: pixels.slice() }),
  } as unknown as CanvasRenderingContext2D;
  const frames: Array<{ time: number; duration: number; pixels: number[] }> = [];
  const emit = vi.fn(async (_: HTMLCanvasElement, time: number, duration: number) => {
    frames.push({ time, duration, pixels: [...retained.data] });
  });
  const writer = createAdaptiveFrameWriter(context, emit, signal);
  return {
    writer,
    frames,
    emit,
    canvas,
    change: (index: number, value: number) => {
      pixels[index] = value;
    },
  };
}

it('coalesces twelve rounded 60Hz frames to exactly 200ms and preserves the clipped tail', async () => {
  const { writer, frames } = fixture();
  for (let i = 0; i < 14; i++) {
    const start = Math.round((i * 1e6) / 60);
    const end = Math.min(222_222, Math.round(((i + 1) * 1e6) / 60));
    await writer.add(start, end - start);
  }
  await writer.flush();
  expect(frames.map(({ time, duration }) => [time, duration])).toEqual([
    [0, 200_000],
    [200_000, 22_222],
  ]);
  writer.dispose();
});

it('preserves single-pixel and alpha ABA changes without threshold suppression', async () => {
  const { writer, frames, change } = fixture();
  await writer.add(0, 16_667);
  change(4, 11);
  await writer.add(16_667, 16_666);
  change(4, 10);
  await writer.add(33_333, 16_667);
  change(7, 254);
  await writer.add(50_000, 16_667);
  await writer.flush();
  expect(frames.map((f) => [f.time, f.pixels[4], f.pixels[7]])).toEqual([
    [0, 10, 255],
    [16_667, 11, 255],
    [33_333, 10, 255],
    [50_000, 10, 254],
  ]);
  writer.dispose();
});

it('does not bridge a gap or admit overlapping time and flush is idempotent', async () => {
  const { writer, frames } = fixture();
  await writer.add(13_579, 16_667);
  await writer.add(50_000, 1000);
  await expect(writer.add(50_500, 1000)).rejects.toThrow('timing');
  await writer.flush();
  await writer.flush();
  expect(frames.map((f) => [f.time, f.duration])).toEqual([
    [13_579, 16_667],
    [50_000, 1000],
  ]);
  writer.dispose();
});

it('checks abort before flushing and discards the retained frame on disposal', async () => {
  const controller = new AbortController();
  const { writer, emit } = fixture(controller.signal);
  await writer.add(0, 16_667);
  controller.abort();
  await expect(writer.flush()).rejects.toThrow();
  writer.dispose();
  expect(emit).not.toHaveBeenCalled();
});

it('propagates encoder failure and abort during backpressure without accepting another frame', async () => {
  const controller = new AbortController();
  const { writer, emit, change } = fixture(controller.signal);
  await writer.add(0, 16_667);
  emit.mockImplementationOnce(async () => {
    controller.abort();
  });
  change(0, 99);
  await expect(writer.add(16_667, 16_666)).rejects.toThrow();
  writer.dispose();
  expect(emit).toHaveBeenCalledTimes(1);
  const failed = fixture();
  await failed.writer.add(0, 16_667);
  failed.emit.mockRejectedValueOnce(new Error('encoder failed'));
  await expect(failed.writer.flush()).rejects.toThrow('encoder failed');
  failed.writer.dispose();
});

it('rejects malformed timing, resized surfaces and use after disposal', async () => {
  const { writer, canvas } = fixture();
  for (const [time, duration] of [
    [-1, 1],
    [0, 0],
    [0, 200_001],
    [NaN, 1],
    [0.5, 1],
  ])
    await expect(writer.add(time!, duration!)).rejects.toThrow('timing');
  canvas.width = 3;
  await expect(writer.add(0, 1)).rejects.toThrow('dimensions');
  writer.dispose();
  await expect(writer.add(0, 1)).rejects.toThrow('disposed');
});
