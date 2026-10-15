import { createReviewPreviewRenderer } from '../../../../apps/extension/src/workflows/video-review/render-preview';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import { resolvePreviewRenderAllocation } from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/workflows/video-review/spatial-renderer';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
  reviewWindowRasterBacking,
} from '../../../../apps/extension/src/workflows/video-review/window-header';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/click-animation';
import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { reviewCutTransitionAt } from '../../../../apps/extension/src/features/video/review/cuts';
import {
  paintReviewCutDissolve,
  reviewCutTransitionSides,
} from '../../../../apps/extension/src/workflows/video-review/cut-transition-frames';

type Scene = Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0];
type Frame = Parameters<ReturnType<typeof createReviewPreviewRenderer>['render']>[1];
const sourceSize = { width: 640, height: 360 };
function canvas(size: { width: number; height: number }) {
  return Object.assign(document.createElement('canvas'), size);
}
function source(color: string, timestamp: number) {
  const surface = canvas(sourceSize),
    context = surface.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, surface.width, surface.height);
  for (let x = 0; x < surface.width; x += 3) {
    context.fillStyle = x % 2 ? '#ffe200' : '#0022ff';
    context.fillRect(x, 0, 1, surface.height);
  }
  return {
    surface,
    timestamp,
    backing: sourceSize,
    close() {},
    draw: (target: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) =>
      target.drawImage(surface, x, y, width, height),
  };
}
function difference(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const left = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const right = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  let maximum = 0,
    changed = 0;
  for (let i = 0; i < left.length; i++) {
    const delta = Math.abs(left[i]! - right[i]!);
    maximum = Math.max(maximum, delta);
    if (delta) changed++;
  }
  return { maximum, changed };
}

/** Independent composition consumes the original source and one borrowed joined raster. */
async function reference(scene: Scene, frame: Frame, backing: { width: number; height: number }) {
  const output = canvas(backing),
    context = output.getContext('2d', { alpha: false })!;
  const identity = computeQuickEditSceneLayout({
    source: scene.source,
    output: backing,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const joined = reviewWindowRasterBacking({
    windowRect: identity.windowRect,
    sourceWidth: scene.source.width,
    magnify: true,
  });
  const header = scene.windowHeader
    ? await loadReviewWindowHeader(
        reviewWindowHeaderUrl(scene.windowHeader, sourceSize.width, sourceSize.height),
        new AbortController().signal,
        {
          backing: {
            width: joined.width,
            height: Math.max(
              1,
              Math.ceil(
                ((identity.videoRect.y - identity.windowRect.y) * joined.width) /
                  identity.windowRect.width
              )
            ),
          },
        }
      )
    : null;
  const spatial = scene.zoomRegions.some((region) => region.perspective?.enabled)
    ? createReviewSpatialRenderer()
    : undefined;
  const paint = (
    target: CanvasRenderingContext2D,
    surface: HTMLCanvasElement,
    sample: Frame['source'],
    resultTime: number
  ) => {
    const camera = evaluateQuickEditCameraAtTime(scene.zoomRegions, resultTime);
    const layout = computeQuickEditSceneLayout({
      source: scene.source,
      output: surface,
      background: scene.background,
      windowHeader: scene.windowHeader,
      camera,
    });
    const sceneFrame = {
      canvas: surface,
      layout,
      background: scene.background,
      image: null,
      headerImage: header,
      sample,
    };
    drawReviewSceneFrame(target, {
      ...sceneFrame,
      deferComments: true,
      spatialRenderer: spatial,
      windowRasterBacking: reviewWindowRasterBacking({
        windowRect: layout.windowRect,
        sourceWidth: scene.source.width,
        magnify: true,
      }),
      drawOverlays: (windowRaster) =>
        drawReviewSceneOverlays({
          scene: sceneFrame,
          context: target,
          canvas: surface,
          renderer: spatial,
          regions: scene.zoomRegions,
          globalResultTime: resultTime,
          cameraScale: camera.scale,
          sourceWidth: sourceSize.width,
          clicks: scene.clicks,
          spotlightScratch: null,
          windowRaster,
        }),
    });
  };
  try {
    if (frame.transition) {
      const scratch = canvas(backing),
        scratchContext = scratch.getContext('2d')!;
      const { blend, frames, resultOffset } = frame.transition;
      const sides = reviewCutTransitionSides(
        blend,
        frames,
        frame.source,
        frame.resultTime,
        resultOffset
      );
      paintReviewCutDissolve(
        context,
        { canvas: scratch, context: scratchContext },
        blend.incoming,
        (target, surface, index) =>
          paint(
            target,
            surface,
            { ...sides[index].sample, backing: sourceSize },
            sides[index].resultTime
          ),
        output
      );
      scratch.width = scratch.height = 0;
    } else paint(context, output, frame.source, frame.resultTime);
    return output;
  } finally {
    header?.close();
    spatial?.dispose();
  }
}

/** Actual managed pixels/limits cover flat, reduced, spatial, global fragment dissolve and header-off. */
export async function probe() {
  const left = source('#ff3300', 0.95),
    right = source('#00dd66', 2.05);
  const results = [];
  try {
    for (const mode of ['flat', 'reduced', 'spatial', 'fragment-dissolve', 'header-off'] as const) {
      const backing = mode === 'flat' ? sourceSize : { width: 320, height: 180 };
      const time = mode === 'fragment-dissolve' ? 5.25 : 1.25;
      const scene: Scene = {
        source: sourceSize,
        background: { enabled: false },
        comments: [],
        keys: [],
        zoomRegions:
          mode === 'spatial'
            ? [
                {
                  ...createQuickEditZoomRegion({ id: 'tilt', at: 0, duration: 8, endMax: 8 }),
                  enter: { type: 'none', duration: 0 },
                  exit: { type: 'none', duration: 0 },
                  perspective: {
                    enabled: true,
                    rotateX: 12,
                    rotateY: -18,
                    rotateZ: 5,
                    strength: 0.7,
                  },
                },
              ]
            : [],
        ...(mode === 'header-off'
          ? {}
          : { windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser', title: '' } }),
        clicks: [
          {
            settings: {
              ...REVIEW_CLICK_DEFAULT,
              effect: 'magnify',
              magnification: 2,
              radius: 120,
              color: '#00000000',
              lensShadow: 0,
            },
            point: { x: 0.5, y: 0.025 },
            anchor: time,
            start: time - 1,
            end: time + 1,
          },
        ],
      };
      const blend =
        mode === 'fragment-dissolve'
          ? reviewCutTransitionAt(1.25, [
              {
                id: 'cut',
                type: 'dissolve',
                seam: 1.5,
                before: 0.5,
                after: 0.5,
                left: { start: 0, end: 1 },
                right: { start: 2, end: 3 },
              },
            ])
          : null;
      const frame: Frame = {
        generation: 1,
        resultTime: time,
        sourceTime: 0.95,
        source: left,
        ...(blend ? { transition: { blend, frames: { left, right }, resultOffset: 4 } } : {}),
      };
      const resources = createPreviewRenderResources({
        maximumManagedBytes: 1,
        maximumCanvases: 1,
      });
      const limits: { maximumManagedBytes: number; maximumCanvases: number }[] = [];
      let assets: Parameters<typeof resolvePreviewRenderAllocation>[0]['assets'] = {
        backgroundBitmap: null,
        headerBitmap: null,
        watermark: null,
        previousWatermarkCache: null,
      };
      const renderer = createReviewPreviewRenderer({
        resources,
        allocation: {
          describe: () =>
            resolvePreviewRenderAllocation({
              scene,
              dimensions: { canonical: sourceSize, backing },
              resultTime: time,
              sourceTime: 0.95,
              sourceAllocationBytes: null,
              sourceBacking: sourceSize,
              camera: { retainedBytes: null, activeBytes: null },
              transitionBytes: blend ? [640 * 360 * 4, 640 * 360 * 4] : null,
              previousFront: null,
              assets,
            }),
          replaceLimits: (limit) => {
            resources.replaceLimits(limit);
            limits.push(limit);
          },
        },
      });
      try {
        const prepared = await renderer.prepare(
          scene,
          { canonical: sourceSize, backing },
          new AbortController().signal
        );
        assets = prepared.allocationAssets;
        const actual = await renderer.render(prepared, frame),
          expected = await reference(scene, frame, backing);
        const parity = difference(actual.canvas, expected);
        const counters = resources.counters;
        const row = document.createElement('div');
        row.textContent = mode;
        for (const surface of [actual.canvas, expected]) {
          const copy = canvas(backing);
          copy.getContext('2d')!.drawImage(surface, 0, 0);
          row.append(copy);
        }
        document.body.append(row);
        actual.release();
        prepared.release();
        expected.width = expected.height = 0;
        renderer.dispose();
        resources.dispose();
        results.push({
          mode,
          parity,
          headerWidth: assets.headerBitmap?.width ?? null,
          peak: counters.peakManagedBytes,
          budget: Math.max(...limits.map((limit) => limit.maximumManagedBytes)),
          remaining: resources.counters.managedBytes,
        });
      } finally {
        renderer.dispose();
        resources.dispose();
      }
    }
    return results;
  } finally {
    left.surface.width = left.surface.height = right.surface.width = right.surface.height = 0;
  }
}
