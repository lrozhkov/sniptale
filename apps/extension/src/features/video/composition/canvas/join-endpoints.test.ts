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
function fixture(
  compose?: NonNullable<Parameters<typeof createCompositionJoinEndpoints>[0]['compose']>
) {
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
  const sample = vi.fn<
    (
      time: number
    ) => ReturnType<Parameters<typeof createCompositionJoinEndpoints>[0]['renderSample']>
  >(async (time) => {
    source.canvas.pixel = time === 1 ? [1, 0, 0, 1] : [0, 0, 1, 1];
    return { canvas: source.canvas as unknown as HTMLCanvasElement, release };
  });
  const owner = createCompositionJoinEndpoints({
    resources,
    size: { width: 1, height: 1 },
    renderSample: sample,
    ...(compose ? { compose } : {}),
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

it('passes immutable endpoints to an asynchronous compositor without Canvas blending', async () => {
  const completion = Promise.withResolvers<boolean>();
  const compose = vi.fn<
    NonNullable<Parameters<typeof createCompositionJoinEndpoints>[0]['compose']>
  >(() => completion.promise);
  const f = fixture(compose);
  const drawing = f.owner.draw(f.target.context, f.request, f.signal);
  await vi.waitFor(() => expect(compose).toHaveBeenCalledOnce());
  expect(f.active.size).toBe(2);
  expect(f.target.context.drawImage).not.toHaveBeenCalled();
  expect(compose.mock.calls[0]![0]).toMatchObject({ incomingWeight: 0.5, signal: f.signal });
  completion.resolve(true);
  await drawing;
  expect(f.target.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(f.active.size).toBe(0);
});

it('retains Canvas composition only when the injected compositor reports hardware unavailability', async () => {
  const f = fixture(async () => false);
  await f.owner.draw(f.target.context, f.request, f.signal);
  expect(f.target.canvas.pixel).toEqual([0.5, 0, 0.5, 1]);
  f.owner.dispose();
});

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

it('preserves Gallery source-over cut compositing at transparent endpoint pixels', async () => {
  const f = fixture();
  f.sample.mockImplementation(async (time) => {
    f.source.canvas.pixel = time === 1 ? [1, 0, 0, 1] : [0, 0, 0, 0];
    return { canvas: f.source.canvas as unknown as HTMLCanvasElement, release: f.release };
  });
  const cut = { ...f.request, sampling: 'cut' as const };
  await f.owner.draw(f.target.context, cut, f.signal);
  expect(f.target.canvas.pixel).toEqual([1, 0, 0, 1]);
  f.owner.dispose();
});

function retainSamples(f: ReturnType<typeof fixture>) {
  const samples = [surface(), surface()];
  const releases = [vi.fn(), vi.fn()];
  f.sample.mockImplementation(async (time) => ({
    canvas: samples[time - 1]!.canvas as unknown as HTMLCanvasElement,
    retained: true,
    release: releases[time - 1]!,
  }));
  return { samples, releases };
}

it('borrows retained immutable samples without copies and reuses them only at identical key and times', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  const consume = vi.fn(
    async (endpoints: { outgoing: HTMLCanvasElement; incoming: HTMLCanvasElement }) => {
      expect(endpoints.outgoing).toBe(retained.samples[0]!.canvas);
      expect(endpoints.incoming).toBe(retained.samples[1]!.canvas);
      return 'completed';
    }
  );
  await expect(f.owner.withEndpoints(f.request, f.signal, consume)).resolves.toBe('completed');
  await f.owner.withEndpoints({ ...f.request, incomingWeight: 0.75 }, f.signal, consume);
  expect(f.sample).toHaveBeenCalledTimes(2);
  expect(f.canvas).not.toHaveBeenCalled();
  expect(retained.releases.every((release) => release.mock.calls.length === 0)).toBe(true);
  await f.owner.withEndpoints({ ...f.request, key: {} }, f.signal, consume);
  expect(f.sample).toHaveBeenCalledTimes(4);
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  f.owner.clear();
  f.owner.dispose();
  expect(retained.releases.every((release) => release.mock.calls.length === 2)).toBe(true);
});

it.each(['clear', 'dispose'] as const)(
  'defers borrowed retained pair release through %s until GPU completion',
  async (operation) => {
    const f = fixture();
    const retained = retainSamples(f);
    const started = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<void>();
    const frame = f.owner.withEndpoints(f.request, f.signal, async () => {
      started.resolve();
      await completed.promise;
    });
    await started.promise;
    f.owner[operation]();
    expect(retained.releases.every((release) => release.mock.calls.length === 0)).toBe(true);
    await expect(f.owner.withEndpoints(f.request, f.signal, async () => {})).rejects.toThrow();
    completed.resolve();
    await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
    expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
    f.owner.dispose();
  }
);

it('pins copied endpoints during asynchronous compose and rejects publication invalidated by clear', async () => {
  const started = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<boolean>();
  const f = fixture(async () => {
    started.resolve();
    return completed.promise;
  });
  const frame = f.owner.draw(f.target.context, f.request, f.signal);
  await started.promise;
  f.owner.clear();
  expect(f.active.size).toBe(2);
  completed.resolve(false);
  await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.active.size).toBe(0);
  expect(f.target.context.drawImage).not.toHaveBeenCalled();
});

it('releases a retained first endpoint when second sampling fails and permits retry', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  const render = f.sample.getMockImplementation()!;
  f.sample.mockImplementationOnce(render).mockRejectedValueOnce(new Error('sample failed'));
  await expect(f.owner.withEndpoints(f.request, f.signal, async () => {})).rejects.toThrow(
    'sample failed'
  );
  expect(retained.releases[0]).toHaveBeenCalledOnce();
  expect(retained.releases[1]).not.toHaveBeenCalled();
  await f.owner.withEndpoints(f.request, f.signal, async () => {});
  f.owner.dispose();
  expect(retained.releases[0]).toHaveBeenCalledTimes(2);
  expect(retained.releases[1]).toHaveBeenCalledOnce();
});

it('releases late retained samples after cancellation without invoking the consumer', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const render = f.sample.getMockImplementation()!;
  f.sample.mockImplementation(async (time) => {
    if (time === 2) {
      started.resolve();
      await pending.promise;
    }
    return render(time);
  });
  const controller = new AbortController();
  const consumer = vi.fn(async () => {});
  const frame = f.owner.withEndpoints(f.request, controller.signal, consumer);
  await started.promise;
  controller.abort();
  pending.resolve();
  await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
  expect(consumer).not.toHaveBeenCalled();
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  f.owner.dispose();
});

it('invalidates retained endpoints when sample times change without a key change', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  await f.owner.withEndpoints(f.request, f.signal, async () => {});
  await f.owner.withEndpoints(
    { ...f.request, outgoingTime: 2, incomingTime: 1 },
    f.signal,
    async () => {}
  );
  expect(f.sample.mock.calls.map(([time]) => time)).toEqual([1, 2, 2, 1]);
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  f.owner.dispose();
  expect(retained.releases.every((release) => release.mock.calls.length === 2)).toBe(true);
});

it('keeps retained endpoints alive until an aborted consumer settles, then releases exactly once', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  const started = Promise.withResolvers<void>();
  const completed = Promise.withResolvers<void>();
  const controller = new AbortController();
  const frame = f.owner.withEndpoints(f.request, controller.signal, async () => {
    started.resolve();
    await completed.promise;
  });
  await started.promise;
  controller.abort();
  expect(retained.releases.every((release) => release.mock.calls.length === 0)).toBe(true);
  completed.resolve();
  await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  f.owner.dispose();
});

it('retires retained endpoints on consumer failure and permits retry', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  await expect(
    f.owner.withEndpoints(f.request, f.signal, async () => {
      throw new Error('GPU failed');
    })
  ).rejects.toThrow('GPU failed');
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  await f.owner.withEndpoints(f.request, f.signal, async () => {});
  f.owner.dispose();
  expect(retained.releases.every((release) => release.mock.calls.length === 2)).toBe(true);
});

it('permits retry after the first sample fails before any lease exists', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  f.sample.mockRejectedValueOnce(new Error('first sample failed'));
  await expect(f.owner.withEndpoints(f.request, f.signal, async () => {})).rejects.toThrow(
    'first sample failed'
  );
  expect(retained.releases.every((release) => release.mock.calls.length === 0)).toBe(true);
  await f.owner.withEndpoints(f.request, f.signal, async () => {});
  f.owner.dispose();
  expect(retained.releases.every((release) => release.mock.calls.length === 1)).toBe(true);
});

it('releases the late first retained sample after clear without starting the second sample', async () => {
  const f = fixture();
  const retained = retainSamples(f);
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const render = f.sample.getMockImplementation()!;
  f.sample.mockImplementation(async (time) => {
    started.resolve();
    await pending.promise;
    return render(time);
  });
  const consumer = vi.fn(async () => {});
  const frame = f.owner.withEndpoints(f.request, f.signal, consumer);
  await started.promise;
  f.owner.clear();
  pending.resolve();
  await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.sample).toHaveBeenCalledOnce();
  expect(consumer).not.toHaveBeenCalled();
  expect(retained.releases[0]).toHaveBeenCalledOnce();
  expect(retained.releases[1]).not.toHaveBeenCalled();
  f.owner.dispose();
});
