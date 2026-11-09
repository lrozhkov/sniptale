// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createBookendPreviewGpuRenderer,
  type BookendPreviewGpuInput,
} from './bookend-preview-gpu';
import {
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type createGpuPreviewRenderer,
} from './gpu-preview';
import { createPreviewPresentationSession } from './preview-presentation';
import { resolveMediaFitFrame } from '../../project/window-geometry';

class BorrowedBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width = 641,
    readonly height = 359
  ) {}
}
class BorrowedVideo implements VideoFrame {
  readonly codedWidth = 641;
  readonly codedHeight = 359;
  readonly codedRect = new DOMRectReadOnly(0, 0, 641, 359);
  readonly displayWidth = 641;
  readonly displayHeight = 359;
  readonly visibleRect = this.codedRect;
  readonly duration = 33333;
  readonly format = 'NV12';
  readonly timestamp = 1_000_000;
  readonly colorSpace: VideoColorSpace = {
    fullRange: false,
    matrix: 'bt709',
    primaries: 'bt709',
    transfer: 'bt709',
    toJSON: () => ({}),
  };
  readonly close = vi.fn();
  readonly clone = vi.fn<VideoFrame['clone']>(() => {
    throw new Error('Borrowed source must not be cloned');
  });
  readonly allocationSize = vi.fn<VideoFrame['allocationSize']>(() => 641 * 359 * 4);
  readonly copyTo = vi.fn<VideoFrame['copyTo']>(async () => []);
}
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function fixture(source: ImageBitmap | VideoFrame = new BorrowedBitmap()) {
  const host = document.createElement('div'),
    fallback = document.createElement('canvas');
  host.append(fallback);
  document.body.append(host);
  const presenter = createPreviewPresentationSession({
    host: () => host,
    fallback: () => fallback,
    role: 'inspector',
  });
  presenter.mount();
  const present = vi.fn<(request: Parameters<GpuPreviewRenderer['render']>[0]) => Promise<void>>(
    async () => {}
  );
  const releaseImage = vi.fn(),
    disposeSurface = vi.fn();
  const backend = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present,
      releaseImage,
      dispose: disposeSurface,
    })),
  } satisfies GpuPreviewRenderer;
  const createBackend = vi.fn<typeof createGpuPreviewRenderer>(async () => backend);
  const renderer = createBookendPreviewGpuRenderer(createBackend);
  cleanup.push(() => {
    renderer.dispose();
    presenter.dispose();
  });
  const input: BookendPreviewGpuInput = {
    source,
    sourceSize: { width: 641, height: 359 },
    output: { width: 199, height: 113 },
    logical: { width: 1920, height: 1080 },
    framing: { fit: 'contain', fillColor: '#20408080', crop: { panX: 0.25, panY: -0.5 } },
    signal: new AbortController().signal,
    acquire: presenter.acquire,
  };
  return {
    renderer,
    createBackend,
    backend,
    presenter,
    host,
    fallback,
    present,
    releaseImage,
    disposeSurface,
    input,
  };
}

it.each(['contain', 'cover'] as const)(
  'composes fill and borrowed image with canonical fractional %s geometry and no global VideoFrame',
  async (fit) => {
    vi.stubGlobal('VideoFrame', undefined);
    const source = new BorrowedBitmap(),
      f = fixture(source);
    const input = { ...f.input, framing: { ...f.input.framing, fit } };
    const output = await f.renderer.render(input);
    expect(output).toBeTruthy();
    const request = f.present.mock.calls[0]![0];
    expect(request.output).toEqual(input.output);
    expect(request.logical).toEqual(input.logical);
    expect(request.layers).toHaveLength(2);
    const fill = request.layers[0]!,
      media = request.layers[1]!;
    expect(fill.rect).toEqual({ x: 0, y: 0, ...input.logical });
    expect(fill.tint).toEqual([32 / 255, 64 / 255, 128 / 255, 128 / 255]);
    expect(fill.source).toBeInstanceOf(HTMLCanvasElement);
    if (!(fill.source instanceof HTMLCanvasElement))
      throw new Error('Expected retained white raster');
    expect(fill.source.width).toBe(1);
    expect(fill.source.height).toBe(1);
    expect([...fill.source.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([
      255, 255, 255, 255,
    ]);
    const expected = resolveMediaFitFrame({
      source: input.sourceSize,
      output: input.logical,
      fit,
      crop: input.framing.crop,
    });
    expect(media.rect).toEqual({
      x: expected.x,
      y: expected.y,
      width: expected.width,
      height: expected.height,
    });
    if (fit === 'contain') {
      expect(media.rect.x).toBe(0);
      expect(media.rect.y).toBeGreaterThan(0);
      expect(media.rect.width).toBe(input.logical.width);
    } else {
      expect(media.rect.x).toBeLessThan(0);
      expect(media.rect.y).toBe(0);
      expect(media.rect.height).toBe(input.logical.height);
    }
    expect(media.source).toBe(source);
    expect(fill.inverse).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(media.inverse).toEqual(fill.inverse);
    expect(f.backend.render).not.toHaveBeenCalled();
    expect(source.close).not.toHaveBeenCalled();
    if (output) output.release();
  }
);

it('retains material revisions across framing edits and replaces only the source revision', async () => {
  const source = new BorrowedBitmap(),
    f = fixture(source);
  const first = await f.renderer.render(f.input);
  if (first) first.release();
  const edited = {
    ...f.input,
    output: { width: 320, height: 180 },
    framing: { fit: 'cover' as const, fillColor: '#ff0000ff', crop: { panX: -1, panY: 1 } },
  };
  const second = await f.renderer.render(edited);
  if (second) second.release();
  const next = new BorrowedBitmap();
  const third = await f.renderer.render({ ...edited, source: next });
  if (third) third.release();
  const [a, b, c] = f.present.mock.calls.map(([request]) => request.layers);
  expect(a![0]!.source).toBe(b![0]!.source);
  expect(b![0]!.source).toBe(c![0]!.source);
  expect(a![0]!.cache).toEqual(b![0]!.cache);
  expect(b![0]!.cache).toEqual(c![0]!.cache);
  expect(a![1]!.cache?.key).toBe(b![1]!.cache?.key);
  expect(b![1]!.cache?.key).toBe(c![1]!.cache?.key);
  expect(a![1]!.cache?.revision).toBe(source);
  expect(b![1]!.cache?.revision).toBe(source);
  expect(c![1]!.cache?.revision).toBe(next);
  expect(source.close).not.toHaveBeenCalled();
  expect(next.close).not.toHaveBeenCalled();
});

it('passes a borrowed video and admitted orientation without cloning, reading, or closing it', async () => {
  const source = new BorrowedVideo(),
    f = fixture(source);
  const orientation = { rotation: 90 as const, flip: true };
  const output = await f.renderer.render({
    ...f.input,
    sourceSize: { width: 359, height: 641 },
    orientation,
  });
  expect(f.present.mock.calls[0]![0].layers[1]!.source).toBe(source);
  expect(f.present.mock.calls[0]![0].layers[1]!.orientation).toEqual(orientation);
  f.renderer.dispose();
  expect(source.clone).not.toHaveBeenCalled();
  expect(source.copyTo).not.toHaveBeenCalled();
  expect(source.close).not.toHaveBeenCalled();
  if (output) output.release();
});

it.each(['cancel', 'dispose'] as const)(
  'drains an admitted fence before releasing a canceled target after %s',
  async (reason) => {
    const f = fixture(),
      controller = new AbortController(),
      completion = Promise.withResolvers<void>();
    f.present.mockReturnValueOnce(completion.promise);
    const pending = f.renderer.render({ ...f.input, signal: controller.signal });
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    if (reason === 'cancel') controller.abort();
    else f.renderer.dispose();
    expect(f.releaseImage).not.toHaveBeenCalled();
    expect(f.backend.dispose).not.toHaveBeenCalled();
    completion.resolve();
    await expect(pending).resolves.toBe(false);
    expect(f.releaseImage).toHaveBeenCalledOnce();
    if (reason === 'dispose') expect(f.backend.dispose).toHaveBeenCalledOnce();
  }
);

it('keeps the backend until accepted frontend output is released and makes release idempotent', async () => {
  const f = fixture(),
    output = await f.renderer.render(f.input);
  if (!output) throw new Error('Expected completed output');
  f.presenter.publish(output, () => {});
  f.renderer.dispose();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  expect(output.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  f.presenter.dispose();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  output.release();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(f.releaseImage).toHaveBeenCalledOnce();
});

it.each(['missing', 'surface', 'device'] as const)(
  'permits fallback for %s availability failure and latches it',
  async (reason) => {
    const f = fixture();
    if (reason === 'missing') f.createBackend.mockResolvedValue(null);
    if (reason === 'surface')
      f.createBackend.mockResolvedValue({
        allocatedBytes: 0,
        render: vi.fn<GpuPreviewRenderer['render']>(),
        dispose: vi.fn(),
      });
    if (reason === 'device')
      f.createBackend.mockRejectedValue(new GpuPreviewDeviceError('device failed'));
    await expect(f.renderer.render(f.input)).resolves.toBeUndefined();
    await expect(f.renderer.render(f.input)).resolves.toBeUndefined();
    expect(f.renderer.fallbackReason).toBe(reason === 'device' ? 'device-failed' : 'unavailable');
    expect(f.createBackend).toHaveBeenCalledOnce();
    expect(f.present).not.toHaveBeenCalled();
  }
);

it('propagates ordinary encode errors, releases its target, and remains usable', async () => {
  const f = fixture(),
    error = new Error('invalid operation');
  f.present.mockRejectedValueOnce(error);
  await expect(f.renderer.render(f.input)).rejects.toBe(error);
  expect(f.renderer.fallbackReason).toBeUndefined();
  expect(f.releaseImage).toHaveBeenCalledOnce();
  const output = await f.renderer.render(f.input);
  expect(output).toBeTruthy();
  if (output) output.release();
});

it('rejects an overlapping render without admitting another target', async () => {
  const f = fixture(),
    completion = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(completion.promise);
  const pending = f.renderer.render(f.input);
  await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
  await expect(f.renderer.render(f.input)).rejects.toThrow('already in flight');
  expect(f.backend.createSurface).toHaveBeenCalledOnce();
  completion.resolve();
  const output = await pending;
  if (output) output.release();
});

it.each(['output', 'logical', 'sourceSize'] as const)(
  'rejects invalid %s dimensions before backend acquisition',
  async (field) => {
    const f = fixture();
    await expect(
      f.renderer.render({ ...f.input, [field]: { width: 0, height: 10 } })
    ).rejects.toThrow();
    expect(f.createBackend).not.toHaveBeenCalled();
  }
);

it('releases a failed target but keeps an accepted output provider alive through a later device failure', async () => {
  const source = new BorrowedBitmap(),
    f = fixture(source);
  const accepted = await f.renderer.render(f.input);
  if (!accepted) throw new Error('Expected accepted output');
  f.presenter.publish(accepted, () => {});
  f.present.mockRejectedValueOnce(new GpuPreviewDeviceError('lost device'));
  await expect(f.renderer.render(f.input)).resolves.toBeUndefined();
  expect(f.renderer.fallbackReason).toBe('device-failed');
  expect(f.releaseImage).toHaveBeenCalledOnce();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  expect(accepted.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  await expect(f.renderer.render(f.input)).resolves.toBeUndefined();
  expect(f.createBackend).toHaveBeenCalledOnce();
  f.presenter.dispose();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(source.close).not.toHaveBeenCalled();
});

it('retires a backend that finishes initializing after disposal without acquiring a target', async () => {
  const source = new BorrowedBitmap(),
    f = fixture(source),
    completion = Promise.withResolvers<GpuPreviewRenderer | null>();
  f.createBackend.mockReturnValueOnce(completion.promise);
  const pending = f.renderer.render(f.input);
  expect(f.createBackend).toHaveBeenCalledOnce();
  f.renderer.dispose();
  completion.resolve(f.backend);
  await expect(pending).resolves.toBe(false);
  expect(f.backend.createSurface).not.toHaveBeenCalled();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(source.close).not.toHaveBeenCalled();
});

it.each([
  { field: 'output', width: 0.5 },
  { field: 'logical', width: Infinity },
  { field: 'sourceSize', width: NaN },
] as const)(
  'rejects non-finite or fractional physical dimensions: $field $width',
  async ({ field, width }) => {
    const f = fixture();
    await expect(
      f.renderer.render({ ...f.input, [field]: { width, height: 10 } })
    ).rejects.toThrow();
    expect(f.createBackend).not.toHaveBeenCalled();
  }
);
