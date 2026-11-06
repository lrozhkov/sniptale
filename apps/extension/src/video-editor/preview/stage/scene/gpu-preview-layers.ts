import {
  assertEffectRasterDimensions,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../../../../features/video/composition/effect-runtime/runtime/resource-limits';
import type { EffectRuntimeInputComposition } from '../../../../features/video/composition/effect-runtime/frame/inputs';
import {
  getFittedMediaWindowFrame,
  getFittedMediaContentFrame,
} from '../../../../features/video/composition/draw/fitted-media';
import { roundedWindowRadius } from '../../../../features/video/project/window-geometry';
import {
  buildNativeGpuVideoLayers,
  type NativeGpuVideoSourceBody,
  type NativeGpuSourceMaterial,
} from './gpu-preview-video';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../../../features/video/composition/canvas/gpu-preview';
import type {
  VideoCompositionCameraState,
  VideoCompositionVisualLayer,
} from '../../../../features/video/composition/types';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
} from '../../../../features/video/composition/draw/media-source';
import { resolveVideoSourceLensPaintBounds } from '../../../../features/video/composition/draw/video';
import type {
  EffectRuntimeRenderedComposition,
  EffectRuntimeRenderedFrameMap,
} from '../../../../features/video/composition/effect-runtime';
import { getEffectRuntimeVisualPassFrames } from '../../../../features/video/composition/effect-runtime';
import {
  drawCompositionVisualLayer,
  drawTransitionOverlay,
  hasEffectRuntimeTransitionFrame,
} from '../../../../features/video/composition/draw';
import {
  resolveEffectRuntimeVisualLayerFrame,
  resolveEffectRuntimeVisualLayers,
} from '../../../../features/video/composition/draw/effect-runtime';
import { segmentVisualLayersByViewportLock } from '../../../../features/video/composition/motion/layer-camera';
import {
  resolveOrderedVisualPassLayers,
  splitVisualLayersForSourceSpotlights,
} from '../../../../features/video/composition/visual-pass-layers';
import {
  motionCameraPlaneTransform,
  motionCameraProjection,
} from '../../../../features/video/composition/motion/spatial';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../../features/video/composition/motion/spatial-geometry';
import {
  createSceneSpotlightMasks,
  type SceneSpotlightLayer,
} from '../../../../features/video/composition/draw/spotlight';
import { resolveCompositionSceneSpotlights } from '../../../../features/video/composition/draw/project-spotlight';
import {
  drawActionCompositionState,
  drawSceneActionCompositionStates,
  resolveActionCompositionPaintBounds,
} from '../../../../features/video/composition/draw/effects/actions';
import {
  drawCursorCompositionState,
  resolveCursorCompositionPaintBounds,
} from '../../../../features/video/composition/draw/effects/cursor';
import { resolveCompositionPaintBounds } from '../../../../features/video/composition/draw/paint-bounds';

import { resolveActiveCameraSplit } from '../../../../features/video/composition/camera-split';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { PreviewSceneRenderInput as Input } from './types';
import { resolvePreviewCompositionFrameSize } from './canvas';

type Passes = ReturnType<typeof resolveVideoCompositionRenderPasses>;
type Layer = VideoCompositionVisualLayer;
type VideoLayer = Extract<Layer, { kind: 'video' }>;
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const PADDING = 128;

function integerArtworkBounds(bounds: GpuPreviewLayer['rect'] | null) {
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  const x = Math.floor(bounds.x),
    y = Math.floor(bounds.y);
  const right = Math.ceil(bounds.x + bounds.width),
    bottom = Math.ceil(bounds.y + bounds.height);
  if (!Number.isFinite(right) || !Number.isFinite(bottom) || right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Describes ordered GPU work; vector artwork and alpha masks never read back video pixels. */
export async function buildNativeGpuPreviewLayers(args: {
  sourceMask?: NativeGpuSourceMaterial;
  sourceDecoration?: NativeGpuSourceMaterial;
  annotationMask?: NativeGpuSourceMaterial;
  snapshotGroup?: (group: GpuPreviewGroup) => Promise<ImageBitmap>;
  inputComposition?: EffectRuntimeInputComposition;
  input: Input;
  passes: Passes;
  sources: ReadonlyMap<string, VideoFrame>;
  media: ReadonlyMap<string, VideoCompositionMediaSource>;
  effects?: EffectRuntimeRenderedComposition;
  background: GpuPreviewLayer;
  viewportBorders?: GpuPreviewLayer;
}) {
  const { input, passes } = args;
  const logical = args.inputComposition?.dimensions ?? {
    width: input.project.width,
    height: input.project.height,
  };
  const output =
    args.inputComposition?.renderDimensions ?? resolvePreviewCompositionFrameSize(input) ?? logical;
  const retained: Array<{ release(): void }> = [];
  let snapshotBytes = 0;
  let snapshotEntries = 0;
  const snapshot = async (group: GpuPreviewGroup) => {
    const bytes = assertEffectRasterDimensions(group.output.width, group.output.height) * 4;
    if (
      snapshotBytes + bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes ||
      snapshotEntries >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries
    )
      throw new EffectRuntimeResourceError();
    if (!args.snapshotGroup) throw new Error('GPU exposure snapshot capability is unavailable.');
    snapshotBytes += bytes;
    snapshotEntries++;
    const bitmap = await args.snapshotGroup(group);
    retained.push({
      release() {
        bitmap.close();
        snapshotBytes -= bytes;
        snapshotEntries--;
      },
    });
    return bitmap;
  };
  const release = () => {
    for (const resource of retained.splice(0)) resource.release();
  };
  const measure = input.canvas.ownerDocument.createElement('canvas');
  measure.width = measure.height = 1;
  const metrics = measure.getContext('2d');
  if (!metrics) throw new Error('Preview geometry metrics are unavailable.');
  let paintBounds: ReturnType<typeof resolveCompositionPaintBounds>;
  try {
    const layers = [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].flatMap(
      (frame) => frame.visualLayers
    );
    const sourceFeedbackBounds = new Map<Layer, GpuPreviewLayer['rect']>();
    for (const layer of layers) {
      if (layer.kind !== 'video') continue;
      const borrowed = args.media.get(layer.clipId),
        frame = args.sources.get(layer.clipId);
      const source =
        borrowed instanceof HTMLVideoElement || isVideoCompositionFrameSource(borrowed)
          ? borrowed
          : frame
            ? { sourceWidth: frame.displayWidth, sourceHeight: frame.displayHeight }
            : null;
      if (!source) continue;
      const bounds = resolveVideoSourceLensPaintBounds(layer, source, 1, input.imageBank);
      if (bounds) sourceFeedbackBounds.set(layer, bounds);
    }
    paintBounds = resolveCompositionPaintBounds({
      context: metrics,
      layers,
      output: logical,
      rasterScale: 1,
      sourceFeedbackBounds,
      ...(args.inputComposition
        ? { frames: args.inputComposition.frames }
        : args.effects
          ? { frames: args.effects.overlayFrames }
          : {}),
    });
  } finally {
    measure.width = measure.height = 0;
  }
  const extraBounds = passes.overlayFrame.actions.flatMap((action) => {
    const bounds = integerArtworkBounds(resolveActionCompositionPaintBounds(action, 1));
    return bounds ? [bounds] : [];
  });
  const cursorBounds = passes.overlayFrame.cursor
    ? integerArtworkBounds(resolveCursorCompositionPaintBounds(passes.overlayFrame.cursor))
    : null;
  if (cursorBounds) extraBounds.push(cursorBounds);
  const left = Math.floor(Math.min(-PADDING, paintBounds.x, ...extraBounds.map((rect) => rect.x)));
  const top = Math.floor(Math.min(-PADDING, paintBounds.y, ...extraBounds.map((rect) => rect.y)));
  const right = Math.ceil(
    Math.max(
      logical.width + PADDING,
      paintBounds.x + paintBounds.width,
      ...extraBounds.map((rect) => rect.x + rect.width)
    )
  );
  const bottom = Math.ceil(
    Math.max(
      logical.height + PADDING,
      paintBounds.y + paintBounds.height,
      ...extraBounds.map((rect) => rect.y + rect.height)
    )
  );
  const plane = { x: left, y: top, width: right - left, height: bottom - top };
  const raster = (
    paint: (context: CanvasRenderingContext2D) => void,
    padded = false,
    artworkBounds?: GpuPreviewLayer['rect'] | null
  ): GpuPreviewLayer => {
    const bounds = artworkBounds ?? (padded ? plane : { x: 0, y: 0, ...logical });
    const canvas = input.canvas.ownerDocument.createElement('canvas');
    canvas.width = Math.ceil(bounds.width);
    canvas.height = Math.ceil(bounds.height);
    retained.push({
      release() {
        canvas.width = canvas.height = 0;
      },
    });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Preview artwork is unavailable.');
    context.translate(-bounds.x, -bounds.y);
    paint(context);
    return { source: canvas, rect: bounds, inverse: IDENTITY };
  };
  const groupBounds = (padded: boolean, artworkBounds?: GpuPreviewLayer['rect']) => {
    if (!artworkBounds) return padded ? plane : { x: 0, y: 0, ...logical };
    const roi = integerArtworkBounds(artworkBounds);
    if (!roi) return plane;
    const x = Math.max(roi.x, plane.x),
      y = Math.max(roi.y, plane.y);
    const right = Math.min(roi.x + roi.width, plane.x + plane.width),
      bottom = Math.min(roi.y + roi.height, plane.y + plane.height);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : plane;
  };
  const group = (
    layers: readonly GpuPreviewLayer[],
    padded = false,
    artworkBounds?: GpuPreviewLayer['rect']
  ): GpuPreviewGroup => {
    const bounds = groupBounds(padded, artworkBounds);
    const translate: QuickEditHomography = [1, 0, bounds.x, 0, 1, bounds.y, 0, 0, 1];
    return {
      kind: 'group',
      output:
        padded || artworkBounds
          ? { width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) }
          : output,
      logical: { width: bounds.width, height: bounds.height },
      layers:
        padded || artworkBounds
          ? layers.map((layer) => ({
              ...layer,
              inverse: multiplyQuickEditProjections(layer.inverse, translate),
            }))
          : layers,
    };
  };
  const groupLayer = (
    layers: readonly GpuPreviewLayer[],
    padded = false,
    artworkBounds?: GpuPreviewLayer['rect']
  ): GpuPreviewLayer => ({
    source: group(layers, padded, artworkBounds),
    rect: groupBounds(padded, artworkBounds),
    inverse: IDENTITY,
  });
  const cameraLayers = (
    layers: readonly GpuPreviewLayer[],
    camera: VideoCompositionCameraState,
    sharp = false
  ): GpuPreviewLayer[] => {
    const projection = motionCameraProjection(camera) ?? [
      camera.scale,
      0,
      -camera.viewportX * camera.scale,
      0,
      camera.scale,
      -camera.viewportY * camera.scale,
      0,
      0,
      1,
    ];
    const inverse = invertQuickEditProjection(projection);
    if (!inverse) throw new Error('Preview projection is unavailable.');
    const spatial = camera.spatial;
    const depth =
      !sharp &&
      spatial?.focus.some(
        ({ settings, weight }) => settings.enabled && settings.strength > 0 && weight > 0
      );
    // Over is pointwise under the same homography; masks/erase/add retain their isolated target.
    if (!depth && layers.every((layer) => layer.blend === undefined || layer.blend === 'over')) {
      return layers.map((layer) => ({
        ...layer,
        inverse: multiplyQuickEditProjections(layer.inverse, inverse),
      }));
    }
    const transform = motionCameraPlaneTransform(camera);
    const planeInverse = transform ? invertQuickEditProjection(transform) : null;
    return [
      {
        ...groupLayer(layers, true),
        inverse,
        ...(depth && spatial
          ? {
              depth: {
                frame: spatial,
                window: spatial.reference,
                ...(planeInverse ? { planeInverse } : {}),
              },
            }
          : {}),
      },
    ];
  };
  const spotlight = (
    layers: readonly GpuPreviewLayer[],
    frames: readonly SceneSpotlightLayer[],
    blurBackdrop?: readonly GpuPreviewLayer[]
  ): GpuPreviewLayer[] => {
    if (!frames.length) return [...layers];
    const snapshot = groupLayer(layers);
    const result = [snapshot];
    for (const frame of frames) {
      if (!frame.lens || frame.lens.scale <= 1) continue;
      const opening = frame.opening;
      const points = [
        { x: opening.x, y: opening.y },
        { x: opening.x + opening.width, y: opening.y },
        { x: opening.x + opening.width, y: opening.y + opening.height },
        { x: opening.x, y: opening.y + opening.height },
      ].map((point) => (frame.projection ? projectQuickEditPoint(frame.projection, point) : point));
      if (points.some((point) => !point)) throw new Error('Lens projection is unavailable.');
      const xs = points.map((point) => point!.x),
        ys = points.map((point) => point!.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      const mask = createSceneSpotlightMasks(logical, [
        {
          ...frame,
          dim: 1,
          blur: 0,
          protectionOpening: frame.opening,
          protectionRadius: frame.radius,
          presence: 1,
        },
      ]);
      retained.push({ release: mask.dispose });
      const openingMask = raster((context) => {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, logical.width, logical.height);
        context.globalCompositeOperation = 'destination-out';
        context.drawImage(mask.dim, 0, 0);
      });
      const lens: GpuPreviewLayer = {
        ...snapshot,
        lens: {
          bounds,
          scale: frame.lens.scale,
          optics: frame.lens.optics,
          edgeWidth: frame.lens.edgeWidth ?? 8,
          corner:
            frame.lens.shape === 'circle'
              ? 'circle'
              : Math.min(
                  1,
                  frame.radius / Math.max(0.001, Math.min(opening.width, opening.height) / 2)
                ),
        },
      };
      result.push(groupLayer([lens, { ...openingMask, blend: 'mask' }]));
    }
    const masks = createSceneSpotlightMasks(
      logical,
      frames.filter((frame) => frame.dim > 0 || frame.blur > 0)
    );
    retained.push({ release: masks.dispose });
    if (masks.radius > 0)
      result.push(
        groupLayer([
          { ...(blurBackdrop ? groupLayer(blurBackdrop) : snapshot), blur: masks.radius },
          {
            source: masks.blur,
            rect: { x: 0, y: 0, ...logical },
            inverse: IDENTITY,
            blend: 'mask',
          },
        ])
      );
    result.push({ source: masks.dim, rect: { x: 0, y: 0, ...logical }, inverse: IDENTITY });
    return result;
  };
  const layerProjection = (layer: Layer): QuickEditHomography => {
    const state = layer.renderState;
    const angle = (layer.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const x = layer.x + layer.width / 2,
      y = layer.y + layer.height / 2;
    const a = state.scaleX * c,
      b = -state.scaleX * s,
      d = state.scaleY * s,
      e = state.scaleY * c;
    return [
      a,
      b,
      x + state.translateX - a * x - b * y,
      d,
      e,
      y + state.translateY - d * x - e * y,
      0,
      0,
      1,
    ];
  };
  const sourceBodies = new Map<VideoLayer, NativeGpuVideoSourceBody>();
  const video = (layer: VideoLayer, sourceOwner = layer): GpuPreviewLayer[] => {
    const source = args.sources.get(layer.clipId);
    if (!source) throw new Error('GPU video source is unavailable.');
    const inverse = invertQuickEditProjection(layerProjection(layer));
    if (!inverse) throw new Error('Visual layer projection is unavailable.');
    return buildNativeGpuVideoLayers({
      layer,
      source,
      borrowed: args.media.get(layer.clipId),
      media: args.media,
      imageBank: input.imageBank,
      inverse,
      sourceOwner,
      sourceBodies,
      ...(args.sourceMask
        ? {
            sourceMask: (key: string, paint: (context: CanvasRenderingContext2D) => void) => {
              const lease = args.sourceMask!(input.canvas.ownerDocument, plane, key, paint);
              retained.push(lease);
              return lease.layer;
            },
          }
        : {}),
      ...(args.sourceDecoration
        ? {
            sourceDecoration: (key: string, paint: (context: CanvasRenderingContext2D) => void) => {
              const lease = args.sourceDecoration!(input.canvas.ownerDocument, plane, key, paint);
              retained.push(lease);
              return lease.layer;
            },
          }
        : {}),
      raster,
      groupLayer,
      spotlight,
    });
  };
  const paintLayers = (
    layers: readonly Layer[],
    frames: EffectRuntimeRenderedFrameMap | undefined,
    frameActionOwners?: ReadonlySet<string>
  ) => {
    const drawn = new Set<string>();
    const content: GpuPreviewLayer[] = [];
    const sharp: GpuPreviewLayer[] = [];
    const explicitActions = new Set([
      ...(frameActionOwners ?? []),
      ...layers.filter((layer) => layer.effectActionsOnly).map((layer) => layer.clipId),
    ]);
    for (const layer of layers) {
      const selected = resolveEffectRuntimeVisualLayerFrame(frames, layer);
      const repeated = selected?.deduplicationKey && drawn.has(selected.deduplicationKey);
      if (selected?.deduplicationKey) drawn.add(selected.deduplicationKey);
      let body: GpuPreviewLayer[];
      if (selected) {
        const frame = selected.frame;
        if (repeated) body = [];
        else if (selected.fullFrame)
          body = [
            {
              source: frame.bitmap,
              rect: { x: 0, y: 0, width: frame.logicalWidth, height: frame.logicalHeight },
              inverse: IDENTITY,
            },
          ];
        else {
          const bounds = frame.bitmapBounds ?? { x: 0, y: 0, width: 1, height: 1 };
          const local: GpuPreviewLayer = {
            source: frame.bitmap,
            rect: {
              x: layer.x + bounds.x * layer.width,
              y: layer.y + bounds.y * layer.height,
              width: bounds.width * layer.width,
              height: bounds.height * layer.height,
            },
            inverse: invertQuickEditProjection(layerProjection(layer))!,
            opacity: layer.opacity,
          };
          if (!local.inverse) throw new Error('Effect bitmap projection is unavailable.');
          if (layer.kind === 'effect' && layer.sourceAttachment) {
            const { owner, mapping, innerTransform } = layer.sourceAttachment;
            const window = getFittedMediaWindowFrame(mapping),
              content = getFittedMediaContentFrame(mapping);
            const placement: QuickEditHomography = [
              content.width / mapping.sourceWidth,
              0,
              content.x,
              0,
              content.height / mapping.sourceHeight,
              content.y,
              0,
              0,
              1,
            ];
            const transform = multiplyQuickEditProjections(innerTransform ?? IDENTITY, placement);
            const inverse = invertQuickEditProjection(transform);
            const ownerInverse = invertQuickEditProjection(layerProjection(owner));
            if (!inverse || !ownerInverse)
              throw new Error('Attached effect projection is unavailable.');
            const paintCoverage = (context: CanvasRenderingContext2D) => {
              context.fillStyle = '#fff';
              context.beginPath();
              context.roundRect(
                window.x,
                window.y,
                window.width,
                window.height,
                roundedWindowRadius(window.width, window.height, mapping.windowCornerRadius ?? 0)
              );
              context.fill();
              if (mapping.sourceCrop) {
                const crop = mapping.sourceCrop;
                context.globalCompositeOperation = 'destination-in';
                context.fillRect(
                  content.x + crop.x * content.width,
                  content.y + crop.y * content.height,
                  crop.width * content.width,
                  crop.height * content.height
                );
              }
            };
            const coverageKey = JSON.stringify([
              window,
              mapping.windowCornerRadius ?? 0,
              mapping.sourceCrop ? [mapping.sourceCrop, content] : null,
            ]);
            const coverage = args.annotationMask?.(
              input.canvas.ownerDocument,
              plane,
              coverageKey,
              paintCoverage
            );
            if (coverage) retained.push(coverage);
            const mask = coverage?.layer ?? raster(paintCoverage, true);
            body = [
              {
                ...groupLayer(
                  [
                    { ...local, inverse: multiplyQuickEditProjections(local.inverse, inverse) },
                    { ...mask, blend: 'mask' },
                  ],
                  true
                ),
                inverse: ownerInverse,
                opacity: owner.opacity,
              },
            ];
          } else body = [local];
        }
      } else
        body =
          layer.kind === 'video'
            ? video({ ...layer, actions: [] }, layer)
            : [
                raster(
                  (context) =>
                    drawCompositionVisualLayer(context, layer, 1, 1, input.imageBank, args.media),
                  true
                ),
              ];
      if (selected && !selected.fullFrame && layer.renderState.blurAmount > 0)
        body = [
          {
            ...groupLayer(body, true),
            cssFilter: { blur: layer.renderState.blurAmount, brightness: 1, saturate: 1 },
          },
        ];
      if (!layer.effectActionsOnly) {
        content.push(...body);
        if (sharp.length) sharp.push({ ...groupLayer(body, true), blend: 'erase' });
      }
      if (
        layer.kind === 'video' &&
        (layer.actions?.length || (layer.deferSourceBorders && layer.borders?.length)) &&
        (layer.effectActionsOnly || !explicitActions.has(layer.clipId))
      ) {
        sharp.push(...video({ ...layer, effectActionsOnly: true }, layer));
      }
    }
    return { content, sharp };
  };
  const mergeSharp = (painted: ReturnType<typeof paintLayers>) => {
    if (!painted.sharp.length) return painted.content;
    let bounds: GpuPreviewLayer['rect'] | undefined;
    if (
      painted.sharp.every(
        (layer) =>
          !layer.blur &&
          !layer.cssFilter &&
          !layer.depth &&
          layer.inverse.every((value, index) => value === IDENTITY[index])
      )
    ) {
      const x = Math.min(...painted.sharp.map((layer) => layer.rect.x)) - 2;
      const y = Math.min(...painted.sharp.map((layer) => layer.rect.y)) - 2;
      bounds = {
        x,
        y,
        width: Math.max(...painted.sharp.map((layer) => layer.rect.x + layer.rect.width)) - x + 2,
        height: Math.max(...painted.sharp.map((layer) => layer.rect.y + layer.rect.height)) - y + 2,
      };
    }
    return [...painted.content, groupLayer(painted.sharp, true, bounds)];
  };
  const sceneMasks = (layers: readonly GpuPreviewLayer[], afterClipId?: string) =>
    spotlight(
      layers,
      resolveCompositionSceneSpotlights({
        project: input.project,
        frame: {
          ...passes.overlayFrame,
          sceneSpotlights: (passes.overlayFrame.sceneSpotlights ?? []).filter(
            (state) => state.afterClipId === afterClipId
          ),
        },
        images: input.imageBank,
        viewport: { x: 0, y: 0, ...logical },
        composition: { x: 0, y: 0, scale: 1 },
        transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })
    );
  try {
    if (args.inputComposition) {
      const request = args.inputComposition;
      const members = new Set(request.layers.map((layer) => layer.clipId));
      let result: GpuPreviewLayer[] = [];
      const selected = resolveEffectRuntimeVisualLayers([...request.layers], request.frames);
      const segments =
        request.applyCamera && request.camera
          ? segmentVisualLayersByViewportLock(selected, request.camera)
          : [{ isLocked: true, layers: selected }];
      for (const segment of segments)
        for (const part of splitVisualLayersForSourceSpotlights(
          segment.layers,
          request.applyCamera ? request.scene?.frame.sceneSpotlights : undefined
        )) {
          const painted = paintLayers(part.layers, request.frames);
          const items = mergeSharp(painted);
          result.push(
            ...(!segment.isLocked && request.camera ? cameraLayers(items, request.camera) : items)
          );
          if (part.afterClipId && request.scene) {
            const scene = request.scene;
            const idx = scene.frame.visualLayers.findIndex(
              (layer) => layer.clipId === part.afterClipId
            );
            const lower = scene.frame.visualLayers
              .slice(0, Math.max(0, idx))
              .filter((layer) => !members.has(layer.clipId))
              .map((layer) => (layer.kind === 'video' ? { ...layer, actions: [] } : layer));
            const lowerLayers = resolveEffectRuntimeVisualLayers(lower, request.frames);
            const lowerSegments = request.camera
              ? segmentVisualLayersByViewportLock(lowerLayers, request.camera)
              : [{ isLocked: true, layers: lowerLayers }];
            const underlay: GpuPreviewLayer[] = [args.background];
            for (const lowerSegment of lowerSegments) {
              const lowerPaint = mergeSharp(paintLayers(lowerSegment.layers, request.frames));
              underlay.push(
                ...(!lowerSegment.isLocked && request.camera
                  ? cameraLayers(lowerPaint, request.camera)
                  : lowerPaint)
              );
            }
            underlay.push(...result);
            result = spotlight(
              result,
              resolveCompositionSceneSpotlights({
                project: scene.project,
                frame: {
                  ...scene.frame,
                  sceneSpotlights: (scene.frame.sceneSpotlights ?? []).filter(
                    (state) => state.afterClipId === part.afterClipId
                  ),
                },
                images: input.imageBank,
                viewport: { x: 0, y: 0, ...logical },
                composition: { x: 0, y: 0, scale: 1 },
                transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
              }),
              underlay
            );
          }
        }
      return { layers: result, release };
    }
    let layers: GpuPreviewLayer[] = [args.background];
    const split = resolveActiveCameraSplit(
      input.project,
      input.currentTime,
      passes.overlayFrame.visualLayers
    );
    const orderedLayers = resolveEffectRuntimeVisualLayers(
      passes.overlayFrame.visualLayers.filter((layer) => layer.clipId !== split?.clipId),
      args.effects?.overlayFrames
    );
    // Explicit source feedback can follow a viewport-locked group in another camera segment.
    const frameActionOwners = new Set(
      orderedLayers.filter((layer) => layer.effectActionsOnly).map((layer) => layer.clipId)
    );
    const segments = segmentVisualLayersByViewportLock(orderedLayers, passes.overlayFrame.camera);
    for (const segment of segments)
      for (const part of splitVisualLayersForSourceSpotlights(
        segment.layers,
        passes.overlayFrame.sceneSpotlights
      )) {
        if (segment.isLocked)
          layers.push(
            ...mergeSharp(paintLayers(part.layers, args.effects?.overlayFrames, frameActionOwners))
          );
        else {
          const exposure: GpuPreviewLayer[] = [];
          for (const pass of passes.visualPasses) {
            await args.effects?.prepareVisualPass?.(pass.time);
            const frameLayers = paintLayers(
              resolveOrderedVisualPassLayers(part.layers, pass.frame.visualLayers),
              getEffectRuntimeVisualPassFrames(args.effects, pass.time),
              frameActionOwners
            );
            const projected = cameraLayers(frameLayers.content, pass.frame.camera);
            if (frameLayers.sharp.length)
              projected.push(...cameraLayers(frameLayers.sharp, pass.frame.camera, true));
            if (passes.visualPasses.length === 1 && pass.alpha === 1) exposure.push(...projected);
            else {
              const exposureLayer: GpuPreviewLayer = {
                ...groupLayer(projected),
                opacity: pass.alpha,
                blend: passes.visualPasses.length > 1 ? 'add' : 'over',
              };
              if (
                args.effects?.prepareVisualPass &&
                passes.visualPasses.length > 1 &&
                pass.time !== input.currentTime
              ) {
                if (!('kind' in exposureLayer.source) || exposureLayer.source.kind !== 'group')
                  throw new Error('GPU exposure group is unavailable.');
                exposureLayer.source = await snapshot(exposureLayer.source);
              }
              exposure.push(exposureLayer);
            }
          }
          if (passes.visualPasses.length === 1 && passes.visualPasses[0]?.alpha === 1)
            layers.push(...exposure);
          else layers.push(groupLayer(exposure));
        }
        if (part.afterClipId) layers = sceneMasks(layers, part.afterClipId);
      }
    const overlays: GpuPreviewLayer[] = [];
    for (const pass of passes.visualPasses) {
      if (!pass.transitionOverlays.length) continue;
      await args.effects?.prepareVisualPass?.(pass.time);
      overlays.push(
        raster((context) => {
          for (const overlay of pass.transitionOverlays)
            if (
              !hasEffectRuntimeTransitionFrame(
                getEffectRuntimeVisualPassFrames(args.effects, pass.time),
                overlay.transitionId
              )
            )
              drawTransitionOverlay(context, overlay, logical.width, logical.height, pass.alpha);
        })
      );
    }
    layers.push(...overlays);
    layers = sceneMasks(layers);
    if (args.viewportBorders) layers.push(args.viewportBorders);
    for (const action of passes.overlayFrame.actions) {
      const artwork = raster(
        (context) =>
          action.renderKind === 'keystroke'
            ? drawSceneActionCompositionStates(context, [action], passes.overlayFrame.camera, {
                offsetX: 0,
                offsetY: 0,
                scaleX: 1,
                scaleY: 1,
              })
            : drawActionCompositionState(context, action, null, 1),
        true,
        action.renderKind === 'keystroke'
          ? null
          : integerArtworkBounds(resolveActionCompositionPaintBounds(action, 1))
      );
      layers.push(
        ...(action.renderKind === 'keystroke'
          ? [artwork]
          : cameraLayers([artwork], passes.overlayFrame.camera, true))
      );
    }
    if (passes.overlayFrame.cursor?.visible)
      layers.push(
        ...cameraLayers(
          [
            raster(
              (context) => drawCursorCompositionState(context, passes.overlayFrame.cursor!),
              true,
              cursorBounds
            ),
          ],
          passes.overlayFrame.camera,
          true
        )
      );
    if (split) {
      const screen = split.screen;
      const projection: QuickEditHomography = [
        screen.width,
        0,
        screen.x * logical.width,
        0,
        screen.height,
        screen.y * logical.height,
        0,
        0,
        1,
      ];
      const inverse = invertQuickEditProjection(projection);
      if (!inverse) throw new Error('Camera split projection is unavailable.');
      const screenLayer: GpuPreviewLayer = { ...groupLayer(layers), inverse };
      const clippedScreen = screen.clip
        ? groupLayer([
            screenLayer,
            {
              ...raster((context) => {
                context.fillStyle = '#fff';
                context.fillRect(
                  screen.clip!.x * logical.width,
                  screen.clip!.y * logical.height,
                  screen.clip!.width * logical.width,
                  screen.clip!.height * logical.height
                );
              }),
              blend: 'mask',
            },
          ])
        : screenLayer;
      layers = [
        raster((context) => {
          context.fillStyle = '#101014';
          context.fillRect(0, 0, logical.width, logical.height);
        }),
        clippedScreen,
        ...mergeSharp(paintLayers([split.layer], args.effects?.overlayFrames)),
      ];
      const masked = sceneMasks(sceneMasks(layers), split.clipId);
      const cameraMask = raster((context) => {
        context.fillStyle = '#fff';
        context.fillRect(
          split.camera.x * logical.width,
          split.camera.y * logical.height,
          split.camera.width * logical.width,
          split.camera.height * logical.height
        );
      });
      layers.push(groupLayer([...masked, { ...cameraMask, blend: 'mask' }]));
    }
    return { layers, release };
  } catch (error) {
    release();
    throw error;
  }
}
