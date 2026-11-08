// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { GpuPreviewRenderer } from '../../../features/video/composition/canvas/gpu-preview';
import { createMaterializerGpuOutputs } from './materializer-gpu-outputs';

function fixture() {
  const surfaces: { dispose: ReturnType<typeof vi.fn>; releaseImage: ReturnType<typeof vi.fn> }[] =
    [];
  const renderer: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
    createSurface: vi.fn((canvas) => {
      const surface = { canvas, present: vi.fn(), releaseImage: vi.fn(), dispose: vi.fn() };
      surfaces.push(surface);
      return surface;
    }),
  };
  return { owner: createMaterializerGpuOutputs(document), renderer, surfaces };
}
const size = { width: 16, height: 8 };

it('keeps four immutable private endpoints separate and rejects a fifth before allocation', () => {
  const f = fixture();
  const outputs = Array.from({ length: 4 }, () => f.owner.acquire(size, f.renderer));
  expect(new Set(outputs.map((output) => output.canvas)).size).toBe(4);
  expect(() => f.owner.acquire(size, f.renderer)).toThrow('capacity');
  expect(f.renderer.createSurface).toHaveBeenCalledTimes(4);
  expect(f.renderer.render).not.toHaveBeenCalled();
  outputs[1]!.release();
  const reused = f.owner.acquire(size, f.renderer);
  expect(reused.canvas).toBe(outputs[1]!.canvas);
  expect(f.renderer.createSurface).toHaveBeenCalledTimes(4);
  for (const output of outputs) output.release();
  // Releasing the previous identity cannot release its newly leased destination.
  const another = f.owner.acquire(size, f.renderer);
  expect(another.canvas).not.toBe(reused.canvas);
  another.release();
  reused.release();
  f.owner.dispose();
});

it('defers destruction until an outstanding endpoint lease ends, exactly once', () => {
  const f = fixture();
  const held = f.owner.acquire(size, f.renderer);
  const idle = f.owner.acquire(size, f.renderer);
  idle.release();
  f.owner.dispose();
  f.owner.dispose();
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
  expect(held.canvas.width).toBe(16);
  expect(f.surfaces[1]!.dispose).toHaveBeenCalledOnce();
  expect(() => f.owner.acquire(size, f.renderer)).toThrow('disposed');
  held.release();
  held.release();
  expect(f.surfaces[0]!.releaseImage).toHaveBeenCalledOnce();
  expect(f.surfaces[0]!.dispose).toHaveBeenCalledOnce();
  expect(held.canvas.width).toBe(0);
  expect(f.renderer.dispose).not.toHaveBeenCalled();
});

it('retires only idle wrong-size destinations and never resizes a borrowed image', () => {
  const f = fixture();
  const held = f.owner.acquire(size, f.renderer);
  const idle = f.owner.acquire(size, f.renderer);
  idle.release();
  const resized = f.owner.acquire({ width: 32, height: 16 }, f.renderer);
  expect(held.canvas.width).toBe(16);
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
  expect(f.surfaces[1]!.dispose).toHaveBeenCalledOnce();
  expect(resized.canvas.width).toBe(32);
  held.release();
  resized.release();
  f.owner.dispose();
});

it('admits separate provider pools without acquiring a job or owning provider disposal', () => {
  const f = fixture(),
    other = fixture();
  const first = Array.from({ length: 4 }, () => f.owner.acquire(size, f.renderer));
  const second = Array.from({ length: 4 }, () => f.owner.acquire(size, other.renderer));
  first.forEach((output) => output.release());
  second.forEach((output) => output.release());
  f.owner.dispose();
  expect(f.renderer.dispose).not.toHaveBeenCalled();
  expect(other.renderer.dispose).not.toHaveBeenCalled();
});

it('propagates acquisition failure without retaining a phantom destination', () => {
  const f = fixture();
  vi.mocked(f.renderer.createSurface!).mockImplementationOnce(() => {
    throw new Error('Surface admission failed');
  });
  expect(() => f.owner.acquire(size, f.renderer)).toThrow('Surface admission failed');
  const output = f.owner.acquire(size, f.renderer);
  expect(output.canvas.width).toBe(16);
  output.release();
  f.owner.dispose();
});
