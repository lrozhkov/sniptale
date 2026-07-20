import {
  createEffectRuntimeDrawState,
  drawCompositionVisualLayer,
  drawEffectRuntimeVisualLayer,
  type EffectRuntimeDrawState,
} from '../../../../features/video/composition/draw';
import {
  getEffectRuntimeVisualPassFrames,
  type EffectRuntimeRenderedComposition,
  type EffectRuntimeRenderedFrameMap,
} from '../../../../features/video/composition/effect-runtime';
import {
  mapVisualLayerToViewportSpace,
  segmentVisualLayersByViewportLock,
} from '../../../../features/video/composition/motion/layer-camera';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { VideoProject } from '../../../../features/video/project/types/index';
import {
  beginPreviewCameraPass,
  beginPreviewViewportClip,
  resolvePreparedPreviewSceneCanvas,
  type PreparedPreviewSceneCanvas,
} from './canvas';
import { drawPreviewTransitionOverlays, resolvePreviewEffectDrawState } from './render-effects';
import { resolvePreviewPassTarget } from './render-pass-target';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';

function drawLockedPreviewLayer(
  prepared: PreparedPreviewSceneCanvas,
  layer: ReturnType<typeof mapVisualLayerToViewportSpace>,
  params: {
    clipMediaElements: Map<string, HTMLMediaElement>;
    imageBank: Record<string, HTMLImageElement>;
    pass: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'][number];
    effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined;
    effectRuntimeState: EffectRuntimeDrawState;
  }
) {
  beginPreviewViewportClip(prepared);

  if (
    !drawEffectRuntimeVisualLayer({
      alpha: params.pass.alpha,
      context: prepared.context,
      frames: params.effectRuntimeFrames,
      layer,
      scaleX: prepared.viewport.scale,
      scaleY: prepared.viewport.scale,
      state: params.effectRuntimeState,
    })
  ) {
    drawCompositionVisualLayer(
      prepared.context,
      layer,
      prepared.viewport.scale,
      prepared.viewport.scale,
      params.imageBank,
      params.clipMediaElements,
      params.pass.alpha
    );
  }

  prepared.context.restore();
}

function drawPreparedPreviewVisualPass(params: {
  clipMediaElements: Map<string, HTMLMediaElement>;
  imageBank: Record<string, HTMLImageElement>;
  layers: ReturnType<typeof mapVisualLayerToViewportSpace>[];
  pass: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'][number];
  prepared: PreparedPreviewSceneCanvas;
  effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined;
  effectRuntimeState: EffectRuntimeDrawState;
}) {
  beginPreviewCameraPass(params.prepared, params.pass.frame.camera);

  for (const layer of params.layers) {
    if (
      !drawEffectRuntimeVisualLayer({
        alpha: params.pass.alpha,
        context: params.prepared.context,
        frames: params.effectRuntimeFrames,
        layer,
        scaleX: params.prepared.viewport.scale,
        scaleY: params.prepared.viewport.scale,
        state: params.effectRuntimeState,
      })
    ) {
      drawCompositionVisualLayer(
        params.prepared.context,
        layer,
        params.prepared.viewport.scale,
        params.prepared.viewport.scale,
        params.imageBank,
        params.clipMediaElements,
        params.pass.alpha
      );
    }
  }

  params.prepared.context.restore();
}

export function drawPreviewVisualPasses(params: {
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, HTMLMediaElement>;
  currentTime?: number;
  imageBank: Record<string, HTMLImageElement>;
  overlayFrame: ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];
  effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  project: VideoProject;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  stage: HTMLDivElement | null;
}) {
  const prepared = resolvePreparedPreviewSceneCanvas({
    canvas: params.canvas,
    currentTime: params.currentTime ?? 0,
    imageBank: params.imageBank,
    project: params.project,
    ...(params.previewRasterSize ? { previewRasterSize: params.previewRasterSize } : {}),
    shouldClearCanvas: true,
    stage: params.stage,
  });
  if (!prepared) {
    return null;
  }

  drawPreviewOrderedVisualLayers({
    canvas: params.canvas,
    clipMediaElements: params.clipMediaElements,
    frame: params.overlayFrame,
    imageBank: params.imageBank,
    passes: params.passes,
    prepared,
    effectRuntimeFrames: params.effectRuntimeFrames,
  });
  drawPreviewTransitionOverlays({
    canvas: params.canvas,
    passes: params.passes,
    prepared,
    effectRuntimeFrames: params.effectRuntimeFrames,
  });
  return prepared;
}

function drawPreviewOrderedVisualLayers(params: {
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, HTMLMediaElement>;
  frame: ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];
  imageBank: Record<string, HTMLImageElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  prepared: PreparedPreviewSceneCanvas;
}) {
  const segments = segmentVisualLayersByViewportLock(
    params.frame.visualLayers,
    params.frame.camera
  );
  const overlayEffectState = createEffectRuntimeDrawState();
  const passEffectStates = new Map<number, EffectRuntimeDrawState>();

  for (const segment of segments) {
    if (segment.isLocked) {
      for (const layer of segment.layers) {
        drawLockedPreviewLayer(
          params.prepared,
          mapVisualLayerToViewportSpace(layer, params.frame.camera),
          {
            clipMediaElements: params.clipMediaElements,
            effectRuntimeFrames: params.effectRuntimeFrames?.overlayFrames,
            effectRuntimeState: overlayEffectState,
            imageBank: params.imageBank,
            pass: { alpha: 1, frame: params.frame, time: 0, transitionOverlays: [] },
          }
        );
      }
      continue;
    }

    drawPreviewUnlockedLayerGroup({
      canvas: params.canvas,
      clipMediaElements: params.clipMediaElements,
      effectRuntimeFrames: params.effectRuntimeFrames,
      effectRuntimeStates: passEffectStates,
      imageBank: params.imageBank,
      layers: segment.layers,
      passes: params.passes,
      prepared: params.prepared,
    });
  }
}

function drawPreviewUnlockedLayerGroup(params: {
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, HTMLMediaElement>;
  imageBank: Record<string, HTMLImageElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  effectRuntimeStates: Map<number, EffectRuntimeDrawState>;
  layers: ReturnType<typeof mapVisualLayerToViewportSpace>[];
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  prepared: PreparedPreviewSceneCanvas;
}) {
  const passTarget = resolvePreviewPassTarget({
    canvas: params.canvas,
    passCount: params.passes.length,
    prepared: params.prepared,
  });
  const groupedPrepared =
    passTarget.context === params.prepared.context
      ? params.prepared
      : { ...params.prepared, context: passTarget.context };

  for (const pass of params.passes) {
    drawPreparedPreviewVisualPass({
      clipMediaElements: params.clipMediaElements,
      effectRuntimeFrames: getEffectRuntimeVisualPassFrames(params.effectRuntimeFrames, pass.time),
      effectRuntimeState: resolvePreviewEffectDrawState(params.effectRuntimeStates, pass.time),
      imageBank: params.imageBank,
      layers: resolveOrderedPreviewPassLayers(params.layers, pass.frame.visualLayers),
      pass,
      prepared: groupedPrepared,
    });
  }

  passTarget.flush();
}

function resolveOrderedPreviewPassLayers(
  layers: ReturnType<typeof mapVisualLayerToViewportSpace>[],
  passLayers: ReturnType<typeof mapVisualLayerToViewportSpace>[]
): ReturnType<typeof mapVisualLayerToViewportSpace>[] {
  const resolvedLayers: ReturnType<typeof mapVisualLayerToViewportSpace>[] = [];
  for (const segmentLayer of layers) {
    const layer = passLayers.find((candidate) => candidate.clipId === segmentLayer.clipId);
    if (layer) {
      resolvedLayers.push(layer);
    }
  }
  return resolvedLayers;
}
