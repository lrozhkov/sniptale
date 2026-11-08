import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import { createReviewPreviewFrameExecution } from './preview-frame-execution';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import { planReviewExportSource } from './export-source-plan';
import {
  createReviewGpuPreview,
  reviewGpuPreviewConcurrency,
  type ReviewGpuPresentedFrame,
} from './gpu-preview';
import type { PreviewGpuCanvasFactory } from './preview-render-resources';
import {
  reviewGpuPreviewAllocation,
  reviewPresentedGeometry,
  type ReviewPresentedGeometry,
} from './gpu-preview-geometry';
import type {
  PreviewRendererStatus,
  VideoPreviewRenderer,
} from '../../features/video/preview/preferences';
import type { ReviewRecordingRenderSource } from './recording-render';
import { prepareReviewCameraPlans } from '../../features/video/review/advanced/camera-plan-preparation';
import { reviewWatermarkAssets } from './asset-bytes';
import {
  createReviewPreviewSceneCapture,
  reviewPreviewSceneKey,
  reviewPreviewPreparationKey,
  activeReviewPreviewScene,
  sameReviewPreviewSceneKey,
  type PreviewSceneKey,
  type PreviewScene as Scene,
  type PreviewSceneDimensions as Dimensions,
} from './preview-scene';
import { quickEditRegionNeedsSpatialRenderer } from '../../features/video/review/advanced/spatial';
import {
  paintPreviewOuterFade,
  paintReviewCameraSplitScreen,
  reviewSplitCameraStyle,
  reviewSplitRasterAt,
  reviewSplitScreenAt,
} from './camera-split-screen';
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
  createReviewWindowRaster,
  type ReviewWindowRaster,
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
  reviewWindowRasterBacking,
} from './window-header';
import { evaluateReviewClicks } from '../../features/video/review/click-animation';
import { measureWatermark } from '../../features/video/composition/canvas/watermark';
import type { createWatermarkRenderer } from '../../features/video/composition/canvas/watermark';
import {
  resolvePreviewRenderAllocation,
  calculatePreviewPreparationAllocation,
  calculatePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import { createReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import { drawReviewSceneFrame, drawReviewExportSharpStage } from './scene-frame';
import {
  prepareReviewExportSourceSampling,
  reviewExportSamplingAllocation,
  type ReviewExportSamplingFrame,
} from './export-source-sampling';
import type { ExportEnhancer } from '../../features/video/composition/export-enhancement/enhancer';
import { selectReviewCutTransitionSource } from './cut-transition-frames';
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
type CanvasPublicationOutput = RenderCanvasLease & {
  outputKind: 'canvas2d';
  retainedProviderBytes?: never;
  isRetiredProvider?: never;
};
type PublicationOutput = CanvasPublicationOutput | ReviewGpuPresentedFrame;
type Drawable = Pick<VideoCompositionFrameSource, 'orientation'> & {
  prepare?(signal: AbortSignal): Promise<void>;
  videoFrame?(): VideoFrame; // Borrowed until the captured frame lease is released.
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
};
type Frame = {
  exportEnhancer?: ExportEnhancer;
  recordingHistory?: ReviewRecordingRenderSource;
  fps?: number;
  generation: number;
  sourceTime: number;
  resultTime: number;
  source: Drawable & {
    timestamp: number;
    backing: Size;
    prepare?(signal: AbortSignal): Promise<void>;
  };
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
  borrowers: number;
  retired: boolean;
  closed: boolean;
  lifetime: AbortController;
  maximumInFlight: 1 | 2;
  warmBudgetBytes: number;
  renderer: VideoPreviewRenderer;
  onContextLost: (() => void) | undefined;
  gpu: ReturnType<typeof createReviewGpuPreview> | null;
  annotations: Awaited<ReturnType<typeof createReviewAnnotationRenderer>> | null;
  captions: Awaited<ReturnType<typeof prepareReviewCaptions>> | null;
  allocation: PreviewRenderAllocationInput['assets'];
  background: ImageBitmap | null;
  header: ImageBitmap | null;
  watermark: Awaited<ReturnType<typeof createWatermarkRenderer>> | null;
  painter: ReturnType<typeof createReviewBackgroundPainter>;
  spatial: ReturnType<typeof createReviewSpatialRenderer> | undefined;
  reservations: { release(): void }[];
  windowRaster: {
    key: string;
    lease: ReturnType<typeof createReviewWindowRaster>;
    view: ReviewWindowRaster;
  } | null;
};

function prepareSceneCameraPlans({ scene, dimensions }: PreparedScene) {
  // Raster composition and canonical exposure use distinct geometry cache entries.
  prepareReviewCameraPlans(scene.zoomRegions, scene);
  prepareReviewCameraPlans(scene.zoomRegions, { ...scene, output: dimensions.backing });
}

function validSize(size: Size) {
  if (![size.width, size.height].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('Invalid preview dimensions.');
}

function disposeAssets(assets: Assets) {
  if (!assets.retired) {
    assets.retired = true;
    assets.lifetime.abort();
    assets.gpu?.releaseScene();
    assets.gpu = null;
  }
  // A newer scene can already own the shared GPU when the final old borrower returns.
  if (assets.borrowers || assets.closed) return;
  assets.closed = true;
  assets.windowRaster?.lease.release();
  assets.windowRaster = null;
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
function sceneRequest(
  prepared: PreparedScene,
  frame: Pick<Frame, 'cameraTransform' | 'resultTime'>
) {
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
  annotationExecutor: Parameters<typeof createReviewAnnotationRenderer>[1]['createExecutor'],
  annotationWarmExecutor: Parameters<typeof createReviewAnnotationRenderer>[1]['createWarmExecutor']
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
  const watermark = await measureWatermark(scene.watermark, dimensions.canonical, signal, {
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
  assets.watermark = await watermark.paint(reviewWatermarkAssets(readAsset));
  signal.throwIfAborted();
  if (document.fonts) await document.fonts.ready;
  signal.throwIfAborted();
  if (scene.captions) {
    admit(Boolean(scene.captions.settings?.enabled));
    assets.captions = await prepareSceneCaptions(prepared, assets, resources, signal);
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
      ...(annotationWarmExecutor ? { createWarmExecutor: annotationWarmExecutor } : {}),
    });
    signal.throwIfAborted();
  }
}

function prepareSceneCaptions(
  prepared: PreparedScene,
  assets: Assets,
  resources: RenderResources,
  signal: AbortSignal
) {
  const { scene, dimensions } = prepared;
  if (!scene.captions) return Promise.resolve(null);
  return prepareReviewCaptions({
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
}

function prepareRetainedSceneCaptions(
  prepared: PreparedScene,
  assets: Assets,
  resources: RenderResources,
  allocation: Allocation | undefined,
  signal: AbortSignal
) {
  const enabled = !!prepared.scene.captions?.settings?.enabled;
  admitRender(allocation, prepared, assets, undefined, undefined, enabled);
  return enabled ? prepareSceneCaptions(prepared, assets, resources, signal) : null;
}

/** Keep the admitted static window plane; camera and overlays do not change its pixels. */
function retainedWindowRaster(
  scene: Scene,
  assets: Assets,
  frame: Frame,
  layout: ReturnType<typeof sceneRequest>['layout'],
  resources: RenderResources
): ReviewWindowRaster | undefined {
  // Click magnification changes raster density over time; its original lease path stays dynamic.
  if (
    (!assets.header && !layout.sourceCrop) ||
    frame.transition ||
    scene.clicks.some((cue) => cue.settings.effect === 'magnify')
  ) {
    assets.windowRaster?.lease.release();
    assets.windowRaster = null;
    return undefined;
  }
  const backing = reviewWindowRasterBacking({
    windowRect: layout.windowRect,
    sourceWidth: scene.source.width * (layout.sourceCrop?.width ?? 1),
    magnify: false,
  });
  const key = JSON.stringify([
    frame.source.timestamp,
    backing,
    layout.videoRect,
    layout.visibleVideoRect,
    layout.windowRect,
  ]);
  if (assets.windowRaster?.key === key) return assets.windowRaster.view;
  assets.windowRaster?.lease.release();
  assets.windowRaster = null;
  const lease = createReviewWindowRaster({
    header: assets.header ?? undefined,
    resources,
    backing,
    videoRect: layout.videoRect,
    visibleVideoRect: layout.visibleVideoRect,
    windowRect: layout.windowRect,
    draw: frame.source.draw,
  });
  const view = { image: lease.image, width: lease.width, height: lease.height };
  assets.windowRaster = { key, lease, view };
  return view;
}

async function recordingHistoryScene(
  prepared: PreparedScene,
  frame: Frame,
  signal: AbortSignal
): Promise<Scene> {
  const history = await frame.recordingHistory?.read(
    frame.sourceTime,
    frame.resultTime,
    { ...prepared.dimensions.backing, frameDuration: 1 / (frame.fps ?? 30) },
    signal
  );
  return history
    ? {
        ...prepared.scene,
        zoomRegions: history.effective.zoomRegions,
        clicks: history.clickCues,
        keys: history.keyCues,
      }
    : prepared.scene;
}

async function drawPreparedFrame(
  prepared: PreparedScene,
  assets: Assets,
  canvasOutput: () => CanvasPublicationOutput,
  frame: Frame,
  resources: RenderResources,
  signal: AbortSignal,
  admit: (frame: Frame, bitmaps: readonly Size[]) => void,
  acquireOutput: PreviewGpuCanvasFactory | undefined,
  beforeCanvas: () => Promise<void>
): Promise<{
  output: PublicationOutput;
  geometry?: ReviewPresentedGeometry;
  renderer: PreviewRendererStatus;
}> {
  signal.throwIfAborted();
  const scene = await recordingHistoryScene(prepared, frame, signal);
  const { dimensions } = prepared;
  const raw = frame.exportEnhancer ? undefined : frame.source.videoFrame?.();
  if (raw && assets.gpu) {
    const geometry = reviewPresentedGeometry(
      scene,
      dimensions,
      frame.resultTime,
      frame.cameraTransform
    );
    const input = {
      scene,
      dimensions,
      geometry,
      frame: raw,
      orientation: frame.source.orientation,
      sourceTime: frame.sourceTime,
      header: assets.header,
      image: assets.background,
      painter: assets.painter,
      captions: scene.captions?.settings?.enabled ? assets.captions : null,
      annotations:
        scene.annotationEffects?.lane.enabled &&
        scene.annotationEffects.lane.instances.some((instance) => instance.enabled)
          ? assets.annotations
          : null,
      watermark: scene.watermark && scene.watermark.mode !== 'none' ? assets.watermark : null,
      fps: frame.fps ?? 30,
      ...(frame.camera ? { camera: frame.camera } : {}),
      ...(frame.cameraTransform ? { cameraOverride: frame.cameraTransform } : {}),
      ...(frame.transition ? { transition: frame.transition } : {}),
      admit: (bitmaps: readonly Size[]) => admit(frame, bitmaps),
      sceneAt: (resultTime: number, sourceTime: number) =>
        recordingHistoryScene(prepared, { ...frame, resultTime, sourceTime }, signal),
      signal,
    };
    if (acquireOutput) {
      const output = await assets.gpu.renderPresentation({ ...input, acquireOutput });
      if (output) return { output, geometry, renderer: { backend: 'gpu' } };
    } else {
      const output = canvasOutput();
      const rendered = await assets.gpu.render({ ...input, context: output.context });
      if (rendered) return { output, geometry, renderer: { backend: 'gpu' } };
    }
  }
  await beforeCanvas();
  const output = canvasOutput();
  const presentation = await drawPreparedCanvasFrame(
    { ...prepared, scene },
    assets,
    output,
    frame,
    resources,
    signal,
    admit
  );
  return { ...presentation, output };
}

async function drawPreparedCanvasFrame(
  prepared: PreparedScene,
  assets: Assets,
  output: RenderCanvasLease,
  frame: Frame,
  resources: RenderResources,
  signal: AbortSignal,
  admit: (frame: Frame, bitmaps: readonly Size[]) => void
): Promise<{ geometry: ReviewPresentedGeometry; renderer: PreviewRendererStatus }> {
  const { scene, dimensions } = prepared;
  const request = sceneRequest(prepared, frame);
  const { context, canvas } = output;
  let geometry: ReviewPresentedGeometry;
  await frame.source.prepare?.(signal);
  await frame.camera?.drawable.prepare?.(signal);
  signal.throwIfAborted();
  if (assets.retired) throw new Error('Preview scene is stale.');
  if (request.layout.spatial && !assets.spatial)
    assets.spatial = createReviewSpatialRenderer(assets.onContextLost, resources);
  let transition: RenderCanvasLease | undefined;
  try {
    let sample: Drawable = frame.source;
    if (
      frame.transition &&
      frame.exportEnhancer &&
      frame.transition.blend.plan.type !== 'dissolve'
    ) {
      sample = selectReviewCutTransitionSource(
        frame.transition.blend,
        frame.transition.frames,
        frame.source
      );
    } else if (frame.transition && frame.transition.blend.plan.type !== 'dissolve') {
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
      const scene = await recordingHistoryScene(prepared, frame, signal);
      const request = sceneRequest({ ...prepared, scene }, frame);
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
        currentTime: frame.resultTime,
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
      const instances = scene.annotationEffects?.lane.instances;
      const plans =
        assets.annotations?.describe(frame.resultTime, density, frame.fps ?? 30, instances) ?? [];
      admit(
        frame,
        plans.map(({ plan }) => plan.renderDimensions)
      );
      const annotations = await assets.annotations?.render(
        frame.resultTime,
        density,
        frame.fps ?? 30,
        signal,
        instances
      );
      let enhanced: ReviewExportSamplingFrame | null = null;
      try {
        signal.throwIfAborted();
        if (frame.exportEnhancer)
          enhanced = await prepareReviewExportSourceSampling({
            enhancer: frame.exportEnhancer,
            scene: {
              sourceSize: scene.source,
              ...(scene.canvas ? { baseCanvas: scene.canvas } : {}),
              windowHeader: scene.windowHeader,
              background: scene.background,
              zoomRegions: scene.zoomRegions,
              clickCues: scene.clicks,
              sceneScale: request.sceneScale,
            },
            output: canvas,
            sample,
            sourceTime: frame.sourceTime,
            resultTime: frame.resultTime,
            signal,
            ...(frame.cameraTransform ? { camera: frame.cameraTransform } : {}),
          });
        const sceneArgs: Parameters<typeof drawReviewSceneFrame>[1] = {
          ...drawScene,
          ...(enhanced ? { sample: enhanced.original } : {}),
          ...(enhanced
            ? { layout: enhanced.plan.layout, exportSampling: { frame: enhanced } }
            : {}),
          spatialRenderer: assets.spatial,
          windowRaster: enhanced
            ? undefined
            : retainedWindowRaster(scene, assets, frame, request.layout, resources),
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
              ...(enhanced
                ? {
                    exportSampling: enhanced,
                    sharpPaint: (
                      target: CanvasRenderingContext2D,
                      lens: ReviewExportSamplingFrame['plan']['lenses'][number]
                    ) => drawReviewExportSharpStage(target, sceneArgs, enhanced!, lens),
                  }
                : {}),
              ...(annotations ? { annotationFrames: annotations.entries } : {}),
            }),
        };
        drawReviewSceneFrame(context, sceneArgs);
      } finally {
        enhanced?.dispose();
        annotations?.release();
      }
      return reviewPresentedGeometry(scene, dimensions, frame.resultTime, request.camera);
    };
    if (frame.transition?.blend.plan.type === 'dissolve') {
      geometry = reviewPresentedGeometry(scene, dimensions, frame.resultTime, request.camera);
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
        async (target, surface, side) => {
          const endpoint = sides[side];
          await draw(
            target,
            surface,
            { ...frame, resultTime: endpoint.resultTime, sourceTime: endpoint.sample.timestamp },
            { draw: endpoint.sample.draw.bind(endpoint.sample) }
          );
        },
        canvas
      );
    } else geometry = await draw(context, canvas, frame, sample);
    signal.throwIfAborted();
    const splitScreen = reviewSplitScreenAt(scene.webcam, frame.sourceTime, !!frame.camera);
    paintReviewCameraSplitScreen(context, canvas, dimensions.backing, splitScreen, resources);
    if (frame.camera && scene.webcam)
      drawReviewWebcam(
        context,
        dimensions.backing,
        reviewSplitCameraStyle(scene.webcam, splitScreen),
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
  return {
    geometry,
    renderer: {
      backend: 'legacy',
      ...(assets.renderer === 'gpu' && !frame.exportEnhancer
        ? { fallback: assets.gpu?.fallbackReason ?? 'unavailable' }
        : {}),
    },
  };
}

function admitRender(
  allocation: Allocation | undefined,
  prepared: PreparedScene,
  assets: Assets,
  frame?: Frame,
  annotationBitmaps?: readonly Size[],
  captionMeasurement = false,
  exportEnhancer?: ExportEnhancer
) {
  if (!allocation) return;
  const splitRaster = reviewSplitRasterAt(
    prepared.scene.webcam,
    frame?.sourceTime ?? 0,
    !!frame?.camera,
    prepared.dimensions.backing
  );
  const input = allocation.describe();
  const previousCache = assets.painter.retainedCacheSize;
  const base = {
    ...input,
    publication: {
      ...input.publication,
      backing: prepared.dimensions.backing,
      maximumInFlight: assets.maximumInFlight,
    },
    assets: assets.allocation,
    background: input.background ? { ...input.background, previousCache } : null,
    scene: {
      ...input.scene,
      splitRaster,
      exportWindowRaster: null as Size | null,
      ...(annotationBitmaps ? { annotationBitmaps } : {}),
    },
  };
  const retainedSpatial = assets.spatial?.allocations ?? [];
  const enhancement = frame?.exportEnhancer ?? exportEnhancer;
  if (enhancement) {
    const request = sceneRequest(prepared, frame ?? { resultTime: 0 });
    const plan = planReviewExportSource({
      scene: {
        sourceSize: prepared.scene.source,
        ...(prepared.scene.canvas ? { baseCanvas: prepared.scene.canvas } : {}),
        windowHeader: prepared.scene.windowHeader,
        background: prepared.scene.background,
        zoomRegions: prepared.scene.zoomRegions,
        clickCues: prepared.scene.clicks,
        sceneScale: request.sceneScale,
      },
      output: prepared.dimensions.backing,
      identity: {
        sourceKey: prepared.scene,
        sourceTime: frame?.source.timestamp ?? 0,
        passTime: frame?.resultTime ?? 0,
        sourceSize: prepared.scene.source,
      },
      resultTime: frame?.resultTime ?? 0,
      ...(frame?.cameraTransform ? { camera: frame.cameraTransform } : {}),
    });
    const physical = reviewExportSamplingAllocation(
      plan,
      prepared.dimensions.backing,
      prepared.scene.background,
      request.sceneScale
    );
    if (physical.active && (assets.header || plan.layout.sourceCrop))
      base.scene.exportWindowRaster = physical.window;
    if (physical.active && (base.scene.spatial || retainedSpatial.length))
      base.scene.spatial = {
        output: prepared.dimensions.backing,
        halfFloat: base.scene.spatial?.halfFloat ?? true,
        plane: physical.plane,
        overlay: physical.overlay,
        retained: retainedSpatial,
      };
  }
  if (retainedSpatial.length) {
    base.scene.spatial = {
      output: prepared.dimensions.backing,
      plane: base.scene.spatial?.plane ?? { width: 1, height: 1 },
      halfFloat: base.scene.spatial?.halfFloat ?? true,
      ...base.scene.spatial,
      retained: retainedSpatial,
    };
  }
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
            spatial: base.scene.spatial,
            exportWindowRaster: base.scene.exportWindowRaster,
            transitionRaster: prepared.dimensions.backing,
            splitRaster,
            ...(annotationBitmaps ? { annotationBitmaps } : {}),
          },
        })
      );
    }
  }
  const gpu =
    assets.renderer === 'gpu' &&
    !exportEnhancer &&
    !frame?.exportEnhancer &&
    typeof navigator !== 'undefined' &&
    navigator.gpu
      ? reviewGpuPreviewAllocation(prepared.scene, prepared.dimensions, assets.maximumInFlight)
      : { maximumManagedBytes: 0, maximumCanvases: 0 };
  allocation.replaceLimits({
    // Caption refresh retains the scene resources while borrowing one 1×1 measurement canvas.
    maximumManagedBytes:
      Math.max(...candidates.map((value) => value.maximumManagedBytes)) +
      (captionMeasurement ? 4 : 0) +
      gpu.maximumManagedBytes +
      assets.warmBudgetBytes,
    maximumCanvases:
      Math.max(...candidates.map((value) => value.maximumCanvases)) +
      (captionMeasurement ? 1 : 0) +
      gpu.maximumCanvases,
  });
}

const needsSpatialRenderer = (scene: Scene) =>
  scene.zoomRegions.some(quickEditRegionNeedsSpatialRenderer);

/** Owns prepared scenes and one session GPU; callers retain capture and publication. */
export function createReviewPreviewRenderer(args: {
  maximumInFlight?: 1 | 2;
  renderer?: VideoPreviewRenderer;
  resources: RenderResources;
  exportEnhancer?: ExportEnhancer;
  allocation?: Allocation;
  readAsset?: (assetId: string, signal: AbortSignal) => Promise<Blob | null>;
  onContextLost?: () => void;
  annotationExecutor?: Parameters<typeof createReviewAnnotationRenderer>[1]['createExecutor'];
  annotationWarmExecutor?: Parameters<
    typeof createReviewAnnotationRenderer
  >[1]['createWarmExecutor'];
}) {
  const captureScene = createReviewPreviewSceneCapture();
  let generation = 0;
  let disposed = false;
  let current: {
    prepared: PreparedScene;
    assets: Assets;
    key: PreviewSceneKey;
    preparationKey: string;
  } | null = null;
  let preparedSource: Scene | null = null;
  let preparation: AbortController | null = null;
  let captionRefresh: AbortController | null = null;
  let rendering = 0;
  const execution = createReviewPreviewFrameExecution(args.maximumInFlight ?? 1);
  let gpu: ReturnType<typeof createReviewGpuPreview> | null = null;
  const leases = new Set<Prepared>();
  const clear = () => {
    if (current) disposeAssets(current.assets);
    current = null;
    preparedSource = null;
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
  const renderFrame = async (
    prepared: Prepared,
    frame: Frame,
    signal?: AbortSignal,
    acquireOutput?: PreviewGpuCanvasFactory
  ) => {
    const capacity =
      current?.assets.renderer === 'gpu' &&
      reviewGpuPreviewConcurrency(
        current.prepared.scene,
        current.assets.annotations?.maximumInFlight
      ) === 2
        ? (args.maximumInFlight ?? 1)
        : 1;
    if (rendering >= capacity) throw new Error('Preview frame is already admitted.');
    if (disposed || !leases.has(prepared) || current?.prepared.generation !== prepared.generation)
      throw new Error('Preview scene is stale.');
    if (![frame.source.timestamp, frame.sourceTime, frame.resultTime].every(Number.isFinite))
      throw new Error('Invalid preview frame time.');
    const captured = current;
    const callerSignal = signal ?? preparation?.signal;
    if (!callerSignal) throw new Error('Preview scene is stale.');
    const renderingSignal = AbortSignal.any([callerSignal, captured.assets.lifetime.signal]);
    renderingSignal.throwIfAborted();
    const checkCurrent = () => {
      renderingSignal.throwIfAborted();
      if (disposed || current !== captured || !leases.has(prepared))
        throw new Error('Preview scene is stale.');
    };
    let exclusive =
      capacity === 1 ||
      !!frame.recordingHistory ||
      !!frame.exportEnhancer ||
      !!frame.camera ||
      !!frame.cameraTransform ||
      !!frame.transition;
    captured.assets.borrowers++;
    rendering++;
    let releaseExecution: (() => void) | undefined;
    const beforeCanvas = async () => {
      if (!exclusive) {
        // Finish the shared GPU attempt before requesting exclusive fallback; two upgrades must not deadlock.
        releaseExecution?.();
        releaseExecution = undefined;
        exclusive = true;
        releaseExecution = await execution.acquire(true, renderingSignal);
      }
      checkCurrent();
    };
    let output: PublicationOutput | undefined;
    const canvasOutput = (): CanvasPublicationOutput => {
      if (output) {
        if (output.outputKind !== 'canvas2d')
          throw new Error('Preview output context is unavailable.');
        return output;
      }
      output = {
        ...args.resources.canvas('preview-publication', captured.prepared.dimensions.backing, {
          alpha: false,
        }),
        outputKind: 'canvas2d',
      };
      return output;
    };
    try {
      releaseExecution = await execution.acquire(exclusive, renderingSignal);
      checkCurrent();
      admitRender(
        args.allocation,
        captured.prepared,
        captured.assets,
        frame,
        undefined,
        false,
        args.exportEnhancer
      );
      const presentation = await drawPreparedFrame(
        captured.prepared,
        captured.assets,
        canvasOutput,
        frame,
        args.resources,
        renderingSignal,
        (endpoint, bitmaps) => {
          if (disposed || current !== captured || !leases.has(prepared))
            throw new Error('Preview scene is stale.');
          admitRender(
            args.allocation,
            captured.prepared,
            captured.assets,
            endpoint,
            bitmaps,
            false,
            args.exportEnhancer
          );
        },
        acquireOutput,
        beforeCanvas
      );
      output = presentation.output;
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
        renderer: presentation.renderer,
        geometry: presentation.geometry
          ? {
              ...presentation.geometry,
              generation: frame.generation,
              sceneGeneration: prepared.generation,
            }
          : null,
      };
    } catch (failure) {
      output?.release();
      throw failure;
    } finally {
      releaseExecution?.();
      rendering--;
      captured.assets.borrowers--;
      if (captured.assets.retired) disposeAssets(captured.assets);
    }
  };
  return {
    /** Report capacity from the prepared owner; the first publication initializes it serially. */
    maximumInFlight(scene: Scene): 1 | 2 {
      return scene === preparedSource &&
        current?.assets.renderer === 'gpu' &&
        args.maximumInFlight === 2
        ? reviewGpuPreviewConcurrency(scene, current.assets.annotations?.maximumInFlight)
        : 1;
    },
    async prepare(
      sourceScene: Scene,
      dimensions: Dimensions,
      signal: AbortSignal
    ): Promise<Prepared> {
      if (disposed) throw new Error('Preview renderer is disposed.');
      captionRefresh?.abort();
      captionRefresh = null;
      const scene = activeReviewPreviewScene(sourceScene);
      validSize(scene.source);
      validSize(dimensions.canonical);
      validSize(dimensions.backing);
      signal.throwIfAborted();
      const key = reviewPreviewSceneKey(scene, dimensions);
      if (current && sameReviewPreviewSceneKey(current.key, key)) {
        current.key = key;
        admitRender(
          args.allocation,
          current.prepared,
          current.assets,
          undefined,
          undefined,
          false,
          args.exportEnhancer
        );
        preparedSource = sourceScene;
        return lease(current.prepared, current.assets, signal);
      }
      const assetsKey = reviewPreviewPreparationKey(scene, dimensions, needsSpatialRenderer(scene));
      if (current?.preparationKey === assetsKey) {
        const captured = current;
        const prepared = {
          generation: ++generation,
          scene: captureScene(scene),
          dimensions: structuredClone(dimensions),
        };
        prepareSceneCameraPlans(prepared);
        const controller = new AbortController();
        captionRefresh = controller;
        const abort = () => controller.abort(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        try {
          const refresh = prepareRetainedSceneCaptions(
            prepared,
            captured.assets,
            args.resources,
            args.allocation,
            controller.signal
          );
          const captions = refresh ? await refresh : captured.assets.captions;
          controller.signal.throwIfAborted();
          if (disposed || current !== captured) throw new Error('Preview scene is stale.');
          if (refresh)
            admitRender(
              args.allocation,
              prepared,
              captured.assets,
              undefined,
              undefined,
              false,
              args.exportEnhancer
            );
          captured.assets.captions = captions;
          current = { ...captured, prepared, key };
          preparedSource = sourceScene;
          return lease(prepared, current.assets, signal);
        } finally {
          signal.removeEventListener('abort', abort);
          if (captionRefresh === controller) captionRefresh = null;
        }
      }
      preparation?.abort();
      clear();
      const controller = new AbortController();
      preparation = controller;
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      const prepared = {
        generation: ++generation,
        scene: captureScene(scene),
        dimensions: structuredClone(dimensions),
      };
      prepareSceneCameraPlans(prepared);
      const useGpu =
        args.renderer !== 'legacy' &&
        !args.exportEnhancer &&
        typeof navigator !== 'undefined' &&
        !!navigator.gpu;
      if (useGpu && !gpu)
        gpu = createReviewGpuPreview({
          resources: args.resources,
          reserve: (bytes) => args.resources.bytes('preview-gpu', bytes),
          maximumInFlight: args.maximumInFlight ?? 1,
        });
      const assets: Assets = {
        borrowers: 0,
        retired: false,
        closed: false,
        lifetime: new AbortController(),
        maximumInFlight: args.maximumInFlight ?? 1,
        warmBudgetBytes:
          useGpu &&
          args.annotationWarmExecutor &&
          prepared.scene.annotationEffects?.lane.enabled &&
          prepared.scene.annotationEffects.lane.instances.some((instance) => instance.enabled)
            ? EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes + 4
            : 0,
        renderer: args.exportEnhancer ? 'legacy' : (args.renderer ?? 'gpu'),
        onContextLost: args.onContextLost,
        gpu: useGpu ? gpu : null,
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
        windowRaster: null,
      };
      const releaseAssets = () => disposeAssets(assets);
      controller.signal.addEventListener('abort', releaseAssets, { once: true });
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
            const limits = calculatePreviewPreparationAllocation({
              previousFront: input.publication.previousFront,
              ...(input.publication.previousFrontKind
                ? { previousFrontKind: input.publication.previousFrontKind }
                : {}),
              ...(input.publication.previousProviderBytes !== undefined
                ? { previousProviderBytes: input.publication.previousProviderBytes }
                : {}),
              retainedCamera: input.admission.camera.retained,
              retainedTransition: input.admission.transition,
              backgroundBitmap: assets.allocation.backgroundBitmap,
              headerBitmap: assets.allocation.headerBitmap,
              watermark: assets.allocation.watermark,
              measurement,
              annotationSourceBytes: assets.allocation.annotationSourceBytes ?? 0,
            });
            const previousFront = input.publication.previousFront;
            const sharedFrontBytes =
              gpu &&
              previousFront &&
              input.publication.previousFrontKind === 'gpu-surface' &&
              !input.publication.previousProviderBytes
                ? previousFront.width * previousFront.height * 8
                : 0;
            args.allocation.replaceLimits({
              ...limits,
              // The current provider already owns the GPU front storage counted by preparation.
              maximumManagedBytes:
                limits.maximumManagedBytes +
                // One isolated advisory packet must not reduce the two foreground packet budgets.
                assets.warmBudgetBytes +
                Math.max(0, (gpu?.allocatedBytes ?? 0) - sharedFrontBytes),
            });
          },
          args.annotationExecutor,
          args.annotationWarmExecutor
        );
        controller.signal.throwIfAborted();
        admitRender(
          args.allocation,
          prepared,
          assets,
          undefined,
          undefined,
          false,
          args.exportEnhancer
        );
        if (needsSpatialRenderer(prepared.scene) && !assets.gpu)
          assets.spatial = createReviewSpatialRenderer(args.onContextLost, args.resources);
        current = { prepared, assets, key, preparationKey: assetsKey };
        preparedSource = sourceScene;
        return lease(prepared, assets, signal);
      } catch (failure) {
        disposeAssets(assets);
        throw failure;
      } finally {
        controller.signal.removeEventListener('abort', releaseAssets);
        signal.removeEventListener('abort', abort);
      }
    },
    /** Admit decoded captures before their owner reserves or paints the next frame. */
    admit(prepared: Prepared, frame: Frame) {
      if (disposed || !leases.has(prepared) || current?.prepared.generation !== prepared.generation)
        throw new Error('Preview scene is stale.');
      admitRender(
        args.allocation,
        current.prepared,
        current.assets,
        frame,
        undefined,
        false,
        args.exportEnhancer
      );
    },
    async render(prepared: Prepared, frame: Frame, signal?: AbortSignal) {
      const output = await renderFrame(prepared, frame, signal);
      if (output.outputKind !== 'canvas2d') {
        output.release();
        throw new Error('Preview output context is unavailable.');
      }
      return output;
    },
    /** The mounted caller leases nonfront GPU canvases and owns visible publication. */
    renderPresentation(
      prepared: Prepared,
      frame: Frame,
      signal: AbortSignal,
      acquireOutput: PreviewGpuCanvasFactory
    ) {
      return renderFrame(prepared, frame, signal, acquireOutput);
    },
    cancelWarmAnnotations() {
      current?.assets.annotations?.cancelWarm(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      captionRefresh?.abort();
      captionRefresh = null;
      for (const handle of leases) handle.release();
      preparation?.abort();
      preparation = null;
      clear();
      gpu?.dispose();
      gpu = null;
    },
  };
}
