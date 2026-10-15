import {
  parseEffectV1Source,
  sha256EffectV1Bytes,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { createReviewAnnotationRenderer } from '../../../../apps/extension/src/workflows/video-review/annotation-renderer';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/workflows/video-review/spatial-renderer';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
import { computeQuickEditSceneLayout } from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import {
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  quickEditSpatialTargetCamera,
} from '../../../../apps/extension/src/features/video/review/advanced/spatial';
import type {
  ReviewAnnotationEffectSnapshot,
  ReviewAnnotationEffect,
} from '../../../../apps/extension/src/features/video/review/annotation-effects/types';

const size = { width: 640, height: 360 };
const rgb = [68, 136, 204] as const;
const surface = () => Object.assign(document.createElement('canvas'), size);
async function definition(name: 'frame' | 'title') {
  const response = await fetch(
    `/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`
  );
  if (!response.ok) throw new Error('Color source unavailable');
  const source = await response.text(),
    parsed = parseEffectV1Source(source);
  if (!parsed.ok || !parsed.document) throw new Error('Color document invalid');
  const document = parsed.document;
  const bytes = new TextEncoder().encode(source),
    sha256 = await sha256EffectV1Bytes(bytes);
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${sha256}`,
    sha256,
    source,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: document.id,
    retainedByteLength: bytes.byteLength,
    assets: [],
  };
  return { document, snapshot };
}
function bitmapInterior(bitmap: ImageBitmap) {
  const canvas = Object.assign(document.createElement('canvas'), {
    width: bitmap.width,
    height: bitmap.height,
  });
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let alpha = 0;
  for (let i = 3; i < pixels.length; i += 4) alpha = Math.max(alpha, pixels[i]!);
  let count = 0,
    error = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] !== alpha || !alpha) continue;
    count++;
    for (let channel = 0; channel < 3; channel++)
      error = Math.max(error, Math.abs(pixels[i + channel]! - rgb[channel]!));
  }
  return { alpha, count, rgbError: error };
}
function compositedInterior(canvas: HTMLCanvasElement, alpha: number, background: number) {
  const expected = rgb.map((channel) =>
    Math.round((channel * alpha) / 255 + background * (1 - alpha / 255))
  );
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0,
    minimumError = 255;
  for (let i = 0; i < pixels.length; i += 4) {
    const error = Math.max(
      ...expected.map((channel, index) => Math.abs(pixels[i + index]! - channel))
    );
    minimumError = Math.min(minimumError, error);
    if (error <= 2 && pixels[i + 3] === 255) count++;
  }
  return { expected, count, minimumError };
}
async function colorFrame(args: {
  definition: Awaited<ReturnType<typeof definition>>;
  role: 'outline' | 'primary' | 'secondary';
  alpha: 255 | 128;
  plane: 'content' | 'viewport';
  spatial: boolean;
  background: 255 | 32;
}) {
  const { document, snapshot } = args.definition;
  const color = args.alpha === 255 ? '#4488ccff' : '#4488cc80';
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
  );
  Object.assign(controls, {
    surface: '#00000000',
    accent: args.role === 'outline' ? color : '#00000000',
  });
  if (args.role === 'outline') Object.assign(controls, { line: 8 });
  else
    Object.assign(controls, {
      ink: color,
      title: args.role === 'primary' ? 'MMMMMMMM' : '',
      line2: '',
      eyebrow: '',
      subtitle: args.role === 'secondary' ? 'MMMMMMMM' : '',
      font: 76,
      bodyFont: 26,
    });
  const instance: ReviewAnnotationEffect = {
    id: 'color',
    snapshotId: snapshot.id,
    start: 0,
    end: 4,
    enabled: true,
    order: 0,
    attachment: args.plane,
    controls,
    transform: { x: 0.125, y: 0.2, width: 0.75, height: 0.55, rotation: 0 },
  };
  const resources = createPreviewRenderResources({
    maximumManagedBytes: 64 * 1024 * 1024,
    maximumCanvases: 12,
  });
  const signal = new AbortController().signal;
  const annotations = await createReviewAnnotationRenderer(
    {
      lane: { enabled: true, instances: [instance] },
      snapshots: [snapshot],
      planes: { content: size, viewport: size },
      segments: [
        { sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 4, kind: 'keep', rate: 1 },
      ],
    },
    { resources, signal, readAsset: async () => null }
  );
  const renderer = args.spatial ? createReviewSpatialRenderer(undefined, resources) : undefined;
  try {
    const batch = await annotations.render(
      2,
      { content: { width: 1, height: 1 }, viewport: { width: 1, height: 1 } },
      30,
      signal
    );
    try {
      const bitmap = bitmapInterior(batch.entries[0]!.bitmap);
      const backgroundColor = args.background === 255 ? '#ffffffff' : '#202020ff';
      const background = {
        enabled: true,
        type: 'solid',
        color: backgroundColor,
        layout: { padding: 0, cornerRadius: 0 },
      } as const;
      const region = {
        ...createQuickEditZoomRegion({ id: 'color-camera', at: 0, duration: 4, endMax: 4 }),
        transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
        perspective: {
          ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
          enabled: args.spatial,
          rotateY: -25,
          rotateX: 10,
        },
      };
      const camera = quickEditSpatialTargetCamera(region);
      const canvas = surface(),
        context = canvas.getContext('2d')!;
      const layout = computeQuickEditSceneLayout({
        source: size,
        output: size,
        background,
        camera,
      });
      const scene = {
        canvas,
        layout,
        background,
        image: null,
        resources,
        deferComments: true,
        sample: {
          draw(
            target: CanvasRenderingContext2D,
            x: number,
            y: number,
            width: number,
            height: number
          ) {
            target.fillStyle = backgroundColor;
            target.fillRect(x, y, width, height);
          },
        },
      };
      drawReviewSceneFrame(context, { ...scene, spatialRenderer: renderer });
      drawReviewSceneOverlays({
        scene,
        canvas,
        context,
        renderer,
        spotlightScratch: null,
        regions: [region],
        globalResultTime: 2,
        cameraScale: 1,
        sourceWidth: size.width,
        annotationFrames: batch.entries,
      });
      const final = compositedInterior(canvas, bitmap.alpha, args.background);
      canvas.style.width = '240px';
      globalThis.document.body.append(canvas);
      return {
        role: args.role,
        alpha: args.alpha,
        plane: args.plane,
        spatial: args.spatial,
        background: args.background,
        bitmap,
        final,
      };
    } finally {
      batch.release();
    }
  } finally {
    renderer?.dispose();
    annotations.dispose();
    resources.dispose();
  }
}

/** Quantitative original builtin pixels separate selected RGBA, declared opacity and compositor coverage. */
export async function probeAnnotationColors() {
  const frame = await definition('frame'),
    title = await definition('title');
  const results = [];
  for (const alpha of [255, 128] as const) {
    for (const plane of ['content', 'viewport'] as const)
      for (const spatial of [false, true])
        for (const background of [255, 32] as const)
          results.push(
            await colorFrame({
              definition: frame,
              role: 'outline',
              alpha,
              plane,
              spatial,
              background,
            })
          );
    for (const role of ['primary', 'secondary'] as const)
      results.push(
        await colorFrame({
          definition: title,
          role,
          alpha,
          plane: 'viewport',
          spatial: false,
          background: 255,
        })
      );
  }
  return results;
}
