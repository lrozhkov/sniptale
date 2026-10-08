// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ReviewCutTransitionPreview,
  useReviewCutTransitionProvider,
  ReviewCutBlackout,
  type ReviewCutPreviewBinding,
} from './cut-transition-preview';
import type { ReviewTransitionSample } from '../../workflows/video-review/cut-transition-frames';

const state = vi.hoisted(() => ({
  dispose: vi.fn(),
  sample: vi.fn<() => Promise<ReviewTransitionSample | null>>(),
  right: vi.fn<() => ReviewTransitionSample>(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getPrimaryVideoTrack = async () => ({});
    dispose = state.dispose;
  },
  VideoSampleSink: class {
    getSample = state.sample;
    async *samples() {
      yield state.right();
    }
  },
}));
vi.mock('./controls', () => ({
  ReviewButton: (props: { label: string; onClick(): void }) => (
    <button onClick={props.onClick}>{props.label}</button>
  ),
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const sample = (timestamp: number): ReviewTransitionSample => ({
  timestamp,
  draw: vi.fn(),
  close: vi.fn(),
});
function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.dispose.mockClear();
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const video = createRef<HTMLVideoElement>();
  video.current = document.createElement('video');
  Object.defineProperties(video.current, {
    videoWidth: { value: 100 },
    videoHeight: { value: 60 },
  });
  const callbacks: VideoFrameRequestCallback[] = [];
  video.current.requestVideoFrameCallback = vi.fn((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  video.current.cancelVideoFrameCallback = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  const binding: ReviewCutPreviewBinding = {
    file: new File(['a'], 'a.webm'),
    duration: 6,
    time: 2,
    edits: [
      {
        id: 'cut',
        kind: 'cut' as const,
        start: 2,
        end: 4,
        requestedStart: 2,
        requestedEnd: 4,
        transition: { type: 'dissolve' as const, before: 0.5, after: 0.5 },
      },
    ],
  };
  const onRaster = vi.fn();
  const render = async (file = binding.file) => {
    await act(async () =>
      root.render(
        <ReviewCutTransitionPreview
          binding={{ ...binding, file }}
          onRaster={onRaster}
          video={video}
          style={{ width: 100, height: 60 }}
        />
      )
    );
  };
  cleanup = () => act(() => root.unmount());
  return { host, render, video, callbacks, context, binding, onRaster };
}

it('conceals loading, rejects a stale removed native frame, and releases decoder resources', async () => {
  const left = sample(1.9),
    right = sample(4.1);
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  const view = mount();
  await view.render();
  expect(view.host.querySelector('canvas')).not.toBeNull();
  expect(view.host.querySelector('[role=status]')).toBeNull();
  act(() =>
    view.callbacks.at(-1)!(0, {
      mediaTime: 3,
      presentationTime: 0,
      expectedDisplayTime: 0,
      width: 100,
      height: 60,
      presentedFrames: 1,
      processingDuration: 0,
    })
  );
  expect(view.context.drawImage).not.toHaveBeenCalled();
  expect(right.draw).toHaveBeenCalled();
  cleanup?.();
  cleanup = undefined;
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
  expect(state.dispose).toHaveBeenCalledOnce();
  expect(view.video.current?.cancelVideoFrameCallback).toHaveBeenCalled();
});

it('shows a retryable failure instead of exposing the native frame when no endpoint exists', async () => {
  state.sample.mockResolvedValue(null);
  const view = mount();
  await view.render();
  expect(view.host.querySelector('[role=alert]')).not.toBeNull();
  const left = sample(1.9),
    right = sample(4.1);
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  await act(async () => view.host.querySelector('button')!.click());
  expect(view.host.querySelector('[role=alert]')).toBeNull();
  expect(state.dispose).toHaveBeenCalledOnce();
});

it('does not publish a late frame after the source changes', async () => {
  let resolve!: (value: ReviewTransitionSample) => void;
  const pending = new Promise<ReviewTransitionSample>((done) => {
    resolve = done;
  });
  state.sample.mockReturnValueOnce(pending).mockResolvedValue(sample(1.8));
  state.right.mockReturnValue(sample(4.2));
  const view = mount();
  await view.render();
  expect(view.host.querySelector('[role=status]')).not.toBeNull();
  await view.render(new File(['b'], 'b.webm'));
  const obsolete = sample(1.9);
  await act(async () => resolve(obsolete));
  expect(obsolete.close).toHaveBeenCalledOnce();
  expect(obsolete.draw).not.toHaveBeenCalled();
  expect(view.host.querySelector('[role=status]')).toBeNull();
});

it('never rereads a live video using a timestamp from a previous frame callback', async () => {
  state.sample.mockResolvedValue(sample(1.9));
  state.right.mockReturnValue(sample(4.1));
  const view = mount();
  view.binding.time = 1.7;
  await view.render();
  act(() => view.callbacks.at(-1)!(0, { mediaTime: 1.7 } as VideoFrameCallbackMetadata));
  view.context.drawImage.mockClear();
  // A seek may finish before the next presentation callback. Only the captured
  // raster has the old callback's timestamp; the live video no longer does.
  view.video.current!.currentTime = 3;
  await view.render();
  expect(view.context.drawImage.mock.calls.some(([source]) => source === view.video.current)).toBe(
    false
  );
});

it('does not reuse disposed endpoints after disabling a transition and undoing that change', async () => {
  let closed = false;
  const oldLeft = sample(1.9);
  oldLeft.close = vi.fn(() => {
    closed = true;
  });
  oldLeft.draw = vi.fn(() => {
    if (closed) throw new Error('closed endpoint');
  });
  state.sample.mockResolvedValueOnce(oldLeft).mockResolvedValue(sample(1.8));
  state.right.mockReturnValueOnce(sample(4.1)).mockReturnValue(sample(4.2));
  const view = mount();
  await view.render();
  const original = view.binding.edits;
  view.binding.edits = original.map((edit) => {
    const copy = { ...edit };
    if (copy.kind === 'cut') delete copy.transition;
    return copy;
  });
  await view.render();
  expect(closed).toBe(true);
  view.binding.edits = original;
  await expect(view.render()).resolves.toBeUndefined();
});

it('keeps transition phase on the result clock when a VFR frame began before the window', async () => {
  const left = sample(1.9),
    right = sample(4.1);
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  const view = mount();
  view.binding.time = 1.75;
  await view.render();
  vi.mocked(left.draw).mockClear();
  vi.mocked(right.draw).mockClear();
  act(() => view.callbacks.at(-1)!(0, { mediaTime: 1.4 } as VideoFrameCallbackMetadata));
  expect(left.draw).not.toHaveBeenCalled();
  expect(right.draw).toHaveBeenCalledOnce();
  expect(view.context.globalAlpha).toBe(0.25);
});

it('publishes only the ready cut raster and clears it outside the transition', async () => {
  let resolve!: (value: ReviewTransitionSample) => void;
  state.sample.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  state.right.mockReturnValue(sample(4.1));
  const view = mount();
  await view.render();
  expect(view.onRaster).toHaveBeenLastCalledWith({ active: true, frame: null });
  await act(async () => resolve(sample(1.9)));
  expect(view.onRaster).toHaveBeenLastCalledWith({
    active: true,
    frame: view.host.querySelector('canvas'),
  });
  view.binding.time = 0;
  await view.render();
  expect(view.onRaster).toHaveBeenLastCalledWith({ active: false, frame: null });
});

it('uses the complete output plane for black fade and removes it for dissolve or outside the seam', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  cleanup = () => act(() => root.unmount());
  const render = (type: 'fade-black' | 'dissolve', time: number, color?: string) =>
    act(() =>
      root.render(
        <ReviewCutBlackout
          binding={{
            file: new File([], 'clip.webm'),
            duration: 6,
            time,
            edits: [
              {
                id: 'cut',
                kind: 'cut',
                start: 2,
                end: 4,
                requestedStart: 2,
                requestedEnd: 4,
                transition: { type, before: 0.5, after: 0.5, ...(color ? { color } : {}) },
              },
            ],
          }}
        />
      )
    );
  render('fade-black', 1.75);
  expect(host.firstElementChild?.getAttribute('style')).toContain('opacity: 0.5');
  render('fade-black', 2);
  expect(host.firstElementChild?.getAttribute('style')).toContain('opacity: 1');
  expect(host.firstElementChild?.getAttribute('style')).toContain('background-color: rgb(0, 0, 0)');
  render('fade-black', 2, '#123456');
  expect(host.firstElementChild?.getAttribute('style')).toContain(
    'background-color: rgb(18, 52, 86)'
  );
  render('fade-black', 2.5);
  expect(host.firstElementChild).toBeNull();
  render('dissolve', 2);
  expect(host.firstElementChild).toBeNull();
});

function mountProvider(
  managed = false,
  admit?: (bytes: readonly [number, number]) => { release(): void }
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.dispose.mockClear();
  const root = createRoot(document.createElement('div'));
  const binding: ReviewCutPreviewBinding = {
    file: new File(['provider'], 'provider.webm'),
    duration: 6,
    time: 1.75,
    edits: [
      {
        id: 'cut',
        kind: 'cut',
        start: 2,
        end: 4,
        requestedStart: 2,
        requestedEnd: 4,
        transition: { type: 'dissolve', before: 0.5, after: 0.5 },
      },
    ],
  };
  let provider!: ReturnType<typeof useReviewCutTransitionProvider>;
  function Harness(props: {
    binding: ReviewCutPreviewBinding | undefined;
    duringRender?: () => void;
  }) {
    provider = useReviewCutTransitionProvider(props.binding, managed, admit);
    props.duringRender?.();
    return null;
  }
  const render = async (value: ReviewCutPreviewBinding | undefined, duringRender?: () => void) => {
    await act(async () =>
      root.render(<Harness binding={value} {...(duringRender ? { duringRender } : {})} />)
    );
  };
  cleanup = () => act(() => root.unmount());
  return {
    binding,
    render,
    get provider() {
      return provider;
    },
  };
}

it('provides result-clock endpoints without creating hybrid canvases or requesting native frames', async () => {
  state.sample.mockResolvedValue(sample(1.9));
  state.right.mockReturnValue(sample(4.1));
  const view = mountProvider();
  const create = vi.spyOn(document, 'createElement');
  await view.render(view.binding);
  expect(create).not.toHaveBeenCalled();
  expect(view.provider.read(0)).toBeNull();
  const result = view.provider.read(1.75)!;
  expect(result.frames).not.toBeNull();
  expect(result.lease?.active).toBe(true);
  expect(result.blend.incoming).toBe(0.25);
  expect(view.provider.read(2.25)!.blend.incoming).toBe(0.75);
  const lease = result.lease!;
  await view.render(undefined);
  expect(lease.active).toBe(false);
  expect(view.provider.read(1.75)).toBeNull();
  expect(state.dispose).toHaveBeenCalledOnce();
});

it('rejects obsolete endpoint reads during replacement render before effect cleanup', async () => {
  const left = sample(1.9);
  state.sample.mockResolvedValueOnce(left).mockResolvedValue(sample(1.8));
  state.right.mockReturnValue(sample(4.1));
  const view = mountProvider();
  await view.render(view.binding);
  const read = view.provider.read;
  const lease = read(1.75)!.lease!;
  let inspected = false;
  await view.render(
    { ...view.binding, file: new File(['replacement'], 'replacement.webm') },
    () => {
      if (inspected) return;
      inspected = true;
      expect(lease.active).toBe(true);
      expect(read(1.75)!.frames).toBeNull();
    }
  );
  expect(inspected).toBe(true);
  expect(lease.active).toBe(false);
  expect(left.close).toHaveBeenCalledOnce();
  expect(read(1.75)!.frames).not.toBeNull();
  await view.render(undefined, () => expect(read(1.75)).toBeNull());
});

it('keeps failed provider acquisition retryable and closes a late disabled endpoint', async () => {
  state.sample.mockResolvedValue(null);
  const view = mountProvider();
  await view.render(view.binding);
  expect(view.provider.read(1.75)).toMatchObject({ frames: null, failed: true });
  let resolve!: (value: ReviewTransitionSample) => void;
  state.sample.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  await act(async () => view.provider.retry());
  expect(view.provider.read(1.75)).toMatchObject({ frames: null, failed: false });
  await view.render(undefined);
  const late = sample(1.9);
  await act(async () => resolve(late));
  expect(late.close).toHaveBeenCalledOnce();
  expect(view.provider.read(1.75)).toBeNull();
});

it('requires actual endpoint allocation metadata before managed publication', async () => {
  const left = sample(1.9),
    right = sample(4.1);
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  const view = mountProvider(true);
  await view.render(view.binding);
  expect(view.provider.read(1.75)).toMatchObject({
    frames: null,
    failed: true,
    allocationBytes: null,
  });
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
  const validLeft = { ...sample(1.9), allocationSize: () => 300 };
  const validRight = { ...sample(4.1), allocationSize: () => 400 };
  state.sample.mockResolvedValue(validLeft);
  state.right.mockReturnValue(validRight);
  await act(async () => view.provider.retry());
  expect(view.provider.read(1.75)).toMatchObject({
    frames: { left: validLeft, right: validRight },
    failed: false,
    allocationBytes: [300, 400],
  });
});

it('retains prefetched endpoints until their decoder owner closes them', async () => {
  const events: string[] = [];
  const left = {
    ...sample(1.9),
    allocationSize: () => 300,
    close: vi.fn(() => events.push('left closed')),
  };
  const right = {
    ...sample(4.1),
    allocationSize: () => 400,
    close: vi.fn(() => events.push('right closed')),
  };
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  const release = vi.fn(() => events.push('released'));
  const admit = vi.fn(() => ({ release }));
  const view = mountProvider(true, admit);
  view.binding.time = 0;
  await view.render(view.binding);
  expect(view.provider.read(0)).toBeNull();
  expect(view.provider.current?.allocationBytes).toEqual([300, 400]);
  expect(admit).toHaveBeenCalledExactlyOnceWith([300, 400]);
  expect(release).not.toHaveBeenCalled();
  await view.render({ ...view.binding, time: 1.75 });
  expect(view.provider.read(1.75)!.frames).toEqual({ left, right });
  expect(admit).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  await view.render(undefined);
  expect(events).toEqual(['left closed', 'right closed', 'released']);
  expect(release).toHaveBeenCalledOnce();
});

it('closes a decoded managed pair on reservation refusal without publishing it', async () => {
  const left = { ...sample(1.9), allocationSize: () => 300 };
  const right = { ...sample(4.1), allocationSize: () => 400 };
  state.sample.mockResolvedValue(left);
  state.right.mockReturnValue(right);
  const view = mountProvider(true, () => {
    throw new Error('Allocation refused');
  });
  await view.render(view.binding);
  expect(view.provider.read(1.75)).toMatchObject({ frames: null, failed: true });
  expect(left.close).toHaveBeenCalledOnce();
  expect(right.close).toHaveBeenCalledOnce();
});

it('releases endpoint reservations on source replacement and unmount', async () => {
  state.sample.mockImplementation(async () => ({ ...sample(1.9), allocationSize: () => 300 }));
  state.right.mockImplementation(() => ({ ...sample(4.1), allocationSize: () => 400 }));
  const events: string[] = [];
  const admit = vi.fn(() => {
    events.push('admit');
    return { release: () => events.push('release') };
  });
  const view = mountProvider(true, admit);
  await view.render(view.binding);
  await view.render({ ...view.binding, file: new File(['other'], 'other.webm') });
  expect(events).toEqual(['admit', 'release', 'admit']);
  cleanup?.();
  cleanup = undefined;
  expect(events).toEqual(['admit', 'release', 'admit', 'release']);
});
