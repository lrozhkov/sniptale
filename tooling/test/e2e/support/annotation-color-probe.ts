import {
  parseAnimationTemplateSource,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createReviewAnnotationRenderer } from '../../../../apps/extension/src/workflows/video-review/annotation-renderer';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/spatial-renderer';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
import { computeQuickEditSceneLayout } from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { quickEditSpatialTargetCamera } from '../../../../apps/extension/src/features/video/review/advanced/spatial';
import { DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE } from '../../../../apps/extension/src/features/video/project/motion/spatial';
import type {
  ReviewAnnotationEffectSnapshot,
  ReviewAnnotationEffect,
} from '../../../../apps/extension/src/features/video/review/annotation-effects/types';

const size = { width: 640, height: 360 };
const rgb = [68, 136, 204] as const;
const surface = () => Object.assign(document.createElement('canvas'), size);
async function definition(name: 'frame' | 'title') {
  const response = await fetch(`/video-effects/animations/${name}.sniptale-animation.json`);
  if (!response.ok) throw new Error('Color source unavailable');
  const source = await response.text(),
    parsed = parseAnimationTemplateSource(source);
  if (!parsed.ok || !parsed.template) throw new Error('Color document invalid');
  const document = parsed.template;
  const bytes = new TextEncoder().encode(source),
    hash = bytesToHex(sha256(bytes));
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${hash}`,
    sha256: hash,
    source,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: document.id,
    retainedByteLength: bytes.byteLength,
    assets: [],
  };
  return { document, snapshot };
}
/** Author text color and independent opacity in checked Lottie data; do not emulate removed ink controls. */
function authoredTextColor(
  base: Awaited<ReturnType<typeof definition>>,
  role: 'primary' | 'secondary',
  alpha: number
) {
  const template = structuredClone(base.document);
  const slot = role === 'primary' ? 'title' : 'subtitle';
  // This fixture declares RGBA8 values. Quantize the composed alpha once before
  // authoring the Lottie opacity, so the engine cannot quantize the same byte twice.
  const effectiveAlpha = Math.round(alpha * (role === 'secondary' ? 0.84 : 1));
  // Use the interior of the target RGBA8 bin, not its floating-point lower boundary.
  const factor = Math.min(255, effectiveAlpha + 0.5) / 255;
  const slots = template.animation['slots'];
  if (!isPlainRecord(slots) || !isPlainRecord(slots[slot]) || !isPlainRecord(slots[slot]['p']))
    throw new Error('Text color slot missing');
  const setFill = (frames: unknown) => {
    if (!Array.isArray(frames) || !frames.length) throw new Error('Text color frames missing');
    for (const frame of frames) {
      if (!isPlainRecord(frame) || !isPlainRecord(frame['s']))
        throw new Error('Text color document missing');
      frame['s']['fc'] = rgb.map((channel) => channel / 255);
    }
  };
  setFill(slots[slot]['p']['k']);
  const layers = template.animation['layers'];
  if (!Array.isArray(layers)) throw new Error('Text color layers missing');
  let found = false;
  for (const layer of layers) {
    if (
      !isPlainRecord(layer) ||
      !isPlainRecord(layer['t']) ||
      !isPlainRecord(layer['t']['d']) ||
      layer['t']['d']['sid'] !== slot
    )
      continue;
    setFill(layer['t']['d']['k']);
    if (!isPlainRecord(layer['ks']) || !isPlainRecord(layer['ks']['o']))
      throw new Error('Text opacity missing');
    const opacity = layer['ks']['o'];
    if (opacity['a'] === 0 && typeof opacity['k'] === 'number') opacity['k'] *= factor;
    else if (opacity['a'] === 1 && Array.isArray(opacity['k'])) {
      for (const frame of opacity['k']) {
        if (!isPlainRecord(frame)) throw new Error('Text opacity keyframe missing');
        for (const key of ['s', 'e']) {
          const values = frame[key];
          if (values === undefined) continue;
          if (
            !Array.isArray(values) ||
            !values.every((value) => typeof value === 'number' && Number.isFinite(value))
          )
            throw new Error('Text opacity keyframe invalid');
          frame[key] = values.map((value) => value * factor);
        }
      }
    } else throw new Error('Text opacity unsupported');
    found = true;
  }
  if (!found) throw new Error('Text color layer missing');
  return checkedDefinition(template);
}
function checkedDefinition(document: AnimationTemplate) {
  const source = JSON.stringify(document),
    parsed = parseAnimationTemplateSource(source);
  if (!parsed.template) throw new Error('Authored color fixture invalid');
  const bytes = new TextEncoder().encode(source),
    hash = bytesToHex(sha256(bytes));
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${hash}`,
    sha256: hash,
    source,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: parsed.template.id,
    retainedByteLength: bytes.byteLength,
    assets: [],
  };
  return { document: parsed.template, snapshot };
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
  const { document, snapshot } =
    args.role === 'outline'
      ? args.definition
      : authoredTextColor(args.definition, args.role, args.alpha);
  const color = args.alpha === 255 ? '#4488ccff' : '#4488cc80';
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectControlDefault(control, 'en')])
  );
  Object.assign(controls, { accent: args.role === 'outline' ? color : '#00000000', title: '' });
  if (args.role === 'outline') controls['stroke'] = 8;
  else
    Object.assign(controls, {
      title: args.role === 'primary' ? 'MMMMMMMM' : '',
      subtitle: args.role === 'secondary' ? 'MMMMMMMM' : '',
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
