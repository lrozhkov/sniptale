import { expect, it, vi } from 'vitest';
import type { RenderCanvasLease, RenderResources } from './render-resources';
import { createCompositionJoinEndpoints } from './join-endpoints';

class Pixel {
  pixel = [0, 0, 0, 0];
  width = 1;
  height = 1;
}
function surface() {
  const canvas = new Pixel();
  const states: { alpha: number; operation: string }[] = [];
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: vi.fn(() =>
      states.push({ alpha: context.globalAlpha, operation: context.globalCompositeOperation })
    ),
    restore: vi.fn(() => {
      const state = states.pop()!;
      context.globalAlpha = state.alpha;
      context.globalCompositeOperation = state.operation;
    }),
    setTransform: vi.fn(),
    clearRect: vi.fn(() => {
      canvas.pixel = [0, 0, 0, 0];
    }),
    drawImage: vi.fn((source: Pixel) => {
      const multiplier =
        context.globalCompositeOperation === 'lighter'
          ? 1
          : 1 - source.pixel[3]! * context.globalAlpha;
      canvas.pixel = canvas.pixel.map(
        (value, index) => value * multiplier + source.pixel[index]! * context.globalAlpha
      );
    }),
  };
  return { canvas, context: context as unknown as CanvasRenderingContext2D };
}
function fixture() {
  const target = surface();
  const source = surface();
  const leases: RenderCanvasLease[] = [];
  const active = new Set<RenderCanvasLease>();
  const canvas = vi.fn(() => {
    if (active.size >= 2) throw new Error('Endpoint budget exceeded');
    const copy = surface();
    const lease: RenderCanvasLease = {
      canvas: copy.canvas as unknown as HTMLCanvasElement,
      context: copy.context,
      release: vi.fn(() => active.delete(lease)),
    };
    leases.push(lease);
    active.add(lease);
    return lease;
  });
  const resources: RenderResources = { canvas, bytes: () => ({ release() {} }) };
  const release = vi.fn();
  const sample = vi.fn<(time: number) => Promise<{ canvas: HTMLCanvasElement; release(): void }>>(
    async (time) => {
      source.canvas.pixel = time === 1 ? [1, 0, 0, 1] : [0, 0, 1, 1];
      return { canvas: source.canvas as unknown as HTMLCanvasElement, release };
    }
  );
  const owner = createCompositionJoinEndpoints({
    resources,
    size: { width: 1, height: 1 },
    renderSample: sample,
  });
  const request = { key: {}, outgoingTime: 1, incomingTime: 2, incomingWeight: 0.5 };
  return {
    target,
    source,
    canvas,
    leases,
    active,
    sample,
    release,
    owner,
    request,
    signal: new AbortController().signal,
  };
}

it('copies both completed samples before reusing a borrowed canvas and retains only one endpoint pair', async () => {
  const f = fixture();
  f.target.canvas.pixel = [0, 1, 0, 1];
  await f.owner.draw(f.target.context, f.request, f.signal);
  expect(f.target.canvas.pixel).toEqual([0.5, 0, 0.5, 1]);
  expect(f.sample.mock.calls.map(([time]) => time)).toEqual([1, 2]);
  expect(f.release).toHaveBeenCalledTimes(2);
  await f.owner.draw(f.target.context, { ...f.request, incomingWeight: 0.75 }, f.signal);
  expect(f.target.canvas.pixel).toEqual([0.25, 0, 0.75, 1]);
  expect(f.sample).toHaveBeenCalledTimes(2);
  expect(f.active.size).toBe(2);
  await f.owner.draw(f.target.context, { ...f.request, key: {} }, f.signal);
  expect(f.sample).toHaveBeenCalledTimes(4);
  expect(
    f.leases.slice(0, 2).every((lease) => vi.mocked(lease.release).mock.calls.length === 1)
  ).toBe(true);
  f.owner.dispose();
  f.owner.dispose();
  expect(f.active.size).toBe(0);
  expect(f.leases.every((lease) => vi.mocked(lease.release).mock.calls.length === 1)).toBe(true);
});

it('blends transparent endpoints and restores the target state', async () => {
  const f = fixture();
  f.sample.mockImplementation(async (time) => {
    f.source.canvas.pixel = time === 1 ? [1, 0, 0, 1] : [0, 0, 0, 0];
    return { canvas: f.source.canvas as unknown as HTMLCanvasElement, release: f.release };
  });
  f.target.context.globalAlpha = 0.2;
  f.target.context.globalCompositeOperation = 'multiply';
  await f.owner.draw(f.target.context, f.request, f.signal);
  expect(f.target.canvas.pixel).toEqual([0.5, 0, 0, 0.5]);
  expect(f.target.context.globalAlpha).toBe(0.2);
  expect(f.target.context.globalCompositeOperation).toBe('multiply');
  f.owner.dispose();
});

it('releases partial endpoints on allocation failure and permits retry', async () => {
  const f = fixture();
  const allocate = f.canvas.getMockImplementation()!;
  f.canvas.mockImplementationOnce(allocate).mockImplementationOnce(() => {
    throw new Error('allocation');
  });
  await expect(f.owner.draw(f.target.context, f.request, f.signal)).rejects.toThrow('allocation');
  expect(f.active.size).toBe(0);
  expect(f.release).toHaveBeenCalledTimes(2);
  expect(f.target.canvas.pixel).toEqual([0, 0, 0, 0]);
  await f.owner.draw(f.target.context, f.request, f.signal);
  expect(f.target.canvas.pixel).toEqual([0.5, 0, 0.5, 1]);
  f.owner.dispose();
});

it('refuses a second sampling request and releases late incoming work after disposal without publication', async () => {
  const f = fixture();
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const started = Promise.withResolvers<void>();
  const render = f.sample.getMockImplementation()!;
  f.sample.mockImplementation(async (time) => {
    if (time === 2) {
      started.resolve();
      await pending;
    }
    return render(time);
  });
  const frame = f.owner.draw(f.target.context, f.request, f.signal);
  await started.promise;
  await expect(f.owner.draw(f.target.context, f.request, f.signal)).rejects.toThrow(
    'already being sampled'
  );
  f.owner.dispose();
  complete();
  await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.release).toHaveBeenCalledTimes(2);
  expect(f.active.size).toBe(0);
  expect(f.target.canvas.pixel).toEqual([0, 0, 0, 0]);
});

it('does not adopt copied endpoints when a queued cancellation occurs just before pair publication', async () => {
  const f = fixture();
  f.sample.mockImplementation(async (time) => {
    f.source.canvas.pixel = time === 1 ? [1, 0, 0, 1] : [0, 0, 1, 1];
    return {
      canvas: f.source.canvas as unknown as HTMLCanvasElement,
      release: () => {
        f.release();
        if (time === 2) queueMicrotask(f.owner.clear);
      },
    };
  });
  await expect(f.owner.draw(f.target.context, f.request, f.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(f.active.size).toBe(0);
  expect(f.leases.every((lease) => vi.mocked(lease.release).mock.calls.length === 1)).toBe(true);
  expect(f.target.canvas.pixel).toEqual([0, 0, 0, 0]);
  f.owner.dispose();
});
