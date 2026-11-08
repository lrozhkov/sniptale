import { scaleEffectRuntimeFramePlan } from '../../../../features/video/composition/effect-runtime/render/wave';
import { preparePreviewImageResources } from './image-resources';
import { canPrepareEffectRuntimeGpuComposition } from '../../../../features/video/composition/effect-runtime/render/gpu-wave';
import type { EffectRuntimeGpuPreparedComposition } from '../../../../features/video/composition/effect-runtime/runtime/types';
import type { PreviewScenePresentation } from './types';
import type { EffectRuntimeInputComposer } from '../../../../features/video/composition/effect-runtime/frame/inputs';
import { VideoSample } from 'mediabunny';
import {
  prepareDecodedVideoFrame,
  prepareDecodedVideoSample,
} from '../../../../features/video/composition/draw/decoded-sample';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionMediaSource,
  type VideoCompositionFrameSource,
} from '../../../../features/video/composition/draw/media-source';
import {
  beginPreviewViewportClip,
  publishCompletedPreviewFrame,
  type PreparedPreviewSceneCanvas,
} from './canvas';
import {
  drawDeferredCameraSplitSpotlights,
  paintCameraSplitScreen,
  resolveActiveCameraSplit,
} from '../../../../features/video/composition/camera-split';
import { drawVideoProjectSceneEdges } from '../../../../features/video/composition/canvas/scene-edges';
import {
  presentationEnvelopeOpacity,
  resolveVideoProjectSceneEdgePlan,
} from '../../../../features/video/project/scene/edge-fades';
import { drawCompositionSceneSpotlights } from '../../../../features/video/composition/draw/project-spotlight';
import { drawCompositionBorders } from '../../../../features/video/composition/draw/border';
import {
  createVideoProjectWatermarkRenderer,
  type VideoProjectWatermarkRenderer,
} from '../../../../features/video/composition/canvas/project-watermark';
import { loadVideoEditorAssetBlob } from '../../../runtime/session/asset-urls';
import { drawSpatialSceneOverlays } from '../../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';

import {
  createEffectRuntimeDrawState,
  drawCompositionVisualLayer,
  drawEffectRuntimeVisualLayer,
  drawSceneActionCompositionStates,
  drawCursorCompositionState,
} from '../../../../features/video/composition/draw';
import {
  disposeEffectRuntimeComposition,
  renderEffectRuntimeComposition,
  type EffectRuntimeRenderedComposition,
} from '../../../../features/video/composition/effect-runtime';

import { mapCompositionPointThroughCamera } from '../../../../features/video/composition/motion';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';

import { prepareNativePreviewGpuComposition } from './frame-plan';
import { drawPreviewVisualPasses } from './render-visual';
import type { PreviewSceneViewport, PreviewStageVideoRefs } from '../types';
import { resolvePreviewEffectRuntimeRasterScale } from './canvas';

import type { PreviewSceneRenderInput } from './types';
import {
  createVideoProjectCaptionRenderer,
  type VideoProjectCaptionRenderer,
} from '../../../../workflows/video-review/project-captions';

function createPreviewSceneMediaMap(
  videoRefs: PreviewStageVideoRefs,
  decodedVideoFrames?: ReadonlyMap<string, VideoCompositionFrameSource>
): Map<string, VideoCompositionMediaSource> {
  const mediaMap = new Map<string, VideoCompositionMediaSource>();
  for (const [clipId, video] of Object.entries(videoRefs.current)) {
    if (video) {
      mediaMap.set(clipId, video);
    }
  }
  for (const [clipId, frame] of decodedVideoFrames ?? []) mediaMap.set(clipId, frame);
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

/** Internal signal: retry this request serially after all GPU jobs settle. */
export class PreviewGpuSerialFallback extends Error {
  constructor() {
    super('Preview GPU jobs must drain before Canvas fallback.');
    this.name = 'PreviewGpuSerialFallback';
  }
}

export async function renderPreviewScene(
  params: PreviewSceneRenderInput
): Promise<PreviewScenePresentation | void | false> {
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

/** A capture owns its normalized frames until all composition consumers finish. */
function capturePreviewSceneVideos(
  media: Map<string, VideoCompositionMediaSource>,
  videos: readonly HTMLMediaElement[],
  signal?: AbortSignal
) {
  const frames: Array<{ close(): void }> = [];
  const release = () => {
    for (const frame of frames) frame.close();
  };
  const captureSignal = signal ?? new AbortController().signal;
  const sources = [...media].filter(
    ([, source]) =>
      (source instanceof HTMLVideoElement && source.videoWidth > 0 && videos.includes(source)) ||
      (isVideoCompositionFrameSource(source) && source.toVideoFrame !== undefined)
  );
  const prepare = async () => {
    for (const [clipId, source] of sources) {
      if (isVideoCompositionFrameSource(source) && source.toVideoFrame) {
        const sample = await prepareDecodedVideoSample(
          new VideoSample(source.toVideoFrame(), source.orientation),
          captureSignal
        );
        frames.push(sample);
        captureSignal.throwIfAborted();
        media.set(clipId, {
          sourceWidth: sample.displayWidth,
          sourceHeight: sample.displayHeight,
          draw: (context, x, y, width, height) => sample.draw(context, x, y, width, height),
        });
        continue;
      }
      if (!(source instanceof HTMLVideoElement)) continue;
      const captured = await prepareDecodedVideoFrame(new VideoFrame(source), captureSignal);
      frames.push(captured);
      captureSignal.throwIfAborted();
      media.set(clipId, {
        sourceWidth: captured.displayWidth,
        sourceHeight: captured.displayHeight,
        draw: (context, x, y, width, height) => context.drawImage(captured, x, y, width, height),
      });
    }
  };
  return { ready: sources.length ? prepare() : undefined, release };
}

async function renderPreparedPreviewScene(
  params: PreviewSceneRenderInput,
  watermark?: Awaited<ReturnType<VideoProjectWatermarkRenderer['prepare']>>
): Promise<PreviewScenePresentation | void | false> {
  const renderPasses =
    params.preparedFrame?.passes ??
    resolveVideoCompositionRenderPasses(params.project, params.currentTime);
  if (params.cameraOverride && !params.preparedFrame) {
    renderPasses.overlayFrame.camera = params.cameraOverride;
    for (const pass of renderPasses.visualPasses) pass.frame.camera = params.cameraOverride;
  }
  const clipMediaElements = createPreviewSceneMediaMap(params.videoRefs, params.decodedVideoFrames);
  // Effects rasterize their inputs asynchronously; never start with an unavailable frame.
  if (!arePreviewSourcesReady(params, renderPasses, clipMediaElements)) return false;
  const videos = [...clipMediaElements]
    .filter(([id]) =>
      [renderPasses.overlayFrame, ...renderPasses.visualPasses.map((pass) => pass.frame)].some(
        (frame) => frame.visualLayers.some((layer) => layer.clipId === id)
      )
    )
    .map(([, video]) => video)
    .filter((video): video is HTMLMediaElement => video instanceof HTMLMediaElement);
  let mediaChanged = false;
  const invalidate = () => {
    mediaChanged = true;
  };
  for (const video of videos) video.addEventListener('seeking', invalidate);
  let effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  let gpuEffectFrames: EffectRuntimeGpuPreparedComposition | undefined;
  let capture: ReturnType<typeof capturePreviewSceneVideos> | undefined;

  try {
    if (params.previewRenderer === 'legacy' || !params.gpuPreview) {
      capture = capturePreviewSourcesIfNeeded(params, clipMediaElements, videos);
      if (capture?.ready) await capture.ready;
    }
    const imageInput = await preparePreviewImageResources(params, renderPasses);
    if (!imageInput) return false;
    params = imageInput;
    if (params.previewRenderer !== 'legacy' && params.gpuPreview) {
      const captions = await (
        params.captionRenderer ?? createVideoProjectCaptionRenderer()
      ).prepare(params.project, params.project, params.signal);
      const accelerated = await params.gpuPreview.render(
        params,
        renderPasses,
        (prepared, phase) =>
          drawResolvedPreviewSceneOverlays(
            {
              clipMediaElements,
              captions,
              watermark,
              effectRuntimeFrames,
              params,
              renderPasses,
              isInvalidated: () => mediaChanged,
            },
            prepared,
            true,
            phase
          ),
        () => mediaChanged,
        async (composeInput) => {
          const supplied = params.preparedFrame;
          const prepared =
            supplied &&
            supplied.rasterScale ===
              resolvePreviewEffectRuntimeRasterScale({
                canvas: params.canvas,
                ...(params.previewRasterSize
                  ? { previewRasterSize: params.previewRasterSize }
                  : {}),
                project: params.project,
                stage: params.stage,
              })
              ? supplied.effects
              : await resolvePreviewEffectRuntimeFrames(
                  params,
                  renderPasses,
                  clipMediaElements,
                  composeInput,
                  true
                );
          if (prepared && 'kind' in prepared) gpuEffectFrames = prepared;
          else effectRuntimeFrames = prepared;
          return prepared;
        },
        captions.plan.cues.length > 0 ||
          Boolean(watermark) ||
          (params.sceneEdges !== 'omit' &&
            presentationEnvelopeOpacity(
              resolveVideoProjectSceneEdgePlan(
                params.project,
                params.sampleFps ?? params.project.fps
              ).visualEnvelope,
              params.currentTime
            ) > 0)
      );
      if (accelerated !== undefined) {
        if (accelerated === false) return false;
        const output = accelerated === true ? undefined : accelerated;
        if (
          params.signal?.aborted ||
          mediaChanged ||
          videos.some(
            (video) => video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) ||
          !arePreviewSourcesReady(params, renderPasses, clipMediaElements)
        ) {
          output?.release();
          return false;
        }
        return {
          camera: renderPasses.overlayFrame.camera,
          time: params.currentTime,
          renderer: { backend: 'gpu' },
          ...(output ? { output } : {}),
        };
      }
      if (gpuEffectFrames !== params.preparedFrame?.effects) gpuEffectFrames?.dispose();
      gpuEffectFrames = undefined;
      disposeEffectRuntimeComposition(effectRuntimeFrames);
      effectRuntimeFrames = undefined;
    }
    if (params.gpuOnly) throw new PreviewGpuSerialFallback();
    capture ??= capturePreviewSourcesIfNeeded(params, clipMediaElements, videos);
    if (capture?.ready) await capture.ready;
    const captions = await (params.captionRenderer ?? createVideoProjectCaptionRenderer()).prepare(
      params.project,
      params.project,
      params.signal
    );
    effectRuntimeFrames = await resolvePreviewEffectRuntimeFrames(
      params,
      renderPasses,
      clipMediaElements
    );
    if (
      mediaChanged ||
      videos.some(
        (video) => video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) ||
      !arePreviewSourcesReady(params, renderPasses, clipMediaElements)
    )
      return false;
    if (params.signal?.aborted) return;
    const drawn = await drawResolvedPreviewScene({
      clipMediaElements,
      captions,
      watermark,
      effectRuntimeFrames,
      params,
      renderPasses,
      isInvalidated: () => mediaChanged,
    });
    if (!drawn) return false;
    return {
      camera: renderPasses.overlayFrame.camera,
      time: params.currentTime,
      renderer: {
        backend: 'legacy',
        ...((params.previewRenderer === 'gpu' || params.gpuPreview) &&
        params.previewRenderer !== 'legacy'
          ? { fallback: params.gpuPreview?.fallbackReason ?? 'unavailable' }
          : {}),
      },
    };
  } finally {
    for (const video of videos) video.removeEventListener('seeking', invalidate);
    try {
      if (gpuEffectFrames !== params.preparedFrame?.effects) gpuEffectFrames?.dispose();
      gpuEffectFrames = undefined;
      disposeEffectRuntimeComposition(effectRuntimeFrames);
    } finally {
      capture?.release();
    }
  }
}

function arePreviewSceneVideosReady(
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  media: ReadonlyMap<string, VideoCompositionMediaSource>
): boolean {
  const frames = [
    renderPasses.overlayFrame,
    ...renderPasses.visualPasses.filter((pass) => pass.alpha > 0).map((pass) => pass.frame),
  ];
  return frames.every((frame) =>
    frame.visualLayers.every((layer) => {
      if (layer.kind !== 'video' || layer.opacity <= 0) return true;
      const video = media.get(layer.clipId);
      return (
        isVideoCompositionFrameSource(video) ||
        (!!video && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      );
    })
  );
}

type ResolvedPreviewSceneArgs = {
  watermark: Awaited<ReturnType<VideoProjectWatermarkRenderer['prepare']>> | undefined;
  captions: Awaited<ReturnType<VideoProjectCaptionRenderer['prepare']>>;
  clipMediaElements: Map<string, VideoCompositionMediaSource>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  params: PreviewSceneRenderInput;
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>;
  isInvalidated(): boolean;
};

async function drawResolvedPreviewScene(args: ResolvedPreviewSceneArgs): Promise<boolean> {
  const spatial = [
    args.renderPasses.overlayFrame,
    ...args.renderPasses.visualPasses.map((pass) => pass.frame),
  ].some((frame) => frame.camera.spatial !== undefined);
  if (!spatial && !args.watermark && !args.effectRuntimeFrames?.prepareVisualPass) {
    const drawn = await drawResolvedPreviewSceneContent(args);
    if (drawn && !args.params.deferFrameEvent)
      args.params.canvas.dispatchEvent(new Event('sniptale-preview-frame', { bubbles: true }));
    return drawn;
  }
  const presented = args.params.canvas;
  const owned = !args.params.stagingCanvas;
  const staging = args.params.stagingCanvas?.() ?? presented.ownerDocument.createElement('canvas');
  if (staging === presented || staging.ownerDocument !== presented.ownerDocument)
    throw new Error('Preview frame canvas is unavailable.');
  try {
    const drawn = await drawResolvedPreviewSceneContent(
      { ...args, params: { ...args.params, canvas: staging } },
      presented
    );
    if (!drawn || args.params.signal?.aborted || args.isInvalidated()) return false;
    publishCompletedPreviewFrame(presented, staging, !args.params.deferFrameEvent);
    return true;
  } finally {
    if (owned) {
      staging.width = 0;
      staging.height = 0;
    }
  }
}

function drawPreviewDeferredCameraSpotlights(
  args: ResolvedPreviewSceneArgs,
  prepared: PreparedPreviewSceneCanvas,
  split: NonNullable<ReturnType<typeof resolveActiveCameraSplit>>
) {
  const { context, viewport } = prepared;
  drawDeferredCameraSplitSpotlights({
    context,
    split,
    frame: args.renderPasses.overlayFrame,
    project: args.params.project,
    images: args.params.imageBank,
    viewport: {
      x: viewport.offsetX,
      y: viewport.offsetY,
      width: viewport.width,
      height: viewport.height,
    },
    composition: { x: viewport.offsetX, y: viewport.offsetY, scale: viewport.scale },
  });
}

async function drawResolvedPreviewSceneContent(
  args: ResolvedPreviewSceneArgs,
  viewportCanvas?: HTMLCanvasElement
): Promise<boolean> {
  const visualPassArgs = {
    canvas: args.params.canvas,
    ...(args.params.spatialRenderer ? { spatialRenderer: args.params.spatialRenderer } : {}),
    ...(viewportCanvas ? { viewportCanvas } : {}),
    clipMediaElements: args.clipMediaElements,
    ...(args.params.preparedFrame?.sourceFrames
      ? { sourceFrames: args.params.preparedFrame.sourceFrames }
      : {}),
    currentTime: args.params.currentTime,
    ...(args.effectRuntimeFrames ? { effectRuntimeFrames: args.effectRuntimeFrames } : {}),
    imageBank: args.params.imageBank,
    overlayFrame: args.renderPasses.overlayFrame,
    passes: args.renderPasses.visualPasses,
    ...(args.params.previewRasterSize ? { previewRasterSize: args.params.previewRasterSize } : {}),
    project: args.params.project,
    stage: args.params.stage,
  };
  const overlayPrepared = await drawPreviewVisualPasses(visualPassArgs);

  if (!overlayPrepared || args.params.signal?.aborted) return false;

  drawResolvedPreviewSceneOverlays(args, overlayPrepared);
  return true;
}

function drawResolvedPreviewSceneOverlays(
  args: ResolvedPreviewSceneArgs,
  overlayPrepared: PreparedPreviewSceneCanvas,
  viewportArtworkOnly = false,
  artworkPhase: 'borders' | 'final' = 'final'
) {
  if (!viewportArtworkOnly)
    drawCompositionSceneSpotlights({
      context: overlayPrepared.context,
      frame: args.renderPasses.overlayFrame,
      project: args.params.project,
      images: args.params.imageBank,
      viewport: {
        x: overlayPrepared.viewport.offsetX,
        y: overlayPrepared.viewport.offsetY,
        width: overlayPrepared.viewport.width,
        height: overlayPrepared.viewport.height,
      },
      composition: {
        x: overlayPrepared.viewport.offsetX,
        y: overlayPrepared.viewport.offsetY,
        scale: overlayPrepared.viewport.scale,
      },
    });
  if (!viewportArtworkOnly || artworkPhase === 'borders')
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
  if (viewportArtworkOnly && artworkPhase === 'borders') return;
  if (!viewportArtworkOnly)
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
  const split = viewportArtworkOnly
    ? null
    : resolveActiveCameraSplit(
        args.params.project,
        args.params.currentTime,
        args.renderPasses.overlayFrame.visualLayers
      );
  if (split) {
    paintCameraSplitScreen(
      context,
      {
        x: viewport.offsetX * overlayPrepared.dpr,
        y: viewport.offsetY * overlayPrepared.dpr,
        width: viewport.width * overlayPrepared.dpr,
        height: viewport.height * overlayPrepared.dpr,
      },
      split.screen,
      args.params.canvas.ownerDocument
    );
    beginPreviewViewportClip(overlayPrepared);
    try {
      if (
        !drawEffectRuntimeVisualLayer({
          context,
          frames: args.effectRuntimeFrames?.overlayFrames,
          layer: split.layer,
          scaleX: viewport.scale,
          scaleY: viewport.scale,
          state: createEffectRuntimeDrawState(),
        })
      )
        drawCompositionVisualLayer(
          context,
          split.layer,
          viewport.scale,
          viewport.scale,
          args.params.imageBank,
          args.clipMediaElements
        );
    } finally {
      context.restore();
    }
    drawPreviewDeferredCameraSpotlights(args, overlayPrepared, split);
  }
  if (args.captions.plan.cues.length || args.watermark) {
    context.save();
    try {
      context.translate(viewport.offsetX, viewport.offsetY);
      context.scale(viewport.scale, viewport.scale);
      if (args.captions.plan.cues.length) args.captions.draw(context, args.params.currentTime);
      args.watermark?.draw(context);
    } finally {
      context.restore();
    }
  }
  if (args.params.sceneEdges !== 'omit')
    drawVideoProjectSceneEdges(
      context,
      args.params.project,
      args.params.currentTime,
      {
        x: viewport.offsetX * overlayPrepared.dpr,
        y: viewport.offsetY * overlayPrepared.dpr,
        width: viewport.width * overlayPrepared.dpr,
        height: viewport.height * overlayPrepared.dpr,
      },
      args.params.sampleFps ?? args.params.project.fps
    );
}

function resolvePreviewEffectRuntimeFrames(
  params: PreviewSceneRenderInput,
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  composeInput?: EffectRuntimeInputComposer
): Promise<EffectRuntimeRenderedComposition | undefined>;
function resolvePreviewEffectRuntimeFrames(
  params: PreviewSceneRenderInput,
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  composeInput: EffectRuntimeInputComposer | undefined,
  prepareGpu: true
): Promise<EffectRuntimeRenderedComposition | EffectRuntimeGpuPreparedComposition | undefined>;
async function resolvePreviewEffectRuntimeFrames(
  params: PreviewSceneRenderInput,
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>,
  composeInput?: EffectRuntimeInputComposer,
  prepareGpu = false
): Promise<EffectRuntimeRenderedComposition | EffectRuntimeGpuPreparedComposition | undefined> {
  const hasPlans =
    (renderPasses.overlayFrame.effectRuntimePlans ?? []).length > 0 ||
    renderPasses.visualPasses.some(({ frame }) => (frame.effectRuntimePlans ?? []).length > 0);
  if (!hasPlans) return undefined;
  const executor =
    typeof params.effectRuntimeExecutor === 'function'
      ? params.effectRuntimeExecutor()
      : params.effectRuntimeExecutor;
  if (!executor) throw new Error('EFFECT_RUNTIME_PREVIEW_EXECUTOR_MISSING');
  if (
    prepareGpu &&
    executor.prepareGpuFrame &&
    canPrepareEffectRuntimeGpuComposition([
      renderPasses.overlayFrame,
      ...renderPasses.visualPasses.map((pass) => pass.frame),
    ])
  ) {
    return prepareNativePreviewGpuComposition(params, renderPasses, executor);
  }
  return renderEffectRuntimeComposition({
    project: params.project,
    streamVisualPasses: true,
    ...(composeInput ? { composeInput } : {}),
    clipMediaElements,
    ...(params.preparedFrame?.sourceFrames
      ? {
          prepareSourcePass: async (frame, time) => ({
            media: params.preparedFrame!.sourceFrames!.media(frame, time, [
              ...frame.visualLayers,
              ...frame.effectInputLayers,
            ]),
            renderDimensions: (plan) =>
              scaleEffectRuntimeFramePlan(plan, resolvePreviewEffectRuntimeRasterScale(params))
                .renderDimensions,
            effectMedia: () =>
              params.preparedFrame!.sourceFrames!.media(frame, time, frame.effectInputLayers),
          }),
        }
      : {}),
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

/** Exact prepared sources are ready without a second moving-media admission or capture. */
function arePreviewSourcesReady(
  input: PreviewSceneRenderInput,
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>,
  media: Map<string, VideoCompositionMediaSource>
) {
  return Boolean(input.preparedFrame?.sourceFrames) || arePreviewSceneVideosReady(passes, media);
}
function capturePreviewSourcesIfNeeded(
  input: PreviewSceneRenderInput,
  media: Map<string, VideoCompositionMediaSource>,
  videos: readonly HTMLMediaElement[]
) {
  return input.preparedFrame?.sourceFrames
    ? undefined
    : capturePreviewSceneVideos(media, videos, input.signal);
}
