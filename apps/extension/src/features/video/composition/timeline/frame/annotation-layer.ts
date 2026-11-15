import { resolveCompositionAnnotationClip } from '../../annotation/resolved-clip';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../../project/transition/presentation.types';
import type { VideoProject, VideoProjectAnnotationClip } from '../../../project/types/index';
import type { VideoCompositionVisualLayer } from '../../types';

export function createAnnotationVisualLayer(
  clip: VideoProjectAnnotationClip,
  currentTime: number,
  project: VideoProject,
  zIndex: number
): Extract<VideoCompositionVisualLayer, { kind: 'annotation' }> {
  const resolvedClip = resolveCompositionAnnotationClip(clip, currentTime, project);
  const layerFrame = resolvedClip.scene
    ? resolvedClip.presentation.labelFrame
    : resolvedClip.presentation.frame;

  return {
    clip: resolvedClip,
    clipId: clip.id,
    height: layerFrame.height,
    kind: 'annotation',
    opacity: resolvedClip.presentation.frame.opacity,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    rotation: resolvedClip.presentation.frame.rotation,
    width: layerFrame.width,
    x: layerFrame.x,
    y: layerFrame.y,
    zIndex,
  };
}
