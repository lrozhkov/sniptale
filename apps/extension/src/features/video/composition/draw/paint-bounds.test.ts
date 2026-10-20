// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { resolveCompositionPaintBounds } from './paint-bounds';
import { drawCompositionVisualLayer } from './visual';
import {
  createImageClip,
  createTextClip,
  createShapeClip,
} from '../../project/timeline/project-meta.test.helpers';
import {
  createProjectAndClip,
  createSceneTemplate,
  resolveTestScene,
} from '../../project/annotation-engine/resolver.test-support';
import {
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
} from '../../project/annotation-engine';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import type { VideoCompositionVisualLayer } from '../types';
import type { EffectRuntimeRenderedFrameMap } from '../effect-runtime/runtime/types';

const output = { width: 200, height: 100 };
function context() {
  return document.createElement('canvas').getContext('2d')!;
}
function image(): Extract<VideoCompositionVisualLayer, { kind: 'image' }> {
  const clip = createImageClip({ shadowIntensity: 0 });
  return {
    clip,
    clipId: clip.id,
    kind: 'image',
    x: -60,
    y: 10,
    width: 40,
    height: 20,
    opacity: 1,
    rotation: 90,
    zIndex: 0,
    renderState: { ...IDENTITY_TRANSITION_VISUAL_STATE, translateX: 20, scaleX: 2, scaleY: 0.5 },
  };
}

it('retains off-canvas ink after rotation nonuniform scale and the existing media shadow bleed', () => {
  const layer = image();
  const args = { context: context(), layers: [layer], output, rasterScale: 1 };
  expect(resolveCompositionPaintBounds(args)).toEqual({ x: -42, y: 0, width: 242, height: 100 });
  expect(
    resolveCompositionPaintBounds({
      ...args,
      layers: [{ ...layer, clip: { ...layer.clip, shadowIntensity: 100, shadowMode: 'BACKDROP' } }],
    })
  ).toEqual({ x: -122, y: -12, width: 322, height: 112 });
  expect(resolveCompositionPaintBounds({ ...args, layers: [{ ...layer, opacity: 0 }] })).toEqual({
    x: 0,
    y: 0,
    ...output,
  });
});

it('includes actual painted text beyond the panel height and restores the measurement context', () => {
  const clip = createTextClip({ text: 'AAA\nBBB\nCCC\nDDD' });
  clip.style = {
    ...clip.style,
    backgroundColor: 'transparent',
    borderWidth: 0,
    fontFamily: 'sans-serif',
    fontSize: 20,
    lineHeight: 1.5,
    padding: 4,
  };
  const layer: VideoCompositionVisualLayer = {
    clip,
    clipId: clip.id,
    kind: 'text',
    x: 20,
    y: 110,
    width: 100,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '12px serif';
  const bounds = resolveCompositionPaintBounds({
    context: ctx,
    layers: [layer],
    output,
    rasterScale: 1,
  });
  expect(ctx.font).toBe('12px serif');
  drawCompositionVisualLayer(ctx, layer, 1, 1, {}, new Map());
  const pixels = ctx.getImageData(0, 0, 300, 300).data;
  let lastInkY = -1;
  for (let y = 0; y < 300; y++)
    for (let x = 0; x < 300; x++) {
      if (pixels[(y * 300 + x) * 4 + 3] === 0) continue;
      lastInkY = Math.max(lastInkY, y);
      expect(x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(x).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(y).toBeGreaterThanOrEqual(bounds.y - 1);
      expect(y).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
    }
  expect(lastInkY).toBeGreaterThan(layer.y + layer.height);
});

it('captures shape embedded assets outside their parent body', () => {
  const clip = createShapeClip();
  clip.transform = { ...clip.transform, width: 40, height: 20 };
  clip.embeddedAsset = { assetId: 'badge', placement: { x: -100, y: -80, width: 140, height: 60 } };
  const layer: VideoCompositionVisualLayer = {
    clip,
    clipId: clip.id,
    kind: 'shape',
    x: 20,
    y: 20,
    width: 40,
    height: 20,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  expect(
    resolveCompositionPaintBounds({ context: context(), layers: [layer], output, rasterScale: 1 })
  ).toEqual({ x: -82, y: -62, width: 282, height: 162 });
  expect(
    resolveCompositionPaintBounds({
      context: context(),
      layers: [
        { ...layer, clip: { ...clip, embeddedAsset: { ...clip.embeddedAsset, opacity: 0 } } },
      ],
      output,
      rasterScale: 1,
    })
  ).toEqual({ x: 0, y: 0, ...output });
});

it('retains accepted effect bitmap overflow instead of clipping it to its clip frame', () => {
  const base = image();
  const layer = {
    ...base,
    x: 20,
    y: 20,
    width: 20,
    height: 20,
    rotation: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  const frames: EffectRuntimeRenderedFrameMap = new Map([
    [
      'fx',
      {
        bitmap: {} as ImageBitmap,
        effectInstanceId: 'fx',
        kind: 'targetEffect',
        snapshotId: 'snapshot',
        width: 200,
        height: 120,
        logicalWidth: 200,
        logicalHeight: 100,
        target: {
          kind: 'clip',
          clipId: layer.clipId,
          chainIndex: 0,
          placement: { x: 20, y: 20, width: 20, height: 20, rotation: 0, opacity: 1 },
        },
        bitmapBounds: { x: -5, y: -3, width: 10, height: 6 },
      },
    ],
  ]);
  expect(
    resolveCompositionPaintBounds({
      context: context(),
      layers: [layer],
      frames,
      output,
      rasterScale: 1,
    })
  ).toEqual({ x: -82, y: -42, width: 282, height: 142 });
});

it('includes target annotation nodes outside the body and follows the renderer viewport clip policy', () => {
  const { clip, project } = createProjectAndClip();
  const original = createSceneTemplate(VideoAnnotationTargetBindingKind.RECT);
  const template = {
    ...original,
    renderTree: {
      id: 'root',
      nodeType: VideoAnnotationRenderNodeKind.GROUP,
      children: [
        {
          id: 'target',
          nodeType: VideoAnnotationRenderNodeKind.FRAME,
          props: { target: 'rect' },
          style: { stroke: '#ff0000', strokeWidth: 2 },
        },
      ],
    },
  };
  const resolved = resolveTestScene(project, clip, 1.8, template);
  const scene = {
    ...resolved,
    renderTree: {
      ...resolved.renderTree,
      children: resolved.renderTree.children.map((node) => ({
        ...node,
        transform: { ...node.transform, x: -800 },
      })),
    },
  };
  const resolvedClip = {
    calloutDecor: clip.calloutDecor,
    content: clip.content,
    id: clip.id,
    leaderLine: clip.leaderLine,
    presentation: scene.presentation,
    renderFamily: clip.renderFamily,
    scene,
    target: clip.target,
    targetPoint: clip.targetPoint,
    targetRect: clip.targetRect,
    templateKind: clip.templateKind,
    trackId: clip.trackId,
  };
  const frame = scene.presentation.labelFrame;
  const layer: VideoCompositionVisualLayer = {
    clip: resolvedClip,
    clipId: clip.id,
    kind: 'annotation',
    ...frame,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  const args = {
    context: context(),
    layers: [layer],
    output: { width: project.width, height: project.height },
    rasterScale: 1,
  };
  expect(resolveCompositionPaintBounds(args).x).toBeLessThanOrEqual(clip.targetRect!.x - 800 - 1);
  expect(resolveCompositionPaintBounds({ ...args, rasterScale: 0.5 }).x).toBe(0);
});

it('refuses nonfinite source geometry without changing the source layers', () => {
  const layer = image();
  const before = structuredClone(layer);
  const args = { context: context(), layers: [layer], output, rasterScale: 1 };
  expect(() => resolveCompositionPaintBounds({ ...args, rasterScale: NaN })).toThrow(
    'source bounds'
  );
  expect(() =>
    resolveCompositionPaintBounds({ ...args, layers: [{ ...layer, x: Infinity }] })
  ).toThrow('source bounds');
  expect(layer).toEqual(before);
});

it.each(['ARROW', 'LINE', 'RECTANGLE', 'ELLIPSE'] as const)(
  'captures actual off-canvas %s ink at small sizes with thick strokes and rotated raster scales',
  (shapeType) => {
    for (const strokeWidth of [1, 20])
      for (const rasterScale of [0.5, 1, 2]) {
        const clip = createShapeClip();
        clip.shapeType = shapeType;
        clip.transform = { ...clip.transform, width: 6, height: 3 };
        clip.style = {
          ...clip.style,
          fillColor: 'transparent',
          strokeColor: '#ff0000',
          strokeWidth,
        };
        const layer: VideoCompositionVisualLayer = {
          clip,
          clipId: clip.id,
          kind: 'shape',
          x: 220,
          y: 120,
          width: 6,
          height: 3,
          rotation: 35,
          opacity: 1,
          zIndex: 0,
          renderState: IDENTITY_TRANSITION_VISUAL_STATE,
        };
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d')!;
        const bounds = resolveCompositionPaintBounds({
          context: ctx,
          layers: [layer],
          output,
          rasterScale,
        });
        drawCompositionVisualLayer(ctx, layer, rasterScale, rasterScale, {}, new Map());
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const ink = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3]! < 2) continue;
            ink.left = Math.min(ink.left, x);
            ink.right = Math.max(ink.right, x);
            ink.top = Math.min(ink.top, y);
            ink.bottom = Math.max(ink.bottom, y);
          }
        const evidence = JSON.stringify({ shapeType, strokeWidth, rasterScale, bounds, ink });
        expect(Number.isFinite(ink.left), evidence).toBe(true);
        expect(ink.left, evidence).toBeGreaterThanOrEqual(bounds.x * rasterScale - 1);
        expect(ink.top, evidence).toBeGreaterThanOrEqual(bounds.y * rasterScale - 1);
        expect(ink.right, evidence).toBeLessThanOrEqual(
          (bounds.x + bounds.width) * rasterScale + 1
        );
        expect(ink.bottom, evidence).toBeLessThanOrEqual(
          (bounds.y + bounds.height) * rasterScale + 1
        );
      }
  }
);
