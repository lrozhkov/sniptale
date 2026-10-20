import { drawCompositionBorders } from '../../../../features/video/composition/draw/border';
import {
  createVideoProjectWatermarkRenderer,
  type VideoProjectWatermarkRenderer,
} from '../../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../../runtime/session/asset-urls';
import { drawSpatialSceneOverlays } from '../../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import {
  drawSceneActionCompositionStates,
  drawCursorCompositionState,
} from '../../../../features/video/composition/draw';
import {
  disposeEffectRuntimeComposition,
  renderEffectRuntimeComposition,
  type EffectRuntimeRenderedComposition,
} from '../../../../features/video/composition/effect-runtime';
import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import { mapCompositionPointThroughCamera } from '../../../../features/video/composition/motion';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
import type { VideoProject } from '../../../../features/video/project/types/index';
import { drawPreviewVisualPasses } from './render-visual';
import type { PreviewSceneViewport, PreviewStageVideoRefs } from '../types';
import { resolvePreviewEffectRuntimeRasterScale } from './canvas';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';
import type { VideoEditorPreviewMode } from '../../../contracts/preview-runtime';
import {
  createVideoProjectCaptionRenderer,
  type VideoProjectCaptionRenderer,
} from '../../../../workflows/video-review/project-captions';

type PreviewEffectRuntimeExecutorInput =
  | EffectRuntimeSandboxExecutor
  | (() => EffectRuntimeSandboxExecutor);

function createPreviewSceneMediaMap(
  videoRefs: PreviewStageVideoRefs
): Map<string, HTMLMediaElement> {
  const mediaMap = new Map<string, HTMLMediaElement>();
  for (const [clipId, video] of Object.entries(videoRefs.current)) {
    if (video) {
      mediaMap.set(clipId, video);
    }
  }
  return mediaMap;
}

function mapPreviewScenePoint(
  point: { x: number; y: number },
  camera: ReturnType<typeof resolveVideoCompositionFrame>['camera'],
  viewport: PreviewSceneViewport
) {
  const mappedPoint = mapCompositionPointThroughCamera(point, camera);
  if (!mappedPoint) return null;

  return {
    x: viewport.offsetX + mappedPoint.x * viewport.scale,
    y: viewport.offsetY + mappedPoint.y * viewport.scale,
  };
}

function drawPreviewSceneOverlays(params: {
  camera: ReturnType<typeof resolveVideoCompositionFrame>['camera'];
  context: CanvasRenderingContext2D;
  frame: ReturnType<typeof resolveVideoCompositionFrame>;
  viewport: PreviewSceneViewport;
  logicalSize: { width: number; height: number };
  rasterScale: number;
  spatialRenderer: (() => ReviewSpatialRenderer) | undefined;
}) {
  if (
    drawSpatialSceneOverlays({
      actions: params.frame.actions,
      camera: params.camera,
      cursor: params.frame.cursor,
      context: params.context,
      destination: {
        x: params.viewport.offsetX,
        y: params.viewport.offsetY,
        width: params.viewport.width,
        height: params.viewport.height,
      },
      logicalSize: params.logicalSize,
      output: {
        width: Math.ceil(params.logicalSize.width * params.rasterScale),
        height: Math.ceil(params.logicalSize.height * params.rasterScale),
      },
      rasterScale: params.rasterScale,
      spatialRenderer: params.spatialRenderer,
    })
  )
    return;
  const overlayScale = params.viewport.scale * params.camera.scale;
  const cursorPoint =
    params.frame.cursor &&
    mapPreviewScenePoint(params.frame.cursor, params.camera, params.viewport);
  const scaledCursor =
    params.frame.cursor && cursorPoint
      ? {
          ...params.frame.cursor,
          ...cursorPoint,
          scale: params.frame.cursor.scale * overlayScale,
        }
      : null;
  drawSceneActionCompositionStates(params.context, params.frame.actions, params.camera, {
    offsetX: params.viewport.offsetX,
    offsetY: params.viewport.offsetY,
    scaleX: params.viewport.scale,
    scaleY: params.viewport.scale,
  });

  if (scaledCursor) {
    drawCursorCompositionState(params.context, scaledCursor);
  }
}

type PreviewSceneParams = {
  watermarkRenderer?: VideoProjectWatermarkRenderer;
  cameraOverride?: VideoCompositionCameraState;
  canvas: HTMLCanvasElement;
  captionRenderer?: VideoProjectCaptionRenderer;
  /** The preview runtime owns this reusable transaction canvas. */
  stagingCanvas?: () => HTMLCanvasElement;
  spatialRenderer?: () => ReviewSpatialRenderer;
  currentTime: number;
  imageBank: Record<string, HTMLImageElement>;
  effectRuntimeExecutor?: PreviewEffectRuntimeExecutorInput;
  isPlaybackFrame?: boolean;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  previewCacheBypass?: boolean;
  previewMode?: VideoEditorPreviewMode;
  renderRevision?: Promise<string>;
  project: VideoProject;
  signal?: AbortSignal;
  stage: HTMLDivElement | null;
  videoRefs: PreviewStageVideoRefs;
};

export async function renderPreviewScene(params: PreviewSceneParams): Promise<void | false> {
  if (!params.project.watermark || params.project.watermark.mode === 'none') {
    params.watermarkRenderer?.clear();
    return renderPreparedPreviewScene(params);
  }
  const owner =
    params.watermarkRenderer ?? createVideoProjectWatermarkRenderer(loadVideoEditorAssetBlob);
  try {
    const watermark = await owner.prepare(params.project, params.project, params.signal);
    params.signal?.throwIfAborted();
    return await renderPreparedPreviewScene(params, watermark);
  } finally {
    if (!params.watermarkRenderer) owner.clear();
  }
}

async function renderPreparedPreviewScene(
  params: PreviewSceneParams,
  watermark?: Awaited<ReturnType<VideoProjectWatermarkRenderer['prepare']>>
): Promise<void | false> {
  const renderPasses = resolveVideoCompositionRenderPasses(params.project, params.currentTime);
  if (params.cameraOverride) {
    renderPasses.overlayFrame.camera = params.cameraOverride;
    for (const pass of renderPasses.visualPasses) pass.frame.camera = params.cameraOverride;
  }
  const clipMediaElements = createPreviewSceneMediaMap(params.videoRefs);
  // Effects rasterize their inputs asynchronously; never start with an unavailable frame.
  if (!arePreviewSceneVideosReady(renderPasses, clipMediaElements)) return false;
  const videos = [...clipMediaElements]
    .filter(([id]) =>
      [renderPasses.overlayFrame, ...renderPasses.visualPasses.map((pass) => pass.frame)].some(
        (frame) => frame.visualLayers.some((layer) => layer.clipId === id)
      )
    )
    .map(([, video]) => video);
  let mediaChanged = false;
  const invalidate = () => {
    mediaChanged = true;
  };
  for (const video of videos) video.addEventListener('seeking', invalidate);
  let effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  let captions: Awaited<ReturnType<VideoProjectCaptionRenderer['prepare']>>;
  try {
    captions = await (params.captionRenderer ?? createVideoProjectCaptionRenderer()).prepare(
      params.project,
      params.project,
      params.signal
    );
    effectRuntimeFrames = await resolvePreviewEffectRuntimeFrames(
      params,
      renderPasses,
      clipMediaElements
    );
  } finally {
    for (const video of videos) video.removeEventListener('seeking', invalidate);
  }
  if (mediaChanged) {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
    return false;
  }
  if (params.signal?.aborted) {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
    return;
  }
  try {
    if (params.signal?.aborted) return;
    // Media seeking can invalidate readiness after the React render was queued.
    // Keep the last complete frame until the decoder supplies a replacement.
    if (!arePreviewSceneVideosReady(renderPasses, clipMediaElements)) return false;
    const drawn = drawResolvedPreviewScene({
      clipMediaElements,
      captions,
      watermark,
      effectRuntimeFrames,
      params,
      renderPasses,
    });
    if (!drawn) return false;
  } finally {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
  }
}

function arePreviewSceneVideosReady(
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  media: ReadonlyMap<string, HTMLMediaElement>
): boolean {
  const frames = [
    renderPasses.overlayFrame,
    ...renderPasses.visualPasses.filter((pass) => pass.alpha > 0).map((pass) => pass.frame),
  ];
  return frames.every((frame) =>
    frame.visualLayers.every((layer) => {
      if (layer.kind !== 'video' || layer.opacity <= 0) return true;
      const video = media.get(layer.clipId);
      return !!video && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    })
  );
}

type ResolvedPreviewSceneArgs = {
  watermark: Awaited<ReturnType<VideoProjectWatermarkRenderer['prepare']>> | undefined;
  captions: Awaited<ReturnType<VideoProjectCaptionRenderer['prepare']>>;
  clipMediaElements: Map<string, HTMLMediaElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  params: Parameters<typeof renderPreviewScene>[0];
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>;
};

function drawResolvedPreviewScene(args: ResolvedPreviewSceneArgs): boolean {
  const spatial = [
    args.renderPasses.overlayFrame,
    ...args.renderPasses.visualPasses.map((pass) => pass.frame),
  ].some((frame) => frame.camera.spatial !== undefined);
  if (!spatial && !args.watermark) return drawResolvedPreviewSceneContent(args);
  const presented = args.params.canvas;
  const owned = !args.params.stagingCanvas;
  const staging = args.params.stagingCanvas?.() ?? presented.ownerDocument.createElement('canvas');
  if (staging === presented || staging.ownerDocument !== presented.ownerDocument)
    throw new Error('Preview frame canvas is unavailable.');
  try {
    const drawn = drawResolvedPreviewSceneContent(
      { ...args, params: { ...args.params, canvas: staging } },
      presented
    );
    if (!drawn || args.params.signal?.aborted) return false;
    publishCompletedPreviewFrame(presented, staging);
    return true;
  } finally {
    if (owned) {
      staging.width = 0;
      staging.height = 0;
    }
  }
}

function publishCompletedPreviewFrame(
  presented: HTMLCanvasElement,
  staging: HTMLCanvasElement
): void {
  const context = presented.getContext('2d');
  if (!context) throw new Error('Preview frame context is unavailable.');
  if (presented.width !== staging.width) presented.width = staging.width;
  if (presented.height !== staging.height) presented.height = staging.height;
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'copy';
    context.filter = 'none';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.drawImage(staging, 0, 0);
  } finally {
    context.restore();
  }
}

function drawResolvedPreviewSceneContent(
  args: ResolvedPreviewSceneArgs,
  viewportCanvas?: HTMLCanvasElement
): boolean {
  const visualPassArgs = {
    canvas: args.params.canvas,
    ...(args.params.spatialRenderer ? { spatialRenderer: args.params.spatialRenderer } : {}),
    ...(viewportCanvas ? { viewportCanvas } : {}),
    clipMediaElements: args.clipMediaElements,
    currentTime: args.params.currentTime,
    ...(args.effectRuntimeFrames ? { effectRuntimeFrames: args.effectRuntimeFrames } : {}),
    imageBank: args.params.imageBank,
    overlayFrame: args.renderPasses.overlayFrame,
    passes: args.renderPasses.visualPasses,
    ...(args.params.previewRasterSize ? { previewRasterSize: args.params.previewRasterSize } : {}),
    project: args.params.project,
    stage: args.params.stage,
  };
  const overlayPrepared = drawPreviewVisualPasses(visualPassArgs);

  if (!overlayPrepared || args.params.signal?.aborted) return false;

  drawCompositionBorders(
    overlayPrepared.context,
    args.renderPasses.overlayFrame.viewportBorders,
    {
      x: overlayPrepared.viewport.offsetX,
      y: overlayPrepared.viewport.offsetY,
      width: overlayPrepared.viewport.width,
      height: overlayPrepared.viewport.height,
    },
    overlayPrepared.viewport.scale
  );
  drawPreviewSceneOverlays({
    camera: args.renderPasses.overlayFrame.camera,
    context: overlayPrepared.context,
    frame: args.renderPasses.overlayFrame,
    viewport: overlayPrepared.viewport,
    logicalSize: { width: args.params.project.width, height: args.params.project.height },
    rasterScale: overlayPrepared.viewport.scale * overlayPrepared.dpr,
    spatialRenderer: args.params.spatialRenderer,
  });
  const { context, viewport } = overlayPrepared;
  if (!args.captions.plan.cues.length && !args.watermark) return true;
  context.save();
  try {
    context.translate(viewport.offsetX, viewport.offsetY);
    context.scale(viewport.scale, viewport.scale);
    if (args.captions.plan.cues.length) args.captions.draw(context, args.params.currentTime);
    args.watermark?.draw(context);
  } finally {
    context.restore();
  }
  return true;
}

async function resolvePreviewEffectRuntimeFrames(
  params: Parameters<typeof renderPreviewScene>[0],
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  clipMediaElements: ReadonlyMap<string, HTMLMediaElement>
): Promise<EffectRuntimeRenderedComposition | undefined> {
  const hasPlans =
    (renderPasses.overlayFrame.effectRuntimePlans ?? []).length > 0 ||
    renderPasses.visualPasses.some(({ frame }) => (frame.effectRuntimePlans ?? []).length > 0);
  if (!hasPlans) return undefined;
  const executor =
    typeof params.effectRuntimeExecutor === 'function'
      ? params.effectRuntimeExecutor()
      : params.effectRuntimeExecutor;
  if (!executor) throw new Error('EFFECT_RUNTIME_PREVIEW_EXECUTOR_MISSING');
  return renderEffectRuntimeComposition({
    clipMediaElements,
    executor,
    imageBank: params.imageBank,
    overlayFrame: renderPasses.overlayFrame,
    overlayTime: params.currentTime,
    ...(params.spatialRenderer ? { spatialRenderer: params.spatialRenderer } : {}),
    ownerDocument: params.canvas.ownerDocument,
    rasterScale: resolvePreviewEffectRuntimeRasterScale({
      canvas: params.canvas,
      ...(params.previewRasterSize ? { previewRasterSize: params.previewRasterSize } : {}),
      project: params.project,
      stage: params.stage,
    }),
    visualPasses: renderPasses.visualPasses,
    ...(params.signal ? { signal: params.signal } : {}),
  });
}
