import { createNativeSharpStages, type NativeSharpStage } from './source-sharp-stage';
import type { ProjectExportSourceSampling } from './source-sampling';
import { motionCameraProjection } from '../../../features/video/composition/motion/spatial';
import { multiplyQuickEditProjections } from '../../../features/video/composition/motion/spatial-geometry';
import { drawCompositionSceneSpotlights } from '../../../features/video/composition/draw/project-spotlight';
import {
  drawDeferredCameraSplitSpotlights,
  paintCameraSplitScreen,
  resolveActiveCameraSplit,
} from '../../../features/video/composition/camera-split';
import { drawCompositionBorders } from '../../../features/video/composition/draw/border';
import { drawSpatialCompositionGroup } from '../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../features/video/composition/canvas/spatial-renderer';
import { resolveEffectRuntimeVisualLayers } from '../../../features/video/composition/draw/effect-runtime';
import { resolveProjectOutputTransform } from '../../../features/video/project/export/output-dimensions';
import {
  createEffectRuntimeDrawState,
  drawEffectRuntimeVisualLayer,
  type EffectRuntimeDrawState,
} from '../../../features/video/composition/draw';
import {
  getEffectRuntimeVisualPassFrames,
  type EffectRuntimeRenderedComposition,
  type EffectRuntimeRenderedFrameMap,
} from '../../../features/video/composition/effect-runtime';
import {
  mapVisualLayerToViewportSpace,
  segmentVisualLayersByViewportLock,
} from '../../../features/video/composition/motion/layer-camera';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import type { VideoCompositionTimelineIndex } from '../../../features/video/composition/timeline/frame/index';
import { createVideoCompositionPassBuffer } from '../../../features/video/composition/canvas/pass-buffer';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../features/video/project/types/index';
import { drawExportSceneBackground, type ExportSceneBackgroundCache } from './background';
import { drawCompositionLayer } from './clip';
import type { LoadedImagesMap } from './types';
import {
  resolveOrderedVisualPassLayers,
  splitVisualLayersForSourceSpotlights,
} from '../../../features/video/composition/visual-pass-layers';
import { drawExportTransitionOverlayPasses, resolveExportEffectDrawState } from './frame-effects';
import { drawExportOverlayPass } from './frame-overlays';

type ClipMediaSources = Parameters<typeof drawCompositionLayer>[5];
type RenderPasses = ReturnType<typeof resolveVideoCompositionRenderPasses>;
type VisualPass = RenderPasses['visualPasses'][number];
type OverlayFrame = RenderPasses['overlayFrame'];
type VisualLayer = ReturnType<typeof mapVisualLayerToViewportSpace>;
type DrawParams = Parameters<typeof drawVisualPasses>[0];

function beginExportCameraPass(
  context: CanvasRenderingContext2D,
  pass: VisualPass,
  params: Pick<DrawParams, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'settings'>
) {
  context.save();
  context.beginPath();
  context.rect(0, 0, params.settings.width, params.settings.height);
  context.clip();
  if (params.offsetX !== 0 || params.offsetY !== 0) {
    context.translate(params.offsetX, params.offsetY);
  }
  context.scale(pass.frame.camera.scale, pass.frame.camera.scale);
  context.translate(
    -pass.frame.camera.viewportX * params.scaleX,
    -pass.frame.camera.viewportY * params.scaleY
  );
}

async function drawVisualPasses(params: {
  time: number;
  clipMediaElements: ClipMediaSources;
  context: CanvasRenderingContext2D;
  effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  loadedImages: LoadedImagesMap;
  offsetX: number;
  offsetY: number;
  renderPasses: RenderPasses;
  scaleX: number;
  scaleY: number;
  settings: VideoProjectExportSettings;
  project: VideoProject;
  logicalSize: { width: number; height: number };
  spatialRenderer?: () => ReviewSpatialRenderer;
  sourceSampling?: ProjectExportSourceSampling;
  sourceSamplingFallback?: 'first' | 'last';
  sharpStages?: readonly NativeSharpStage[];
  signal?: AbortSignal;
}) {
  const splitClipId = resolveActiveCameraSplit(
    params.project,
    params.time,
    params.renderPasses.overlayFrame.visualLayers
  )?.clipId;
  const segments = segmentVisualLayersByViewportLock(
    resolveEffectRuntimeVisualLayers(
      params.renderPasses.overlayFrame.visualLayers.filter((layer) => layer.clipId !== splitClipId),
      params.effectRuntimeFrames?.overlayFrames
    ),
    params.renderPasses.overlayFrame.camera
  );
  const overlayEffectState = createEffectRuntimeDrawState();
  const passEffectStates = new Map<number, EffectRuntimeDrawState>();
  const sharpEffectStates = new Map<NativeSharpStage, Map<number, EffectRuntimeDrawState>>();
  const sharpOverlayStates = new Map<NativeSharpStage, EffectRuntimeDrawState>();
  for (const stage of params.sharpStages ?? []) {
    sharpEffectStates.set(stage, new Map());
    sharpOverlayStates.set(stage, createEffectRuntimeDrawState());
  }

  for (const segment of segments) {
    for (const part of splitVisualLayersForSourceSpotlights(
      segment.layers,
      params.renderPasses.overlayFrame.sceneSpotlights
    )) {
      if (segment.isLocked) {
        const prepared = await params.sourceSampling?.prepare({
          project: params.project,
          ...(params.sourceSamplingFallback ? { fallback: params.sourceSamplingFallback } : {}),
          frame: params.renderPasses.overlayFrame,
          time: params.time,
          media: params.clipMediaElements,
          images: params.loadedImages,
          ...(params.signal ? { signal: params.signal } : {}),
        });
        drawLockedOverlayLayers(
          params.context,
          part.layers,
          params.renderPasses.overlayFrame,
          prepared ? { ...params, clipMediaElements: prepared.media } : params,
          params.effectRuntimeFrames?.overlayFrames,
          overlayEffectState
        );
        for (const stage of params.sharpStages ?? [])
          if (!stage.finished)
            stage.paint((context) =>
              drawLockedOverlayLayers(
                context,
                part.layers,
                params.renderPasses.overlayFrame,
                {
                  ...params,
                  clipMediaElements: prepared?.forDemand(stage.id) ?? params.clipMediaElements,
                },
                params.effectRuntimeFrames?.overlayFrames,
                sharpOverlayStates.get(stage)!
              )
            );
      } else
        await drawUnlockedOverlayGroup(part.layers, params, passEffectStates, sharpEffectStates);
      if (part.afterClipId)
        drawCompositionSceneSpotlights({
          context: params.context,
          afterClipId: part.afterClipId,
          ...(params.sharpStages
            ? {
                sharpPaint: (id, context) => {
                  const stage = params.sharpStages!.find((item) => item.id === `sceneLens:${id}`);
                  if (!stage) throw new Error('Prepared scene lens stage is unavailable.');
                  stage.publish(context);
                },
              }
            : {}),
          frame: params.renderPasses.overlayFrame,
          project: params.project,
          images: params.loadedImages,
          viewport: { x: 0, y: 0, width: params.settings.width, height: params.settings.height },
          composition: { x: params.offsetX, y: params.offsetY, scale: params.scaleX },
        });
    }
  }
}

function drawVisualPassLayers(
  context: CanvasRenderingContext2D,
  layers: VisualLayer[],
  pass: VisualPass,
  params: Pick<DrawParams, 'clipMediaElements' | 'loadedImages' | 'scaleX' | 'scaleY' | 'settings'>,
  effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined,
  effectRuntimeState: EffectRuntimeDrawState
) {
  for (const layer of layers) {
    if (
      !drawEffectRuntimeVisualLayer({
        alpha: pass.alpha,
        context,
        frames: effectRuntimeFrames,
        layer,
        scaleX: params.scaleX,
        scaleY: params.scaleY,
        state: effectRuntimeState,
      })
    ) {
      drawCompositionLayer(
        context,
        layer,
        params.scaleX,
        params.scaleY,
        params.loadedImages,
        params.clipMediaElements,
        pass.alpha
      );
    }
  }
}

function drawLockedOverlayLayers(
  context: CanvasRenderingContext2D,
  layers: VisualLayer[],
  overlayFrame: OverlayFrame,
  params: Pick<
    DrawParams,
    'clipMediaElements' | 'loadedImages' | 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY'
  >,
  effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined,
  effectRuntimeState: EffectRuntimeDrawState
) {
  context.save();
  if (params.offsetX !== 0 || params.offsetY !== 0) {
    context.translate(params.offsetX, params.offsetY);
  }
  for (const layer of layers) {
    const mappedLayer = mapVisualLayerToViewportSpace(layer, overlayFrame.camera);
    if (
      !drawEffectRuntimeVisualLayer({
        context,
        frames: effectRuntimeFrames,
        layer: mappedLayer,
        scaleX: params.scaleX,
        scaleY: params.scaleY,
        state: effectRuntimeState,
      })
    ) {
      drawCompositionLayer(
        context,
        mappedLayer,
        params.scaleX,
        params.scaleY,
        params.loadedImages,
        params.clipMediaElements,
        1
      );
    }
  }
  context.restore();
}

function paintExportVisualSample(args: {
  drawContext: CanvasRenderingContext2D;
  pass: VisualPass;
  layers: VisualLayer[];
  params: Pick<
    DrawParams,
    | 'loadedImages'
    | 'offsetX'
    | 'offsetY'
    | 'scaleX'
    | 'scaleY'
    | 'logicalSize'
    | 'settings'
    | 'spatialRenderer'
  >;
  media: ClipMediaSources;
  buffered: boolean;
  effectState: EffectRuntimeDrawState;
  frames?: EffectRuntimeRenderedFrameMap;
  sourceRasterScale?: number;
  sharpTarget?: Pick<NativeSharpStage, 'output' | 'transform'>;
}) {
  const {
    drawContext,
    pass,
    layers,
    params,
    media,
    buffered,
    effectState,
    frames,
    sourceRasterScale,
    sharpTarget,
  } = args;
  if (pass.frame.camera.spatial) {
    if (!params.spatialRenderer) throw new Error('Perspective renderer is unavailable.');
    drawContext.save();
    try {
      drawContext.globalAlpha *= buffered ? 1 : pass.alpha;
      drawSpatialCompositionGroup({
        camera: pass.frame.camera,
        context: drawContext,
        renderer: params.spatialRenderer(),
        clipMediaElements: media,
        ...(sourceRasterScale !== undefined ? { sourceRasterScale } : {}),
        ...(sharpTarget || sourceRasterScale !== undefined
          ? {
              sharpOutput: {
                output: sharpTarget?.output ?? {
                  width: params.settings.width,
                  height: params.settings.height,
                },
                destination: {
                  x: 0,
                  y: 0,
                  ...(sharpTarget?.output ?? {
                    width: params.settings.width,
                    height: params.settings.height,
                  }),
                },
                projection: multiplyQuickEditProjections(
                  sharpTarget?.transform ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
                  multiplyQuickEditProjections(
                    [1, 0, params.offsetX, 0, 1, params.offsetY, 0, 0, 1],
                    motionCameraProjection(pass.frame.camera, params.scaleX)!
                  )
                ),
              },
            }
          : {}),
        imageBank: params.loadedImages,
        layers: resolveOrderedVisualPassLayers(layers, pass.frame.visualLayers),
        effectState,
        ...(frames ? { frames } : {}),
        logicalSize: params.logicalSize,
        rasterScale: params.scaleX,
        output: {
          width: Math.max(1, Math.ceil(params.logicalSize.width * params.scaleX)),
          height: Math.max(1, Math.ceil(params.logicalSize.height * params.scaleY)),
        },
        destination: {
          x: params.offsetX,
          y: params.offsetY,
          width: params.logicalSize.width * params.scaleX,
          height: params.logicalSize.height * params.scaleY,
        },
      });
    } finally {
      drawContext.restore();
    }
    return;
  }
  beginExportCameraPass(drawContext, pass, params);
  drawVisualPassLayers(
    drawContext,
    resolveOrderedVisualPassLayers(layers, pass.frame.visualLayers),
    buffered ? { ...pass, alpha: 1 } : pass,
    { ...params, clipMediaElements: media },
    frames,
    effectState
  );
  drawContext.restore();
}

async function drawUnlockedOverlayGroup(
  layers: VisualLayer[],
  params: DrawParams,
  effectRuntimeStates: Map<number, EffectRuntimeDrawState>,
  sharpEffectStates: Map<NativeSharpStage, Map<number, EffectRuntimeDrawState>>
) {
  const ownerDocument =
    typeof HTMLCanvasElement !== 'undefined' && params.context.canvas instanceof HTMLCanvasElement
      ? params.context.canvas.ownerDocument
      : null;
  const passBuffer =
    params.renderPasses.visualPasses.length > 1
      ? createVideoCompositionPassBuffer({
          bufferHeight: params.settings.height,
          bufferWidth: params.settings.width,
          drawHeight: params.settings.height,
          drawWidth: params.settings.width,
          ownerDocument,
          targetContext: params.context,
        })
      : null;
  const drawContext = passBuffer?.context ?? params.context;
  const stageBuffers: Array<{
    stage: NativeSharpStage;
    buffer: ReturnType<typeof createVideoCompositionPassBuffer>;
    release(): void;
  }> = [];
  try {
    for (const stage of params.sharpStages ?? []) {
      if (stage.finished) continue;
      const releases: (() => void)[] = [];
      let buffer: ReturnType<typeof createVideoCompositionPassBuffer> = null;
      try {
        if (params.renderPasses.visualPasses.length > 1) {
          releases.push(
            params.sourceSampling!.reserveRaster(stage.output.width, stage.output.height)
          );
          releases.push(
            params.sourceSampling!.reserveRaster(stage.output.width, stage.output.height)
          );
          buffer = createVideoCompositionPassBuffer({
            bufferWidth: stage.output.width,
            bufferHeight: stage.output.height,
            drawWidth: stage.output.width,
            drawHeight: stage.output.height,
            ownerDocument,
            targetContext: stage.context,
          });
          if (!buffer) throw new Error('Sharp motion blur buffer is unavailable.');
          buffer.context.setTransform(
            stage.transform[0],
            stage.transform[3],
            stage.transform[1],
            stage.transform[4],
            stage.transform[2],
            stage.transform[5]
          );
        }
        stageBuffers.push({
          stage,
          buffer,
          release() {
            for (const release of releases) release();
          },
        });
      } catch (error) {
        buffer?.dispose();
        for (const release of releases) release();
        throw error;
      }
    }
  } catch (error) {
    for (const item of stageBuffers) {
      item.buffer?.dispose();
      item.release();
    }
    passBuffer?.dispose();
    throw error;
  }

  try {
    if (
      params.renderPasses.visualPasses.length > 1 &&
      params.renderPasses.visualPasses.some((pass) => pass.frame.camera.spatial) &&
      !passBuffer
    )
      throw new Error('Motion blur buffer is unavailable.');
    for (const pass of params.renderPasses.visualPasses) {
      await params.effectRuntimeFrames?.prepareVisualPass?.(pass.time);
      const prepared = await params.sourceSampling?.prepare({
        project: params.project,
        ...(params.sourceSamplingFallback ? { fallback: params.sourceSamplingFallback } : {}),
        frame: pass.frame,
        sceneTime: params.time,
        lensFrame: params.renderPasses.overlayFrame,
        time: pass.time,
        media: params.clipMediaElements,
        images: params.loadedImages,
        ...(params.signal ? { signal: params.signal } : {}),
      });
      const passParams = prepared ? { ...params, clipMediaElements: prepared.media } : params;
      const frames = getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time);
      const paint = (
        drawContext: CanvasRenderingContext2D,
        media = passParams.clipMediaElements,
        stage?: NativeSharpStage
      ) =>
        paintExportVisualSample({
          drawContext,
          pass,
          layers,
          params,
          media,
          buffered: !!passBuffer,
          effectState: resolveExportEffectDrawState(
            stage ? sharpEffectStates.get(stage)! : effectRuntimeStates,
            pass.time
          ),
          ...(frames ? { frames } : {}),
          ...(prepared
            ? {
                sourceRasterScale: stage
                  ? prepared.rasterScaleForDemand(stage.id)
                  : prepared.sourceRasterScale,
              }
            : {}),
          ...(stage ? { sharpTarget: stage } : {}),
        });
      if (passBuffer) passBuffer.drawPass(pass.alpha, paint);
      else paint(drawContext);
      for (const { stage, buffer } of stageBuffers) {
        const media = prepared?.forDemand(stage.id) ?? params.clipMediaElements;
        if (buffer) buffer.drawPass(pass.alpha, (context) => paint(context, media, stage));
        else stage.paint((context) => paint(context, media, stage));
      }
    }

    passBuffer?.flush();
    for (const { buffer } of stageBuffers) buffer?.flush();
  } finally {
    for (const item of stageBuffers) {
      item.buffer?.dispose();
      item.release();
    }
    passBuffer?.dispose();
  }
}

export async function drawProjectFrame(
  context: CanvasRenderingContext2D,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  currentTime: number,
  loadedImages: LoadedImagesMap,
  clipMediaElements: ClipMediaSources,
  options: {
    backgroundCache?: ExportSceneBackgroundCache;
    spatialRenderer?: () => ReviewSpatialRenderer;
    compositionIndex?: VideoCompositionTimelineIndex;
    effectRuntimeFrames?: EffectRuntimeRenderedComposition;
    sourceSampling?: ProjectExportSourceSampling;
    sourceSamplingFallback?: 'first' | 'last';
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const { offsetX, offsetY, scale } = resolveProjectOutputTransform(project, settings);
  const renderPasses = resolveVideoCompositionRenderPasses(project, currentTime, {
    includeSubtitles: settings.burnInSubtitles === true,
    cameraViewport: {
      width: settings.width,
      height: settings.height,
      ...(settings.resolution ? { resolution: settings.resolution } : {}),
    },
    ...(options.compositionIndex ? { timelineIndex: options.compositionIndex } : {}),
  });

  const sharpStages = options.sourceSampling
    ? createNativeSharpStages({
        project,
        settings,
        frame: renderPasses.overlayFrame,
        images: loadedImages,
        sampling: options.sourceSampling,
      })
    : [];
  context.save();
  try {
    context.clearRect(0, 0, settings.width, settings.height);
    const paintBackground = (target: CanvasRenderingContext2D) =>
      drawExportSceneBackground({
        ...(renderPasses.overlayFrame.camera.backgroundCamera
          ? { backgroundCamera: renderPasses.overlayFrame.camera.backgroundCamera }
          : {}),
        ...(options.backgroundCache ? { cache: options.backgroundCache } : {}),
        context: target,
        currentTime,
        height: settings.height,
        loadedImages,
        project,
        width: settings.width,
      });
    paintBackground(context);
    for (const stage of sharpStages) stage.paint(paintBackground);
    await drawVisualPasses({
      time: currentTime,
      ...(sharpStages.length ? { sharpStages } : {}),
      ...(options.sourceSampling ? { sourceSampling: options.sourceSampling } : {}),
      ...(options.sourceSamplingFallback
        ? { sourceSamplingFallback: options.sourceSamplingFallback }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      clipMediaElements,
      context,
      ...(options.effectRuntimeFrames ? { effectRuntimeFrames: options.effectRuntimeFrames } : {}),
      loadedImages,
      offsetX,
      offsetY,
      renderPasses,
      project,
      logicalSize: { width: project.width, height: project.height },
      ...(options.spatialRenderer ? { spatialRenderer: options.spatialRenderer } : {}),
      scaleX: scale,
      scaleY: scale,
      settings,
    });
    await drawExportTransitionOverlayPasses(
      context,
      renderPasses.visualPasses,
      settings,
      options.effectRuntimeFrames
    );
    for (const stage of sharpStages)
      if (!stage.finished) {
        stage.context.save();
        try {
          stage.context.setTransform(
            stage.transform[0],
            stage.transform[3],
            stage.transform[1],
            stage.transform[4],
            stage.transform[2],
            stage.transform[5]
          );
          await drawExportTransitionOverlayPasses(
            stage.context,
            renderPasses.visualPasses,
            settings,
            options.effectRuntimeFrames,
            {
              size: stage.output,
              transform: stage.transform,
              reserveRaster: (width, height) =>
                options.sourceSampling!.reserveRaster(width, height),
            }
          );
        } finally {
          stage.context.restore();
        }
      }
    drawCompositionSceneSpotlights({
      context,
      ...(sharpStages.length
        ? {
            sharpPaint: (id, target) => {
              const stage = sharpStages.find((item) => item.id === `sceneLens:${id}`);
              if (!stage) throw new Error('Prepared scene lens stage is unavailable.');
              stage.publish(target);
            },
          }
        : {}),
      frame: renderPasses.overlayFrame,
      project,
      images: loadedImages,
      viewport: { x: 0, y: 0, width: settings.width, height: settings.height },
      composition: { x: offsetX, y: offsetY, scale },
    });
    drawCompositionBorders(
      context,
      renderPasses.overlayFrame.viewportBorders,
      { x: 0, y: 0, width: settings.width, height: settings.height },
      scale
    );
    context.save();
    if (offsetX !== 0 || offsetY !== 0) {
      context.translate(offsetX, offsetY);
    }
    drawExportOverlayPass(context, renderPasses.overlayFrame, scale, scale, {
      logicalSize: { width: project.width, height: project.height },
      spatialRenderer: options.spatialRenderer,
    });
    context.restore();
    const split = resolveActiveCameraSplit(
      project,
      currentTime,
      renderPasses.overlayFrame.visualLayers
    );
    if (split) {
      const prepared = await options.sourceSampling?.prepare({
        project,
        ...(options.sourceSamplingFallback ? { fallback: options.sourceSamplingFallback } : {}),
        frame: renderPasses.overlayFrame,
        time: currentTime,
        media: clipMediaElements,
        images: loadedImages,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      paintCameraSplitScreen(
        context,
        {
          x: offsetX,
          y: offsetY,
          width: project.width * scale,
          height: project.height * scale,
        },
        split.screen
      );
      context.save();
      try {
        context.translate(offsetX, offsetY);
        if (
          !drawEffectRuntimeVisualLayer({
            context,
            frames: options.effectRuntimeFrames?.overlayFrames,
            layer: split.layer,
            scaleX: scale,
            scaleY: scale,
            state: createEffectRuntimeDrawState(),
          })
        )
          drawCompositionLayer(
            context,
            split.layer,
            scale,
            scale,
            loadedImages,
            prepared?.media ?? clipMediaElements,
            1
          );
      } finally {
        context.restore();
      }
      drawDeferredCameraSplitSpotlights({
        context,
        split,
        frame: renderPasses.overlayFrame,
        project,
        images: loadedImages,
        viewport: { x: 0, y: 0, width: settings.width, height: settings.height },
        composition: { x: offsetX, y: offsetY, scale },
      });
    }
  } finally {
    for (const stage of sharpStages) stage.dispose();
    options.sourceSampling?.releasePass();
    context.restore();
  }
}
