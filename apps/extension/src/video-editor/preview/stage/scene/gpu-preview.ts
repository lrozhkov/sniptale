import { createNativeGpuPreviewMaterials } from './gpu-preview-materials';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
} from '../../../../features/video/composition/canvas/gpu-preview';

import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
} from '../../../../features/video/composition/draw/media-source';

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
import type { PreviewSceneRenderInput as Input, NativeGpuPreviewRenderer } from './types';
import {
  publishCompletedPreviewFrame,
  resolvePreparedPreviewSceneCanvas,
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
  createBackend: typeof createGpuPreviewRenderer = createGpuPreviewRenderer
): NativeGpuPreviewRenderer {
  let backend: GpuPreviewRenderer | null = null;
  let preparation: Promise<GpuPreviewRenderer | null> | null = null;
  let unavailable = false;
  let disposed = false;
  const materials = createNativeGpuPreviewMaterials();
  const release = () => {
    backend?.dispose();
    backend = null;
    materials.dispose();
  };
  return {
    get acceptsNativeFrames() {
      return backend !== null && !unavailable && !disposed;
    },
    dispose() {
      disposed = true;
      release();
    },
    async render(input, passes, finish, isInvalidated, effects) {
      const layer = admittedLayer(input, passes);
      const depthLayer = admittedLayer(input, passes, true);
      if (disposed || unavailable || typeof VideoFrame === 'undefined') return undefined;
      const inverse = layer || depthLayer ? layerInverse((layer ?? depthLayer)!, passes) : null;
      const output = resolvePreviewCompositionFrameSize(input);
      if (!output) return false;
      const captured = new Map<string, VideoFrame>();
      const media = new Map<string, VideoCompositionMediaSource>();
      for (const [id, source] of Object.entries(input.videoRefs.current))
        if (source) media.set(id, source);
      for (const [id, source] of input.decodedVideoFrames ?? []) media.set(id, source);
      let inputDeviceFailure: GpuPreviewDeviceError | undefined;
      let plan: Awaited<ReturnType<typeof buildNativeGpuPreviewLayers>> | undefined;
      let artwork: HTMLCanvasElement | undefined;
      let bordersArtwork: HTMLCanvasElement | undefined;
      let bitmap: ImageBitmap | undefined;
      let staging: HTMLCanvasElement | undefined;
      try {
        preparation ??= createBackend();
        const resolved = await preparation;
        if (disposed) {
          resolved?.dispose();
          return false;
        }
        backend = resolved;
        if (!backend) {
          unavailable = true;
          return undefined;
        }
        if (input.signal?.aborted || isInvalidated()) return false;
        const needed = new Set(
          [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].flatMap((frame) =>
            [...frame.visualLayers, ...frame.effectInputLayers]
              .filter((item) => item.kind === 'video')
              .map((item) => item.clipId)
          )
        );
        for (const id of needed) {
          const source = media.get(id);
          if (source instanceof HTMLVideoElement) {
            if (source.seeking || source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
              return false;
            captured.set(id, new VideoFrame(source));
          } else if (isVideoCompositionFrameSource(source) && source.toVideoFrame)
            captured.set(id, source.toVideoFrame());
          else throw new Error('GPU decoded source frame is unavailable.');
        }
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
              completed = await backend!.render({
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
            frame: layer,
            fitMode: layer.clip.fitMode,
            sourceWidth: source.displayWidth,
            sourceHeight: source.displayHeight,
            displayScale: 1,
            ...admittedVisualWindowHeader(layer.clip, input.imageBank, false),
          };
          const window = getFittedMediaWindowFrame(fitted);
          layers = [
            backdrop,
            materials.decoration(input, layer, source, inverse),
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
            input,
            passes,
            sources: captured,
            media,
            snapshotGroup: async (group) => {
              const bitmap = await backend!.render({
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
        artwork = createArtwork('final');
        layers.push({
          source: artwork,
          rect: { x: 0, y: 0, width: artwork.width, height: artwork.height },
          inverse: IDENTITY,
        });
        staging = input.stagingCanvas?.() ?? input.canvas.ownerDocument.createElement('canvas');
        const prepared = resolvePreparedPreviewSceneCanvas({
          ...input,
          canvas: staging,
          viewportCanvas: input.canvas,
          shouldClearCanvas: false,
        });
        if (!prepared) return false;
        const viewport = prepared.viewport;
        let presentationLayers = layers;
        let logical = { width: input.project.width, height: input.project.height };
        if (
          Math.abs(viewport.offsetX) > 1e-6 ||
          Math.abs(viewport.offsetY) > 1e-6 ||
          Math.abs(viewport.width - prepared.bounds.width) > 1e-6 ||
          Math.abs(viewport.height - prepared.bounds.height) > 1e-6
        ) {
          logical = { width: prepared.bounds.width, height: prepared.bounds.height };
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
        bitmap = await backend.render({
          output: { width: staging.width, height: staging.height },
          logical,
          layers: presentationLayers,
          signal: input.signal ?? new AbortController().signal,
        });
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
          publishCompletedPreviewFrame(input.canvas, staging);
          return true;
        } finally {
          prepared.context.restore();
        }
      } catch (error) {
        if (input.signal?.aborted || disposed || isInvalidated()) return false;
        if (error instanceof GpuPreviewDeviceError || inputDeviceFailure) {
          unavailable = true;
          release();
          return undefined;
        }
        throw error;
      } finally {
        bitmap?.close();
        for (const frame of captured.values()) frame.close();
        plan?.release();
        if (artwork) artwork.width = artwork.height = 0;
        if (bordersArtwork) bordersArtwork.width = bordersArtwork.height = 0;
        if (staging && !input.stagingCanvas) staging.width = staging.height = 0;
      }
    },
  };
}
