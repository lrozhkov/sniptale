// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewCutTransitionPreview, type ReviewCutPreviewBinding } from './cut-transition-preview';
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
  const render = async (file = binding.file) => {
    await act(async () =>
      root.render(
        <ReviewCutTransitionPreview
          binding={{ ...binding, file }}
          video={video}
          style={{ width: 100, height: 60 }}
        />
      )
    );
  };
  cleanup = () => act(() => root.unmount());
  return { host, render, video, callbacks, context, binding };
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
