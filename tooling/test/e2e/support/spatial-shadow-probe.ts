import { calculatePreviewRenderAllocation } from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import { reviewSpatialSourceRect } from '../../../../apps/extension/src/workflows/video-review/scene-shadow';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/spatial-renderer';
import { drawReviewSceneShadow } from '../../../../apps/extension/src/workflows/video-review/scene-shadow';
import { computeQuickEditSceneLayout } from '../../../../apps/extension/src/features/video/review/advanced/scene';

/** Independent oversized Canvas2D rotation exposes the former source-raster edge. */
export function probeSpatialShadowEdge() {
  const width = 641,
    height = 401,
    angle = (25 * Math.PI) / 180;
  const background = {
    enabled: true,
    type: 'solid',
    color: '#ffffffff',
    zoomBehavior: 'fixed',
    layout: { padding: 4, cornerRadius: 12, shadow: { intensity: 80, color: '#000000ff' } },
  } as const;
  const frame = {
    rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const,
    perspective: 1,
    windowMotion: 1,
    lockBackground: true,
    focus: [],
  };
  const layout = computeQuickEditSceneLayout({
    source: { width, height },
    output: { width, height },
    background,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5, spatial: frame },
  });
  const make = (w: number, h: number) =>
    Object.assign(document.createElement('canvas'), { width: w, height: h });
  const actual = make(width, height),
    reference = make(width, height);
  const context = actual.getContext('2d')!,
    target = reference.getContext('2d')!;
  const renderer = createReviewSpatialRenderer();
  try {
    drawReviewSceneFrame(context, {
      canvas: actual,
      layout,
      background,
      image: null,
      spatialRenderer: renderer,
      sample: {
        draw(ctx, x, y, w, h) {
          ctx.fillStyle = '#3366cc';
          ctx.fillRect(x, y, w, h);
        },
      },
    });
    const margin = 300,
      plane = make(width + margin * 2, height + margin * 2);
    const source = plane.getContext('2d')!;
    source.translate(margin, margin);
    drawReviewSceneShadow(source, background, layout.windowRect, 12);
    source.fillStyle = '#3366cc';
    source.beginPath();
    source.roundRect(
      layout.windowRect.x,
      layout.windowRect.y,
      layout.windowRect.width,
      layout.windowRect.height,
      12
    );
    source.fill();
    target.fillStyle = '#fff';
    target.fillRect(0, 0, width, height);
    const cx = layout.windowRect.x + layout.windowRect.width / 2;
    const cy = layout.windowRect.y + layout.windowRect.height / 2;
    target.translate(cx, cy);
    target.rotate(angle);
    target.translate(-cx, -cy);
    target.drawImage(plane, -margin, -margin);
    const left = context.getImageData(0, 0, width, height).data;
    const right = target.getImageData(0, 0, width, height).data;
    let maximum = 0,
      error = 0,
      count = 0,
      minimumReference = 255;
    const profiles: number[][] = [];
    for (const sourceY of [180, 200, 220, 240]) {
      const profile: number[] = [];
      for (let sourceX = -14; sourceX <= 0; sourceX++) {
        const x = Math.round(
          cx + Math.cos(angle) * (sourceX - cx) - Math.sin(angle) * (sourceY - cy)
        );
        const y = Math.round(
          cy + Math.sin(angle) * (sourceX - cx) + Math.cos(angle) * (sourceY - cy)
        );
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4,
          delta = Math.abs(left[i]! - right[i]!);
        error += delta;
        maximum = Math.max(maximum, delta);
        count++;
        minimumReference = Math.min(minimumReference, right[i]!);
        profile.push(left[i]!);
      }
      profiles.push(profile);
    }
    actual.dataset.case = 'actual-shadow';
    reference.dataset.case = 'oversized-reference';
    document.body.append(actual, reference);
    return { maximum, mean: error / count, count, minimumReference, profiles };
  } finally {
    renderer.dispose();
  }
}

function paintOversizedShadowReference(args: {
  output: { width: number; height: number };
  window: Parameters<typeof drawReviewSceneShadow>[2];
  background: Parameters<typeof drawReviewSceneShadow>[1];
  frame: Parameters<ReturnType<typeof createReviewSpatialRenderer>['draw']>[1]['frame'];
}) {
  const { output, window, background, frame } = args;
  const margin = 300,
    plane = Object.assign(document.createElement('canvas'), {
      width: output.width + margin * 2,
      height: output.height + margin * 2,
    });
  const ctx = plane.getContext('2d')!;
  ctx.translate(margin, margin);
  drawReviewSceneShadow(ctx, background, window, 12);
  ctx.beginPath();
  ctx.roundRect(window.x, window.y, window.width, window.height, 12);
  ctx.fillStyle = '#3366cc';
  ctx.fill();
  const reference = Object.assign(document.createElement('canvas'), output);
  const target = reference.getContext('2d')!;
  target.fillStyle = '#fff';
  target.fillRect(0, 0, output.width, output.height);
  const independent = createReviewSpatialRenderer();
  try {
    independent.draw(target, {
      source: plane,
      sourceRect: { x: -margin, y: -margin, width: plane.width, height: plane.height },
      output,
      base: window,
      target: window,
      frame,
    });
  } finally {
    independent.dispose();
  }

  return reference;
}

function compareExteriorShadow(actualCanvas: HTMLCanvasElement, reference: HTMLCanvasElement) {
  const target = reference.getContext('2d')!;
  const output = actualCanvas;
  let maximum = 0,
    mean = 0,
    count = 0;
  const actual = actualCanvas
    .getContext('2d')!
    .getImageData(0, 0, output.width, output.height).data;
  const expected = target.getImageData(0, 0, output.width, output.height).data;
  // Ignore opaque content and its rasterized corner: this witness compares the exterior shadow.
  for (let i = 0; i < actual.length; i += 4) {
    if (expected[i]! < 90 || expected[i]! > 245 || expected[i + 2]! - expected[i]! > 8) continue;
    const delta = Math.abs(actual[i]! - expected[i]!);
    maximum = Math.max(maximum, delta);
    mean += delta;
    count++;
  }
  mean /= count;

  return { maximum, mean, count };
}

function shadowBudgetScenario(mode: 'area' | 'depth' | 'refusal') {
  const output = { width: 641, height: 401 };
  const background = {
    enabled: true,
    type: 'solid',
    color: '#ffffffff',
    zoomBehavior: 'fixed',
    layout: { padding: 4, cornerRadius: 12, shadow: { intensity: 80, color: '#000000ff' } },
  } as const;
  const a = (30 * Math.PI) / 360,
    b = (-20 * Math.PI) / 360;
  const frame = {
    rotation: [
      Math.sin(a) * Math.cos(b),
      Math.cos(a) * Math.sin(b),
      -Math.sin(a) * Math.sin(b),
      Math.cos(a) * Math.cos(b),
    ] as const,
    perspective: 1,
    windowMotion: 1,
    lockBackground: true,
    focus: [
      {
        weight: 1,
        settings: {
          enabled: true,
          mode: mode === 'depth' ? 'depth' : 'area',
          x: 0,
          y: 0,
          width: 0,
          softness: 0.01,
          strength: 1,
        } as const,
      },
    ],
  };
  const layout = computeQuickEditSceneLayout({
    source: output,
    output,
    background,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5, spatial: frame },
  });
  const sourceRect = reviewSpatialSourceRect({ output, window: layout.windowRect, background });
  const plan = calculatePreviewRenderAllocation({
    publication: { backing: output, previousFront: null },
    admission: {
      source: { kind: 'canvas', size: output },
      camera: { retained: null, active: null },
      transition: null,
    },
    assets: {
      headerBitmap: null,
      backgroundBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
    background: null,
    scene: {
      transitionRaster: null,
      windowRaster: null,
      motionPass: null,
      spatial: { output, plane: sourceRect, halfFloat: true },
      spotlight: null,
      border: null,
      denseCommentGradient: null,
      denseBackgroundGradient: null,
    },
  });

  return { output, background, frame, layout, plan };
}

/** A separately painted oversized source checks tilted/blurred pixels and real managed limits. */
export function probeSpatialShadowBudget() {
  const result = [];
  for (const mode of ['area', 'depth', 'refusal'] as const) {
    const { output, background, frame, layout, plan } = shadowBudgetScenario(mode);
    const resources = createPreviewRenderResources({
      ...plan,
      maximumManagedBytes: plan.maximumManagedBytes - (mode === 'refusal' ? 1 : 0),
    });
    const front = resources.canvas('front', output),
      staging = resources.canvas('staging', output);
    const source = resources.canvas('source', output);
    front.context.fillStyle = '#ee44aa';
    front.context.fillRect(0, 0, output.width, output.height);
    const renderer = createReviewSpatialRenderer(undefined, resources);
    let refused = false,
      maximum = 0,
      mean = 0,
      count = 0;
    try {
      renderer.surface('overlay', output.width, output.height);
      try {
        drawReviewSceneFrame(staging.context, {
          canvas: staging.canvas,
          layout,
          background,
          image: null,
          spatialRenderer: renderer,
          resources,
          sample: {
            draw(ctx, x, y, w, h) {
              ctx.fillStyle = '#3366cc';
              ctx.fillRect(x, y, w, h);
            },
          },
        });
      } catch (error) {
        if (
          mode !== 'refusal' ||
          !(error instanceof Error) ||
          !error.message.includes('resource allocation')
        )
          throw error;
        refused = true;
      }
      if (!refused) {
        const reference = paintOversizedShadowReference({
          output,
          window: layout.windowRect,
          background,
          frame,
        });
        ({ maximum, mean, count } = compareExteriorShadow(staging.canvas, reference));
        const view = Object.assign(document.createElement('canvas'), output);
        view.getContext('2d')!.drawImage(staging.canvas, 0, 0);
        view.style.width = '320px';
        reference.style.width = '320px';
        document.body.append(view, reference);
      }
      const preservedFront = Array.from(front.context.getImageData(0, 0, 1, 1).data);
      result.push({
        mode,
        maximum,
        mean,
        count,
        refused,
        preservedFront,
        peak: resources.counters.peakManagedBytes,
        limit: plan.maximumManagedBytes,
        peakCanvases: resources.counters.peakCanvasCount,
        canvasLimit: plan.maximumCanvases,
      });
    } finally {
      renderer.dispose();
      front.release();
      staging.release();
      source.release();
      resources.dispose();
    }
    Object.assign(result.at(-1)!, { afterDispose: resources.counters.managedBytes });
  }
  return result;
}
