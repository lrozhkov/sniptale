// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewStageGeometry, resolveReviewClickRaster } from './stage-geometry';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  quickEditSpatialTargetCamera,
} from '../../features/video/review/advanced/spatial';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import { computeQuickEditWindowTransform } from '../../features/video/review/advanced/scene';
import {
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from '../../features/video/review/advanced/spatial-geometry';

let host: HTMLDivElement;
let root: Root;
let viewport: { width: number; height: number };
let resize: () => void;
let observed: ReturnType<typeof useReviewStageGeometry>;
const disconnect = vi.fn();
const source = { duration: 4, width: 1921, height: 1081, mimeType: 'video/webm', size: 5 };
const camera = { scale: 1, centerX: 0.5, centerY: 0.5 };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  viewport = { width: 800, height: 450 };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => viewport.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewport.height);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function Probe(props: Parameters<typeof useReviewStageGeometry>[0]) {
  const target = useRef<HTMLDivElement>(null);
  const geometry = useReviewStageGeometry(props, target);
  useEffect(() => {
    observed = geometry;
  }, [geometry]);
  return <div ref={target} />;
}
async function render(props: Parameters<typeof useReviewStageGeometry>[0]) {
  await act(async () => root.render(<Probe {...props} />));
}
it('keeps canonical even source output independent of viewport resizing', async () => {
  await render({ source });
  expect(observed.watermarkOutput).toEqual({ width: 1920, height: 1080 });
  expect(observed.size.width).toBeLessThanOrEqual(800);
  expect(observed.size.height).toBe(450);
  viewport = { width: 400, height: 225 };
  act(() => resize());
  expect(observed.size.width).toBeLessThanOrEqual(400);
  expect(observed.size.height).toBe(225);
  expect(observed.watermarkOutput).toEqual({ width: 1920, height: 1080 });
  await act(async () => root.render(null));
  expect(disconnect).toHaveBeenCalledOnce();
});
it('uses full scene canvas for watermark pixels while reporting fitted drawing geometry', async () => {
  const onGeometry = vi.fn();
  await render({
    source,
    scene: { background: { enabled: false }, camera, canvas: { width: 1001, height: 777 } },
    comments: { onGeometry },
  });
  expect(observed.watermarkOutput).toEqual({ width: 1000, height: 776 });
  expect(observed.size.height).toBe(450);
  expect(observed.size.width).toBeLessThan(800);
  expect(onGeometry).toHaveBeenLastCalledWith({
    output: observed.size,
    projection: undefined,
    videoTransform: observed.sceneLayout!.videoTransform,
  });
  viewport = { width: 300, height: 200 };
  act(() => resize());
  expect(observed.watermarkOutput).toEqual({ width: 1000, height: 776 });
  expect(onGeometry).toHaveBeenLastCalledWith({
    output: observed.size,
    projection: undefined,
    videoTransform: observed.sceneLayout!.videoTransform,
  });
  expect(observed.size.height).toBe(200);
});

it.each([
  ['window', false, 1],
  ['window', true, 1],
  ['window', true, 0.35],
  ['follow-video', true, 0.5],
  ['fixed', false, 1],
  ['content', true, 1],
  ['none', false, 1],
  ['none', true, 0.35],
] as const)(
  'keeps click raster and represented plane aligned for %s header=%s motion=%s',
  async (mode, header, motion) => {
    const background: QuickEditBackgroundSettings =
      mode === 'none'
        ? { enabled: false }
        : {
            enabled: true,
            type: 'solid',
            color: '#888888',
            layout: { padding: 12, cornerRadius: 12 },
            zoomBehavior: mode,
          };
    const region = {
      ...createQuickEditZoomRegion({ id: 'r', at: 0, duration: 2, endMax: 4 }),
      transform: { scale: 2.3, centerX: 0.5, centerY: 0.5 },
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: -60 },
    };
    const target = quickEditSpatialTargetCamera(region);
    await render({
      source,
      scene: {
        background,
        windowHeader: header ? DEFAULT_WINDOW_HEADER : undefined,
        camera: { ...target, spatial: { ...target.spatial!, windowMotion: motion } },
      },
    });
    const raster = resolveReviewClickRaster(
      observed.sceneLayout!,
      background,
      observed.overlayClip!
    );
    const represented = observed.sceneLayout!.videoTransform;
    const transform = raster.transform!;
    // All four source edges reconstruct the displayed video; header changes the base plane only.
    for (const point of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]) {
      expect(
        transform.x + transform.scale * (raster.video.x + point.x * raster.video.width)
      ).toBeCloseTo(represented.x + point.x * represented.width);
      expect(
        transform.y + transform.scale * (raster.video.y + point.y * raster.video.height)
      ).toBeCloseTo(represented.y + point.y * represented.height);
    }
    expect(raster.clip.rect).toEqual(observed.sceneLayout!.windowRect);
    expect(raster.clip.radius * transform.scale).toBeCloseTo(observed.overlayClip!.radius);
    expect(transform.x + transform.scale * raster.clip.rect.x).toBeCloseTo(
      observed.overlayClip!.rect.x
    );
    expect(transform.y + transform.scale * raster.clip.rect.y).toBeCloseTo(
      observed.overlayClip!.rect.y
    );
    if (mode === 'content') expect(transform.scale).toBe(1);
    if (mode === 'window' && !header && motion === 1) {
      const point = {
        x: represented.x + represented.width * 0.1,
        y: represented.y + represented.height * 0.5,
      };
      expect(point.x).toBeLessThan(0);
      const projected = projectQuickEditPoint(
        quickEditPlaneProjection(
          observed.overlayClip!.rect,
          observed.overlayClip!.rect,
          observed.sceneLayout!.spatial!
        ),
        point
      );
      expect(projected).not.toBeNull();
      if (!projected) throw new Error('Expected the represented video point on the canvas');
      expect(projected.x).toBeGreaterThan(0);
      expect(projected.x).toBeLessThan(observed.size.width);
      expect(raster.video.x + raster.video.width * 0.1).toBeGreaterThan(0);
    }
  }
);

it('keeps flat click clipping unchanged and removes spatial mapping after its endpoint', async () => {
  const background: QuickEditBackgroundSettings = {
    enabled: true,
    type: 'solid',
    color: '#888888',
    layout: { padding: 12, cornerRadius: 12 },
    zoomBehavior: 'content',
  };
  await render({
    source,
    scene: { background, camera: { scale: 2.3, centerX: 0.5, centerY: 0.5 } },
  });
  expect(
    resolveReviewClickRaster(observed.sceneLayout!, background, observed.overlayClip!)
  ).toEqual({
    video: observed.sceneLayout!.videoTransform,
    clip: observed.overlayClip,
    transform: undefined,
    window: {
      videoRect: observed.sceneLayout!.videoRect,
      windowRect: observed.sceneLayout!.windowRect,
      transform: computeQuickEditWindowTransform(observed.sceneLayout!),
    },
  });
  await render({ source });
  expect(observed.overlayClip).toBeUndefined();
});

it('keeps annotation attachment planes canonical while CSS fit changes and consumes the supplied camera', async () => {
  const actual = { scale: 2, centerX: 0.6, centerY: 0.4 };
  await render({ source, scene: { background: { enabled: false }, camera: actual } });
  const before = observed.annotationGeometry;
  expect(before?.content).toEqual({ width: source.width, height: source.height });
  expect(before?.viewport).toEqual(observed.watermarkOutput);
  expect(before?.contentToViewport[0]).toBeCloseTo((1920 * 2) / source.width);
  viewport = { width: 533, height: 241 };
  act(() => resize());
  expect(observed.annotationGeometry).toEqual(before);
  expect(observed.size.width).toBeLessThanOrEqual(533);
  await render({ source, scene: { background: { enabled: false }, camera } });
  expect(observed.annotationGeometry?.contentToViewport).not.toEqual(before?.contentToViewport);
});
