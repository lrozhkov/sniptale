import type { PreviewSceneRenderInput } from './types';
import { mapCompositionPointThroughCamera } from '../../../features/video/composition/motion';
import { drawSpatialSceneOverlays } from '../../../features/video/composition/draw/spatial';
import type { PreparedPreviewSceneCanvas } from './types';
import type { CameraOutputViewport } from '../../../features/video/project/export/output-dimensions';
import type { PreviewSceneSourceFrames } from './source-frames';
import type { VideoCompositionMediaSource } from '../../../features/video/composition/draw/media-source';
import { drawCompositionSceneSpotlights } from '../../../features/video/composition/draw/project-spotlight';
import { drawSpatialCompositionGroup } from '../../../features/video/composition/draw/spatial';
import type { ReviewSpatialRenderer } from '../../../features/video/composition/canvas/spatial-renderer';
import {
  resolveOrderedVisualPassLayers,
  resolveVisualStateSourceSpotlights,
  splitVisualLayersForSourceSpotlights,
} from '../../../features/video/composition/visual-pass-layers';
import { resolveEffectRuntimeVisualLayers } from '../../../features/video/composition/draw/effect-runtime';
import {
  createEffectRuntimeDrawState,
  drawCompositionVisualLayer,
  drawCursorCompositionState,
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
  shouldLockVisualLayerToViewport,
  segmentVisualLayersByViewportLock,
} from '../../../features/video/composition/motion/layer-camera';
import type { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import type { VideoProject } from '../../../features/video/project/types/index';
import {
  beginPreviewCameraPass,
  beginPreviewViewportClip,
  resolvePreparedPreviewSceneCanvas,
} from './canvas';
import { drawPreviewTransitionOverlays, resolvePreviewEffectDrawState } from './render-effects';
import { resolvePreviewPassTarget } from './render-pass-target';
import type { VideoEditorPreviewRasterSize } from './types';
import { resolveActiveCameraSplit } from '../../../features/video/composition/camera-split';

function drawLockedPreviewLayer(
  prepared: PreparedPreviewSceneCanvas,
  layer: ReturnType<typeof mapVisualLayerToViewportSpace>,
  params: {
    clipMediaElements: Map<string, VideoCompositionMediaSource>;
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
  clipMediaElements: Map<string, VideoCompositionMediaSource>;
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

export async function drawPreviewVisualPasses(params: {
  sourceFrames?: PreviewSceneSourceFrames;
  canvas: HTMLCanvasElement;
  viewportCanvas?: HTMLCanvasElement;
  spatialRenderer?: () => ReviewSpatialRenderer;
  transitionRenderer?: PreviewSceneRenderInput['transitionRenderer'];
  signal?: AbortSignal;
  clipMediaElements: Map<string, VideoCompositionMediaSource>;
  currentTime?: number;
  imageBank: Record<string, HTMLImageElement>;
  overlayFrame: ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];
  effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  project: VideoProject;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  sceneOutput?: CameraOutputViewport;
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
    ...(params.sceneOutput ? { sceneOutput: params.sceneOutput } : {}),
    ...(params.previewRasterSize ? { previewRasterSize: params.previewRasterSize } : {}),
    shouldClearCanvas: true,
    stage: params.stage,
  });
  if (!prepared) {
    return null;
  }

  await drawPreviewOrderedVisualLayers({
    ...(params.sourceFrames ? { sourceFrames: params.sourceFrames } : {}),
    project: params.project,
    time: params.currentTime ?? 0,
    canvas: params.canvas,
    clipMediaElements: params.clipMediaElements,
    frame: params.overlayFrame,
    imageBank: params.imageBank,
    passes: params.passes,
    prepared,
    effectRuntimeFrames: params.effectRuntimeFrames,
    spatialRenderer: params.spatialRenderer,
    transitionRenderer: params.transitionRenderer,
    signal: params.signal,
  });
  await drawPreviewTransitionOverlays({
    canvas: params.canvas,
    passes: params.passes,
    prepared,
    effectRuntimeFrames: params.effectRuntimeFrames,
  });
  return prepared;
}

async function drawPreviewOrderedVisualLayers(params: {
  sourceFrames?: PreviewSceneSourceFrames;
  sceneOutput?: CameraOutputViewport;
  project: VideoProject;
  time: number;
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, VideoCompositionMediaSource>;
  frame: ReturnType<typeof resolveVideoCompositionRenderPasses>['overlayFrame'];
  imageBank: Record<string, HTMLImageElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  passes: ReturnType<typeof resolveVideoCompositionRenderPasses>['visualPasses'];
  prepared: PreparedPreviewSceneCanvas;
  spatialRenderer: (() => ReviewSpatialRenderer) | undefined;
  transitionRenderer: PreviewSceneRenderInput['transitionRenderer'];
  signal: AbortSignal | undefined;
  withSceneBackdrop?: (paint: (source: HTMLCanvasElement) => void) => void;
}) {
  if (params.frame.glTrackPlans?.size) {
    await drawPreviewGlTrackLayers(params);
    return;
  }
  const splitClipId = resolveActiveCameraSplit(
    params.project,
    params.time,
    params.frame.visualLayers
  )?.clipId;
  const segments = segmentVisualLayersByViewportLock(
    resolveEffectRuntimeVisualLayers(
      params.frame.visualLayers.filter((layer) => layer.clipId !== splitClipId),
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
        await drawPreviewUnlockedLayerGroup({
          ...(params.sourceFrames ? { sourceFrames: params.sourceFrames } : {}),
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
      if (part.afterClipId) {
        const afterClipId = part.afterClipId;
        const drawMask = (source?: HTMLCanvasElement) =>
          drawCompositionSceneSpotlights({
            ...(source ? { blurSource: () => source } : {}),
            context: params.prepared.context,
            afterClipId,
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
        const samples = params.frame.sceneSpotlights?.filter(
          (state) => state.afterClipId === part.afterClipId
        );
        if (
          params.withSceneBackdrop &&
          samples?.some(
            (state) =>
              state.spotlight.blur > 0 ||
              state.spotlight.effect === 'magnify' ||
              (state.from?.blur ?? 0) > 0 ||
              state.from?.effect === 'magnify'
          )
        )
          params.withSceneBackdrop(drawMask);
        else drawMask();
      }
    }
  }
}

async function drawPreviewUnlockedLayerGroup(params: {
  sourceFrames?: PreviewSceneSourceFrames;
  sceneOutput?: CameraOutputViewport;
  canvas: HTMLCanvasElement;
  clipMediaElements: Map<string, VideoCompositionMediaSource>;
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
      await params.effectRuntimeFrames?.prepareVisualPass?.(pass.time);
      const paint = (context: CanvasRenderingContext2D) =>
        drawPreparedPreviewVisualPass({
          clipMediaElements:
            params.sourceFrames?.media(pass.frame, pass.time) ?? params.clipMediaElements,
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

async function drawPreviewGlTrackLayers(
  params: Parameters<typeof drawPreviewOrderedVisualLayers>[0]
) {
  if (!params.transitionRenderer)
    throw new Error('Native transition fallback owner is unavailable.');
  const renderer = params.transitionRenderer();
  const { glTrackPlans, ...baseFrame } = params.frame;
  const viewport = params.prepared.viewport;
  const dpr = params.prepared.dpr;
  const width = Math.max(1, Math.ceil(viewport.width * dpr));
  const height = Math.max(1, Math.ceil(viewport.height * dpr));
  const splitClipId = resolveActiveCameraSplit(
    params.project,
    params.time,
    params.frame.visualLayers
  )?.clipId;
  const ordered = resolveEffectRuntimeVisualLayers(
    params.frame.visualLayers.filter((layer) => layer.clipId !== splitClipId),
    params.effectRuntimeFrames?.overlayFrames
  );
  const tracks = new Map<string, typeof ordered>();
  for (const layer of ordered) {
    const members = tracks.get(layer.clip.trackId) ?? [];
    members.push(layer);
    tracks.set(layer.clip.trackId, members);
  }
  for (const [trackId, layers] of tracks) {
    params.signal?.throwIfAborted();
    const root = glTrackPlans?.get(trackId);
    if (!root) {
      await drawPreviewOrderedVisualLayers({
        ...params,
        frame: { ...baseFrame, visualLayers: layers },
      });
      continue;
    }
    const result = await renderer.render({
      root,
      width,
      height,
      ratio: params.project.width / params.project.height,
      signal: params.signal ?? new AbortController().signal,
      async paintState(target, clipIds) {
        const members = new Set(clipIds);
        const selected = layers.filter((layer) => members.has(layer.clipId));
        const stateFrame = {
          ...baseFrame,
          visualLayers: selected,
          sceneSpotlights: resolveVisualStateSourceSpotlights(
            selected,
            params.frame.sceneSpotlights
          ),
        };
        const prepared = {
          ...params.prepared,
          context: target.context,
          bounds: { width: viewport.width, height: viewport.height },
          viewport: { ...viewport, offsetX: 0, offsetY: 0 },
        };
        target.context.setTransform(dpr, 0, 0, dpr, 0, 0);
        await drawPreviewOrderedVisualLayers({
          ...params,
          canvas: target.canvas,
          prepared,
          frame: stateFrame,
          withSceneBackdrop(paint) {
            target.withScratch((scratch) => {
              scratch.context.drawImage(
                params.canvas,
                viewport.offsetX * dpr,
                viewport.offsetY * dpr,
                width,
                height,
                0,
                0,
                width,
                height
              );
              scratch.context.drawImage(target.canvas, 0, 0);
              paint(scratch.canvas);
            });
          },
        });
        for (const id of clipIds) {
          const cursor = params.frame.sourceCursors?.get(id);
          if (!cursor?.visible) continue;
          const owner = selected.find((layer) => layer.clipId === id);
          const locked = owner && shouldLockVisualLayerToViewport(owner, params.frame.camera);
          if (
            !locked &&
            drawSpatialSceneOverlays({
              actions: [],
              cursor,
              camera: params.frame.camera,
              context: target.context,
              destination: { x: 0, y: 0, width: viewport.width, height: viewport.height },
              logicalSize: { width: params.project.width, height: params.project.height },
              output: { width, height },
              rasterScale: viewport.scale * dpr,
              spatialRenderer: params.spatialRenderer,
            })
          )
            continue;
          const point = locked
            ? cursor
            : mapCompositionPointThroughCamera(cursor, params.frame.camera);
          if (point)
            drawCursorCompositionState(target.context, {
              ...cursor,
              x: point.x * viewport.scale,
              y: point.y * viewport.scale,
              scale: cursor.scale * viewport.scale * (locked ? 1 : params.frame.camera.scale),
            });
        }
      },
    });
    try {
      params.signal?.throwIfAborted();
      params.prepared.context.drawImage(
        result.canvas,
        viewport.offsetX,
        viewport.offsetY,
        viewport.width,
        viewport.height
      );
    } finally {
      result.release();
    }
  }
}
