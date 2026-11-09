import { createReviewPreviewRenderer } from '../../../apps/extension/src/workflows/video-review/render-preview';
import { reviewPresentedGeometry } from '../../../apps/extension/src/workflows/video-review/gpu-preview-geometry';
import { createQuickEditZoomRegion } from '../../../apps/extension/src/features/video/review/advanced/zoom';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../../apps/extension/src/features/video/project/motion/spatial';
import { REVIEW_CLICK_DEFAULT } from '../../../apps/extension/src/features/video/review/advanced/click-animation';
import { evaluateReviewClicks } from '../../../apps/extension/src/features/video/review/click-animation';
import { projectQuickEditPoint } from '../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import { DEFAULT_WINDOW_HEADER } from '../../../packages/runtime-contracts/src/window-header';
import type { PreviewScene } from '../../../apps/extension/src/workflows/video-review/preview-scene';
import type { RenderResources } from '../../../apps/extension/src/features/video/composition/canvas/render-resources';
import { runNativeClickLensOverflow } from './native-click-lens-overflow';

interface OverflowRow {
  editor: 'Gallery' | 'Native';
  backend: 'gpu' | 'legacy';
  variant: string;
  samples: number;
  changedOutside: number;
  maxDifference: number;
  width: number;
  height: number;
  probe?: 'magnified-source' | 'outline';
  transparentSamples?: number;
  transparentDifference?: number;
}
export interface ClickLensOverflowReport {
  rows: OverflowRow[];
}
declare global {
  interface Window {
    clickLensOverflowFixture?: { run(): Promise<ClickLensOverflowReport> };
  }
}
const output = { width: 1100, height: 720 };
const sourceSize = { width: 931, height: 520 };
const dimensions = { canonical: output, backing: output };
function canvas(size = output) {
  return Object.assign(document.createElement('canvas'), size);
}
function context(target: HTMLCanvasElement) {
  const value = target.getContext('2d');
  if (!value) throw new Error('E_LENS_CONTEXT');
  return value;
}
const resources: RenderResources = {
  canvas(_role, size, options) {
    const target = canvas(size);
    const paint = target.getContext('2d', options);
    if (!paint) throw new Error('E_LENS_CONTEXT');
    return {
      canvas: target,
      context: paint,
      release() {
        target.width = target.height = 0;
      },
    };
  },
  bytes() {
    return { release() {} };
  },
};

function createScene(variant: string): PreviewScene {
  return {
    source: sourceSize,
    canvas: {
      ...output,
      ...(variant === 'cropped-header'
        ? { crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }
        : {}),
    },
    ...(variant === 'cropped-header'
      ? { windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' } }
      : {}),
    background: {
      enabled: true,
      type: 'solid',
      color: '#302060',
      zoomBehavior: 'window',
      layout: { padding: 40.13, cornerRadius: 18, shadow: { intensity: 0, color: '#000000' } },
    },
    zoomRegions:
      variant === 'projected-overflow'
        ? [
            {
              ...createQuickEditZoomRegion({ id: 'roll', at: 0, duration: 4 }),
              transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
              perspective: {
                ...DEFAULT_CAMERA_PERSPECTIVE,
                enabled: true,
                rotateZ: 30,
                rotateX: 5,
                rotateY: -5,
                strength: 1,
              },
              enter: { type: 'none', duration: 0 },
              exit: { type: 'none', duration: 0 },
            },
          ]
        : [],
    comments: [],
    keys: [],
    clicks: [],
  };
}

function galleryPlan(variant: string) {
  const scene = createScene(variant);
  const geometry = reviewPresentedGeometry(scene, dimensions, 2);
  const base = geometry.layout;
  const visible = base.visibleVideoRect ?? base.videoRect;
  const point =
    variant === 'projected-overflow'
      ? { x: 0.01, y: 0.5 }
      : { x: 0.5, y: (visible.y + 5 - base.videoRect.y) / base.videoRect.height };
  const active: PreviewScene = {
    ...scene,
    clicks: [
      {
        point,
        start: 1.8,
        anchor: 2,
        end: 2.4,
        settings: {
          ...REVIEW_CLICK_DEFAULT,
          effect: 'magnify',
          radius: 36,
          stroke: 6,
          color: '#00ffff',
          opacity: 1,
          magnification: 2,
          lensShadow: 50,
          lensOptics: 'flat',
        },
      },
    ],
  };
  const click = evaluateReviewClicks(active.clicks, 2)[0];
  if (!click?.lens) throw new Error('E_LENS_FRAME');
  const sourceScale = base.videoRect.width / sourceSize.width;
  const center = {
    x: base.videoRect.x + point.x * base.videoRect.width,
    y: base.videoRect.y + point.y * base.videoRect.height,
  };
  const probe =
    variant === 'projected-overflow'
      ? { x: center.x - click.radius * sourceScale, y: center.y }
      : { x: center.x, y: base.windowRect.y - 4 };
  if (variant === 'projected-overflow' && probe.x >= 0)
    throw new Error('E_LENS_PROBE_NOT_NEGATIVE');
  if (variant !== 'projected-overflow' && probe.y >= base.windowRect.y)
    throw new Error('E_LENS_PROBE_NOT_OUTSIDE');
  const mapped = projectQuickEditPoint(geometry.projection, probe);
  if (
    !mapped ||
    mapped.x < 4 ||
    mapped.y < 4 ||
    mapped.x >= output.width - 4 ||
    mapped.y >= output.height - 4
  )
    throw new Error('E_LENS_PROBE_OUTSIDE_VIEWPORT');
  return {
    scene,
    active,
    geometry,
    base,
    center,
    mapped,
    magnification: click.lens.scale,
    radius: click.radius * sourceScale,
    variant,
  };
}

function measureGallery(
  plan: ReturnType<typeof galleryPlan>,
  before: Uint8ClampedArray,
  pixels: Uint8ClampedArray
) {
  const { geometry, base, center, mapped, magnification, variant } = plan;
  let samples = 0,
    changedOutside = 0,
    maxDifference = 0;
  const x = Math.round(mapped.x),
    y = Math.round(mapped.y);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const point = projectQuickEditPoint(geometry.inverse, {
        x: x + dx + 0.5,
        y: y + dy + 0.5,
      });
      const window = base.windowRect;
      if (
        !point ||
        (point.x >= window.x - 1 &&
          point.x <= window.x + window.width + 1 &&
          point.y >= window.y - 1 &&
          point.y <= window.y + window.height + 1)
      )
        continue;
      const index = ((y + dy) * output.width + x + dx) * 4;
      const difference = Math.max(
        ...[0, 1, 2].map((channel) => Math.abs(pixels[index + channel]! - before[index + channel]!))
      );
      samples++;
      if (variant === 'projected-overflow') {
        if (
          difference > 40 &&
          pixels[index]! < 120 &&
          pixels[index + 1]! > 120 &&
          pixels[index + 2]! > 120
        )
          changedOutside++;
      } else {
        const sourcePoint = projectQuickEditPoint(geometry.projection, {
          x: center.x + (point.x - center.x) / magnification,
          y: center.y + (point.y - center.y) / magnification,
        });
        if (
          !sourcePoint ||
          sourcePoint.x < 0 ||
          sourcePoint.y < 0 ||
          sourcePoint.x >= output.width ||
          sourcePoint.y >= output.height
        )
          throw new Error('E_LENS_SAMPLE_OUTSIDE');
        const reference =
          (Math.floor(sourcePoint.y) * output.width + Math.floor(sourcePoint.x)) * 4;
        const error = Math.max(
          ...[0, 1, 2].map((channel) =>
            Math.abs(pixels[index + channel]! - before[reference + channel]!)
          )
        );
        if (difference > 40 && error <= 32) changedOutside++;
      }
      maxDifference = Math.max(maxDifference, difference);
    }
  return { samples, changedOutside, maxDifference };
}

function measureTransparentInterior(
  plan: ReturnType<typeof galleryPlan>,
  before: Uint8ClampedArray,
  pixels: Uint8ClampedArray
) {
  if (plan.variant !== 'edge') return {};
  const point = projectQuickEditPoint(plan.geometry.projection, {
    x: plan.center.x,
    y: plan.center.y - plan.radius * 0.65,
  });
  if (!point) throw new Error('E_LENS_TRANSPARENT_PROJECTION');
  let transparentSamples = 0,
    transparentDifference = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const index = ((Math.round(point.y) + dy) * output.width + Math.round(point.x) + dx) * 4;
      transparentSamples++;
      transparentDifference = Math.max(
        transparentDifference,
        ...[0, 1, 2].map((channel) => Math.abs(pixels[index + channel]! - before[index + channel]!))
      );
    }
  return { transparentSamples, transparentDifference };
}

type Renderer = ReturnType<typeof createReviewPreviewRenderer>;
type Frame = Parameters<Renderer['render']>[1];
async function captureGallery(
  renderer: Renderer,
  scene: PreviewScene,
  frame: Frame,
  debug = false
) {
  const signal = new AbortController().signal;
  const prepared = await renderer.prepare(scene, dimensions, signal);
  try {
    const completed = await renderer.render(prepared, frame, signal);
    try {
      const pixels = context(completed.canvas).getImageData(0, 0, output.width, output.height).data;
      if (debug) {
        const preview = canvas();
        preview.dataset['lensOverflow'] = `Gallery-${completed.renderer.backend}`;
        context(preview).drawImage(completed.canvas, 0, 0);
        document.body.append(preview);
      }
      return { pixels, backend: completed.renderer.backend };
    } finally {
      completed.release();
    }
  } finally {
    prepared.release();
  }
}

async function gallery(backend: 'gpu' | 'legacy', variant: string): Promise<OverflowRow> {
  const plan = galleryPlan(variant);
  const input = canvas(sourceSize);
  context(input).fillStyle = '#f02030';
  context(input).fillRect(0, 0, input.width, input.height);
  const source = new VideoFrame(input, { timestamp: 2_000_000 });
  const renderer = createReviewPreviewRenderer({ renderer: backend, resources });
  const frame = {
    generation: 1,
    sourceTime: 2,
    resultTime: 2,
    fps: 60,
    source: {
      timestamp: 2,
      backing: sourceSize,
      videoFrame: () => source,
      draw: (
        target: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ) => target.drawImage(input, x, y, width, height),
    },
  };
  try {
    const before = await captureGallery(renderer, plan.scene, frame);
    const active = await captureGallery(renderer, plan.active, frame, variant === 'edge');
    if (before.backend !== backend || active.backend !== backend) throw new Error('E_LENS_BACKEND');
    return {
      editor: 'Gallery',
      backend,
      variant,
      probe: variant === 'projected-overflow' ? 'outline' : 'magnified-source',
      ...measureGallery(plan, before.pixels, active.pixels),
      ...measureTransparentInterior(plan, before.pixels, active.pixels),
      ...output,
    };
  } finally {
    renderer.dispose();
    source.close();
    input.width = input.height = 0;
  }
}

export function installClickLensOverflowFixture() {
  window.clickLensOverflowFixture = {
    async run() {
      const rows: OverflowRow[] = [];
      for (const backend of ['legacy', 'gpu'] as const)
        for (const variant of ['edge', 'projected-overflow', 'cropped-header'])
          rows.push(await gallery(backend, variant));
      rows.push(...(await runNativeClickLensOverflow()));
      return { rows };
    },
  };
}
