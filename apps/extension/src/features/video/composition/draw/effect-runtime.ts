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
  const standalone = findStandaloneFrame(args.frames, args.layer.clipId);
  if (standalone) {
    drawCompositionVisualLayerBitmap(
      args.context,
      args.layer,
      standalone.bitmap,
      args.scaleX,
      args.scaleY,
      args.alpha
    );
    return true;
  }
  const target = findTargetFrame(args.frames, args.layer.clipId);
  if (target) {
    drawCompositionVisualLayerBitmap(
      args.context,
      args.layer,
      target.bitmap,
      args.scaleX,
      args.scaleY,
      args.alpha
    );
    return true;
  }
  const transition = findTransitionFrame(args.frames, args.layer.clipId);
  if (!transition || transition.target.kind !== 'transition') return false;
  if (!args.state.drawnTransitionIds.has(transition.target.transitionId)) {
    args.state.drawnTransitionIds.add(transition.target.transitionId);
    drawFullFrame(args.context, transition, args.scaleX, args.scaleY, args.alpha ?? 1);
  }
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
