import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import { createZoomPreviewGpuArtwork } from './zoom-preview-gpu-artwork';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type GpuPreviewLayer,
  type GpuPreviewGroup,
} from '../../features/video/composition/canvas/gpu-preview';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSpatialWindow,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { SceneSpotlightLayer } from '../../features/video/composition/draw/spotlight';
import type { SceneBorderFrame } from '../../features/video/composition/scene-border';
import { drawSceneBorders } from '../../features/video/composition/draw/border';
import { createReviewBackgroundPainter } from '../../workflows/video-review/scene-background';
import { createPreviewRenderResources } from '../../workflows/video-review/preview-render-resources';
import {
  createReviewGpuPrimitives,
  applyReviewGpuSpotlightFrames,
} from '../../workflows/video-review/gpu-preview-layers';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import type { ZoomPreviewLayout } from './zoom-preview-paint';
import { reviewGpuSourcePlane } from '../../workflows/video-review/gpu-preview-geometry';

const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Inspector scene inputs retain the existing authored gesture and history authorities. */
export interface ZoomPreviewGpuInput {
  currentTime?: number | undefined;
  /** Physical source clock and navigation intent frozen with this scene. */
  liveSource?:
    | {
        readonly url: string;
        readonly time: number;
        readonly seekRevision: number;
        readonly segmentStart?: number | null;
      }
    | undefined;
  sourceSelection?: ZoomPreviewFrame['selection'];
  auxiliary?:
    | {
        scene: import('../../features/video/review/advanced/types').QuickEditCameraSceneInput;
        focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
      }
    | undefined;
  background: QuickEditBackgroundSettings;
  imageUrl: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  camera: QuickEditCameraTransform;
  frame: ZoomPreviewFrame | null;
  live?: boolean | undefined;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
  view: 'area' | 'result';
  cornerRadius: number;
  previewScale?: number | undefined;
  lensFrames?: readonly SceneSpotlightLayer[] | undefined;
  spotlightFrames?: readonly SceneSpotlightLayer[] | undefined;
  borderFrames?: readonly SceneBorderFrame[] | undefined;
  exposures?: readonly { camera: QuickEditCameraTransform; alpha: number }[] | undefined;
  /** Playback poses coalesce without cancelling a valid earlier temporal frame. */
  authoringRevision?: string | undefined;
  region?: QuickEditZoomRegion | undefined;
}

/** Derive the source-plane transform once for GPU sampling and inspector gesture projection. */
export function zoomPreviewGpuProjection(
  input: Pick<ZoomPreviewGpuInput, 'view' | 'camera' | 'layout' | 'background'>,
  camera = input.camera
) {
  if (input.view === 'area')
    return {
      projection: identity,
      inverse: identity,
      windowProjection: identity,
      windowInverse: identity,
    };
  const layout = {
    ...input.layout,
    videoTransform: computeQuickEditVideoTransform({
      videoRect: input.layout.videoRect,
      windowRect: input.layout.windowRect,
      camera,
    }),
  };
  if (camera.spatial) layout.spatial = camera.spatial;
  else delete layout.spatial;
  const plane = reviewGpuSourcePlane(layout, input.background);
  const projection = multiplyQuickEditProjections(plane.outerProjection, plane.innerProjection);
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) throw new Error('Inspector preview projection is unavailable.');
  return {
    projection,
    inverse,
    windowProjection: plane.outerProjection,
    windowInverse: plane.outerInverse,
  };
}

/** Pointer coordinates start in the already zoomed plane; cancel that affine step in the shared GPU matrix. */
export function zoomPreviewGpuPointerProjection(
  input: ZoomPreviewGpuInput
): QuickEditHomography | undefined {
  if (input.view !== 'result' || !input.camera.spatial) return undefined;
  const base = input.layout.videoRect;
  const display = computeQuickEditVideoTransform({
    videoRect: base,
    windowRect: input.layout.windowRect,
    camera: input.camera,
  });
  const inverseZoom: QuickEditHomography = [
    base.width / display.width,
    0,
    base.x - (display.x * base.width) / display.width,
    0,
    base.height / display.height,
    base.y - (display.y * base.height) / display.height,
    0,
    0,
    1,
  ];
  return multiplyQuickEditProjections(zoomPreviewGpuProjection(input).projection, inverseZoom);
}

/** A transient source-readiness failure that the presentation queue can retry. */
export class PendingZoomPreviewFrame extends Error {
  override name = 'PendingZoomPreviewFrame';
}

/** Render borrowed inputs; the caller closes the completed bitmap after publication. */
export type MiniRenderer = {
  render(
    input: ZoomPreviewGpuInput,
    signal: AbortSignal,
    source?: VideoCompositionFrameSource
  ): Promise<ImageBitmap | null>;
  dispose(): void;
};

/** One inspector owns a bounded GPU device, static artwork and primitive-only raster resources. */
export function createZoomPreviewGpuRenderer(): MiniRenderer {
  // The shared GPU cap is 256 MiB; the remainder covers source-density artwork and vector scratch.
  const resources = createPreviewRenderResources({
    maximumManagedBytes: 384 * 1024 * 1024,
    maximumCanvases: 48,
  });
  const painter = createReviewBackgroundPainter(resources);
  let initialization: Promise<GpuPreviewRenderer | null> | null = null;
  let renderer: GpuPreviewRenderer | null = null;
  let unavailable = false;
  let disposed = false;
  const artwork = createZoomPreviewGpuArtwork(resources, painter);
  let active = 0;
  let retired = false;
  const retire = () => {
    if (!disposed || active || retired) return;
    retired = true;
    renderer?.dispose();
    painter.dispose();
    artwork.dispose();
    resources.dispose();
  };
  return {
    async render(input, signal, borrowed) {
      if (unavailable || disposed) return null;
      active++;
      let owned: VideoFrame | null = null;
      const primitives = createReviewGpuPrimitives(resources);
      try {
        const live = input.frame?.image;
        if (
          !borrowed &&
          typeof HTMLVideoElement !== 'undefined' &&
          live instanceof HTMLVideoElement &&
          (live.readyState < 2 || live.seeking)
        )
          throw new PendingZoomPreviewFrame();
        if (typeof VideoFrame === 'undefined') return null;
        initialization ??= createGpuPreviewRenderer({
          reserve: (bytes) => resources.bytes('inspector-gpu', bytes),
        });
        renderer = await initialization;
        signal.throwIfAborted();
        if (!renderer || disposed) {
          unavailable = true;
          return null;
        }
        const art = await artwork.prepare(input, signal);
        let source: GpuPreviewLayer['source'];
        const imageSource = input.frame?.image;
        if (borrowed) {
          if (!borrowed.toVideoFrame) throw new Error('Inspector source frame is unavailable.');
          owned = borrowed.toVideoFrame();
          source = owned;
        } else if (
          typeof HTMLVideoElement !== 'undefined' &&
          imageSource instanceof HTMLVideoElement
        ) {
          try {
            owned = new VideoFrame(imageSource);
          } catch (error) {
            if (error instanceof DOMException && error.name === 'InvalidStateError')
              throw new PendingZoomPreviewFrame();
            throw error;
          }
          source = owned;
        } else source = artwork.source(input.frame);
        const full = { x: 0, y: 0, ...input.output };
        const originalLayers: GpuPreviewLayer[] = [
          {
            source: art.decoration.canvas,
            rect: art.rect,
            inverse: identity,
            cache: { key: 'mini-decoration', revision: art },
          },
          ...(art.header
            ? [
                {
                  source: art.header.canvas,
                  rect: {
                    x: input.layout.windowRect.x,
                    y: input.layout.windowRect.y,
                    width: input.layout.windowRect.width,
                    height:
                      (input.layout.visibleVideoRect ?? input.layout.videoRect).y -
                      input.layout.windowRect.y,
                  },
                  inverse: identity,
                  clip: { rect: input.layout.windowRect, radius: input.cornerRadius },
                  cache: { key: 'mini-header', revision: art },
                },
              ]
            : []),
          {
            source,
            ...(borrowed?.orientation ? { orientation: borrowed.orientation } : {}),
            rect: input.layout.videoRect,
            inverse: identity,
            clip: { rect: input.layout.windowRect, radius: input.cornerRadius },
            ...(input.live || (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
              ? {}
              : { cache: { key: 'mini-source', revision: source } }),
          },
        ];
        const density = input.frame
          ? Math.max(1, input.frame.width / input.layout.videoRect.width)
          : 1;
        const original: GpuPreviewGroup = {
          kind: 'group',
          logical: input.output,
          output: {
            width: Math.max(1, Math.ceil(input.output.width * density)),
            height: Math.max(1, Math.ceil(input.output.height * density)),
          },
          layers: originalLayers,
        };
        const exposures =
          input.view === 'result' && input.exposures?.length
            ? input.exposures
            : [{ camera: input.camera, alpha: 1 }];
        const windowLayers: GpuPreviewLayer[] = [];
        for (const exposure of exposures) {
          const layout = {
            ...input.layout,
            videoTransform: computeQuickEditVideoTransform({
              videoRect: input.layout.videoRect,
              windowRect: input.layout.windowRect,
              camera: exposure.camera,
            }),
          };
          if (exposure.camera.spatial) layout.spatial = exposure.camera.spatial;
          else delete layout.spatial;
          const plane = reviewGpuSourcePlane(layout, input.background);
          const planeLayers =
            input.view === 'area'
              ? originalLayers
              : originalLayers.map((layer) => {
                  if (layer.source === art.decoration.canvas)
                    return { ...layer, rect: plane.shadowRect(art.rect) };
                  if (layer.source === source)
                    return {
                      ...layer,
                      rect: plane.video,
                      clip: { rect: plane.clip, radius: input.cornerRadius * plane.clipScale },
                    };
                  if (layer.source === art.header?.canvas)
                    return {
                      ...layer,
                      rect: plane.header,
                      clip: { rect: plane.clip, radius: input.cornerRadius * plane.clipScale },
                    };
                  return layer;
                });
          const inverse = input.view === 'area' ? identity : plane.outerInverse;
          const planeSource: GpuPreviewGroup = { ...original, layers: planeLayers };
          const focus =
            input.view === 'result' &&
            exposure.camera.spatial?.focus.some(
              (entry) => entry.settings.enabled && entry.weight > 0
            );
          if (focus || exposures.length > 1)
            windowLayers.push({
              source: planeSource,
              rect: full,
              inverse,
              ...(focus
                ? { depth: { frame: exposure.camera.spatial!, window: input.layout.windowRect } }
                : {}),
              opacity: exposure.alpha,
              ...(exposures.length > 1 ? { blend: 'add' as const } : {}),
            });
          else windowLayers.push(...planeLayers.map((layer) => ({ ...layer, inverse })));
        }
        const motion = computeQuickEditSceneCamera(input.layout, input.background);
        const inverse: QuickEditHomography =
          input.view === 'area' ||
          input.camera.spatial?.lockBackground ||
          motion.backgroundScale === 1
            ? identity
            : [
                1 / motion.backgroundScale,
                0,
                -motion.x / motion.backgroundScale,
                0,
                1 / motion.backgroundScale,
                -motion.y / motion.backgroundScale,
                0,
                0,
                1,
              ];
        const dimensions = { canonical: input.output, backing: input.output };
        const window: GpuPreviewGroup = {
          kind: 'group',
          output: input.output,
          logical: input.output,
          layers: windowLayers,
        };
        const base: GpuPreviewGroup = {
          kind: 'group',
          output: input.output,
          logical: input.output,
          layers: [
            {
              source: art.background.canvas,
              rect: full,
              inverse,
              cache: { key: 'mini-background', revision: art.backgroundRevision },
            },
            { source: window, rect: full, inverse: identity },
          ],
        };
        const focused = applyReviewGpuSpotlightFrames({
          dimensions,
          frames: input.spotlightFrames ?? input.lensFrames ?? [],
          source: base,
          primitives,
        });
        const layers: GpuPreviewLayer[] = [{ source: focused, rect: full, inverse: identity }];
        if (input.borderFrames?.length) {
          const motion = computeQuickEditSceneCamera(input.layout, input.background);
          const border = primitives.raster('inspector-gpu-borders', input.output, (context) =>
            drawSceneBorders(
              context,
              input.output,
              input.borderFrames ?? [],
              { rect: motion.windowClip, radius: input.cornerRadius * motion.scale },
              resources
            )
          );
          const target = computeQuickEditSpatialWindow(input.layout, input.background);
          const overlayInverse =
            input.view === 'result' && input.camera.spatial
              ? invertQuickEditProjection(
                  quickEditPlaneProjection(target, target, input.camera.spatial)
                )
              : identity;
          if (!overlayInverse) throw new Error('Inspector overlay projection is unavailable.');
          layers.push({ source: border, rect: full, inverse: overlayInverse });
        }
        return await renderer.render({
          output: input.output,
          logical: input.output,
          layers,
          signal,
        });
      } catch (error) {
        if (signal.aborted || !(error instanceof GpuPreviewDeviceError)) throw error;
        unavailable = true;
        renderer?.dispose();
        artwork.clear();
        return null;
      } finally {
        primitives.dispose();
        owned?.close();
        active--;
        retire();
      }
    },
    dispose() {
      disposed = true;
      retire();
    },
  };
}
