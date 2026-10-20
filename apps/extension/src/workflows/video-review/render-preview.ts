import type { PreviewScene as Scene, PreviewSceneDimensions as Dimensions } from './preview-scene';
import { hasCameraPerspective as hasQuickEditPerspective } from '../../features/video/project/motion/spatial';
import {
  presentationMainColorOpacity,
  presentationMainColor,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import type {
  RenderResources,
  RenderCanvasLease,
} from '../../features/video/composition/canvas/render-resources';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import { isCanvasCommentVisibleAt } from '../../features/video/review/comments';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';
import type { reviewCutTransitionAt } from '../../features/video/review/cuts';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import { resolveReviewAssetBytes } from './asset-bytes';
import { createReviewBackgroundPainter } from './scene-background';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
  reviewWindowRasterBacking,
} from './window-header';
import { evaluateReviewClicks } from '../../features/video/review/click-animation';
import { measureReviewWatermark } from './render-watermark';
import type { createReviewWatermarkRenderer } from './render-watermark';
import {
  resolvePreviewRenderAllocation,
  calculatePreviewPreparationAllocation,
  calculatePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import { createReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import { drawReviewSceneFrame } from './scene-frame';
import { drawReviewSceneOverlays } from './render-scene-overlays';
import { drawReviewWebcam } from './render-webcam';
import { drawReviewKeys } from './render-key-animation';
import {
  paintReviewCutTransition,
  paintReviewCutDissolve,
  reviewCutTransitionSides,
  paintReviewCutBlackout,
  type ReviewTransitionFrames,
} from './cut-transition-frames';
import { QuickEditExportUnavailable } from './export-unavailable';
import { prepareReviewCaptions } from './render-captions';
import { reviewCaptionReservations } from './caption-reservations';
import {
  createReviewAnnotationRenderer,
  reviewAnnotationPreparationBytes,
} from './annotation-renderer';

type Size = { width: number; height: number };
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
  fps?: number;
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
    resultOffset?: number;
  };
};
type PreparedScene = { generation: number; scene: Scene; dimensions: Dimensions };
type Prepared = {
  generation: number;
  watermarkBounds: NonNullable<Assets['watermark']>['bounds'];
  allocationAssets: PreviewRenderAllocationInput['assets'];
  captionConflicts: Awaited<ReturnType<typeof prepareReviewCaptions>>['plan']['conflicts'];
  release(): void;
};
type Allocation = {
  describe(): PreviewRenderAllocationInput;
  replaceLimits(limits: { maximumManagedBytes: number; maximumCanvases: number }): void;
};
type Assets = {
  annotations: Awaited<ReturnType<typeof createReviewAnnotationRenderer>> | null;
  captions: Awaited<ReturnType<typeof prepareReviewCaptions>> | null;
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
  assets.annotations?.dispose();
  assets.annotations = null;
  assets.captions = null;
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
    frame.cameraTransform ??
    evaluateQuickEditCameraAtTime(scene.zoomRegions, frame.resultTime, {
      source: scene.source,
      canvas: scene.canvas,
      background: scene.background,
      windowHeader: scene.windowHeader,
      output: dimensions.backing,
    });
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
  admit: (measurement: boolean) => void,
  annotationExecutor: Parameters<typeof createReviewAnnotationRenderer>[1]['createExecutor']
) {
  const { scene, dimensions } = prepared;
  const annotationScene = scene.annotationEffects
    ? {
        ...scene.annotationEffects,
        planes: { content: scene.source, viewport: dimensions.canonical },
      }
    : undefined;
  if (annotationScene)
    assets.allocation.annotationSourceBytes = reviewAnnotationPreparationBytes(annotationScene);
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
    const magnify = scene.clicks.some(
      (cue) =>
        !cue.gesture && cue.settings.effect === 'magnify' && (cue.settings.magnification ?? 1.6) > 1
    );
    const joined = reviewWindowRasterBacking({
      windowRect: layout.windowRect,
      sourceWidth: scene.source.width * (layout.sourceCrop?.width ?? 1),
      magnify,
    });
    const backing = {
      width: joined.width,
      height: Math.max(
        1,
        Math.ceil(
          ((layout.visibleVideoRect ?? layout.videoRect).y - layout.windowRect.y) *
            (magnify ? joined.width / layout.windowRect.width : 1)
        )
      ),
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
  if (scene.captions) {
    admit(Boolean(scene.captions.settings?.enabled));
    assets.captions = await prepareReviewCaptions({
      ...scene.captions,
      output: dimensions.canonical,
      signal,
      resources,
      reservations: (context) =>
        reviewCaptionReservations({
          scene,
          context,
          output: dimensions.canonical,
          watermarkBounds: assets.watermark?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
        }),
    });
    admit(false);
  }
  if (annotationScene) {
    assets.annotations = await createReviewAnnotationRenderer(annotationScene, {
      resources,
      signal,
      readAsset: async (reference, signal) => {
        signal.throwIfAborted();
        const blob = await readAsset(reference);
        signal.throwIfAborted();
        return blob;
      },
      ...(annotationExecutor ? { createExecutor: annotationExecutor } : {}),
    });
    signal.throwIfAborted();
  }
}

async function drawPreparedFrame(
  prepared: PreparedScene,
  assets: Assets,
  output: RenderCanvasLease,
  frame: Frame,
  resources: RenderResources,
  signal: AbortSignal,
  admit: (frame: Frame, bitmaps: readonly Size[]) => void
) {
  const request = sceneRequest(prepared, frame);
  const { scene, dimensions } = prepared;
  const { context, canvas } = output;
  let transition: RenderCanvasLease | undefined;
  try {
    let sample: Drawable = frame.source;
    if (frame.transition && frame.transition.blend.plan.type !== 'dissolve') {
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
    const draw = async (
      context: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      frame: Frame,
      sample: Drawable
    ) => {
      const request = sceneRequest(prepared, frame);
      if (request.layout.spatial && !assets.spatial)
        throw new Error('Preview spatial preparation is unavailable.');
      const drawScene = {
        canvas,
        backgroundCacheContext: output.context,
        layout: request.layout,
        background: request.background,
        image: assets.background,
        headerImage: assets.header,
        sample,
        deferComments: true,
        comments: scene.comments
          .filter((comment) => isCanvasCommentVisibleAt(comment, frame.sourceTime))
          .map((comment) =>
            scene.showEditorComments ? { ...comment, renderToVideo: true } : comment
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
      const density = {
        content: {
          width: request.layout.videoTransform.width / scene.source.width,
          height: request.layout.videoTransform.height / scene.source.height,
        },
        viewport: {
          width: dimensions.backing.width / dimensions.canonical.width,
          height: dimensions.backing.height / dimensions.canonical.height,
        },
      };
      const plans = assets.annotations?.describe(frame.resultTime, density, frame.fps ?? 30) ?? [];
      admit(
        frame,
        plans.map(({ plan }) => plan.renderDimensions)
      );
      const annotations = await assets.annotations?.render(
        frame.resultTime,
        density,
        frame.fps ?? 30,
        signal
      );
      try {
        signal.throwIfAborted();
        drawReviewSceneFrame(context, {
          ...drawScene,
          spatialRenderer: assets.spatial,
          windowRasterBacking: reviewWindowRasterBacking({
            windowRect: request.layout.windowRect,
            sourceWidth: scene.source.width * (request.layout.sourceCrop?.width ?? 1),
            magnify: evaluateReviewClicks(scene.clicks, frame.resultTime).some(
              (click) => (click.lens?.scale ?? 1) > 1
            ),
          }),
          motionBlur: frame.cameraTransform
            ? undefined
            : quickEditMotionBlurCameras(scene.zoomRegions, frame.resultTime, scene),
          drawOverlays: (windowRaster) =>
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
              windowRaster,
              ...(annotations ? { annotationFrames: annotations.entries } : {}),
            }),
        });
      } finally {
        annotations?.release();
      }
    };
    if (frame.transition?.blend.plan.type === 'dissolve') {
      const { blend, frames, resultOffset } = frame.transition;
      const sides = reviewCutTransitionSides(
        blend,
        frames,
        frame.source,
        frame.resultTime,
        resultOffset
      );
      transition = resources.canvas('preview-transition-source', dimensions.backing);
      await paintReviewCutDissolve(
        context,
        transition,
        blend.incoming,
        (target, surface, side) => {
          const endpoint = sides[side];
          return draw(
            target,
            surface,
            { ...frame, resultTime: endpoint.resultTime, sourceTime: endpoint.sample.timestamp },
            { draw: endpoint.sample.draw.bind(endpoint.sample) }
          );
        },
        canvas
      );
    } else await draw(context, canvas, frame, sample);
    signal.throwIfAborted();
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
      assets.captions?.draw(context, frame.resultTime);
    } finally {
      context.restore();
    }
    paintReviewCutBlackout(context, dimensions.backing, frame.transition?.blend ?? null);
    paintPreviewOuterFade(context, dimensions.backing, scene.outerFadePlan, frame.resultTime);
  } finally {
    transition?.release();
  }
}

/** One final backing-space fill, outside every camera, watermark and transition transform. */
function paintPreviewOuterFade(
  context: CanvasRenderingContext2D,
  backing: Size,
  plan: PresentationSequencePlan | undefined,
  resultTime: number
) {
  if (!plan) return;
  context.save();
  try {
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = presentationMainColorOpacity(plan, resultTime);
    context.fillStyle = presentationMainColor(plan, resultTime);
    context.fillRect(0, 0, backing.width, backing.height);
  } finally {
    context.restore();
  }
}

function admitRender(
  allocation: Allocation | undefined,
  prepared: PreparedScene,
  assets: Assets,
  frame?: Frame,
  annotationBitmaps?: readonly Size[]
) {
  if (!allocation) return;
  const input = allocation.describe();
  const previousCache = assets.painter.retainedCacheSize;
  const base = {
    ...input,
    publication: { ...input.publication, backing: prepared.dimensions.backing },
    assets: assets.allocation,
    background: input.background ? { ...input.background, previousCache } : null,
    scene: { ...input.scene, ...(annotationBitmaps ? { annotationBitmaps } : {}) },
  };
  const candidates = [calculatePreviewRenderAllocation(base)];
  if (frame?.transition?.blend.plan.type === 'dissolve') {
    const sides = reviewCutTransitionSides(
      frame.transition.blend,
      frame.transition.frames,
      frame.source,
      frame.resultTime,
      frame.transition.resultOffset
    );
    for (const side of sides) {
      const graph = resolvePreviewRenderAllocation({
        scene: prepared.scene,
        dimensions: prepared.dimensions,
        resultTime: side.resultTime,
        sourceTime: side.sample.timestamp,
        ...(frame.cameraTransform ? { cameraTransform: frame.cameraTransform } : {}),
        sourceAllocationBytes: null,
        sourceBacking: frame.source.backing,
        camera: { retainedBytes: null, activeBytes: null },
        transitionBytes: null,
        previousFront: input.publication.previousFront,
        assets: assets.allocation,
        previousBackgroundCache: previousCache,
      });
      candidates.push(
        calculatePreviewRenderAllocation({
          ...base,
          background: graph.background,
          scene: {
            ...graph.scene,
            transitionRaster: prepared.dimensions.backing,
            ...(annotationBitmaps ? { annotationBitmaps } : {}),
          },
        })
      );
    }
  }
  allocation.replaceLimits({
    maximumManagedBytes: Math.max(...candidates.map((value) => value.maximumManagedBytes)),
    maximumCanvases: Math.max(...candidates.map((value) => value.maximumCanvases)),
  });
}

/** One prepared scene owner; transport, immutable capture and publication remain with the caller. */
export function createReviewPreviewRenderer(args: {
  resources: RenderResources;
  allocation?: Allocation;
  readAsset?: (assetId: string, signal: AbortSignal) => Promise<Blob | null>;
  onContextLost?: () => void;
  annotationExecutor?: Parameters<typeof createReviewAnnotationRenderer>[1]['createExecutor'];
}) {
  let generation = 0;
  let disposed = false;
  let current: { prepared: PreparedScene; assets: Assets; key: string } | null = null;
  let preparation: AbortController | null = null;
  let rendering = false;
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
      captionConflicts: structuredClone(assets.captions?.plan.conflicts ?? []),
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
    async prepare(
      sourceScene: Scene,
      dimensions: Dimensions,
      signal: AbortSignal
    ): Promise<Prepared> {
      if (disposed) throw new Error('Preview renderer is disposed.');
      const annotations = sourceScene.annotationEffects;
      const instances = annotations?.lane.enabled
        ? annotations.lane.instances.filter((instance) => instance.enabled)
        : [];
      const ids = new Set(instances.map((instance) => instance.snapshotId));
      const scene: Scene = {
        ...sourceScene,
        ...(annotations
          ? {
              annotationEffects: {
                ...annotations,
                lane: { enabled: annotations.lane.enabled, instances },
                snapshots: annotations.snapshots.filter((snapshot) => ids.has(snapshot.id)),
              },
            }
          : {}),
      };
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
        annotations: null,
        captions: null,
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
          (reference) => (args.readAsset ?? resolveReviewAssetBytes)(reference, controller.signal),
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
                annotationSourceBytes: assets.allocation.annotationSourceBytes ?? 0,
              })
            );
          },
          args.annotationExecutor
        );
        controller.signal.throwIfAborted();
        admitRender(args.allocation, prepared, assets);
        if (
          prepared.scene.zoomRegions.some(
            (region) =>
              !region.dormant &&
              !region.border &&
              !region.spotlight &&
              (hasQuickEditPerspective(region.perspective) || region.depthOfField?.enabled)
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
    async render(prepared: Prepared, frame: Frame, signal?: AbortSignal) {
      if (rendering) throw new Error('Preview frame is already admitted.');
      if (disposed || !leases.has(prepared) || current?.prepared.generation !== prepared.generation)
        throw new Error('Preview scene is stale.');
      if (![frame.source.timestamp, frame.sourceTime, frame.resultTime].every(Number.isFinite))
        throw new Error('Invalid preview frame time.');
      const captured = current;
      const renderingSignal = signal ?? preparation?.signal;
      if (!renderingSignal) throw new Error('Preview scene is stale.');
      renderingSignal.throwIfAborted();
      admitRender(args.allocation, current.prepared, current.assets, frame);
      const output = args.resources.canvas(
        'preview-publication',
        current.prepared.dimensions.backing,
        { alpha: false }
      );
      rendering = true;
      try {
        await drawPreparedFrame(
          captured.prepared,
          captured.assets,
          output,
          frame,
          args.resources,
          renderingSignal,
          (endpoint, bitmaps) => {
            if (disposed || current !== captured || !leases.has(prepared))
              throw new Error('Preview scene is stale.');
            admitRender(args.allocation, captured.prepared, captured.assets, endpoint, bitmaps);
          }
        );
        renderingSignal.throwIfAborted();
        if (disposed || current !== captured || !leases.has(prepared))
          throw new Error('Preview scene is stale.');
        return {
          ...output,
          generation: frame.generation,
          sceneGeneration: prepared.generation,
          sourceTime: frame.sourceTime,
          resultTime: frame.resultTime,
          representedMediaTime: frame.source.timestamp,
          cameraMediaTime: frame.camera?.representedMediaTime ?? null,
          cameraGeneration: frame.camera?.generation ?? null,
          captionConflicts: prepared.captionConflicts,
        };
      } catch (failure) {
        output.release();
        throw failure;
      } finally {
        rendering = false;
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
