import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createReviewPresentationMain,
  type ReviewPresentationMainInput,
} from './presentation-main';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { PresentationCandidate } from '../../features/video/review/presentation-sequence';

const io = vi.hoisted(() => ({
  samples: [] as {
    timestamp: number;
    draw: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[],
  times: [] as number[],
  inputs: [] as { dispose: ReturnType<typeof vi.fn> }[],
  canvases: [] as HTMLCanvasElement[],
  sample: vi.fn(),
  audio: vi.fn(),
  prepare: vi.fn(),
  render: vi.fn(),
  realRenderer: false,
  resolution: 1000,
  missingTrack: false,
  decode: true,
  missingSample: false,
  allocation: 4096,
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = vi.fn();
    constructor() {
      io.inputs.push(this);
    }
    async getPrimaryAudioTrack() {
      return io.audio();
    }
    async getPrimaryVideoTrack() {
      return io.missingTrack
        ? null
        : {
            codec: 'avc',
            canDecode: async () => io.decode,
            getDisplayWidth: async () => 64,
            getDisplayHeight: async () => 36,
            getTimeResolution: async () => io.resolution,
            computeDuration: async () => 3,
          };
    }
  },
  VideoSampleSink: class {
    async getSample(time: number) {
      return io.sample(time);
    }
    async *samples(start: number) {
      yield await io.sample(start);
    }
    async *samplesAtTimestamps(times: Iterable<number>) {
      for (const time of times) yield await io.sample(time);
    }
  },
}));
// The shared renderer has independent pixel-parity proof. This boundary probe retains
// the real ledger and decoders to prove clocks, admission and ownership around its API.
vi.mock('./render-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./render-preview')>();
  return {
    createReviewPreviewRenderer: (
      args: Parameters<typeof actual.createReviewPreviewRenderer>[0]
    ) =>
      io.realRenderer
        ? actual.createReviewPreviewRenderer(args)
        : {
            prepare: async (...input: unknown[]) => {
              await io.prepare(...input);
              return {
                allocationAssets: {
                  headerBitmap: null,
                  backgroundBitmap: null,
                  watermark: null,
                  previousWatermarkCache: null,
                },
                release: vi.fn(),
              };
            },
            render: (_prepared: unknown, frame: unknown) => {
              io.render(frame);
              return args.resources.canvas('publication', { width: 64, height: 36 });
            },
            dispose: vi.fn(),
          },
  };
});

function candidate(time = 0, holdLast = false): PresentationCandidate {
  return {
    tick: 90,
    timestampUs: 3000000 + time * 1e6,
    durationUs: 33333,
    segment: 'main',
    segmentLocalTimeUs: time * 1e6,
    retainEndpoint: false,
    mapping: {
      kind: 'main',
      mainLocalTime: time,
      globalMainTime: 7 + time,
      range: { start: time, end: time + 1 / 30 },
      holdLast,
    },
  };
}
function fixture(): ReviewPresentationMainInput {
  return {
    file: new Blob(['primary']),
    index: {
      duration: 3,
      boundaries: [0, 3],
      videoCodec: 'avc',
      audioCodec: null,
      container: 'mp4',
      rotation: 0,
    },
    edits: [],
    effective: resolveQuickEditEffectiveState(createQuickEditAdvancedState()),
    fragmentOffset: 7,
    dimensions: { canonical: { width: 64, height: 36 }, backing: { width: 64, height: 36 } },
    readAsset: async () => new Blob(['camera']),
    signal: new AbortController().signal,
  };
}
const owners: Awaited<ReturnType<typeof createReviewPresentationMain>>[] = [];
async function open(args = fixture()) {
  const owner = await createReviewPresentationMain(args);
  owners.push(owner);
  return owner;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.samples.length = io.times.length = io.inputs.length = io.canvases.length = 0;
  io.realRenderer = false;
  io.resolution = 1000;
  io.missingTrack = false;
  io.decode = true;
  io.missingSample = false;
  io.allocation = 4096;
  io.prepare.mockResolvedValue(undefined);
  io.audio.mockResolvedValue(null);
  io.render.mockImplementation(() => undefined);
  io.sample.mockImplementation(async (time: number) => {
    io.times.push(time);
    if (io.missingSample) return null;
    const sample = {
      timestamp: time,
      format: 'RGBA',
      allocationSize: () => io.allocation,
      close: vi.fn(),
      draw: vi.fn(),
    };
    io.samples.push(sample);
    return sample;
  });
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          reset: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          scale: vi.fn(),
          translate: vi.fn(),
          beginPath: vi.fn(),
          rect: vi.fn(),
          roundRect: vi.fn(),
          clip: vi.fn(),
          setTransform: vi.fn(),
        }),
      } as unknown as HTMLCanvasElement;
      io.canvases.push(canvas);
      return canvas;
    },
  });
});
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.unstubAllGlobals();
});

it('maps cuts and speed into source time while effects use global main time without intro placement', async () => {
  const args = fixture();
  args.edits = [
    { id: 'cut', kind: 'cut', start: 0, end: 0.5, requestedStart: 0, requestedEnd: 0.5 },
    {
      id: 'speed',
      kind: 'speed',
      start: 0.5,
      end: 2,
      requestedStart: 0.5,
      requestedEnd: 2,
      rate: 2,
      audio: 'speed',
    },
  ];
  const owner = await open(args);
  const frame = await owner.render(candidate(0.25));
  expect(io.times).toEqual([1]);
  expect(io.render).toHaveBeenCalledWith(
    expect.objectContaining({ sourceTime: 1, resultTime: 7.25 })
  );
  expect(io.samples[0]!.close).toHaveBeenCalledOnce();
  expect(frame.canvas.width).toBe(64);
  await expect(owner.render(candidate(0.5))).rejects.toThrow('unavailable');
  frame.release();
  frame.release();
  const next = await owner.render(candidate(0.75));
  expect(io.times).toEqual([1, 2]);
  next.release();
  owner.dispose();
  expect(io.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  expect(io.inputs[0]!.dispose).toHaveBeenCalledOnce();
});

it('holds the complete last output composition using its lattice clock and actual source ticks', async () => {
  io.resolution = 90_000;
  const owner = await open();
  await expect(owner.render(candidate(3, true))).rejects.toThrow('last valid output clock');
  const frame = await owner.render(candidate(3, true), { heldMainLocalTime: 2.983333 });
  expect(io.times).toEqual([268500 / 90000]);
  expect(io.render).toHaveBeenCalledWith(expect.objectContaining({ resultTime: 9.983333 }));
  frame.release();
  await expect(owner.render(candidate(3, true), { heldMainLocalTime: 3 })).rejects.toThrow('clock');
  const wrong = candidate();
  wrong.mapping = { kind: 'image', assetId: 'image' };
  await expect(owner.render(wrong)).rejects.toThrow('main presentation candidate');
  const misplaced = candidate();
  if (misplaced.mapping.kind === 'main') misplaced.mapping.globalMainTime = 99;
  await expect(owner.render(misplaced)).rejects.toThrow('clock');
});

it('clamps a last-in-range request to the final actual track tick without crossing the edit boundary', async () => {
  io.resolution = 1000;
  const owner = await open();
  const frame = await owner.render(candidate(2.9999));
  expect(io.times).toEqual([2.999]);
  frame.release();
});

it('passes effective scene settings and independent camera pixels through the shared painter', async () => {
  const args = fixture();
  args.effective.webcam = createQuickEditWebcam(
    'project-asset:camera',
    { width: 64, height: 36 },
    { width: 64, height: 36 }
  );
  args.effective.webcam.offsetSeconds = 0.5;
  const owner = await open(args);
  const frame = await owner.render(candidate(1));
  expect(io.inputs).toHaveLength(2);
  expect(io.times).toEqual([1, 0.5]);
  expect(io.prepare.mock.calls[0]![0]).toMatchObject({
    webcam: args.effective.webcam,
    background: args.effective.background,
    zoomRegions: args.effective.zoomRegions,
  });
  expect(io.render).toHaveBeenCalledWith(
    expect.objectContaining({
      camera: expect.objectContaining({
        representedMediaTime: 0.5,
        source: { width: 64, height: 36 },
      }),
    })
  );
  expect(io.samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  frame.release();
});

it('reuses transition endpoint admission in edit-local time and closes the endpoint pair after paint', async () => {
  const args = fixture();
  args.edits = [
    {
      id: 'cut',
      kind: 'cut',
      start: 0.5,
      end: 1,
      requestedStart: 0.5,
      requestedEnd: 1,
      transition: { type: 'dissolve', before: 0.5, after: 0.5 },
    },
  ];
  const owner = await open(args);
  const frame = await owner.render(candidate(0.25));
  expect(io.render).toHaveBeenCalledWith(
    expect.objectContaining({
      resultTime: 7.25,
      transition: expect.objectContaining({ frames: expect.any(Object) }),
    })
  );
  expect(io.samples).toHaveLength(3);
  expect(io.samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  frame.release();
});

it.each(['missing', 'decode', 'resolution'])(
  'disposes input when opening fails: %s',
  async (failure) => {
    if (failure === 'missing') io.missingTrack = true;
    if (failure === 'decode') io.decode = false;
    if (failure === 'resolution') io.resolution = 0;
    await expect(open()).rejects.toThrow();
    expect(io.inputs[0]!.dispose).toHaveBeenCalledOnce();
  }
);

it.each(['sample', 'allocation', 'paint'])(
  'releases failed frame work and admits a later retry: %s',
  async (failure) => {
    const owner = await open();
    if (failure === 'sample') io.missingSample = true;
    if (failure === 'allocation') io.allocation = NaN;
    if (failure === 'paint')
      io.render.mockImplementationOnce(() => {
        throw new Error('paint failed');
      });
    await expect(owner.render(candidate())).rejects.toThrow();
    expect(io.samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
    io.missingSample = false;
    io.allocation = 4096;
    const frame = await owner.render(candidate(1));
    frame.release();
  }
);

it('refuses overlapping requests and cancels a delayed preparation without decoding or publication', async () => {
  const controller = new AbortController();
  const owner = await open({ ...fixture(), signal: controller.signal });
  let finish!: () => void;
  io.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = owner.render(candidate());
  await expect(owner.render(candidate(1))).rejects.toThrow('unavailable');
  controller.abort();
  finish();
  await expect(pending).rejects.toThrow();
  expect(io.sample).not.toHaveBeenCalled();
  expect(io.render).not.toHaveBeenCalled();
  await expect(owner.render(candidate())).rejects.toThrow('unavailable');
});

it('cancels during decode and closes the late sample before any paint', async () => {
  const controller = new AbortController();
  const owner = await open({ ...fixture(), signal: controller.signal });
  const close = vi.fn();
  io.sample.mockImplementationOnce(async () => {
    controller.abort();
    return { timestamp: 0, format: 'RGBA', draw: vi.fn(), close, allocationSize: () => 4096 };
  });
  await expect(owner.render(candidate())).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
  expect(io.render).not.toHaveBeenCalled();
});

it('renders through the real prepared renderer and ledger across multiple offline frames', async () => {
  io.realRenderer = true;
  const owner = await open();
  for (const time of [0, 1, 2]) {
    const frame = await owner.render(candidate(time));
    expect(frame.canvas.width).toBe(64);
    expect(io.samples.at(-1)!.draw).toHaveBeenCalled();
    expect(io.samples.at(-1)!.close).toHaveBeenCalledOnce();
    frame.release();
  }
  owner.dispose();
  expect(io.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

it('borrows the primary audio track from its one existing Input', async () => {
  const audio = { codec: 'aac' };
  io.audio.mockResolvedValue(audio);
  const owner = await open();
  expect(owner.audioTrack).toBe(audio);
  expect(io.inputs).toHaveLength(1);
  owner.dispose();
  expect(io.inputs[0]!.dispose).toHaveBeenCalledOnce();
  await expect(owner.render(candidate())).rejects.toThrow('unavailable');
});

it('disposes the Input when cancellation interrupts primary audio metadata', async () => {
  let complete!: (value: { codec: string }) => void;
  io.audio.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const args = fixture();
  const controller = new AbortController();
  args.signal = controller.signal;
  const opening = createReviewPresentationMain(args);
  await vi.waitFor(() => expect(io.audio).toHaveBeenCalledOnce());
  controller.abort();
  complete({ codec: 'aac' });
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.inputs).toHaveLength(1);
  expect(io.inputs[0]!.dispose).toHaveBeenCalledOnce();
});
