import { drawCompositionSceneSpotlights } from '../../../../features/video/composition/draw/project-spotlight';
import { drawSpatialCompositionGroup } from '../../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';
import {
  resolveOrderedVisualPassLayers,
  splitVisualLayersForSourceSpotlights,
} from '../../../../features/video/composition/visual-pass-layers';
import { resolveEffectRuntimeVisualLayers } from '../../../../features/video/composition/draw/effect-runtime';
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
  spatialRenderer: (() => ReviewSpatialRenderer) | undefined;
  effectRuntimeFrames: EffectRuntimeRenderedFrameMap | undefined;
  effectRuntimeState: EffectRuntimeDrawState;
}) {
  if (params.pass.frame.camera.spatial) {
    if (!params.spatialRenderer) throw new Error('Perspective renderer is unavailable.');
    const { viewport, dpr, context } = params.prepared;
    context.save();
    try {
      context.globalAlpha *= params.pass.alpha;
      drawSpatialCompositionGroup({
        camera: params.pass.frame.camera,
        context,
        renderer: params.spatialRenderer(),
        clipMediaElements: params.clipMediaElements,
        imageBank: params.imageBank,
        layers: params.layers,
        effectState: params.effectRuntimeState,
        ...(params.effectRuntimeFrames ? { frames: params.effectRuntimeFrames } : {}),
        logicalSize: {
          width: viewport.width / viewport.scale,
          height: viewport.height / viewport.scale,
        },
        output: {
          width: Math.max(1, Math.ceil(viewport.width * dpr)),
          height: Math.max(1, Math.ceil(viewport.height * dpr)),
        },
        destination: {
          x: viewport.offsetX,
          y: viewport.offsetY,
          width: viewport.width,
          height: viewport.height,
        },
        rasterScale: viewport.scale * dpr,
      });
    } finally {
      context.restore();
    }
    return;
  }
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
  viewportCanvas?: HTMLCanvasElement;
  spatialRenderer?: () => ReviewSpatialRenderer;
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
    ...(params.overlayFrame.camera.backgroundCamera
      ? { backgroundCamera: params.overlayFrame.camera.backgroundCamera }
      : {}),
    canvas: params.canvas,
    ...(params.viewportCanvas ? { viewportCanvas: params.viewportCanvas } : {}),
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
    project: params.project,
    canvas: params.canvas,
    clipMediaElements: params.clipMediaElements,
    frame: params.overlayFrame,
    imageBank: params.imageBank,
    passes: params.passes,
    prepared,
    effectRuntimeFrames: params.effectRuntimeFrames,
    spatialRenderer: params.spatialRenderer,
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
  project: VideoProject;
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, HTMLMediaElement>;
  frame: ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];
  imageBank: Record<string, HTMLImageElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  prepared: PreparedPreviewSceneCanvas;
  spatialRenderer: (() => ReviewSpatialRenderer) | undefined;
}) {
  const segments = segmentVisualLayersByViewportLock(
    resolveEffectRuntimeVisualLayers(
      params.frame.visualLayers,
      params.effectRuntimeFrames?.overlayFrames
    ),
    params.frame.camera
  );
  const overlayEffectState = createEffectRuntimeDrawState();
  const passEffectStates = new Map<number, EffectRuntimeDrawState>();

  for (const segment of segments) {
    for (const part of splitVisualLayersForSourceSpotlights(
      segment.layers,
      params.frame.sceneSpotlights
    )) {
      if (segment.isLocked) {
        for (const layer of part.layers)
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
      } else
        drawPreviewUnlockedLayerGroup({
          canvas: params.canvas,
          clipMediaElements: params.clipMediaElements,
          effectRuntimeFrames: params.effectRuntimeFrames,
          effectRuntimeStates: passEffectStates,
          imageBank: params.imageBank,
          layers: part.layers,
          passes: params.passes,
          prepared: params.prepared,
          spatialRenderer: params.spatialRenderer,
        });
      if (part.afterClipId)
        drawCompositionSceneSpotlights({
          context: params.prepared.context,
          afterClipId: part.afterClipId,
          frame: params.frame,
          project: params.project,
          images: params.imageBank,
          viewport: {
            x: params.prepared.viewport.offsetX,
            y: params.prepared.viewport.offsetY,
            width: params.prepared.viewport.width,
            height: params.prepared.viewport.height,
          },
          composition: {
            x: params.prepared.viewport.offsetX,
            y: params.prepared.viewport.offsetY,
            scale: params.prepared.viewport.scale,
          },
        });
    }
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
  spatialRenderer: (() => ReviewSpatialRenderer) | undefined;
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

  try {
    if (
      params.passes.length > 1 &&
      params.passes.some((pass) => pass.frame.camera.spatial) &&
      !passTarget.drawPass
    )
      throw new Error('Motion blur buffer is unavailable.');
    for (const pass of params.passes) {
      const paint = (context: CanvasRenderingContext2D) =>
        drawPreparedPreviewVisualPass({
          clipMediaElements: params.clipMediaElements,
          effectRuntimeFrames: getEffectRuntimeVisualPassFrames(
            params.effectRuntimeFrames,
            pass.time
          ),
          effectRuntimeState: resolvePreviewEffectDrawState(params.effectRuntimeStates, pass.time),
          imageBank: params.imageBank,
          layers: resolveOrderedVisualPassLayers(params.layers, pass.frame.visualLayers),
          pass: passTarget.drawPass ? { ...pass, alpha: 1 } : pass,
          prepared: { ...groupedPrepared, context },
          spatialRenderer: params.spatialRenderer,
        });
      if (passTarget.drawPass) passTarget.drawPass(pass.alpha, paint);
      else paint(groupedPrepared.context);
    }

    passTarget.flush();
  } finally {
    passTarget.dispose();
  }
}
