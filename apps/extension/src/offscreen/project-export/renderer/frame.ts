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
import { resolveOrderedVisualPassLayers } from './visual-pass-layers';
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
  params: Pick<DrawParams, 'scaleX' | 'scaleY' | 'settings'>
) {
  context.save();
  context.beginPath();
  context.rect(0, 0, params.settings.width, params.settings.height);
  context.clip();
  context.scale(pass.frame.camera.scale, pass.frame.camera.scale);
  context.translate(
    -pass.frame.camera.viewportX * params.scaleX,
    -pass.frame.camera.viewportY * params.scaleY
  );
}

function drawVisualPasses(params: {
  clipMediaElements: ClipMediaSources;
  context: CanvasRenderingContext2D;
  effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  loadedImages: LoadedImagesMap;
  renderPasses: RenderPasses;
  scaleX: number;
  scaleY: number;
  settings: VideoProjectExportSettings;
}) {
  const segments = segmentVisualLayersByViewportLock(
    params.renderPasses.overlayFrame.visualLayers,
    params.renderPasses.overlayFrame.camera
  );
  const overlayEffectState = createEffectRuntimeDrawState();
  const passEffectStates = new Map<number, EffectRuntimeDrawState>();

  for (const segment of segments) {
    if (segment.isLocked) {
      drawLockedOverlayLayers(
        params.context,
        segment.layers,
        params.renderPasses.overlayFrame,
        params,
        params.effectRuntimeFrames?.overlayFrames,
        overlayEffectState
      );
      continue;
    }

    drawUnlockedOverlayGroup(segment.layers, params, passEffectStates);
  }

  drawExportTransitionOverlayPasses(
    params.context,
    params.renderPasses.visualPasses,
    params.settings,
    params.effectRuntimeFrames
  );
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
  params: Pick<DrawParams, 'clipMediaElements' | 'loadedImages' | 'scaleX' | 'scaleY'>,
  effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined,
  effectRuntimeState: EffectRuntimeDrawState
) {
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
}

function drawUnlockedOverlayGroup(
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

  for (const pass of params.renderPasses.visualPasses) {
    beginExportCameraPass(drawContext, pass, params);
    drawVisualPassLayers(
      drawContext,
      resolveOrderedVisualPassLayers(layers, pass.frame.visualLayers),
      pass,
      params,
      getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time),
      resolveExportEffectDrawState(effectRuntimeStates, pass.time)
    );
    drawContext.restore();
  }

  passBuffer?.flush();
}

export function drawProjectFrame(
  context: CanvasRenderingContext2D,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  currentTime: number,
  loadedImages: LoadedImagesMap,
  clipMediaElements: ClipMediaSources,
  options: {
    backgroundCache?: ExportSceneBackgroundCache;
    compositionIndex?: VideoCompositionTimelineIndex;
    effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  } = {}
): void {
  const scaleX = settings.width / project.width;
  const scaleY = settings.height / project.height;
  const renderPasses = resolveVideoCompositionRenderPasses(project, currentTime, {
    includeSubtitles: settings.burnInSubtitles === true,
    ...(options.compositionIndex ? { timelineIndex: options.compositionIndex } : {}),
  });

  context.save();
  context.clearRect(0, 0, settings.width, settings.height);
  drawExportSceneBackground({
    ...(options.backgroundCache ? { cache: options.backgroundCache } : {}),
    context,
    currentTime,
    height: settings.height,
    loadedImages,
    project,
    width: settings.width,
  });

  drawVisualPasses({
    clipMediaElements,
    context,
    ...(options.effectRuntimeFrames ? { effectRuntimeFrames: options.effectRuntimeFrames } : {}),
    loadedImages,
    renderPasses,
    scaleX,
    scaleY,
    settings,
  });
  drawExportOverlayPass(context, renderPasses.overlayFrame, scaleX, scaleY);

  context.restore();
}
