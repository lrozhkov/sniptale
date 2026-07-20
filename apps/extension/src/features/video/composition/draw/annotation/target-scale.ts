import type { VideoCompositionResolvedAnnotationClip } from '../../types';
import { scaleAnnotationPoint, scaleAnnotationRect } from './scale';

export function scaleTargetAwareAnnotationClip(
  clip: VideoCompositionResolvedAnnotationClip,
  displayScale: number
): VideoCompositionResolvedAnnotationClip {
  return {
    ...clip,
    presentation: {
      ...clip.presentation,
      labelFrame: scaleAnnotationRect(clip.presentation.labelFrame, displayScale),
    },
    targetPoint: clip.targetPoint ? scaleAnnotationPoint(clip.targetPoint, displayScale) : null,
    targetRect: clip.targetRect ? scaleAnnotationRect(clip.targetRect, displayScale) : null,
  };
}
