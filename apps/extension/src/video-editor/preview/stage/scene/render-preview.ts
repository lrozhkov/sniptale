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
}) {
  const overlayScale = params.viewport.scale * params.camera.scale;
  const scaledCursor = params.frame.cursor
    ? {
        ...params.frame.cursor,
        ...mapPreviewScenePoint(params.frame.cursor, params.camera, params.viewport),
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

export async function renderPreviewScene(params: {
  cameraOverride?: VideoCompositionCameraState;
  canvas: HTMLCanvasElement;
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
}): Promise<void | false> {
  const renderPasses = resolveVideoCompositionRenderPasses(params.project, params.currentTime);
  if (params.cameraOverride) {
    renderPasses.overlayFrame.camera = params.cameraOverride;
    for (const pass of renderPasses.visualPasses) pass.frame.camera = params.cameraOverride;
  }
  const clipMediaElements = createPreviewSceneMediaMap(params.videoRefs);
  const effectRuntimeFrames = await resolvePreviewEffectRuntimeFrames(
    params,
    renderPasses,
    clipMediaElements
  );
  if (params.signal?.aborted) {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
    return;
  }
  try {
    if (params.signal?.aborted) return;
    // Media seeking can invalidate readiness after the React render was queued.
    // Keep the last complete frame until the decoder supplies a replacement.
    const frames = [
      renderPasses.overlayFrame,
      ...renderPasses.visualPasses.filter((pass) => pass.alpha > 0).map((pass) => pass.frame),
    ];
    if (
      frames.some((frame) =>
        frame.visualLayers.some((layer) => {
          if (layer.kind !== 'video' || layer.opacity <= 0) return false;
          const video = clipMediaElements.get(layer.clipId);
          return !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
        })
      )
    )
      return false;
    drawResolvedPreviewScene({
      clipMediaElements,
      effectRuntimeFrames,
      params,
      renderPasses,
    });
  } finally {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
  }
}

function drawResolvedPreviewScene(args: {
  clipMediaElements: Map<string, HTMLMediaElement>;
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined;
  params: Parameters<typeof renderPreviewScene>[0];
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>;
}): void {
  const visualPassArgs = {
    canvas: args.params.canvas,
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

  if (!overlayPrepared || args.params.signal?.aborted) return;

  drawPreviewSceneOverlays({
    camera: args.renderPasses.overlayFrame.camera,
    context: overlayPrepared.context,
    frame: args.renderPasses.overlayFrame,
    viewport: overlayPrepared.viewport,
  });
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
    ownerDocument: params.canvas.ownerDocument,
    rasterScale: resolvePreviewEffectRuntimeRasterScale({
      canvas: params.canvas,
      ...(params.previewRasterSize ? { previewRasterSize: params.previewRasterSize } : {}),
      project: params.project,
      stage: params.stage,
    }),
    visualPasses: renderPasses.visualPasses,
  });
}
