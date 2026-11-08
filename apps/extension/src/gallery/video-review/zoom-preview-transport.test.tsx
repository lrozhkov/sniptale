// @vitest-environment jsdom
import * as canvasModule from './zoom-preview-canvas';
import * as blurModule from './motion-blur-preview';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomPreview } from './zoom-preview';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const background = createQuickEditAdvancedState().background;
const region = (): QuickEditZoomRegion => ({
  id: 'zoom-1',
  start: 2,
  end: 4,
  transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
});
const frame = { image: document.createElement('canvas'), width: 640, height: 360 };
const pointer = (canvas: HTMLCanvasElement, kind: string, x: number, y = 0) =>
  act(async () => {
    canvas.dispatchEvent(
      new MouseEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0 })
    );
  });

it('paints live transport, then restores the target and cancels animation on stop or unmount', async () => {
  const drawImage = vi.fn();
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    drawImage,
    restore: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const requests = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    requests.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => requests.delete(id));
  const onChange = vi.fn();
  const onInteract = vi.fn();
  const video = document.createElement('video');
  const normalized = { format: 'RGBA', close: vi.fn() };
  vi.stubGlobal(
    'VideoFrame',
    vi.fn(function () {
      return normalized;
    })
  );
  const loadFrame = vi.fn(async () => frame);
  const render = (scale?: number) =>
    act(async () =>
      root.render(
        <ReviewZoomPreview
          region={region()}
          background={{ ...background, enabled: false }}
          source={{ width: 640, height: 360 }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={onChange}
          onInteract={onInteract}
          playback={scale ? { video, camera: { scale, centerX: 0.5, centerY: 0.5 } } : undefined}
        />
      )
    );
  await render(1);
  expect(drawImage).toHaveBeenLastCalledWith(normalized, 0, 0, 480, 270);
  const area = () => host.querySelector<HTMLElement>('[data-focus-frame]')!;
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(100);
  const [id, tick] = [...requests.entries()][0]!;
  requests.delete(id);
  drawImage.mockClear();
  await act(async () => tick(16));
  expect(drawImage).toHaveBeenCalledWith(normalized, 0, 0, 480, 270);
  await render(1.5);
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(100 / 1.5);
  await pointer(host.querySelector('canvas')!, 'pointerdown', 20, 20);
  expect(onInteract).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  await render();
  expect(Number.parseFloat(area().style.width)).toBeCloseTo(50);
  expect(drawImage).toHaveBeenLastCalledWith(frame.image, 0, 0, 480, 270);
  drawImage.mockClear();
  await act(async () => {
    const pending = [...requests.entries()];
    for (const [id, callback] of pending) {
      requests.delete(id);
      callback(32);
    }
  });
  expect(drawImage).not.toHaveBeenCalled();
  expect(requests.size).toBe(0);
  expect(loadFrame).toHaveBeenCalledTimes(1);
  await render(1);
  await act(async () => root.render(null));
  expect(requests.size).toBe(0);
});

it('keeps auxiliary fallback pixels paired with the accepted live camera snapshot', async () => {
  const image = document.createElement('canvas');
  image.width = 640;
  image.height = 360;
  const paint = vi.spyOn(canvasModule, 'ZoomPreviewCanvas').mockImplementation(() => <canvas />);
  const blur = vi.spyOn(blurModule, 'ReviewMotionBlurPreview').mockImplementation(() => null);
  const video = document.createElement('video');
  video.currentTime = 99;
  const selected = region();
  const loadFrame = vi.fn(async () => frame);
  const show = (time: number, sceneTime: number, scale: number) =>
    act(async () =>
      root.render(
        <ReviewZoomPreview
          region={selected}
          background={{ ...background, enabled: false }}
          source={{ width: 640, height: 360 }}
          sourceTime={3}
          loadFrame={loadFrame}
          onChange={vi.fn()}
          focus={{ regions: [selected], time: sceneTime }}
          playback={{
            video,
            camera: { scale, centerX: 0.5, centerY: 0.5 },
            source: { url: 'blob:frozen', time, seekRevision: 0, segmentStart: 0 },
          }}
        />
      )
    );
  await show(0.5, 2, 2);
  const queued = paint.mock.lastCall![0];
  await act(async () => {
    queued.onPresented?.({ ...queued, frame: { image, width: 640, height: 360 } });
    queued.onPaintReady?.(true);
  });
  expect(blur.mock.lastCall![0].getFrame()).toBe(image);
  expect(blur.mock.lastCall![0].camera.scale).toBe(2);
  expect(blur.mock.lastCall![0].focus?.time).toBe(2);
  await show(0.6, 2.1, 3);
  expect(blur.mock.lastCall![0].getFrame()).toBe(image);
  expect(blur.mock.lastCall![0].camera.scale).toBe(2);
  expect(blur.mock.lastCall![0].focus?.time).toBe(2);
  expect(video.currentTime).toBe(99);
});
