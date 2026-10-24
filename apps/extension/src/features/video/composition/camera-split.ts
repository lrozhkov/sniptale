import { acquireVideoCompositionBuffer } from './canvas/buffer-pool';
import type { VideoCompositionVisualLayer } from './types';
import { resolveCameraSplitPresentation, type CameraPanel } from '../project/camera/split';
import type { VideoProject } from '../project/types';
import { drawCompositionSceneSpotlights } from './draw/project-spotlight';

type CameraSplitSpotlightArgs = Parameters<typeof drawCompositionSceneSpotlights>[0];

/** The active camera layer is withheld until after the screen pane is composed. */
export function resolveActiveCameraSplit(
  project: VideoProject,
  time: number,
  layers: readonly VideoCompositionVisualLayer[]
): {
  clipId: string;
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
  screen: CameraPanel;
  camera: CameraPanel;
} | null {
  for (const layer of layers) {
    if (layer.kind !== 'video' || layer.trackRole !== 'CAMERA' || layer.opacity <= 0) continue;
    const clip = project.clips.find((item) => item.id === layer.clipId);
    if (!clip || clip.type !== 'VIDEO') continue;
    const split = resolveCameraSplitPresentation(project, clip, time);
    if (!split || (split.screen.width === 1 && split.screen.height === 1)) continue;
    return {
      clipId: clip.id,
      layer,
      screen: split.screen,
      camera: {
        x: split.camera.x / project.width,
        y: split.camera.y / project.height,
        width: split.camera.width / project.width,
        height: split.camera.height / project.height,
      },
    };
  }
  return null;
}

/** Reapply global and camera-bound masks only to the camera painted after screen composition. */
export function drawDeferredCameraSplitSpotlights(
  args: CameraSplitSpotlightArgs & {
    split: NonNullable<ReturnType<typeof resolveActiveCameraSplit>>;
  }
): void {
  const { context, split, viewport, frame } = args;
  if (
    !frame.sceneSpotlights?.some(
      (state) => state.afterClipId === undefined || state.afterClipId === split.clipId
    )
  )
    return;
  context.save();
  try {
    context.beginPath();
    context.rect(
      viewport.x + split.camera.x * viewport.width,
      viewport.y + split.camera.y * viewport.height,
      split.camera.width * viewport.width,
      split.camera.height * viewport.height
    );
    context.clip();
    drawCompositionSceneSpotlights(args);
    drawCompositionSceneSpotlights({ ...args, afterClipId: split.clipId });
  } finally {
    context.restore();
  }
}

/** Copies one completed screen frame into its animated pane without another media decode. */
export function paintCameraSplitScreen(
  context: CanvasRenderingContext2D,
  viewport: { x: number; y: number; width: number; height: number },
  screen: CameraPanel,
  ownerDocument?: Document | null
): void {
  const canvas = context.canvas;
  const scratch = acquireVideoCompositionBuffer(canvas.width, canvas.height, ownerDocument);
  if (!scratch) throw new Error('Camera split buffer is unavailable.');
  try {
    const source = scratch.canvas.getContext('2d');
    if (!source) throw new Error('Camera split context is unavailable.');
    source.clearRect(0, 0, canvas.width, canvas.height);
    source.drawImage(canvas, 0, 0);
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.filter = 'none';
      context.fillStyle = '#101014';
      context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
      context.drawImage(
        scratch.canvas,
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
        viewport.x + screen.x * viewport.width,
        viewport.y + screen.y * viewport.height,
        screen.width * viewport.width,
        screen.height * viewport.height
      );
    } finally {
      context.restore();
    }
  } finally {
    scratch.release();
  }
}
