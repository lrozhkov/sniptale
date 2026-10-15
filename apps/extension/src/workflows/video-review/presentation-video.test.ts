import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { renderPresentationVideo } from './presentation-video';

const samples = vi.hoisted(
  () =>
    [] as {
      timestamp: number;
      duration: number;
      source: unknown;
      close: ReturnType<typeof vi.fn>;
    }[]
);
const faults = vi.hoisted(() => ({ sample: false, clone: false }));
vi.mock('mediabunny', () => ({
  VideoSample: class {
    timestamp: number;
    duration: number;
    close = vi.fn(() => {
      if (typeof VideoFrame !== 'undefined' && this.source instanceof VideoFrame)
        this.source.close();
    });
    constructor(
      readonly source: unknown,
      options: { timestamp: number; duration: number }
    ) {
      if (faults.sample) throw new Error('Sample construction failed');
      this.timestamp = options.timestamp;
      this.duration = options.duration;
      samples.push(this);
    }
  },
}));

const nativeFrames: NativeFrame[] = [];
class NativeFrame {
  readonly pixels: Uint8Array;
  close = vi.fn();
  constructor(source: { pixels: Uint8Array }) {
    this.pixels = source.pixels.slice();
    nativeFrames.push(this);
  }
  async copyTo(target: Uint8Array) {
    target.set(this.pixels);
  }
  clone() {
    if (faults.clone) throw new Error('Clone failed');
    return new NativeFrame(this);
  }
}
beforeEach(() => {
  nativeFrames.length = 0;
  faults.sample = faults.clone = false;
  vi.stubGlobal('VideoFrame', NativeFrame);
  vi.spyOn(performance, 'now').mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  samples.length = 0;
  const settings = createNewWorkspacePresentationSettings();
  const planned = planReviewPresentationSequence({
    settings,
    mainDuration: 0.105,
    fragmentOffset: 4,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!planned.ok) throw new Error('Expected plan.');
  const controller = new AbortController();
  const releases: ReturnType<typeof vi.fn>[] = [];
  const render = vi.fn(async () => {
    const release = vi.fn();
    releases.push(release);
    return { canvas: {} as HTMLCanvasElement, context: {} as CanvasRenderingContext2D, release };
  });
  return {
    args: {
      plan: planned.plan,
      renderer: { render },
      output: { add: vi.fn(async () => {}) },
      signal: controller.signal,
    },
    controller,
    releases,
    render,
  };
}

describe('presentation video draining', () => {
  it('preserves the global microsecond lattice and partial final duration', async () => {
    const { args, releases } = setup();
    expect(await renderPresentationVideo(args)).toBe(4);
    expect(samples.map((sample) => [sample.timestamp, sample.duration])).toEqual([
      [0, 0.033333],
      [0.033333, 0.033334],
      [0.066667, 0.033333],
      [0.1, 0.005],
    ]);
    expect(samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  });
  it('probes a sparse interval on the original clock', async () => {
    const { args, render } = setup();
    expect(await renderPresentationVideo({ ...args, windows: [{ start: 0.09, end: 0.105 }] })).toBe(
      1
    );
    expect(samples[0]?.timestamp).toBe(0.1);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ tick: 3, timestampUs: 100000 }));
  });
  it('releases the current sample and composition when the output fails', async () => {
    const { args, releases, render } = setup();
    args.output.add.mockRejectedValueOnce(new Error('writer failed'));
    await expect(renderPresentationVideo(args)).rejects.toThrow('writer failed');
    expect(render).toHaveBeenCalledTimes(1);
    expect(samples[0]?.close).toHaveBeenCalledOnce();
    expect(releases[0]).toHaveBeenCalledOnce();
  });
  it('releases a late frame without submitting it after cancellation', async () => {
    const { args, controller, releases, render } = setup();
    const original = render.getMockImplementation()!;
    render.mockImplementationOnce(async () => {
      const frame = await original();
      controller.abort();
      return frame;
    });
    await expect(renderPresentationVideo(args)).rejects.toMatchObject({ name: 'AbortError' });
    expect(args.output.add).not.toHaveBeenCalled();
    expect(releases[0]).toHaveBeenCalledOnce();
  });
});

function adaptiveSetup(duration = 0.105) {
  const state = setup();
  const planned = planReviewPresentationSequence({
    settings: createNewWorkspacePresentationSettings(),
    mainDuration: duration,
    fragmentOffset: 4,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!planned.ok) throw new Error('Expected plan');
  state.args.plan = planned.plan;
  const canvas = { width: 1, height: 1, pixels: new Uint8Array([10, 20, 30, 255]) };
  const context = { canvas } as unknown as CanvasRenderingContext2D;
  state.render.mockImplementation(async () => {
    const release = vi.fn();
    state.releases.push(release);
    return { canvas: canvas as unknown as HTMLCanvasElement, context, release };
  });
  return { ...state, args: { ...state.args, adaptive: true }, canvas, context };
}
function assertReleased(releases: ReturnType<typeof vi.fn>[]) {
  expect(nativeFrames.length).toBeGreaterThan(0);
  expect(nativeFrames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
}

it('coalesces static pixels while preserving endpoints and final partial duration', async () => {
  const { args, releases } = adaptiveSetup();
  expect(await renderPresentationVideo(args)).toBe(3);
  expect(samples.map(({ timestamp, duration }) => [timestamp, duration])).toEqual([
    [0, 0.033333],
    [0.033333, 0.066667],
    [0.1, 0.005],
  ]);
  expect(samples.every((sample) => sample.source instanceof NativeFrame)).toBe(true);
  assertReleased(releases);
});

it('retains a changed final-composition pixel rather than hiding it through adaptive merging', async () => {
  const { args, render, canvas, releases } = adaptiveSetup();
  const original = render.getMockImplementation()!;
  let calls = 0;
  render.mockImplementation(async () => {
    const frame = await original();
    canvas.pixels[0] = calls++ === 2 ? 99 : 10;
    return frame;
  });
  expect(await renderPresentationVideo(args)).toBe(4);
  expect(samples.map((sample) => (sample.source as NativeFrame).pixels[0])).toEqual([
    10, 10, 99, 10,
  ]);
  assertReleased(releases);
});

it('flushes a borrowed adaptive owner before switching composition contexts', async () => {
  const { args, render, releases } = adaptiveSetup();
  const original = render.getMockImplementation()!;
  let calls = 0;
  render.mockImplementation(async () => {
    const frame = await original();
    if (calls++ < 2) return frame;
    const canvas = { width: 1, height: 1, pixels: new Uint8Array([40, 50, 60, 255]) };
    return {
      ...frame,
      canvas: canvas as unknown as HTMLCanvasElement,
      context: { canvas } as unknown as CanvasRenderingContext2D,
    };
  });
  expect(await renderPresentationVideo(args)).toBe(4);
  expect(samples.map((sample) => (sample.source as NativeFrame).pixels[0])).toEqual([
    10, 10, 40, 40,
  ]);
  assertReleased(releases);
});

it('never bridges a sparse-window gap even when retained pixels match', async () => {
  const { args, releases } = adaptiveSetup(0.305);
  expect(
    await renderPresentationVideo({
      ...args,
      windows: [
        { start: 0.03, end: 0.07 },
        { start: 0.16, end: 0.2 },
      ],
    })
  ).toBe(2);
  expect(samples.map(({ timestamp, duration }) => [timestamp, duration])).toEqual([
    [0.033333, 0.066667],
    [0.166667, 0.033333],
  ]);
  assertReleased(releases);
});

it.each(['sample', 'clone', 'output'] as const)(
  'closes original, cloned and composition leases after %s failure',
  async (failure) => {
    const { args, releases } = adaptiveSetup();
    if (failure === 'sample') faults.sample = true;
    else if (failure === 'clone') faults.clone = true;
    else args.output.add.mockRejectedValueOnce(new Error('Output failed'));
    await expect(renderPresentationVideo(args)).rejects.toThrow();
    assertReleased(releases);
  }
);

it('releases the retained native frame when cancellation interrupts the next composition', async () => {
  const { args, controller, render, releases } = adaptiveSetup(0.205);
  const original = render.getMockImplementation()!;
  let calls = 0;
  render.mockImplementation(async () => {
    const frame = await original();
    if (++calls === 3) controller.abort();
    return frame;
  });
  await expect(renderPresentationVideo(args)).rejects.toMatchObject({ name: 'AbortError' });
  expect(args.output.add).toHaveBeenCalledOnce();
  assertReleased(releases);
});

it('closes both adaptive references when output cancels during backpressure', async () => {
  const { args, controller, releases } = adaptiveSetup();
  args.output.add.mockImplementation(async () => {
    controller.abort();
  });
  await expect(renderPresentationVideo(args)).rejects.toMatchObject({ name: 'AbortError' });
  assertReleased(releases);
});

it('does no work for empty windows and reports progress on the full sequence clock', async () => {
  const { args, render } = setup();
  expect(await renderPresentationVideo({ ...args, windows: [] })).toBe(0);
  expect(render).not.toHaveBeenCalled();
  const onProgress = vi.fn();
  await renderPresentationVideo({ ...args, windows: [{ start: 0.03, end: 0.07 }], onProgress });
  expect(onProgress.mock.calls.flat()).toEqual([66667 / 105000, 100000 / 105000]);
});

it('releases the newly acquired composition when flushing the previous context fails', async () => {
  const { args, render, releases } = adaptiveSetup();
  const original = render.getMockImplementation()!;
  let calls = 0;
  render.mockImplementation(async () => {
    const frame = await original();
    if (++calls < 3) return frame;
    const canvas = { width: 1, height: 1, pixels: new Uint8Array([40, 50, 60, 255]) };
    return {
      ...frame,
      canvas: canvas as unknown as HTMLCanvasElement,
      context: { canvas } as unknown as CanvasRenderingContext2D,
    };
  });
  args.output.add.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Flush failed'));
  await expect(renderPresentationVideo(args)).rejects.toThrow('Flush failed');
  expect(render).toHaveBeenCalledTimes(3);
  assertReleased(releases);
});
