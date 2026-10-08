import type {
  RenderResources,
  RenderCanvasLease,
} from '../../features/video/composition/canvas/render-resources';
import type {
  QuickEditAdvancedState,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';
import type { reviewCutTransitionAt } from '../../features/video/review/cuts';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import { resolveReviewAssetBytes } from './asset-bytes';
import { createReviewBackgroundPainter } from './scene-background';
import { loadReviewWindowHeader, reviewWindowHeaderUrl } from './window-header';
import { measureReviewWatermark } from './render-watermark';
import type { createReviewWatermarkRenderer } from './render-watermark';
import {
  calculatePreviewPreparationAllocation,
  calculatePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import { createReviewSpatialRenderer } from './spatial-renderer';
import { drawReviewSceneFrame } from './scene-frame';
import { drawReviewSceneOverlays } from './render-scene-overlays';
import { drawReviewWebcam } from './render-webcam';
import { drawReviewKeys } from './render-key-animation';
import {
  paintReviewCutTransition,
  paintReviewCutBlackout,
  type ReviewTransitionFrames,
} from './cut-transition-frames';
import { QuickEditExportUnavailable } from './export-unavailable';

type Size = { width: number; height: number };
type Dimensions = { canonical: Size; backing: Size };
type Scene = {
  source: Size;
  canvas?: Size;
  background: QuickEditAdvancedState['background'];
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  watermark?: QuickEditAdvancedState['watermark'];
  webcam?: QuickEditAdvancedState['webcam'];
  zoomRegions: readonly QuickEditZoomRegion[];
  comments: readonly CanvasCommentExport[];
  keys: readonly ReviewKeyCue[];
  clicks: readonly ReviewClickCue[];
};
type Drawable = {
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
};
type Frame = {
  generation: number;
  sourceTime: number;
  resultTime: number;
  source: Drawable & { timestamp: number; backing: Size };
  camera?: {
    representedMediaTime: number;
    generation: number;
    source: Size;
    placement: QuickEditWebcamPlacement;
    crop?: Pick<NonNullable<Scene['webcam']>['appearance'], 'zoom' | 'panX' | 'panY'>;
    drawable: Drawable;
  };
  /** Explicit editor target overrides suppress camera exposure sampling. */
  cameraTransform?: QuickEditCameraTransform;
  transition?: {
    blend: NonNullable<ReturnType<typeof reviewCutTransitionAt>>;
    frames: ReviewTransitionFrames;
  };
};
type PreparedScene = { generation: number; scene: Scene; dimensions: Dimensions };
type Prepared = {
  generation: number;
  watermarkBounds: NonNullable<Assets['watermark']>['bounds'];
  allocationAssets: PreviewRenderAllocationInput['assets'];
  release(): void;
};
type Allocation = {
  describe(): PreviewRenderAllocationInput;
  replaceLimits(limits: { maximumManagedBytes: number; maximumCanvases: number }): void;
};
type Assets = {
  allocation: PreviewRenderAllocationInput['assets'];
  background: ImageBitmap | null;
  header: ImageBitmap | null;
  watermark: Awaited<ReturnType<typeof createReviewWatermarkRenderer>> | null;
  painter: ReturnType<typeof createReviewBackgroundPainter>;
  spatial: ReturnType<typeof createReviewSpatialRenderer> | undefined;
  reservations: { release(): void }[];
};

function validSize(size: Size) {
  if (![size.width, size.height].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('Invalid preview dimensions.');
}

function disposeAssets(assets: Assets) {
  assets.watermark?.dispose();
  assets.watermark = null;
  assets.background?.close();
  assets.background = null;
  assets.header?.close();
  assets.header = null;
  assets.painter.dispose();
  assets.spatial?.dispose();
  assets.spatial = undefined;
  for (const reservation of assets.reservations.splice(0)) reservation.release();
}

function scaledBackground(background: Scene['background'], scale: number): Scene['background'] {
  return background.enabled
    ? {
        ...background,
        layout: {
          ...background.layout,
          cornerRadius: background.layout.cornerRadius * scale,
          ...(background.layout.blur === undefined ? {} : { blur: background.layout.blur * scale }),
        },
      }
    : background;
}

/** Authored inputs feed both layouts; raster-dependent paint properties are scaled exactly once. */
function sceneRequest(prepared: PreparedScene, frame: Frame) {
  const { scene, dimensions } = prepared;
  const camera =
    frame.cameraTransform ?? evaluateQuickEditCameraAtTime(scene.zoomRegions, frame.resultTime);
  const input = {
    source: scene.source,
    canvas: scene.canvas,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera,
  };
  const canonicalLayout = computeQuickEditSceneLayout({ ...input, output: dimensions.canonical });
  const layout = computeQuickEditSceneLayout({ ...input, output: dimensions.backing });
  const authoredWidth = scene.canvas?.width ?? scene.source.width;
  return {
    camera,
    layout,
    canonicalLayout,
    sceneScale: dimensions.backing.width / authoredWidth,
    background: scaledBackground(scene.background, dimensions.backing.width / authoredWidth),
    canonicalBackground: scaledBackground(
      scene.background,
      dimensions.canonical.width / authoredWidth
    ),
    scaleX: dimensions.backing.width / dimensions.canonical.width,
    scaleY: dimensions.backing.height / dimensions.canonical.height,
  };
}

async function prepareAssets(
  prepared: PreparedScene,
  assets: Assets,
  resources: RenderResources,
  signal: AbortSignal,
  readAsset: typeof resolveReviewAssetBytes,
  admit: (measurement: boolean) => void
) {
  const { scene, dimensions } = prepared;
  admit(false);
  if (scene.background.enabled && scene.background.type === 'image') {
    const blob = await readAsset(scene.background.assetId);
    signal.throwIfAborted();
    if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
    const bitmap = await createImageBitmap(blob);
    try {
      signal.throwIfAborted();
      validSize(bitmap);
      assets.allocation.backgroundBitmap = { width: bitmap.width, height: bitmap.height };
      admit(false);
      assets.reservations.push(
        resources.bytes('preview-background-bitmap', bitmap.width * bitmap.height * 4)
      );
      assets.background = bitmap;
    } catch (failure) {
      bitmap.close();
      throw failure;
    }
  }
  if (scene.windowHeader) {
    const layout = computeQuickEditSceneLayout({
      source: scene.source,
      canvas: scene.canvas,
      output: dimensions.backing,
      background: scene.background,
      windowHeader: scene.windowHeader,
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    const backing = {
      width: Math.max(1, Math.ceil(layout.windowRect.width)),
      height: Math.max(1, Math.ceil(layout.videoRect.y - layout.windowRect.y)),
    };
    assets.allocation.headerBitmap = backing;
    admit(false);
    assets.reservations.push(
      resources.bytes('preview-header-bitmap', backing.width * backing.height * 4)
    );
    assets.header = await loadReviewWindowHeader(
      reviewWindowHeaderUrl(scene.windowHeader, scene.source.width, scene.source.height),
      signal,
      { backing }
    );
    signal.throwIfAborted();
  }
  admit(scene.watermark?.mode === 'text' && Boolean(scene.watermark.text.value));
  const watermark = await measureReviewWatermark(scene.watermark, dimensions.canonical, signal, {
    scaleX: dimensions.backing.width / dimensions.canonical.width,
    scaleY: dimensions.backing.height / dimensions.canonical.height,
    resources,
  });
  signal.throwIfAborted();
  assets.allocation.watermark = watermark.cache
    ? {
        cache: watermark.cache,
        preparation: watermark.source
          ? { kind: 'image', source: watermark.source }
          : { kind: 'text' },
      }
    : null;
  admit(false);
  assets.watermark = await watermark.paint(readAsset);
  signal.throwIfAborted();
  if (document.fonts) await document.fonts.ready;
  signal.throwIfAborted();
}

function drawPreparedFrame(
  prepared: PreparedScene,
  assets: Assets,
  output: RenderCanvasLease,
  frame: Frame,
  resources: RenderResources
) {
  const request = sceneRequest(prepared, frame);
  const { scene, dimensions } = prepared;
  const { context, canvas } = output;
  let transition: RenderCanvasLease | undefined;
  try {
    let sample: Drawable = frame.source;
    if (frame.transition) {
      validSize(frame.source.backing);
      transition = resources.canvas('preview-transition-source', frame.source.backing);
      paintReviewCutTransition(
        transition.context,
        transition.canvas,
        frame.transition.blend,
        frame.transition.frames,
        frame.source
      );
      const raster = transition.canvas;
      sample = {
        draw: (target, x, y, width, height) => target.drawImage(raster, x, y, width, height),
      };
    }
    if (request.layout.spatial && !assets.spatial)
      throw new Error('Preview spatial preparation is unavailable.');
    const drawScene = {
      canvas,
      layout: request.layout,
      background: request.background,
      image: assets.background,
      headerImage: assets.header,
      sample,
      deferComments: true,
      comments: scene.comments.filter((comment) =>
        isCanvasCommentVisibleAt(comment, frame.sourceTime)
      ),
      sourceTime: frame.sourceTime,
      cameraScale: request.camera.scale,
      sceneScale: request.sceneScale,
      resources,
      backgroundPainter: assets.painter,
      commentSpace: {
        canvas: dimensions.canonical,
        layout: request.canonicalLayout,
        background: request.canonicalBackground,
        cameraScale: request.camera.scale,
      },
    };
    drawReviewSceneFrame(context, {
      ...drawScene,
      spatialRenderer: assets.spatial,
      windowRasterBacking: {
        width: Math.max(1, Math.ceil(request.layout.windowRect.width)),
        height: Math.max(1, Math.ceil(request.layout.windowRect.height)),
      },
      motionBlur: frame.cameraTransform
        ? undefined
        : quickEditMotionBlurCameras(scene.zoomRegions, frame.resultTime),
    });
    drawReviewSceneOverlays({
      scene: drawScene,
      renderer: assets.spatial,
      context,
      canvas,
      spotlightScratch: null,
      regions: scene.zoomRegions,
      globalResultTime: frame.resultTime,
      cameraScale: request.camera.scale,
      sourceWidth: scene.source.width,
      clicks: scene.clicks,
    });
    if (frame.camera && scene.webcam)
      drawReviewWebcam(
        context,
        dimensions.backing,
        scene.webcam,
        frame.camera.placement,
        frame.camera.source,
        frame.camera.drawable,
        frame.camera.crop
      );
    context.save();
    try {
      context.scale(request.scaleX, request.scaleY);
      drawReviewKeys(context, scene.keys, frame.resultTime, dimensions.canonical);
      assets.watermark?.draw(context);
    } finally {
      context.restore();
    }
    paintReviewCutBlackout(context, dimensions.backing, frame.transition?.blend ?? null);
  } finally {
    transition?.release();
  }
}

function admitRender(allocation: Allocation | undefined, prepared: PreparedScene, assets: Assets) {
  if (!allocation) return;
  const input = allocation.describe();
  allocation.replaceLimits(
    calculatePreviewRenderAllocation({
      ...input,
      publication: { ...input.publication, backing: prepared.dimensions.backing },
      assets: assets.allocation,
    })
  );
}

/** One prepared scene owner; transport, immutable capture and publication remain with the caller. */
export function createReviewPreviewRenderer(args: {
  resources: RenderResources;
  allocation?: Allocation;
  readAsset?: typeof resolveReviewAssetBytes;
  onContextLost?: () => void;
}) {
  let generation = 0;
  let disposed = false;
  let current: { prepared: PreparedScene; assets: Assets; key: string } | null = null;
  let preparation: AbortController | null = null;
  const leases = new Set<Prepared>();
  const clear = () => {
    if (current) disposeAssets(current.assets);
    current = null;
  };
  const lease = (prepared: PreparedScene, assets: Assets, signal: AbortSignal): Prepared => {
    const handle: Prepared = {
      generation: prepared.generation,
      watermarkBounds: structuredClone(
        assets.watermark?.bounds ?? { x: 0, y: 0, width: 0, height: 0 }
      ),
      allocationAssets: structuredClone(assets.allocation),
      release() {
        leases.delete(handle);
        signal.removeEventListener('abort', handle.release);
      },
    };
    leases.add(handle);
    signal.addEventListener('abort', handle.release, { once: true });
    return handle;
  };
  return {
    async prepare(scene: Scene, dimensions: Dimensions, signal: AbortSignal): Promise<Prepared> {
      if (disposed) throw new Error('Preview renderer is disposed.');
      validSize(scene.source);
      validSize(dimensions.canonical);
      validSize(dimensions.backing);
      signal.throwIfAborted();
      const key = JSON.stringify([scene, dimensions]);
      if (current?.key === key) {
        admitRender(args.allocation, current.prepared, current.assets);
        return lease(current.prepared, current.assets, signal);
      }
      preparation?.abort();
      clear();
      const controller = new AbortController();
      preparation = controller;
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      const prepared = structuredClone({ generation: ++generation, scene, dimensions });
      const assets: Assets = {
        allocation: {
          backgroundBitmap: null,
          headerBitmap: null,
          watermark: null,
          previousWatermarkCache: null,
        },
        background: null,
        header: null,
        watermark: null,
        painter: createReviewBackgroundPainter(args.resources),
        spatial: undefined,
        reservations: [],
      };
      controller.signal.addEventListener('abort', () => disposeAssets(assets), { once: true });
      try {
        await prepareAssets(
          prepared,
          assets,
          args.resources,
          controller.signal,
          args.readAsset ?? resolveReviewAssetBytes,
          (measurement) => {
            controller.signal.throwIfAborted();
            if (!args.allocation) return;
            const input = args.allocation.describe();
            args.allocation.replaceLimits(
              calculatePreviewPreparationAllocation({
                previousFront: input.publication.previousFront,
                retainedCamera: input.admission.camera.retained,
                retainedTransition: input.admission.transition,
                backgroundBitmap: assets.allocation.backgroundBitmap,
                headerBitmap: assets.allocation.headerBitmap,
                watermark: assets.allocation.watermark,
                measurement,
              })
            );
          }
        );
        controller.signal.throwIfAborted();
        admitRender(args.allocation, prepared, assets);
        if (
          prepared.scene.zoomRegions.some(
            (region) =>
              !region.dormant &&
              !region.border &&
              !region.spotlight &&
              (region.perspective?.enabled || region.depthOfField?.enabled)
          )
        )
          assets.spatial = createReviewSpatialRenderer(args.onContextLost, args.resources);
        current = { prepared, assets, key };
        return lease(prepared, assets, signal);
      } catch (failure) {
        disposeAssets(assets);
        throw failure;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
    render(prepared: Prepared, frame: Frame) {
      if (disposed || !leases.has(prepared) || current?.prepared.generation !== prepared.generation)
        throw new Error('Preview scene is stale.');
      if (![frame.source.timestamp, frame.sourceTime, frame.resultTime].every(Number.isFinite))
        throw new Error('Invalid preview frame time.');
      const output = args.resources.canvas(
        'preview-publication',
        current.prepared.dimensions.backing,
        { alpha: false }
      );
      try {
        drawPreparedFrame(current.prepared, current.assets, output, frame, args.resources);
        return {
          ...output,
          generation: frame.generation,
          sceneGeneration: prepared.generation,
          sourceTime: frame.sourceTime,
          resultTime: frame.resultTime,
          representedMediaTime: frame.source.timestamp,
          cameraMediaTime: frame.camera?.representedMediaTime ?? null,
          cameraGeneration: frame.camera?.generation ?? null,
        };
      } catch (failure) {
        output.release();
        throw failure;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const handle of leases) handle.release();
      preparation?.abort();
      preparation = null;
      clear();
    },
  };
}
