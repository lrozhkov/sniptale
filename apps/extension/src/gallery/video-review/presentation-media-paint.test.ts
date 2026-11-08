// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createPresentationMediaPaintOwner,
  type PresentationMediaPaintInput,
} from './presentation-media-paint';
import type { createBookendPreviewGpuRenderer } from '../../features/video/composition/canvas/bookend-preview-gpu';
import type {
  GpuPreviewFramePresenter,
  GpuPreviewOutput,
} from '../../features/video/composition/canvas/preview-presentation';
import type { createReviewPresentationMedia } from '../../workflows/video-review/presentation-media';
import type { PreviewRendererStatus } from '../../features/video/preview/preferences';

type Media = Awaited<ReturnType<typeof createReviewPresentationMedia>>;
type Lease = Awaited<ReturnType<Media['frame']>>;
type Producer = ReturnType<typeof createBookendPreviewGpuRenderer>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
const owners: ReturnType<typeof createPresentationMediaPaintOwner>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const framing = { fit: 'contain' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };
function videoSlot(): Extract<PresentationMediaPaintInput['slot'], { mode: 'video' }> {
  return {
    mode: 'video',
    video: {
      ...framing,
      assetId: 'video',
      source: { width: 640, height: 360, duration: 10, mimeType: 'video/webm', size: 1000 },
      trim: { start: 1, end: 4 },
      audio: { muted: false, gain: 1 },
    },
  };
}
function fixture() {
  class SnapshotCanvas implements Pick<OffscreenCanvas, 'transferToImageBitmap'> {
    transferToImageBitmap(): ImageBitmap {
      throw new Error('Capability flag must not allocate.');
    }
  }
  vi.stubGlobal('OffscreenCanvas', SnapshotCanvas);
  let input: PresentationMediaPaintInput = {
    sourceKey: 'owner',
    slot: {
      mode: 'image',
      image: { ...framing, assetId: 'image', width: 640, height: 360, duration: 3 },
    },
    time: 0,
    renderer: 'gpu',
  };
  const reads: ReturnType<typeof deferred<Lease>>[] = [];
  const media: Media = {
    audioTrack: null,
    dispose: vi.fn(),
    frame: vi.fn(() => {
      const next = deferred<Lease>();
      reads.push(next);
      return next.promise;
    }),
  };
  type Result = Awaited<ReturnType<Producer['render']>>;
  const jobs: {
    input: Parameters<Producer['render']>[0];
    completion: ReturnType<typeof deferred<Result>>;
  }[] = [];
  let fallback: PreviewRendererStatus['fallback'];
  const producer: Producer = {
    get fallbackReason() {
      return fallback;
    },
    dispose: vi.fn(),
    render: vi.fn((value) => {
      const completion = deferred<Result>();
      jobs.push({ input: value, completion });
      return completion.promise;
    }),
  };
  const createRenderer = vi.fn(() => producer);
  const presenter: GpuPreviewFramePresenter = {
    acquire: vi.fn(),
    publish: vi.fn((_output, accept) => accept()),
  };
  const ready = vi.fn(),
    fail = vi.fn(),
    context = {} as CanvasRenderingContext2D;
  const canvas = document.createElement('canvas');
  const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  const owner = createPresentationMediaPaintOwner({
    sourceKey: 'owner',
    media,
    canvas,
    output: { width: 320, height: 180 },
    presenter,
    read: () => input,
    ready,
    fail,
    createRenderer,
  });
  owners.push(owner);
  const set = (change: Partial<PresentationMediaPaintInput>) => {
    input = { ...input, ...change };
  };
  function lease() {
    const close = vi.fn();
    const bitmap = { width: 640, height: 360, close } as ImageBitmap;
    const snapshot = vi.fn(() => bitmap),
      draw = vi.fn(),
      release = vi.fn();
    return { bitmap, close, snapshot, draw, release };
  }
  const supply = async (index = reads.length - 1) => {
    const source = lease();
    reads[index]!.resolve(source);
    await settle();
    return source;
  };
  const output = (): GpuPreviewOutput => ({
    canvas: document.createElement('canvas'),
    release: vi.fn(),
  });
  return {
    owner,
    set,
    read: () => input,
    media,
    reads,
    jobs,
    producer,
    createRenderer,
    presenter,
    ready,
    fail,
    context,
    getContext,
    lease,
    supply,
    output,
    fallback: (reason: PreviewRendererStatus['fallback']) => {
      fallback = reason;
    },
  };
}

it('reuses one source snapshot for fit, pan, fill and audio edits and releases its lease before GPU work', async () => {
  const f = fixture();
  f.set({ slot: videoSlot(), time: 2 });
  f.owner.request();
  await settle();
  const source = await f.supply();
  expect(source.snapshot).toHaveBeenCalledOnce();
  expect(source.release).toHaveBeenCalledOnce();
  expect(source.release.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(f.producer.render).mock.invocationCallOrder[0]!
  );
  expect(source.draw).not.toHaveBeenCalled();
  expect(source.close).not.toHaveBeenCalled();
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  const slot = videoSlot();
  const edits = [
    { ...slot, video: { ...slot.video, fit: 'cover' as const } },
    { ...slot, video: { ...slot.video, crop: { panX: 0.3, panY: -0.5 } } },
    { ...slot, video: { ...slot.video, fillColor: '#abcdefff' } },
    { ...slot, video: { ...slot.video, audio: { muted: true, gain: 0.4 } } },
  ];
  for (const edit of edits) {
    f.set({ slot: edit });
    f.owner.request();
    await settle();
    const job = f.jobs.at(-1)!;
    expect(job.input.source).toBe(source.bitmap);
    expect(job.input.framing).toEqual({
      fit: edit.video.fit,
      fillColor: edit.video.fillColor,
      crop: edit.video.crop,
    });
    expect(job.input.sourceSize).toEqual({ width: 640, height: 360 });
    job.completion.resolve(f.output());
    await settle();
  }
  expect(f.media.frame).toHaveBeenCalledOnce();
  expect(f.getContext).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.media.dispose).not.toHaveBeenCalled();
});

it('recaptures changed mapping and exact hold-last time while clamped endpoint requests reuse pixels', async () => {
  const f = fixture();
  f.set({ slot: videoSlot(), time: 2 });
  f.owner.request();
  await settle();
  const first = await f.supply();
  expect(f.media.frame).toHaveBeenLastCalledWith(
    { kind: 'video', assetId: 'video', range: { start: 2, end: 2 }, holdLast: false },
    f.read().slot
  );
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  f.set({ time: 4 - Number.EPSILON * 4 });
  f.owner.request();
  await settle();
  expect(first.close).toHaveBeenCalledOnce();
  const second = await f.supply();
  expect(f.media.frame).toHaveBeenLastCalledWith(
    expect.objectContaining({ holdLast: false }),
    f.read().slot
  );
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  f.set({ time: 4 });
  f.owner.request();
  await settle();
  expect(second.close).toHaveBeenCalledOnce();
  await f.supply();
  expect(f.media.frame).toHaveBeenLastCalledWith(
    { kind: 'video', assetId: 'video', range: { start: 4, end: 4 }, holdLast: true },
    f.read().slot
  );
  f.jobs[2]!.completion.resolve(f.output());
  await settle();
  f.set({ time: 8 });
  f.owner.request();
  await settle();
  expect(f.media.frame).toHaveBeenCalledTimes(3);
  f.jobs[3]!.completion.resolve(f.output());
  await settle();
  f.set({
    slot: {
      mode: 'image',
      image: { ...framing, assetId: 'next', width: 640, height: 360, duration: 3 },
    },
  });
  f.owner.request();
  await settle();
  await f.supply();
  expect(f.media.frame).toHaveBeenLastCalledWith({ kind: 'image', assetId: 'next' }, f.read().slot);
  f.jobs[4]!.completion.resolve(f.output());
  await settle();
});

it('runs one active job and renders only the latest pending request using the retained snapshot', async () => {
  const f = fixture();
  f.owner.request();
  await settle();
  const source = await f.supply();
  const slot = f.read().slot;
  if (slot.mode !== 'image') throw new Error('Fixture must be an image.');
  f.set({ slot: { ...slot, image: { ...slot.image, fit: 'cover' } } });
  f.owner.request();
  f.set({ slot: { ...slot, image: { ...slot.image, crop: { panX: 0.7, panY: 0 } } } });
  f.owner.request();
  await settle();
  expect(f.jobs).toHaveLength(1);
  expect(f.jobs[0]!.input.signal.aborted).toBe(true);
  expect(source.close).not.toHaveBeenCalled();
  const stale = f.output();
  f.jobs[0]!.completion.resolve(stale);
  await settle();
  expect(stale.release).toHaveBeenCalledOnce();
  expect(f.presenter.publish).not.toHaveBeenCalled();
  expect(f.jobs).toHaveLength(2);
  expect(f.jobs[1]!.input.framing.crop.panX).toBe(0.7);
  expect(f.media.frame).toHaveBeenCalledOnce();
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.ready).toHaveBeenCalledOnce();
});

it.each(['cancel', 'dispose', 'replacement'] as const)(
  'retains the borrowed bitmap through the GPU fence after %s',
  async (action) => {
    const f = fixture();
    f.owner.request();
    await settle();
    const source = await f.supply();
    if (action === 'replacement') {
      const slot = f.read().slot;
      if (slot.mode !== 'image') throw new Error('Fixture must be an image.');
      f.set({ slot: { ...slot, image: { ...slot.image, assetId: 'replacement' } } });
      f.owner.request();
    } else f.owner[action]();
    expect(source.close).not.toHaveBeenCalled();
    const stale = f.output();
    f.jobs[0]!.completion.resolve(stale);
    await settle();
    expect(stale.release).toHaveBeenCalledOnce();
    expect(source.close).toHaveBeenCalledOnce();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    if (action === 'replacement') {
      await f.supply();
      f.jobs[1]!.completion.resolve(f.output());
      await settle();
    }
    f.owner.dispose();
    expect(source.close).toHaveBeenCalledOnce();
    expect(source.release).toHaveBeenCalledOnce();
  }
);

it.each(['source', 'mapping', 'framing', 'renderer'] as const)(
  'ignores a superseded read error before the passive %s request',
  async (change) => {
    const f = fixture();
    f.owner.request();
    await settle();
    const slot = f.read().slot;
    if (slot.mode !== 'image') throw new Error('Fixture must be an image.');
    if (change === 'source') f.set({ sourceKey: 'replacement' });
    else if (change === 'mapping')
      f.set({ slot: { ...slot, image: { ...slot.image, assetId: 'replacement' } } });
    else if (change === 'framing')
      f.set({ slot: { ...slot, image: { ...slot.image, fit: 'cover' } } });
    else f.set({ renderer: 'legacy' });
    f.reads[0]!.reject(new Error('superseded read'));
    await settle();
    expect(f.fail).not.toHaveBeenCalled();
    expect(f.presenter.publish).not.toHaveBeenCalled();
  }
);

it('does not acquire or fail when current sourceKey differs from its fixed admitted media owner', async () => {
  const f = fixture();
  f.set({ sourceKey: 'other-owner' });
  f.owner.request();
  await settle();
  expect(f.media.frame).not.toHaveBeenCalled();
  expect(f.createRenderer).not.toHaveBeenCalled();
  expect(f.presenter.acquire).not.toHaveBeenCalled();
  expect(f.fail).not.toHaveBeenCalled();
});

it.each(['legacy', 'no-snapshot', 'unavailable', 'device-failed'] as const)(
  'uses original lease draw and release for %s fallback',
  async (reason) => {
    const f = fixture();
    if (reason === 'legacy') f.set({ renderer: 'legacy' });
    if (reason === 'no-snapshot') vi.stubGlobal('OffscreenCanvas', class {});
    f.owner.request();
    await settle();
    if (reason === 'unavailable' || reason === 'device-failed') {
      const source = await f.supply();
      f.fallback(reason);
      f.jobs[0]!.completion.resolve(undefined);
      await settle();
      expect(source.close).toHaveBeenCalledOnce();
      expect(source.release).toHaveBeenCalledOnce();
    }
    const lease = await f.supply();
    expect(lease.snapshot).not.toHaveBeenCalled();
    expect(lease.draw).toHaveBeenCalledWith(f.context);
    expect(lease.release).toHaveBeenCalledOnce();
    expect(f.presenter.publish).toHaveBeenLastCalledWith(null, expect.any(Function));
    expect(f.ready).toHaveBeenCalledOnce();
    expect(f.fail).not.toHaveBeenCalled();
    if (reason === 'unavailable' || reason === 'device-failed') {
      f.owner.request();
      await settle();
      await f.supply();
      expect(f.jobs).toHaveLength(1);
    } else expect(f.producer.render).not.toHaveBeenCalled();
  }
);

it.each(['read', 'snapshot', 'gpu', 'draw'] as const)(
  'reports a current %s error and stops without publication',
  async (failure) => {
    const f = fixture();
    if (failure === 'draw') f.set({ renderer: 'legacy' });
    f.owner.request();
    await settle();
    if (failure === 'read') f.reads[0]!.reject(new Error('decode'));
    else {
      const source = f.lease();
      if (failure === 'snapshot')
        source.snapshot.mockImplementation(() => {
          throw new Error('snapshot');
        });
      if (failure === 'draw')
        source.draw.mockImplementation(() => {
          throw new Error('draw');
        });
      f.reads[0]!.resolve(source);
      await settle();
      if (failure === 'gpu') f.jobs[0]!.completion.reject(new Error('gpu'));
      await settle();
      expect(source.release).toHaveBeenCalledOnce();
      if (failure === 'gpu') expect(source.close).toHaveBeenCalledOnce();
    }
    await settle();
    expect(f.fail).toHaveBeenCalledOnce();
    expect(f.ready).not.toHaveBeenCalled();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    expect(f.media.frame).toHaveBeenCalledOnce();
  }
);

it('releases an obsolete source lease without snapshotting or drawing it', async () => {
  const f = fixture();
  f.owner.request();
  await settle();
  f.set({ sourceKey: 'next' });
  const source = await f.supply();
  expect(source.release).toHaveBeenCalledOnce();
  expect(source.snapshot).not.toHaveBeenCalled();
  expect(source.draw).not.toHaveBeenCalled();
  expect(f.producer.render).not.toHaveBeenCalled();
  expect(f.fail).not.toHaveBeenCalled();
});

it.each(['success', 'error'] as const)(
  'ignores GPU %s after source replacement before its passive request',
  async (result) => {
    const f = fixture();
    f.owner.request();
    await settle();
    const source = await f.supply();
    f.set({ sourceKey: 'replacement' });
    const stale = f.output();
    if (result === 'success') f.jobs[0]!.completion.resolve(stale);
    else f.jobs[0]!.completion.reject(new Error('obsolete submission'));
    await settle();
    expect(f.presenter.publish).not.toHaveBeenCalled();
    expect(f.fail).not.toHaveBeenCalled();
    expect(f.ready).not.toHaveBeenCalled();
    if (result === 'success') expect(stale.release).toHaveBeenCalledOnce();
    f.owner.dispose();
    expect(source.close).toHaveBeenCalledOnce();
  }
);

it('closes a detached snapshot if synchronous snapshot work replaces the current source', async () => {
  const f = fixture();
  f.owner.request();
  await settle();
  const source = f.lease();
  source.snapshot.mockImplementation(() => {
    f.set({ sourceKey: 'replacement' });
    return source.bitmap;
  });
  f.reads[0]!.resolve(source);
  await settle();
  expect(source.release).toHaveBeenCalledOnce();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.producer.render).not.toHaveBeenCalled();
  expect(f.fail).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(source.close).toHaveBeenCalledOnce();
});

it('reuses an image snapshot when local time and authored duration change', async () => {
  const f = fixture();
  f.owner.request();
  await settle();
  const source = await f.supply();
  f.jobs[0]!.completion.resolve(f.output());
  await settle();
  const slot = f.read().slot;
  if (slot.mode !== 'image') throw new Error('Fixture must be an image.');
  f.set({ slot: { ...slot, image: { ...slot.image, duration: 5 } }, time: 3 });
  f.owner.request();
  await settle();
  expect(f.media.frame).toHaveBeenCalledOnce();
  expect(source.snapshot).toHaveBeenCalledOnce();
  expect(f.jobs[1]!.input.source).toBe(source.bitmap);
  f.jobs[1]!.completion.resolve(f.output());
  await settle();
  expect(f.ready).toHaveBeenCalledTimes(2);
});
