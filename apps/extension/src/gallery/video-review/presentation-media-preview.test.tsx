// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ReviewPresentationMediaPreview } from './presentation-media-preview';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
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
  expect(frame).toHaveBeenCalledWith({
    kind: 'video',
    assetId: 'project-asset:video',
    range: { start: 2, end: 2 },
    holdLast: false,
  });
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
  expect(frame).toHaveBeenLastCalledWith({
    kind: 'video',
    assetId: 'project-asset:video',
    range: { start: 8, end: 8 },
    holdLast: true,
  });
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
  expect(frame).toHaveBeenLastCalledWith({
    kind: 'video',
    assetId: 'project-asset:video',
    range: { start: 5, end: 5 },
    holdLast: false,
  });
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
  expect(frame).toHaveBeenCalledWith({ kind: 'image', assetId: 'project-asset:image' });
  expect(host.querySelector('input')).toBeNull();
});

it('does not read an attached asset until its publication settles', async () => {
  await render(true);
  expect(mocks.create).not.toHaveBeenCalled();
  await render(false);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledOnce();
});
