import type {
  EffectRuntimeRenderedComposition,
  EffectRuntimeRenderedFrameMap,
} from '../runtime/types';
import { closeEffectRuntimeBitmap } from '../runtime/resource-limits';

export function getEffectRuntimeVisualPassFrames(
  rendered: EffectRuntimeRenderedComposition | undefined,
  passTime: number
): EffectRuntimeRenderedFrameMap | undefined {
  return rendered?.framesByTime.get(passTime);
}

export function disposeEffectRuntimeComposition(
  rendered: EffectRuntimeRenderedComposition | undefined
): void {
  if (!rendered) return;
  const disposed = new Set<EffectRuntimeRenderedFrameMap>();
  for (const frames of rendered.framesByTime.values()) {
    if (disposed.has(frames)) continue;
    disposed.add(frames);
    closeFrames(frames);
  }
  if (!disposed.has(rendered.overlayFrames)) closeFrames(rendered.overlayFrames);
}

function closeFrames(frames: EffectRuntimeRenderedFrameMap): void {
  for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
}
