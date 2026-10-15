// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';

const paint = vi.hoisted(() => vi.fn());
vi.mock('../../workflows/video-review/scene-frame', () => ({ drawReviewSceneFrame: paint }));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  paint.mockClear();
});

it('paints the current raster only during enabled motion and leaves pending cut frames uncovered', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  cleanup = () => act(() => root.unmount());
  const region: QuickEditZoomRegion = {
    id: 'zoom',
    start: 0,
    end: 4,
    transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'linear', duration: 1 },
    exit: { type: 'linear', duration: 1 },
    motionBlur: { enter: { enabled: true, strength: 0.5 } },
  };
  const raster = document.createElement('canvas');
  const render = (time: number, frame: CanvasImageSource | null, cameraOverride = false) => {
    const camera = cameraOverride
      ? region.transform
      : evaluateQuickEditCameraAtTime([region], time);
    const output = { width: 320, height: 180 };
    const background = { enabled: false } as const;
    act(() =>
      root.render(
        <ReviewMotionBlurPreview
          focus={{ regions: [region], time }}
          camera={camera}
          layout={computeQuickEditSceneLayout({ output, source: output, background, camera })}
          output={output}
          background={background}
          sceneScale={1}
          getFrame={() => frame}
        />
      )
    );
  };
  render(0.5, null);
  expect(host.querySelector('canvas')?.style.visibility).toBe('hidden');
  expect(paint).not.toHaveBeenCalled();
  render(0.5, raster);
  expect(host.querySelector('canvas')?.style.visibility).toBe('visible');
  const drawImage = vi.fn();
  paint.mock.calls.at(-1)![1].sample.draw({ drawImage }, 1, 2, 3, 4);
  expect(drawImage).toHaveBeenCalledWith(raster, 1, 2, 3, 4);
  expect(paint.mock.calls.at(-1)![1].motionBlur).toHaveLength(5);
  for (const [time, override] of [
    [2, false],
    [3.5, false],
    [0.5, true],
  ] as const) {
    render(time, raster, override);
    expect(host.querySelector('canvas')).toBeNull();
  }
});

it('rejects a late background image and repaints when the native video becomes ready', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  cleanup = () => act(() => root.unmount());
  const video = document.createElement('video');
  let readyState = 0;
  Object.defineProperty(video, 'readyState', { get: () => readyState });
  const region: QuickEditZoomRegion = {
    id: 'zoom',
    start: 0,
    end: 4,
    transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'linear', duration: 1 },
    exit: { type: 'linear', duration: 1 },
    motionBlur: { enter: { enabled: true, strength: 0.5 } },
  };
  const camera = evaluateQuickEditCameraAtTime([region], 0.5);
  const output = { width: 320, height: 180 };
  const background = {
    enabled: true,
    type: 'image',
    assetId: 'background',
    imageFit: 'cover',
    layout: { padding: 10, cornerRadius: 8 },
  } as const;
  const render = (imageUrl: string) =>
    act(() =>
      root.render(
        <ReviewMotionBlurPreview
          focus={{ regions: [region], time: 0.5 }}
          camera={camera}
          layout={computeQuickEditSceneLayout({ output, source: output, background, camera })}
          output={output}
          background={background}
          imageUrl={imageUrl}
          sceneScale={0.5}
          getFrame={() => video}
        />
      )
    );
  render('blob:old');
  const stale = images[0]!.onload!;
  render('blob:new');
  act(() => stale.call(images[0]!, new Event('load')));
  expect(paint).not.toHaveBeenCalled();
  act(() => images[1]!.dispatchEvent(new Event('load')));
  expect(paint).not.toHaveBeenCalled();
  readyState = 2;
  act(() => video.dispatchEvent(new Event('loadeddata')));
  expect(paint.mock.calls.at(-1)![1].image).toBe(images[1]);
  expect(paint.mock.calls.at(-1)![1].background.layout.cornerRadius).toBe(4);
  expect(host.querySelector('canvas')?.style.visibility).toBe('visible');
  cleanup();
  cleanup = undefined;
  paint.mockClear();
  video.dispatchEvent(new Event('seeked'));
  expect(paint).not.toHaveBeenCalled();
});
