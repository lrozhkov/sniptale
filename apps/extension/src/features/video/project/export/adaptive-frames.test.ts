// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAdaptiveFrameWriter, createAdaptiveComparisonBudget } from './adaptive-frames';

beforeEach(() => vi.spyOn(performance, 'now').mockReturnValue(0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(
  signal?: AbortSignal,
  onCopy = () => {},
  budget?: ReturnType<typeof createAdaptiveComparisonBudget>
) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 1;
  let pixels = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255]);
  const framesOwned: FakeFrame[] = [];
  const buffers = new Set<Uint8Array>();
  class FakeFrame {
    data = pixels.slice();
    closed = false;
    constructor() {
      framesOwned.push(this);
    }
    copyTo = vi.fn(async (destination: Uint8Array) => {
      if (this.closed) throw new Error('closed');
      onCopy();
      buffers.add(destination);
      destination.set(this.data);
    });
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('VideoFrame', FakeFrame);
  const uploaded = vi.fn();
  const context = {
    canvas,
    getImageData: vi.fn(),
    putImageData: uploaded,
  } as unknown as CanvasRenderingContext2D;
  const frames: Array<{ time: number; duration: number; pixels: number[] }> = [];
  const emit = vi.fn(async (frame: VideoFrame, time: number, duration: number) => {
    const owned = frame as unknown as FakeFrame;
    expect(owned.closed).toBe(false);
    frames.push({ time, duration, pixels: [...owned.data] });
  });
  const writer = createAdaptiveFrameWriter(context, emit, signal, budget);
  return {
    writer,
    frames,
    emit,
    canvas,
    context,
    uploaded,
    framesOwned,
    buffers,
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

it('does not read back the main renderer or upload CPU pixels when retaining frames', async () => {
  const { writer, context, uploaded } = fixture();
  const read = vi.spyOn(context, 'getImageData');
  await writer.add(0, 16_667);
  await writer.add(16_667, 16_666);
  await writer.flush();
  expect(read).not.toHaveBeenCalled();
  expect(uploaded).not.toHaveBeenCalled();
  writer.dispose();
});

it('reuses two pixel buffers and releases every native frame after encoding', async () => {
  const { writer, framesOwned, buffers, change } = fixture();
  for (let i = 0; i < 30; i++) {
    change(0, i);
    await writer.add(i * 1000, 1000);
  }
  await writer.flush();
  writer.dispose();
  expect(buffers.size).toBe(2);
  expect(framesOwned.every((frame) => frame.closed)).toBe(true);
});

it('closes native snapshots when pixel transfer fails or is aborted', async () => {
  const failed = fixture();
  await failed.writer.add(0, 1000);
  failed.framesOwned[0]!.copyTo.mockRejectedValueOnce(new Error('transfer failed'));
  await expect(failed.writer.add(1000, 1000)).rejects.toThrow('transfer failed');
  failed.writer.dispose();
  expect(failed.framesOwned.every((frame) => frame.closed)).toBe(true);
  const controller = new AbortController();
  const aborted = fixture(controller.signal);
  await aborted.writer.add(0, 1000);
  aborted.framesOwned[0]!.copyTo.mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(aborted.writer.add(1000, 1000)).rejects.toThrow();
  aborted.writer.dispose();
  expect(aborted.framesOwned.every((frame) => frame.closed)).toBe(true);
});

it('bounds expensive analysis across render windows and retains every unexamined change', async () => {
  let now = 0;
  vi.mocked(performance.now).mockImplementation(() => now);
  let copies = 0;
  const budget = createAdaptiveComparisonBudget();
  for (let window = 0; window < 6; window++) {
    const { writer, frames, change } = fixture(
      undefined,
      () => {
        now += 50;
        copies++;
      },
      budget
    );
    for (let i = 0; i < 10; i++) {
      now += 20; // real composition work, separate from comparison
      change(0, i);
      await writer.add((window * 10 + i) * 1000, 1000);
    }
    await writer.flush();
    expect(frames.map((frame) => frame.pixels[0])).toEqual(Array.from({ length: 10 }, (_, i) => i));
    writer.dispose();
  }
  expect(copies).toBeLessThanOrEqual(8);
  expect(copies).toBeGreaterThan(0);
});

it('caps pause credit and carries the actual cost of an over-budget comparison', () => {
  let now = 0;
  vi.mocked(performance.now).mockImplementation(() => now);
  const budget = createAdaptiveComparisonBudget();
  budget.begin();
  now += 200;
  budget.charge(200);
  budget.end();
  now += 10_000;
  budget.begin();
  expect(budget.available()).toBe(false);
  budget.end();
  for (let i = 0; i < 4; i++) {
    now += 10_000;
    budget.begin();
    budget.end();
  }
  expect(budget.available()).toBe(true);
  now += 64;
  budget.charge(64);
  budget.end();
  budget.begin();
  expect(budget.available()).toBe(false);
});

it('keeps the borrowed frame alive and the next snapshot stable through encoder backpressure', async () => {
  const { writer, emit, frames, framesOwned, change } = fixture();
  await writer.add(0, 1000);
  const original = emit.getMockImplementation()!;
  let resume!: () => void;
  const waiting = new Promise<void>((resolve) => {
    resume = resolve;
  });
  emit.mockImplementationOnce(async (...args) => {
    await waiting;
    await original(...args);
  });
  change(0, 20);
  const next = writer.add(1000, 1000);
  await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
  expect(framesOwned[0]!.closed).toBe(false);
  change(0, 30);
  resume();
  await next;
  await writer.flush();
  expect(frames.map((frame) => frame.pixels[0])).toEqual([10, 20]);
  writer.dispose();
});
