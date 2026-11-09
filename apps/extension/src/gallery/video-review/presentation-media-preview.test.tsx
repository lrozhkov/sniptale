// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ReviewPresentationMediaPreview } from './presentation-media-preview';
import { ReviewPreviewRendererContext } from './use-preview-preferences';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import type { GpuPreviewRenderer } from '../../features/video/composition/canvas/gpu-preview';
import type { createReviewPresentationMedia } from '../../workflows/video-review/presentation-media';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
const gpu = vi.hoisted(() => ({
  create:
    vi.fn<
      typeof import('../../features/video/composition/canvas/gpu-preview').createGpuPreviewRenderer
    >(),
}));
vi.mock('../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: gpu.create,
}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn() }));
vi.mock('../../workflows/video-review/presentation-media', () => ({
  createReviewPresentationMedia: mocks.create,
}));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: mocks.read,
}));
let root: Root;
let host: HTMLDivElement;
let audio: ReturnType<typeof vi.fn<(available: boolean) => void>>;
const draw = vi.fn();
const release = vi.fn();
const dispose = vi.fn();
const frame = vi.fn();
let slot: Exclude<QuickEditPresentationSettings['intro'], { mode: 'none' }>;
beforeEach(() => {
  vi.clearAllMocks();
  gpu.create.mockReset().mockResolvedValue(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  frame.mockResolvedValue({ draw, release });
  mocks.create.mockResolvedValue({ frame, dispose, audioTrack: null });
  audio = vi.fn<(available: boolean) => void>();
  slot = {
    mode: 'video',
    video: {
      assetId: 'project-asset:video',
      source: { duration: 10, width: 1920, height: 1080, size: 10, mimeType: 'video/mp4' },
      trim: { start: 2, end: 8 },
      audio: { muted: false, gain: 1 },
      fit: 'cover',
      fillColor: '#000000ff',
      crop: { panX: 0.5, panY: -0.5 },
    },
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(pending = false) {
  await act(async () =>
    root.render(
      <ReviewPresentationMediaPreview
        pending={pending}
        slot={slot}
        output={{ width: 1920, height: 1080 }}
        onAudio={audio}
      />
    )
  );
}
it('renders authored framing through the production media adapter with bounded output', async () => {
  await render();
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ slot, output: { width: 640, height: 360 }, readAsset: mocks.read })
  );
  expect(frame).toHaveBeenCalledWith(
    {
      kind: 'video',
      assetId: 'project-asset:video',
      range: { start: 2, end: 2 },
      holdLast: false,
    },
    slot
  );
  expect(draw).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  expect(audio).toHaveBeenLastCalledWith(false);
});
it('reports actual audio presence without changing authored mute state', async () => {
  mocks.create.mockResolvedValue({ frame, dispose, audioTrack: {} });
  await render();
  expect(audio).toHaveBeenLastCalledWith(true);
  expect(slot.mode === 'video' && slot.video.audio.muted).toBe(false);
});
it('releases an obsolete asynchronous frame without painting it', async () => {
  let finish!: (value: { draw: typeof draw; release: typeof release }) => void;
  frame.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => root.unmount());
  await act(async () => finish({ draw, release }));
  expect(draw).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  root = createRoot(host);
});
it('disposes late acquisition after cancellation', async () => {
  let finish!: (value: { frame: typeof frame; dispose: typeof dispose; audioTrack: null }) => void;
  mocks.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => root.unmount());
  await act(async () => finish({ frame, dispose, audioTrack: null }));
  expect(dispose).toHaveBeenCalledOnce();
  expect(frame).not.toHaveBeenCalled();
  root = createRoot(host);
});
it('offers recovery without exposing decoder exceptions', async () => {
  mocks.create.mockRejectedValueOnce(new Error('private source details'));
  await render();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.textContent).not.toContain('private source details');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(draw).toHaveBeenCalledOnce();
});

async function seekTo(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
}
it('seeks to the authored trim endpoint using the decoder hold-last contract', async () => {
  await render();
  await seekTo('8');
  expect(frame).toHaveBeenLastCalledWith(
    {
      kind: 'video',
      assetId: 'project-asset:video',
      range: { start: 8, end: 8 },
      holdLast: true,
    },
    slot
  );
  expect(mocks.create).toHaveBeenCalledOnce();
});
it('serializes rapid seek requests and discards intermediate frame leases', async () => {
  await render();
  let finish!: (value: { draw: typeof draw; release: typeof release }) => void;
  frame.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await seekTo('3');
  await seekTo('4');
  await seekTo('5');
  expect(frame).toHaveBeenCalledTimes(2);
  await act(async () => finish({ draw, release }));
  expect(frame).toHaveBeenCalledTimes(3);
  expect(frame).toHaveBeenLastCalledWith(
    {
      kind: 'video',
      assetId: 'project-asset:video',
      range: { start: 5, end: 5 },
      holdLast: false,
    },
    slot
  );
  expect(draw).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(3);
});
it('renders static image slots without a seek control', async () => {
  slot = {
    mode: 'image',
    image: {
      assetId: 'project-asset:image',
      width: 100,
      height: 50,
      duration: 3,
      fit: 'contain',
      crop: { panX: 0, panY: 0 },
      fillColor: '#ffffffff',
    },
  };
  await render();
  expect(frame).toHaveBeenCalledWith({ kind: 'image', assetId: 'project-asset:image' }, slot);
  expect(host.querySelector('input')).toBeNull();
});

it('does not read an attached asset until its publication settles', async () => {
  await render(true);
  expect(mocks.create).not.toHaveBeenCalled();
  await render(false);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledOnce();
});

it('keeps admitted audio available while authored framing and publication state change', async () => {
  mocks.create.mockResolvedValue({ frame, dispose, audioTrack: {} });
  await render();
  audio.mockClear();
  if (slot.mode !== 'video') throw new Error('expected video');
  slot = { ...slot, video: { ...slot.video, crop: { panX: 0.2, panY: 0 } } };
  await render(true);
  expect(audio).not.toHaveBeenCalledWith(false);
  await render(false);
  expect(audio).not.toHaveBeenCalledWith(false);
  expect(mocks.create).toHaveBeenCalledOnce();
});

type Media = Awaited<ReturnType<typeof createReviewPresentationMedia>>;
type Lease = Awaited<ReturnType<Media['frame']>>;
class RetainedSnapshot implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
class SnapshotCapability {
  transferToImageBitmap(): ImageBitmap {
    throw new Error('The admitted lease owns snapshot normalization');
  }
}
function gpuFixture() {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
  vi.stubGlobal('OffscreenCanvas', SnapshotCapability);
  const present = vi.fn<(request: Parameters<GpuPreviewRenderer['render']>[0]) => Promise<void>>(
    async () => {}
  );
  const backend = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present,
      releaseImage: vi.fn(),
      dispose: vi.fn(),
    })),
  } satisfies GpuPreviewRenderer;
  gpu.create.mockResolvedValue(backend);
  const snapshots: RetainedSnapshot[] = [];
  const snapshot = vi.fn(() => {
    const source = slot.mode === 'image' ? slot.image : slot.video.source;
    const pixels = new RetainedSnapshot(source.width, source.height);
    snapshots.push(pixels);
    return pixels;
  });
  const lease = { draw: vi.fn(), release: vi.fn(), snapshot } satisfies Lease;
  const media = {
    frame: vi.fn<Media['frame']>(async () => lease),
    audioTrack: null,
    dispose: vi.fn(),
  } satisfies Media;
  mocks.create.mockResolvedValue(media);
  return { present, backend, media, lease, snapshots, snapshot };
}
function BeforePassive({ run }: { run: (() => void) | undefined }) {
  useLayoutEffect(() => run?.(), [run]);
  return null;
}
async function renderGpu(renderer: VideoPreviewRenderer = 'gpu', beforePassive?: () => void) {
  await act(async () =>
    root.render(
      <ReviewPreviewRendererContext.Provider value={renderer}>
        <ReviewPresentationMediaPreview
          slot={slot}
          output={{ width: 1920, height: 1080 }}
          onAudio={audio}
        />
        <BeforePassive run={beforePassive} />
      </ReviewPreviewRendererContext.Provider>
    )
  );
}
function gpuFront() {
  return host.querySelector<HTMLCanvasElement>(
    '[data-ui="gallery.videoReview.presentationMedia.gpuHost"] canvas[data-preview-inspector-canvas]'
  );
}
function fallbackCanvas() {
  const canvas = host.querySelector('canvas[aria-label]');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected fallback Canvas');
  return canvas;
}
function imageSource() {
  slot = {
    mode: 'image',
    image: {
      assetId: 'project-asset:image',
      width: 320,
      height: 160,
      duration: 3,
      fit: 'contain',
      fillColor: '#ffffffff',
      crop: { panX: 0, panY: 0 },
    },
  };
}

it.each(['image', 'video'] as const)(
  'publishes completed %s GPU output and reuses one source snapshot through authored recipe edits',
  async (kind) => {
    if (kind === 'image') imageSource();
    const f = gpuFixture();
    await renderGpu();
    expect(gpuFront()).not.toBeNull();
    expect(fallbackCanvas().style.opacity).toBe('0');
    expect(host.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('false');
    expect(f.lease.draw).not.toHaveBeenCalled();
    expect(f.snapshot).toHaveBeenCalledOnce();
    expect(f.lease.release).toHaveBeenCalledOnce();
    expect(f.present.mock.calls[0]![0].layers[1]!.source).toBe(f.snapshots[0]);
    const original = structuredClone(slot);
    if (slot.mode === 'image') {
      slot = { ...slot, image: { ...slot.image, fit: 'cover', crop: { panX: 0.2, panY: -0.4 } } };
    } else {
      slot = { ...slot, video: { ...slot.video, fit: 'contain', crop: { panX: 0.2, panY: -0.4 } } };
    }
    await renderGpu();
    if (slot.mode === 'image') slot = { ...slot, image: { ...slot.image, fillColor: '#ff000080' } };
    else slot = { ...slot, video: { ...slot.video, fillColor: '#ff000080' } };
    await renderGpu();
    expect(f.present.mock.calls.at(-1)![0].layers[0]!.tint).toEqual([1, 0, 0, 128 / 255]);
    if (slot.mode === 'video') {
      const calls = f.present.mock.calls.length;
      slot = { ...slot, video: { ...slot.video, audio: { muted: true, gain: 0.2 } } };
      await renderGpu();
      expect(f.present).toHaveBeenCalledTimes(calls);
    }
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(f.media.frame).toHaveBeenCalledOnce();
    expect(f.snapshot).toHaveBeenCalledOnce();
    expect(f.snapshots[0]!.close).not.toHaveBeenCalled();
    expect(f.present.mock.calls.at(-1)![0].layers[1]!.source).toBe(f.snapshots[0]);
    expect(original.mode === 'image' ? original.image.fillColor : original.video.fillColor).toBe(
      kind === 'image' ? '#ffffffff' : '#000000ff'
    );
    await act(async () => root.render(null));
    expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
    expect(f.backend.dispose).toHaveBeenCalledOnce();
  }
);

it('keeps equivalent reordered source facts admitted and reopens changed source facts', async () => {
  const f = gpuFixture();
  await renderGpu();
  if (slot.mode !== 'video') throw new Error('Expected video');
  const source = slot.video.source;
  slot = {
    ...slot,
    video: {
      ...slot.video,
      source: {
        mimeType: source.mimeType,
        size: source.size,
        height: source.height,
        width: source.width,
        duration: source.duration,
      },
    },
  };
  await renderGpu();
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(f.snapshot).toHaveBeenCalledOnce();
  slot = { ...slot, video: { ...slot.video, source: { ...slot.video.source, width: 1280 } } };
  await renderGpu();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(f.snapshot).toHaveBeenCalledTimes(2);
  expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
  expect(f.snapshots[1]!.width).toBe(1280);
  expect(gpuFront()).not.toBeNull();
});

it('uses the existing renderer preference context to switch GPU and legacy without reopening media', async () => {
  const f = gpuFixture();
  await renderGpu();
  expect(gpuFront()).not.toBeNull();
  await renderGpu('legacy');
  expect(gpuFront()).toBeNull();
  expect(fallbackCanvas().style.opacity).toBe('1');
  expect(f.lease.draw).toHaveBeenCalledOnce();
  expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  await renderGpu('gpu');
  expect(gpuFront()).not.toBeNull();
  expect(f.snapshot).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenCalledOnce();
});

it('preserves authored video and admitted media during silent local GPU seek', async () => {
  const f = gpuFixture();
  const original = structuredClone(slot);
  await renderGpu();
  await seekTo('5.125');
  expect(f.media.frame).toHaveBeenLastCalledWith(
    {
      kind: 'video',
      assetId: 'project-asset:video',
      range: { start: 5.125, end: 5.125 },
      holdLast: false,
    },
    slot
  );
  expect(slot).toEqual(original);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(f.snapshot).toHaveBeenCalledTimes(2);
  expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
  expect(f.snapshots[1]!.close).not.toHaveBeenCalled();
  expect(gpuFront()).not.toBeNull();
  expect(audio).toHaveBeenLastCalledWith(false);
});

it('disposes a GPU source admission completed after replacement without framing or snapshotting it', async () => {
  const f = gpuFixture();
  const admission = Promise.withResolvers<Media>();
  mocks.create.mockReturnValueOnce(admission.promise);
  await renderGpu();
  if (slot.mode !== 'video') throw new Error('Expected video');
  slot = { ...slot, video: { ...slot.video, assetId: 'project-asset:replacement' } };
  await renderGpu();
  const late = { ...f.media, frame: vi.fn<Media['frame']>(), dispose: vi.fn() } satisfies Media;
  await act(async () => admission.resolve(late));
  expect(late.dispose).toHaveBeenCalledOnce();
  expect(late.frame).not.toHaveBeenCalled();
  expect(f.snapshot).toHaveBeenCalledOnce();
  expect(gpuFront()).not.toBeNull();
});

it.each(['frame', 'error'] as const)(
  'ignores an old source %s settled during replacement layout before passive effects',
  async (outcome) => {
    const f = gpuFixture();
    const pending = Promise.withResolvers<Lease>();
    f.media.frame.mockReturnValueOnce(pending.promise);
    await renderGpu();
    const old = {
      draw: vi.fn(),
      release: vi.fn(),
      snapshot: vi.fn<Lease['snapshot']>(),
    } satisfies Lease;
    if (slot.mode !== 'video') throw new Error('Expected video');
    slot = { ...slot, video: { ...slot.video, assetId: 'project-asset:new' } };
    await renderGpu('gpu', () => {
      if (outcome === 'frame') pending.resolve(old);
      else pending.reject(new Error('private obsolete decoder error'));
    });
    expect(host.querySelector('[role=alert]')).toBeNull();
    expect(host.textContent).not.toContain('private obsolete decoder error');
    expect(old.draw).not.toHaveBeenCalled();
    expect(old.snapshot).not.toHaveBeenCalled();
    expect(old.release).toHaveBeenCalledTimes(outcome === 'frame' ? 1 : 0);
    expect(f.snapshot).toHaveBeenCalledOnce();
    expect(gpuFront()).not.toBeNull();
  }
);

it('keeps a retired snapshot alive through GPU completion and closes it after unmount', async () => {
  const f = gpuFixture();
  const completion = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(completion.promise);
  await renderGpu();
  expect(gpuFront()).toBeNull();
  await act(async () => root.render(null));
  expect(f.snapshots[0]!.close).not.toHaveBeenCalled();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  await act(async () => completion.resolve());
  expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(gpuFront()).toBeNull();
});

it('offers retry after an ordinary GPU failure, then publishes a fresh owned snapshot', async () => {
  const f = gpuFixture();
  f.present.mockRejectedValueOnce(new Error('private device detail'));
  await renderGpu();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.textContent).not.toContain('private device detail');
  expect(f.snapshots[0]!.close).toHaveBeenCalledOnce();
  expect(gpuFront()).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(gpuFront()).not.toBeNull();
  expect(f.snapshot).toHaveBeenCalledTimes(2);
  expect(gpu.create).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  expect(f.snapshots[1]!.close).toHaveBeenCalledOnce();
});
