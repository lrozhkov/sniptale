import { drawCompositionSceneSpotlights } from '../../../features/video/composition/draw/project-spotlight';
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
}) {
  const segments = segmentVisualLayersByViewportLock(
    resolveEffectRuntimeVisualLayers(
      params.renderPasses.overlayFrame.visualLayers,
      params.effectRuntimeFrames?.overlayFrames
    ),
    params.renderPasses.overlayFrame.camera
  );
  const overlayEffectState = createEffectRuntimeDrawState();
  const passEffectStates = new Map<number, EffectRuntimeDrawState>();

  for (const segment of segments) {
    for (const part of splitVisualLayersForSourceSpotlights(
      segment.layers,
      params.renderPasses.overlayFrame.sceneSpotlights
    )) {
      if (segment.isLocked) {
        drawLockedOverlayLayers(
          params.context,
          part.layers,
          params.renderPasses.overlayFrame,
          params,
          params.effectRuntimeFrames?.overlayFrames,
          overlayEffectState
        );
      } else await drawUnlockedOverlayGroup(part.layers, params, passEffectStates);
      if (part.afterClipId)
        drawCompositionSceneSpotlights({
          context: params.context,
          afterClipId: part.afterClipId,
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

async function drawUnlockedOverlayGroup(
  layers: VisualLayer[],
  params: DrawParams,
  effectRuntimeStates: Map<number, EffectRuntimeDrawState>
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

  try {
    if (
      params.renderPasses.visualPasses.length > 1 &&
      params.renderPasses.visualPasses.some((pass) => pass.frame.camera.spatial) &&
      !passBuffer
    )
      throw new Error('Motion blur buffer is unavailable.');
    for (const pass of params.renderPasses.visualPasses) {
      await params.effectRuntimeFrames?.prepareVisualPass?.(pass.time);
      const paint = (drawContext: CanvasRenderingContext2D) => {
        if (pass.frame.camera.spatial) {
          if (!params.spatialRenderer) throw new Error('Perspective renderer is unavailable.');
          drawContext.save();
          try {
            drawContext.globalAlpha *= passBuffer ? 1 : pass.alpha;
            drawSpatialCompositionGroup({
              camera: pass.frame.camera,
              context: drawContext,
              renderer: params.spatialRenderer(),
              clipMediaElements: params.clipMediaElements,
              imageBank: params.loadedImages,
              layers: resolveOrderedVisualPassLayers(layers, pass.frame.visualLayers),
              effectState: resolveExportEffectDrawState(effectRuntimeStates, pass.time),
              ...(getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time)
                ? {
                    frames: getEffectRuntimeVisualPassFrames(
                      params.effectRuntimeFrames,
                      pass.time
                    )!,
                  }
                : {}),
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
          passBuffer ? { ...pass, alpha: 1 } : pass,
          params,
          getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time),
          resolveExportEffectDrawState(effectRuntimeStates, pass.time)
        );
        drawContext.restore();
      };
      if (passBuffer) passBuffer.drawPass(pass.alpha, paint);
      else paint(drawContext);
    }

    passBuffer?.flush();
  } finally {
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

  context.save();
  try {
    context.clearRect(0, 0, settings.width, settings.height);
    drawExportSceneBackground({
      ...(renderPasses.overlayFrame.camera.backgroundCamera
        ? { backgroundCamera: renderPasses.overlayFrame.camera.backgroundCamera }
        : {}),
      ...(options.backgroundCache ? { cache: options.backgroundCache } : {}),
      context,
      currentTime,
      height: settings.height,
      loadedImages,
      project,
      width: settings.width,
    });
    await drawVisualPasses({
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
    drawCompositionSceneSpotlights({
      context,
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
  } finally {
    context.restore();
  }
}
