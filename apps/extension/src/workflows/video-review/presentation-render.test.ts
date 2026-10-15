import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createReviewPresentationRenderer,
  type ReviewPresentationRendererInput,
} from './presentation-render';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import {
  iteratePresentationCandidates,
  planReviewPresentationSequence,
  presentationMainHoldTime,
} from '../../features/video/review/presentation-sequence';
import type { RenderCanvasLease } from '../../features/video/composition/canvas/render-resources';

const io = vi.hoisted(() => ({
  main: vi.fn(),
  media: vi.fn(),
  watermark: vi.fn(),
  render: vi.fn(),
  frame: vi.fn(),
  mark: vi.fn(),
  mainDispose: vi.fn(),
  mediaDispose: vi.fn(),
  watermarkDispose: vi.fn(),
  frameRelease: vi.fn(),
  outputRelease: vi.fn(),
}));
vi.mock('./presentation-main', () => ({ createReviewPresentationMain: io.main }));
vi.mock('./presentation-media', () => ({ createReviewPresentationMedia: io.media }));
vi.mock('./render-watermark', () => ({ createReviewWatermarkRenderer: io.watermark }));

/** Small software raster oracle; native browser composition has separate integration proof. */
class Raster {
  private w = 4;
  private h = 2;
  pixels = new Float64Array(4 * 2 * 3);
  readonly context = new RasterContext(this);
  get width() {
    return this.w;
  }
  set width(value: number) {
    this.w = value;
    this.pixels = new Float64Array(this.w * this.h * 3);
  }
  get height() {
    return this.h;
  }
  set height(value: number) {
    this.h = value;
    this.pixels = new Float64Array(this.w * this.h * 3);
  }
  getContext() {
    return this.context;
  }
  pixel(x: number, y: number) {
    return Array.from(this.pixels.slice((y * this.w + x) * 3, (y * this.w + x + 1) * 3));
  }
}
class RasterContext {
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  filter = 'none';
  shadowColor = 'transparent';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  private scale = [1, 1];
  private stack: { alpha: number; fill: string; scale: number[]; composite: string }[] = [];
  constructor(private readonly raster: Raster) {}
  reset() {
    this.raster.pixels.fill(0);
    this.globalAlpha = 1;
    this.scale = [1, 1];
  }
  save() {
    this.stack.push({
      alpha: this.globalAlpha,
      fill: this.fillStyle,
      scale: this.scale,
      composite: this.globalCompositeOperation,
    });
  }
  restore() {
    const state = this.stack.pop()!;
    this.globalAlpha = state.alpha;
    this.globalCompositeOperation = state.composite;
    this.fillStyle = state.fill;
    this.scale = state.scale;
  }
  setTransform(x: number, _b: number, _c: number, y: number) {
    this.scale = [x, y];
  }
  drawImage(source: Raster, _x: number, _y: number) {
    for (let index = 0; index < this.raster.pixels.length; index++)
      this.raster.pixels[index] =
        this.raster.pixels[index]! *
          (this.globalCompositeOperation === 'lighter' ? 1 : 1 - this.globalAlpha) +
        source.pixels[index]! * this.globalAlpha;
  }
  fillRect(x: number, y: number, width: number, height: number) {
    const rgb = [1, 3, 5].map((at) => parseInt(this.fillStyle.slice(at, at + 2), 16));
    for (
      let row = Math.max(0, y * this.scale[1]!);
      row < Math.min(this.raster.height, (y + height) * this.scale[1]!);
      row++
    )
      for (
        let col = Math.max(0, x * this.scale[0]!);
        col < Math.min(this.raster.width, (x + width) * this.scale[0]!);
        col++
      )
        for (let component = 0; component < 3; component++) {
          const offset = (row * this.raster.width + col) * 3 + component;
          this.raster.pixels[offset] =
            this.raster.pixels[offset]! * (1 - this.globalAlpha) +
            rgb[component]! * this.globalAlpha;
        }
  }
}
function canvasLease(): RenderCanvasLease {
  const raster = new Raster();
  raster.context.fillStyle = '#ffffff';
  raster.context.fillRect(0, 0, 4, 2);
  raster.context.fillStyle = '#0000ff';
  raster.context.fillRect(0, 0, 4, 1);
  raster.context.fillStyle = '#00ff00';
  raster.context.fillRect(3, 0, 1, 1);
  return {
    canvas: raster as unknown as HTMLCanvasElement,
    context: raster.context as unknown as CanvasRenderingContext2D,
    release: vi.fn(io.outputRelease),
  };
}
function fixture(bookends = true, includeBookends = true): ReviewPresentationRendererInput {
  const settings = createNeutralPresentationSettings();
  settings.fadeIn = { enabled: true, duration: 0.5 };
  settings.fadeOut = { enabled: true, duration: 0.5 };
  if (bookends) {
    settings.intro = {
      mode: 'image',
      image: {
        assetId: 'intro',
        width: 4,
        height: 2,
        duration: 0.5,
        fit: 'contain',
        fillColor: '#000000ff',
        crop: { panX: 0, panY: 0 },
      },
    };
    settings.outro = { mode: 'image', image: { ...settings.intro.image, assetId: 'outro' } };
  }
  const planned = planReviewPresentationSequence({
    settings,
    mainDuration: 1,
    fragmentOffset: 7,
    includeBookends,
    rate: { numerator: 4, denominator: 1 },
  });
  if (!planned.ok) throw new Error('Invalid fixture');
  return {
    plan: planned.plan,
    settings,
    main: {
      file: new Blob(),
      index: {
        duration: 1,
        boundaries: [0, 1],
        videoCodec: 'avc',
        audioCodec: null,
        container: 'mp4',
        rotation: 0,
      },
      edits: [],
      effective: resolveQuickEditEffectiveState(createQuickEditAdvancedState()),
      fragmentOffset: 7,
      dimensions: { canonical: { width: 8, height: 4 }, backing: { width: 4, height: 2 } },
      readAsset: async () => null,
      signal: new AbortController().signal,
    },
  };
}
const owners: Awaited<ReturnType<typeof createReviewPresentationRenderer>>[] = [];
async function open(args = fixture()) {
  const owner = await createReviewPresentationRenderer(args);
  owners.push(owner);
  return owner;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.render.mockImplementation(async () => canvasLease());
  io.main.mockImplementation(async () => ({
    render: io.render,
    audioTrack: null,
    dispose: io.mainDispose,
  }));
  io.frame.mockImplementation(async () => ({
    draw: (context: CanvasRenderingContext2D) => {
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 4, 2);
    },
    release: io.frameRelease,
  }));
  io.media.mockImplementation(async () => ({
    frame: io.frame,
    dispose: io.mediaDispose,
    audioTrack: null,
  }));
  io.mark.mockImplementation((context: CanvasRenderingContext2D) => {
    context.fillStyle = '#00ff00';
    context.fillRect(6, 0, 2, 2);
  });
  io.watermark.mockImplementation(async () => ({ draw: io.mark, dispose: io.watermarkDispose }));
  vi.stubGlobal('document', { createElement: () => new Raster() });
});
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.unstubAllGlobals();
});

it('prepares each active bookend once and exposes its borrowed audio track', async () => {
  const args = fixture();
  const audio = { codec: 'aac' };
  io.media.mockResolvedValue({ frame: io.frame, dispose: io.mediaDispose, audioTrack: audio });
  const owner = await open(args);
  expect(io.media).toHaveBeenCalledTimes(2);
  expect(io.media.mock.calls.map(([request]) => request.output)).toEqual([
    args.main.dimensions.backing,
    args.main.dimensions.backing,
  ]);
  expect(owner.audioTracks).toEqual({ main: null, intro: audio, outro: audio });
  const candidates = [...iteratePresentationCandidates(args.plan)];
  for (const candidate of [candidates[0]!, candidates[1]!, candidates[0]!])
    (await owner.render(candidate)).release();
  expect(io.media).toHaveBeenCalledTimes(2);
});

it('paints bookend watermark in canonical space before the final full-frame fade', async () => {
  const args = fixture();
  const owner = await open(args);
  const candidates = [...iteratePresentationCandidates(args.plan)];
  const first = await owner.render(candidates[0]!);
  expect((first.canvas as unknown as Raster).pixel(0, 0)).toEqual([0, 0, 0]);
  expect((first.canvas as unknown as Raster).pixel(3, 0)).toEqual([0, 0, 0]);
  first.release();
  const halfway = await owner.render(candidates[1]!);
  expect((halfway.canvas as unknown as Raster).pixel(0, 0)).toEqual([127.5, 0, 0]);
  expect((halfway.canvas as unknown as Raster).pixel(3, 0)).toEqual([0, 127.5, 0]);
  halfway.release();
  const last = await owner.render(candidates.at(-1)!);
  expect(Array.from((last.canvas as unknown as Raster).pixels).every((value) => value === 0)).toBe(
    true
  );
  last.release();
  expect(io.frameRelease).toHaveBeenCalledTimes(3);
});

it('fades the whole main canvas with header, background and watermark without repainting', async () => {
  const args = fixture(false);
  const owner = await open(args);
  const candidates = [...iteratePresentationCandidates(args.plan)];
  const frame = await owner.render(candidates[1]!);
  const raster = frame.canvas as unknown as Raster;
  // Overlapping 0.5s fades contract onto the 0.75s emitted visual span: alpha is 1/3 here.
  expect(raster.pixel(0, 0)[2]).toBeCloseTo(170);
  expect(raster.pixel(0, 1)[0]).toBeCloseTo(170);
  expect(raster.pixel(3, 0)[1]).toBeCloseTo(170);
  expect(io.mark).not.toHaveBeenCalled();
  frame.release();
});

it('renders a fragment without retained media or any edge fade', async () => {
  const args = fixture();
  const result = planReviewPresentationSequence({
    settings: args.settings,
    mainDuration: 1,
    fragmentOffset: 7,
    includeBookends: false,
    rate: args.plan.rate,
  });
  if (!result.ok) throw new Error('Invalid fixture');
  args.plan = result.plan;
  const owner = await open(args);
  for (const candidate of iteratePresentationCandidates(args.plan)) {
    const frame = await owner.render(candidate);
    const raster = frame.canvas as unknown as Raster;
    expect(raster.pixel(0, 0)[2]).toBe(255);
    expect(raster.pixel(0, 1)[0]).toBe(255);
    expect(raster.pixel(3, 0)[1]).toBe(255);
    frame.release();
  }
  expect(io.media).not.toHaveBeenCalled();
  expect(args.plan.audioEnvelope).toMatchObject({ fadeIn: 0, fadeOut: 0 });
});

it('derives a held main clock from the full lattice without rendering a preceding frame', async () => {
  const args = fixture(true);
  args.settings.intro = {
    mode: 'image',
    image: { ...args.settings.intro.image!, duration: 0.105 },
  };
  args.settings.outro = { mode: 'none' };
  args.main.index.duration = 0.1;
  const result = planReviewPresentationSequence({
    settings: args.settings,
    mainDuration: 0.1,
    fragmentOffset: 7,
    includeBookends: true,
    rate: { numerator: 30000, denominator: 1001 },
  });
  if (!result.ok) throw new Error('Invalid fixture');
  args.plan = result.plan;
  const candidate = [...iteratePresentationCandidates(args.plan)].find(
    (value) => value.mapping.kind === 'main' && value.mapping.holdLast
  );
  expect(candidate).toBeDefined();
  const owner = await open(args);
  (await owner.render(candidate!)).release();
  expect(io.render).toHaveBeenCalledWith(candidate, {
    heldMainLocalTime: presentationMainHoldTime(args.plan),
  });
  expect(io.render).toHaveBeenCalledOnce();
});

it('does not prepare dormant or excluded bookends', async () => {
  const args = fixture(false, false);
  args.settings.intro = fixture().settings.intro;
  const owner = await open(args);
  expect(io.media).not.toHaveBeenCalled();
  expect(io.watermark).not.toHaveBeenCalled();
  expect(owner.audioTracks).toEqual({ main: null, intro: null, outro: null });
});

it('refuses stale plans and foreign candidate timing before acquiring pixels', async () => {
  const args = fixture();
  args.settings.intro.image!.duration = 1;
  await expect(open(args)).rejects.toThrow('snapshot');
  expect(io.main).not.toHaveBeenCalled();
  const fresh = fixture();
  const owner = await open(fresh);
  const candidate = [...iteratePresentationCandidates(fresh.plan)][0]!;
  await expect(owner.render({ ...candidate, timestampUs: 1 })).rejects.toThrow('lattice');
  await expect(owner.render({ ...candidate, tick: -1 })).rejects.toThrow('outside');
  expect(io.frame).not.toHaveBeenCalled();
});

it('rejects overlapping frame leases and releases an active frame on disposal', async () => {
  const args = fixture(false);
  const owner = await open(args);
  const candidate = [...iteratePresentationCandidates(args.plan)][0]!;
  const frame = await owner.render(candidate);
  await expect(owner.render(candidate)).rejects.toThrow('leased');
  owner.dispose();
  frame.release();
  expect(io.outputRelease).toHaveBeenCalledOnce();
  expect(io.mainDispose).toHaveBeenCalledOnce();
});

it('disposes prepared owners if a later bookend fails to open', async () => {
  io.media
    .mockResolvedValueOnce({ frame: io.frame, audioTrack: null, dispose: io.mediaDispose })
    .mockRejectedValueOnce(new Error('Missing outro'));
  await expect(open()).rejects.toThrow('Missing outro');
  expect(io.mainDispose).toHaveBeenCalledOnce();
  expect(io.mediaDispose).toHaveBeenCalledOnce();
});

it('releases a late main owner when cancelled during preparation', async () => {
  let complete!: (owner: {
    render: typeof io.render;
    audioTrack: null;
    dispose: typeof io.mainDispose;
  }) => void;
  io.main.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const args = fixture();
  const controller = new AbortController();
  args.main.signal = controller.signal;
  const pending = open(args);
  controller.abort();
  complete({ render: io.render, audioTrack: null, dispose: io.mainDispose });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.mainDispose).toHaveBeenCalledOnce();
  expect(io.media).not.toHaveBeenCalled();
});

it('releases late render output and blocks concurrent rendering after cancellation', async () => {
  let complete!: (frame: RenderCanvasLease) => void;
  io.render.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const args = fixture(false);
  const controller = new AbortController();
  args.main.signal = controller.signal;
  const owner = await open(args);
  const candidate = [...iteratePresentationCandidates(args.plan)][0]!;
  const pending = owner.render(candidate);
  await expect(owner.render(candidate)).rejects.toThrow('leased');
  controller.abort();
  complete(canvasLease());
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.outputRelease).toHaveBeenCalledOnce();
});

it('releases media frames and all owners after paint failure', async () => {
  io.mark.mockImplementation(() => {
    throw new Error('Paint failed');
  });
  const args = fixture();
  const owner = await open(args);
  await expect(owner.render([...iteratePresentationCandidates(args.plan)][0]!)).rejects.toThrow(
    'Paint failed'
  );
  expect(io.frameRelease).toHaveBeenCalledOnce();
  expect(io.mainDispose).toHaveBeenCalledOnce();
  expect(io.mediaDispose).toHaveBeenCalledTimes(2);
  expect(io.watermarkDispose).toHaveBeenCalledOnce();
});

it('releases a bookend frame arriving after renderer disposal', async () => {
  let complete!: (frame: {
    draw: ReturnType<typeof vi.fn>;
    release: typeof io.frameRelease;
  }) => void;
  io.frame.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const args = fixture();
  const owner = await open(args);
  const pending = owner.render([...iteratePresentationCandidates(args.plan)][0]!);
  owner.dispose();
  const draw = vi.fn();
  complete({ draw, release: io.frameRelease });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(draw).not.toHaveBeenCalled();
  expect(io.frameRelease).toHaveBeenCalledOnce();
});

it('passes video bookend mappings unchanged without invoking main effects', async () => {
  const args = fixture();
  args.settings.intro = {
    mode: 'video',
    video: {
      assetId: 'clip',
      source: { width: 4, height: 2, size: 100, duration: 3, mimeType: 'video/mp4' },
      trim: { start: 1, end: 1.5 },
      audio: { muted: false, gain: 1 },
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  const result = planReviewPresentationSequence({
    settings: args.settings,
    mainDuration: 1,
    fragmentOffset: 7,
    includeBookends: true,
    rate: args.plan.rate,
  });
  if (!result.ok) throw new Error('Invalid fixture');
  args.plan = result.plan;
  const candidate = [...iteratePresentationCandidates(args.plan)][1]!;
  const owner = await open(args);
  (await owner.render(candidate)).release();
  expect(io.frame).toHaveBeenCalledWith(candidate.mapping);
  expect(io.render).not.toHaveBeenCalled();
});

it('exposes primary audio borrowed from the already prepared main adapter', async () => {
  const audio = { codec: 'opus' };
  io.main.mockResolvedValue({ render: io.render, audioTrack: audio, dispose: io.mainDispose });
  const owner = await open(fixture(false));
  expect(owner.audioTracks.main).toBe(audio);
  expect(io.main).toHaveBeenCalledOnce();
  owner.dispose();
  expect(io.mainDispose).toHaveBeenCalledOnce();
});

it.each(['dissolve', 'fade-black'] as const)(
  'composes %s across the full join without retiming or repeated endpoint decoding',
  async (type) => {
    const args = fixture();
    args.settings.fadeIn.enabled = args.settings.fadeOut.enabled = false;
    args.settings.introTransition = { type, before: 0.5, after: 0.5, color: '#ffffff' };
    const planned = planReviewPresentationSequence({
      settings: args.settings,
      mainDuration: 1,
      fragmentOffset: 7,
      includeBookends: true,
      rate: args.plan.rate,
    });
    if (!planned.ok) throw new Error('Invalid join fixture');
    args.plan = planned.plan;
    const owner = await open(args);
    const candidates = [...iteratePresentationCandidates(args.plan)];
    for (const tick of [1, 2, 3]) {
      const lease = await owner.render(candidates[tick]!);
      const raster = lease.canvas as unknown as Raster;
      if (tick === 2) {
        expect(raster.pixel(0, 0)).toEqual(
          type === 'dissolve' ? [127.5, 0, 127.5] : [255, 255, 255]
        );
        expect(raster.pixel(0, 1)).toEqual(
          type === 'dissolve' ? [255, 127.5, 127.5] : [255, 255, 255]
        );
      }
      lease.release();
    }
    if (type === 'dissolve') {
      expect(io.frame).toHaveBeenCalledOnce();
      expect(io.render).toHaveBeenCalledOnce();
      expect(io.render.mock.calls[0]![0]).toMatchObject({ mapping: { mainLocalTime: 0 } });
    }
    expect(args.plan.totalDurationUs).toBe(2_000_000);
  }
);

it('releases an acquired outgoing endpoint when incoming decode fails', async () => {
  const args = fixture();
  args.settings.introTransition = { type: 'dissolve', before: 0.2, after: 0.2 };
  const planned = planReviewPresentationSequence({
    settings: args.settings,
    mainDuration: 1,
    fragmentOffset: 7,
    includeBookends: true,
    rate: args.plan.rate,
  });
  if (!planned.ok) throw new Error('Invalid join fixture');
  args.plan = planned.plan;
  io.render.mockRejectedValueOnce(new Error('decode'));
  const owner = await open(args);
  await expect(owner.render([...iteratePresentationCandidates(args.plan)][2]!)).rejects.toThrow(
    'decode'
  );
  expect(io.frameRelease).toHaveBeenCalledOnce();
  expect(io.mainDispose).toHaveBeenCalledOnce();
  expect(io.mediaDispose).toHaveBeenCalledTimes(2);
});
