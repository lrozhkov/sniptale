import type {
  EffectRuntimeRenderedFrame,
  EffectRuntimeRenderedFrameMap,
} from '../effect-runtime/runtime/types';
import type { VideoCompositionVisualLayer } from '../types';
import { drawCompositionVisualLayerBitmap } from './visual';

export interface EffectRuntimeDrawState {
  drawnTransitionIds: Set<string>;
}

export function createEffectRuntimeDrawState(): EffectRuntimeDrawState {
  return { drawnTransitionIds: new Set() };
}

export function drawEffectRuntimeVisualLayer(args: {
  alpha?: number;
  context: CanvasRenderingContext2D;
  frames: EffectRuntimeRenderedFrameMap | undefined;
  layer: VideoCompositionVisualLayer;
  scaleX: number;
  scaleY: number;
  state: EffectRuntimeDrawState;
}): boolean {
  if (args.layer.effectActionsOnly) return false;
  const group = findGroupFrame(args.frames, args.layer.clipId);
  if (group) {
    const key = `group:${group.effectInstanceId}`;
    if (!args.state.drawnTransitionIds.has(key)) {
      args.state.drawnTransitionIds.add(key);
      drawFullFrame(args.context, group, args.scaleX, args.scaleY, args.alpha ?? 1);
    }
    return true;
  }
  const transition = findTransitionFrame(args.frames, args.layer.clipId);
  if (transition && transition.target.kind === 'transition') {
    if (!args.state.drawnTransitionIds.has(transition.target.transitionId)) {
      args.state.drawnTransitionIds.add(transition.target.transitionId);
      drawFullFrame(args.context, transition, args.scaleX, args.scaleY, args.alpha ?? 1);
    }
    return true;
  }
  const frame =
    findTargetFrame(args.frames, args.layer.clipId) ??
    findStandaloneFrame(args.frames, args.layer.clipId);
  if (!frame) return false;
  drawCompositionVisualLayerBitmap(
    args.context,
    args.layer,
    frame.bitmap,
    args.scaleX,
    args.scaleY,
    args.alpha,
    frame.bitmapBounds
  );
  return true;
}

export function hasEffectRuntimeTransitionFrame(
  frames: EffectRuntimeRenderedFrameMap | undefined,
  transitionId: string
): boolean {
  for (const frame of frames?.values() ?? []) {
    if (frame.target.kind === 'transition' && frame.target.transitionId === transitionId) {
      return true;
    }
  }
  return false;
}

function findTargetFrame(
  frames: EffectRuntimeRenderedFrameMap | undefined,
  clipId: string
): EffectRuntimeRenderedFrame | null {
  for (const frame of frames?.values() ?? []) {
    if (frame.target.kind === 'clip' && frame.target.clipId === clipId) return frame;
  }
  return null;
}

function findStandaloneFrame(
  frames: EffectRuntimeRenderedFrameMap | undefined,
  clipId: string
): EffectRuntimeRenderedFrame | null {
  for (const frame of frames?.values() ?? []) {
    if (frame.target.kind === 'scene' && frame.target.clipId === clipId) return frame;
  }
  return null;
}

function findTransitionFrame(
  frames: EffectRuntimeRenderedFrameMap | undefined,
  clipId: string
): EffectRuntimeRenderedFrame | null {
  for (const frame of frames?.values() ?? []) {
    if (
      frame.target.kind === 'transition' &&
      (frame.target.leadingClipId === clipId || frame.target.trailingClipId === clipId)
    ) {
      return frame;
    }
  }
  return null;
}

function drawFullFrame(
  context: CanvasRenderingContext2D,
  frame: EffectRuntimeRenderedFrame,
  scaleX: number,
  scaleY: number,
  alpha: number
): void {
  const previousAlpha = context.globalAlpha;
  context.globalAlpha = previousAlpha * alpha;
  try {
    context.drawImage(
      frame.bitmap,
      0,
      0,
      frame.width,
      frame.height,
      0,
      0,
      frame.logicalWidth * scaleX,
      frame.logicalHeight * scaleY
    );
  } finally {
    context.globalAlpha = previousAlpha;
  }
}

function findGroupFrame(frames: EffectRuntimeRenderedFrameMap | undefined, clipId: string) {
  let track: EffectRuntimeRenderedFrame | undefined;
  for (const frame of frames?.values() ?? []) {
    if (
      (frame.target.kind === 'video-group' || frame.target.kind === 'track') &&
      frame.target.clipIds.includes(clipId)
    ) {
      if (frame.target.kind === 'video-group') return frame;
      track = frame;
    }
  }
  return track;
}

/** Keep selection geometry in the frame model; only the final draw projection is flattened. */
export function resolveEffectRuntimeVisualLayers(
  layers: VideoCompositionVisualLayer[],
  frames: EffectRuntimeRenderedFrameMap | undefined
): VideoCompositionVisualLayer[] {
  const seen = new Set<string>();
  return layers.flatMap((layer) => {
    const group = findGroupFrame(frames, layer.clipId);
    const processed =
      group ?? findTargetFrame(frames, layer.clipId) ?? findTransitionFrame(frames, layer.clipId);
    const actions: VideoCompositionVisualLayer[] =
      processed && layer.kind === 'video' && layer.actions?.length
        ? [{ ...layer, effectActionsOnly: true }]
        : [];
    if (!group) return [layer, ...actions];
    if (seen.has(group.effectInstanceId)) return actions;
    seen.add(group.effectInstanceId);
    return [{ ...layer, effectViewportRaster: true }, ...actions];
  });
}
