import { createNativeEffectPreparation } from './effect-preparation';
import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import { prepareEffectRuntimeGpuScene } from '../../../../features/video/composition/effect-runtime/render/gpu-plan';
import { createNativeGpuPreviewMaterials } from './gpu-preview-materials';
import type { PreviewRendererStatus } from '../../../../features/video/preview/preferences';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
} from '../../../../features/video/composition/canvas/gpu-preview';

import { captureNativePreviewSources } from './frame-plan';

import { buildNativeGpuPreviewLayers } from './gpu-preview-layers';
import {
  getFittedMediaContentFrame,
  getFittedMediaWindowFrame,
} from '../../../../features/video/composition/draw/fitted-media';
import { admittedVisualWindowHeader } from '../../../../features/video/composition/draw/window-header';
import { roundedWindowRadius } from '../../../../features/video/project/window-geometry';
import { motionCameraProjection } from '../../../../features/video/composition/motion/spatial';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  type QuickEditHomography,
} from '../../../../features/video/composition/motion/spatial-geometry';

import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import type {
  PreviewSceneRenderInput as Input,
  NativeGpuPreviewRenderer,
  NativePreviewGpuTarget,
} from './types';
import {
  publishCompletedPreviewFrame,
  resolvePreparedPreviewSceneCanvas,
  resolvePreviewSceneCanvasLayout,
  resolvePreviewCompositionFrameSize,
} from './canvas';

type Passes = ReturnType<typeof resolveVideoCompositionRenderPasses>;
type VideoLayer = Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function admittedLayer(input: Input, passes: Passes, depth = false): VideoLayer | null {
  const frame = passes.overlayFrame;
  const pass = passes.visualPasses[0];
  const layer = frame.visualLayers[0];
  if (
    passes.visualPasses.length !== 1 ||
    !pass ||
    pass.alpha !== 1 ||
    pass.transitionOverlays.length ||
    frame.visualLayers.length !== 1 ||
    !layer ||
    layer.kind !== 'video' ||
    layer.trackRole === 'CAMERA' ||
    layer.opacity !== 1 ||
    layer.effectViewportRaster ||
    layer.effectActionsOnly ||
    layer.actions?.length ||
    layer.borders?.length ||
    layer.spotlights?.length ||
    (!depth &&
      (layer.sourceContentTransform ||
        layer.clip.sourceCrop ||
        frame.camera.sourceContentTransform)) ||
    frame.effectRuntimePlans.length ||
    frame.effectInputLayers.length ||
    frame.sceneSpotlights?.length ||
    frame.actions.length ||
    frame.cursor ||
    (frame.camera.sourceClipId && frame.camera.sourceClipId !== layer.clipId)
  )
    return null;
  const activeDepth =
    frame.camera.spatial?.focus.some(
      ({ settings, weight }) => settings.enabled && settings.strength > 0 && weight > 0
    ) === true;
  if (depth ? !activeDepth || layer.rotation !== 0 : activeDepth) return null;
  const orientation = input.decodedVideoFrames?.get(layer.clipId)?.orientation;
  if (orientation && (orientation.rotation !== 0 || orientation.flip)) return null;
  const state = layer.renderState;
  if (
    state.blurAmount !== 0 ||
    state.opacityMultiplier !== 1 ||
    state.scaleX !== 1 ||
    state.scaleY !== 1 ||
    state.translateX !== 0 ||
    state.translateY !== 0
  )
    return null;
  return layer;
}

function layerInverse(layer: VideoLayer, passes: Passes): QuickEditHomography | null {
  const camera = passes.overlayFrame.camera;
  const projection: QuickEditHomography = motionCameraProjection(camera) ?? [
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
  const angle = (layer.rotation * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const x = layer.x + layer.width / 2,
    y = layer.y + layer.height / 2;
  const rotation: QuickEditHomography = [
    c,
    -s,
    x - c * x + s * y,
    s,
    c,
    y - s * x - c * y,
    0,
    0,
    1,
  ];
  return invertQuickEditProjection(multiplyQuickEditProjections(projection, rotation));
}

/** A preview session owns the backend, its immutable raster revisions and captured raw frames. */
export function createNativeGpuPreviewRenderer(
  createBackend: typeof createGpuPreviewRenderer = createGpuPreviewRenderer,
  options: {
    maximumInFlight?: 1 | 2;
    createPreparationExecutor?: (ownerDocument: Document) => EffectRuntimeSandboxExecutor;
  } = {}
): NativeGpuPreviewRenderer {
  let backend: GpuPreviewRenderer | null = null;
  let preparation: Promise<GpuPreviewRenderer | null> | null = null;
  let unavailable = false;
  let fallbackReason: PreviewRendererStatus['fallback'];
  let disposed = false;
  let active = 0;
  let publicationHolds = 0;
  let materialsReleased = false;
  const lifetime = new AbortController();
  const effectPreparation = createNativeEffectPreparation(options.createPreparationExecutor);
  const maximumInFlight = options.maximumInFlight ?? 1;
  const slots = Array.from({ length: maximumInFlight }, () => ({
    materials: createNativeGpuPreviewMaterials(),
    busy: false,
    submitted: false,
    exclusive: false,
  }));
  const settleRetirement = () => {
    if (active) return;
    if ((disposed || unavailable) && !materialsReleased) {
      materialsReleased = true;
      for (const slot of slots) slot.materials.dispose();
    }
    if (disposed && !publicationHolds) {
      const provider = backend;
      backend = null;
      provider?.dispose();
    }
  };
  return {
    get fallbackReason() {
      return fallbackReason;
    },
    get acceptsNativeFrames() {
      return backend !== null && !unavailable && !disposed;
    },
    dispose() {
      disposed = true;
      effectPreparation.dispose();
      lifetime.abort();
      settleRetirement();
    },
    async render(input, passes, finish, isInvalidated, effects, finalArtworkRequired = true) {
      const layer = admittedLayer(input, passes);
      const depthLayer = admittedLayer(input, passes, true);
      if (disposed || unavailable || typeof VideoFrame === 'undefined') return undefined;
      const exclusive = Boolean(input.preparedFrame && input.acquireGpuOutput);
      if (
        active &&
        (!exclusive || slots.some((slot) => slot.busy && (!slot.exclusive || !slot.submitted)))
      )
        throw new Error('Native GPU preview overlap is unavailable.');
      const slot = slots.find((candidate) => !candidate.busy);
      if (!slot) throw new Error('Native GPU preview overlap is unavailable.');
      const materials = slot.materials;
      input = {
        ...input,
        signal: AbortSignal.any(input.signal ? [input.signal, lifetime.signal] : [lifetime.signal]),
      };
      const inverse = layer || depthLayer ? layerInverse((layer ?? depthLayer)!, passes) : null;
      const output = resolvePreviewCompositionFrameSize(input);
      if (!output) return false;
      active++;
      slot.busy = true;
      slot.submitted = false;
      slot.exclusive = exclusive;
      let capturedSources: ReturnType<typeof captureNativePreviewSources> = null;
      let inputDeviceFailure: GpuPreviewDeviceError | undefined;
      let plan: Awaited<ReturnType<typeof buildNativeGpuPreviewLayers>> | undefined;
      let artwork: HTMLCanvasElement | undefined;
      let bordersArtwork: HTMLCanvasElement | undefined;
      let bitmap: ImageBitmap | undefined;
      let staging: HTMLCanvasElement | undefined;
      let acquiredOutput: NativePreviewGpuTarget | undefined;
      let preparedEffects: Awaited<ReturnType<typeof prepareEffectRuntimeGpuScene>> | undefined;
      try {
        preparation ??=
          maximumInFlight === 1 ? createBackend() : createBackend({ maximumInFlight });
        const resolved = await preparation;
        if (unavailable) return false;
        backend = resolved;
        if (disposed) return false;
        const provider = resolved;
        if (!provider) {
          unavailable = true;
          fallbackReason = 'unavailable';
          return undefined;
        }
        if (input.acquireGpuOutput && !provider.createSurface) {
          unavailable = true;
          fallbackReason = 'unavailable';
          return undefined;
        }
        if (input.signal?.aborted || isInvalidated()) return false;
        capturedSources = captureNativePreviewSources(input, passes);
        if (!capturedSources) return false;
        const { frames: captured, media } = capturedSources;
        if (typeof effects === 'function') {
          effects = await effects(async (request) => {
            let graph: Awaited<ReturnType<typeof buildNativeGpuPreviewLayers>> | undefined;
            let completed: ImageBitmap | undefined;
            try {
              const effectFrame = {
                ...passes.overlayFrame,
                visualLayers: [...request.layers],
                effectInputLayers: [],
                effectRuntimePlans: [],
                actions: [],
                cursor: null,
                sceneSpotlights: request.scene?.frame.sceneSpotlights ?? [],
              };
              const backdrop = materials.background(
                { ...input, currentTime: request.time ?? input.currentTime },
                {
                  ...passes,
                  overlayFrame: {
                    ...passes.overlayFrame,
                    camera: request.camera ?? passes.overlayFrame.camera,
                  },
                }
              );
              graph = await buildNativeGpuPreviewLayers({
                sourceMask: materials.sourceMask,
                sourceDecoration: materials.sourceDecoration,
                annotationMask: materials.annotationMask,
                input: { ...input, currentTime: request.time ?? input.currentTime },
                passes: {
                  overlayFrame: effectFrame,
                  visualPasses: [
                    {
                      alpha: 1,
                      time: input.currentTime,
                      frame: effectFrame,
                      transitionOverlays: [],
                    },
                  ],
                },
                sources: captured,
                media,
                background: backdrop,
                inputComposition: request,
              });
              completed = await provider.render({
                output: request.renderDimensions,
                logical: request.dimensions,
                layers: graph.layers,
                signal: input.signal ?? new AbortController().signal,
              });
              if (disposed || input.signal?.aborted || isInvalidated())
                throw new DOMException('Effect input was cancelled', 'AbortError');
              const result = completed;
              completed = undefined;
              return result;
            } catch (error) {
              if (error instanceof GpuPreviewDeviceError) inputDeviceFailure = error;
              throw error;
            } finally {
              completed?.close();
              graph?.release();
            }
          });
        }
        const backdrop = materials.background(input, passes);
        const createArtwork = (phase: 'borders' | 'final') => {
          const canvas = input.canvas.ownerDocument.createElement('canvas');
          canvas.width = input.project.width;
          canvas.height = input.project.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Preview artwork is unavailable.');
          finish(
            {
              context,
              bounds: { width: canvas.width, height: canvas.height },
              dpr: 1,
              viewport: {
                offsetX: 0,
                offsetY: 0,
                width: canvas.width,
                height: canvas.height,
                scale: 1,
              },
            },
            phase
          );
          return canvas;
        };
        if (passes.overlayFrame.viewportBorders?.length) bordersArtwork = createArtwork('borders');
        let layers: GpuPreviewLayer[];
        const selectedLayer = layer ?? depthLayer;
        const source = selectedLayer && captured.get(selectedLayer.clipId);
        const decoded = selectedLayer && input.decodedVideoFrames?.get(selectedLayer.clipId);
        const directDimensions =
          !decoded ||
          (source &&
            decoded.sourceWidth === source.displayWidth &&
            decoded.sourceHeight === source.displayHeight);
        if (layer && inverse && source && directDimensions) {
          const fitted = {
            frame: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
            fitMode: layer.clip.fitMode,
            sourceWidth: source.displayWidth,
            sourceHeight: source.displayHeight,
            displayScale: 1,
            ...admittedVisualWindowHeader(layer.clip, input.imageBank, false),
          };
          const window = getFittedMediaWindowFrame(fitted);
          layers = [
            backdrop,
            ...materials.decoration(input, layer, source, inverse),
            {
              source,
              rect: getFittedMediaContentFrame(fitted),
              inverse,
              clip: {
                rect: window,
                radius: roundedWindowRadius(
                  window.width,
                  window.height,
                  layer.clip.windowCornerRadius ?? 0
                ),
              },
            },
          ];
        } else if (depthLayer && inverse && source && directDimensions) {
          const retained = await materials.depth(
            { input, passes, sources: captured, media, background: backdrop },
            depthLayer,
            source,
            inverse,
            () => disposed
          );
          if (!retained) return false;
          layers = retained;
        } else {
          plan = await buildNativeGpuPreviewLayers({
            sourceMask: materials.sourceMask,
            sourceDecoration: materials.sourceDecoration,
            annotationMask: materials.annotationMask,
            input,
            passes,
            sources: captured,
            media,
            snapshotGroup: async (group) => {
              const bitmap = await provider.render({
                output: group.output,
                logical: group.logical,
                layers: group.layers,
                signal: input.signal ?? new AbortController().signal,
              });
              if (disposed || input.signal?.aborted || isInvalidated()) {
                bitmap.close();
                throw new DOMException('Exposure snapshot was cancelled', 'AbortError');
              }
              return bitmap;
            },
            ...(effects ? { effects } : {}),
            background: backdrop,
            ...(bordersArtwork
              ? {
                  viewportBorders: {
                    source: bordersArtwork,
                    rect: {
                      x: 0,
                      y: 0,
                      width: bordersArtwork.width,
                      height: bordersArtwork.height,
                    },
                    inverse: IDENTITY,
                  },
                }
              : {}),
          });
          layers = plan.layers;
        }
        if ((layer || depthLayer) && bordersArtwork)
          layers.push({
            source: bordersArtwork,
            rect: { x: 0, y: 0, width: bordersArtwork.width, height: bordersArtwork.height },
            inverse: IDENTITY,
          });
        if (finalArtworkRequired) {
          artwork = createArtwork('final');
          layers.push({
            source: artwork,
            rect: { x: 0, y: 0, width: artwork.width, height: artwork.height },
            inverse: IDENTITY,
          });
        }
        let prepared: ReturnType<typeof resolvePreparedPreviewSceneCanvas> = null;
        let layout: ReturnType<typeof resolvePreviewSceneCanvasLayout>;
        if (input.acquireGpuOutput) {
          layout = resolvePreviewSceneCanvasLayout(input);
          if (
            layout.bounds.width <= 0 ||
            layout.bounds.height <= 0 ||
            layout.viewport.width <= 0 ||
            layout.viewport.height <= 0
          )
            return false;
        } else {
          staging = input.stagingCanvas?.() ?? input.canvas.ownerDocument.createElement('canvas');
          prepared = resolvePreparedPreviewSceneCanvas({
            ...input,
            canvas: staging,
            viewportCanvas: input.canvas,
            shouldClearCanvas: false,
          });
          if (!prepared) return false;
          layout = { ...prepared, backing: { width: staging.width, height: staging.height } };
        }
        const viewport = layout.viewport;
        let presentationLayers = layers;
        let logical = { width: input.project.width, height: input.project.height };
        if (
          Math.abs(viewport.offsetX) > 1e-6 ||
          Math.abs(viewport.offsetY) > 1e-6 ||
          Math.abs(viewport.width - layout.bounds.width) > 1e-6 ||
          Math.abs(viewport.height - layout.bounds.height) > 1e-6
        ) {
          logical = { width: layout.bounds.width, height: layout.bounds.height };
          presentationLayers = [
            materials.background(input, passes, logical, 'native-presentation-background'),
            {
              source: { kind: 'group', output, logical: input.project, layers },
              rect: {
                x: viewport.offsetX,
                y: viewport.offsetY,
                width: viewport.width,
                height: viewport.height,
              },
              inverse: IDENTITY,
            },
          ];
        }
        preparedEffects = await prepareEffectRuntimeGpuScene({
          layers: presentationLayers,
          gpu: provider,
          signal: input.signal ?? new AbortController().signal,
        });
        const request = {
          output: layout.backing,
          logical,
          layers: preparedEffects.layers,
          signal: input.signal ?? new AbortController().signal,
          onSubmitted() {
            slot.submitted = true;
            input.onGpuSubmitted?.();
          },
        };
        if (input.acquireGpuOutput) {
          const target = input.acquireGpuOutput(layout.backing, provider);
          acquiredOutput = target;
          await target.surface.present(request);
          if (input.signal?.aborted || disposed || isInvalidated()) return false;
          publicationHolds++;
          acquiredOutput = undefined;
          effectPreparation.update(input, provider);
          let released = false;
          return {
            canvas: target.canvas,
            release() {
              if (released) return;
              released = true;
              try {
                target.release();
              } finally {
                publicationHolds--;
                settleRetirement();
              }
            },
          };
        }
        if (!prepared || !staging) return false;
        bitmap = await provider.render(request);
        if (input.signal?.aborted || disposed || isInvalidated()) return false;
        prepared.context.save();
        try {
          prepared.context.setTransform(1, 0, 0, 1, 0, 0);
          prepared.context.globalAlpha = 1;
          prepared.context.globalCompositeOperation = 'copy';
          prepared.context.filter = 'none';
          prepared.context.shadowColor = 'transparent';
          prepared.context.shadowBlur =
            prepared.context.shadowOffsetX =
            prepared.context.shadowOffsetY =
              0;
          prepared.context.drawImage(bitmap, 0, 0, staging.width, staging.height);
          if (input.signal?.aborted || disposed || isInvalidated()) return false;
          publishCompletedPreviewFrame(input.canvas, staging, !input.deferFrameEvent);
          effectPreparation.update(input, provider);
          return true;
        } finally {
          prepared.context.restore();
        }
      } catch (error) {
        if (input.signal?.aborted || disposed || isInvalidated()) return false;
        if (error instanceof GpuPreviewDeviceError || inputDeviceFailure) {
          unavailable = true;
          effectPreparation.dispose();
          fallbackReason = 'device-failed';
          const failed = backend;
          backend = null;
          failed?.dispose();
          return undefined;
        }
        throw error;
      } finally {
        try {
          acquiredOutput?.release();
        } finally {
          try {
            bitmap?.close();
            capturedSources?.release();
            preparedEffects?.release();
            plan?.release();
            if (artwork) artwork.width = artwork.height = 0;
            if (bordersArtwork) bordersArtwork.width = bordersArtwork.height = 0;
            if (staging && !input.stagingCanvas) staging.width = staging.height = 0;
          } finally {
            slot.busy = false;
            active--;
            settleRetirement();
          }
        }
      }
    },
  };
}
